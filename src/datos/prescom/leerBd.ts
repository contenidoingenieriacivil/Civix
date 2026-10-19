import type { Insumo, Item, Linea, Rubro } from '../../nucleo/tipos';
import type { BaseDatos, Grupo } from '../modelo';
import { fechaOle, limpiar32, texto, vista } from './binario';

const REG_NBD = 92; // catálogo: grupo, tipo, descripción(70), marca, unidad(5), cotización, id
const REG_GRP = 31;
const CASILLAS_ITEM = 60; // 30 materiales + 10 mano de obra + 20 equipos

export interface ArchivosBd {
  nombre: string;
  nbd: Uint8Array;
  dat: Uint8Array;
  grp?: Uint8Array;
  cfg?: Uint8Array;
}

export function leerGrupos(grp: Uint8Array | undefined): Grupo[] {
  if (!grp) return [];
  const out: Grupo[] = [];
  for (let k = 0; k + REG_GRP <= grp.length; k++) {
    const o = k * REG_GRP;
    const tipo = String.fromCharCode(grp[o]!) as Grupo['tipo'];
    out.push({ tipo: 'IMOE'.includes(tipo) ? tipo : 'I', descripcion: texto(grp, o + 1, 30) });
  }
  return out;
}

/** Lee una base de datos de PRESCOM 2013 (.nbd + .DAT + .GRP + .CFG). */
export function leerBaseDatos(a: ArchivosBd): BaseDatos {
  if (a.nbd.length % REG_NBD !== 0) throw new Error(`${a.nombre}: el catálogo (.nbd) tiene un tamaño inesperado`);
  const dv = vista(a.dat);
  const celdas = Math.floor(a.dat.length / 8);
  const celda = (id: number): [number, number] => {
    if (id < 1 || id > celdas) throw new Error(`${a.nombre}: referencia fuera del archivo de datos (${id})`);
    const o = (id - 1) * 8;
    return [dv.getInt32(o, true), limpiar32(dv.getFloat32(o + 4, true))];
  };

  const nb = vista(a.nbd);
  const insumos: Insumo[] = [];
  const itemsRaw: { id: number; descripcion: string; unidad: string; grupo: number }[] = [];
  for (let k = 0; k < a.nbd.length / REG_NBD; k++) {
    const o = k * REG_NBD;
    const tipo = String.fromCharCode(a.nbd[o + 2]!);
    const base = {
      id: nb.getInt32(o + 88, true),
      descripcion: texto(a.nbd, o + 3, 70),
      unidad: texto(a.nbd, o + 75, 5),
      grupo: nb.getInt16(o, true),
    };
    if (tipo === 'I') itemsRaw.push(base);
    else if (tipo === 'M' || tipo === 'O' || tipo === 'E') {
      insumos.push({
        ...base, rubro: tipo as Rubro, precio: celda(base.id)[1],
        cotizacion: fechaOle(nb.getFloat64(o + 80, true)),
      });
    }
  }

  // Algunas bases (p. ej. Chuquisaca) conservan líneas que apuntan a insumos cuya ficha fue borrada:
  // se importan como "(insumo sin descripción)" con el precio que aún guarda el archivo.
  const conocidos = new Set(insumos.map((i) => i.id));
  const huerfanos: string[] = [];
  const RUBROS: Rubro[] = ['M', 'O', 'E'];
  const items: Item[] = itemsRaw.map((r) => {
    const lineas = (desde: number, hasta: number): Linea[] => {
      const out: Linea[] = [];
      for (let s = desde; s < hasta; s++) {
        const [insumo, rendimiento] = celda(r.id + s);
        if (insumo <= 0) continue;
        if (!conocidos.has(insumo)) {
          conocidos.add(insumo);
          insumos.push({
            id: insumo, rubro: RUBROS[s < 30 ? 0 : s < 40 ? 1 : 2]!, descripcion: '(insumo sin descripción)',
            unidad: '', precio: celda(insumo)[1], cotizacion: null, grupo: 0,
          });
          huerfanos.push(`insumo ${insumo} (ítem "${r.descripcion}")`);
        }
        out.push({ insumo, rendimiento });
      }
      return out;
    };
    if (r.id + CASILLAS_ITEM - 1 > celdas) throw new Error(`${a.nombre}: el ítem "${r.descripcion}" excede el archivo de datos`);
    return { ...r, materiales: lineas(0, 30), manoObra: lineas(30, 40), equipo: lineas(40, 60) };
  });

  const moneda = a.cfg && a.cfg.length >= 2 ? vista(a.cfg).getInt16(0, true) : 2;
  const advertencias = huerfanos.length
    ? [`${huerfanos.length} insumos referenciados por ítems no tienen ficha en el catálogo; se importaron sin descripción`]
    : [];
  return { nombre: a.nombre, moneda, grupos: leerGrupos(a.grp), insumos, items, advertencias };
}
