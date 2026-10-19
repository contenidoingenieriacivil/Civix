import { unzipSync } from 'fflate';
import type { Item } from '../../nucleo/tipos';
import type { Modulo, Partida, Proyecto } from '../modelo';
import { fechaOle, limpiar32, texto, vista } from './binario';
import { leerBaseDatos, leerGrupos } from './leerBd';
import { leerPlantilla } from './leerPlantilla';

const REG_PRE = 460;

/** Lee un proyecto de PRESCOM 2013 (.DDP, que es un ZIP con los archivos del proyecto). */
export function leerProyecto(ddp: Uint8Array): Proyecto {
  const zip = unzipSync(ddp);
  const buscar = (ext: string): Uint8Array | undefined =>
    Object.entries(zip).find(([n]) => n.toUpperCase().endsWith(`.${ext}`) && n.split('/').pop()!.length > 4)?.[1];
  const nombre = Object.keys(zip).find((n) => /\.PRE$/i.test(n))?.split('/').pop()?.replace(/\.PRE$/i, '') ?? 'proyecto';
  const req = (ext: string) => {
    const f = buscar(ext);
    if (!f) throw new Error(`El proyecto no contiene el archivo .${ext}`);
    return f;
  };

  // Los insumos del proyecto viven en .IND (catálogo) + .DAT; los ítems, en .PRE.
  const bd = leerBaseDatos({ nombre, nbd: req('IND'), dat: req('DAT'), grp: buscar('GRP'), cfg: undefined });
  const dat = vista(req('DAT'));
  const celda = (id: number): [number, number] => [dat.getInt32((id - 1) * 8, true), limpiar32(dat.getFloat32((id - 1) * 8 + 4, true))];

  const ids = new Set(bd.insumos.map((i) => i.id));
  const celdas = Math.floor(req('DAT').length / 8);
  // Los bloques de ítems empiezan tras la última casilla de insumos y miden 60 casillas.
  const primerItem = Math.max(0, ...ids) + 1;
  const stt = req('STT');
  const sv = vista(stt);
  const plantilla = leerPlantilla(`${nombre} (plantilla del proyecto)`, req('CFG'));

  const mod = buscar('MOD');
  const tie = buscar('TIE');
  const modulos: Modulo[] = [];
  if (mod) {
    for (let k = 0; k + 50 <= mod.length; k += 50) {
      const nom = texto(mod, k, 50);
      if (!nom) continue;
      const t = tie && tie.length >= (k / 50 + 1) * 66 ? vista(tie) : null;
      const o = (k / 50) * 66 + 50;
      modulos.push({
        nombre: nom,
        inicio: t ? fechaOle(t.getFloat64(o, true)) : null,
        fin: t ? fechaOle(t.getFloat64(o + 8, true)) : null,
      });
    }
  }

  const pre = req('PRE');
  const pv = vista(pre);
  const partidas: Partida[] = [];
  for (let k = 0; (k + 1) * REG_PRE <= pre.length; k++) {
    const o = k * REG_PRE;
    const idItem = pv.getInt32(o + 81, true);
    // Hay proyectos (p. ej. archivos temporales de submódulos) cuyo detalle no está en el propio archivo.
    const conDetalle = idItem >= primerItem && (idItem - primerItem) % 60 === 0 && idItem + 59 <= celdas;
    const lineas = (desde: number, hasta: number) => {
      const out: Item['materiales'] = [];
      for (let s = desde; s < hasta; s++) {
        if (!conDetalle) break;
        const [insumo, rendimiento] = celda(idItem + s);
        if (insumo > 0 && ids.has(insumo)) out.push({ insumo, rendimiento });
      }
      return out;
    };
    const descripcion = texto(pre, o + 4, 70);
    const unidad = texto(pre, o + 76, 5);
    const grupo = pv.getInt16(o + 74, true);
    const item: Item = {
      id: idItem, descripcion, unidad, grupo,
      materiales: lineas(0, 30), manoObra: lineas(30, 40), equipo: lineas(40, 60),
    };
    partidas.push({
      modulo: pv.getInt16(o + 2, true), numero: pv.getInt16(o + REG_PRE - 4, true),
      descripcion, unidad, grupo, item, sinDetalle: !conDetalle, cuadrilla: Math.max(1, pv.getInt16(o + 180, true)), predecesor: Math.max(0, pv.getInt16(o + REG_PRE - 6, true)), cantidad: pv.getFloat64(o + 85, true),
      referenciaPrescom: {
        precioUnitario: pv.getFloat64(o + 108, true), materiales: pv.getFloat64(o + 116, true),
        manoObra: pv.getFloat64(o + 124, true), equipo: pv.getFloat64(o + 132, true),
        inicio: fechaOle(pv.getFloat64(o + 438, true)), fin: fechaOle(pv.getFloat64(o + 446, true)),
      },
    });
  }

  return {
    nombre: texto(stt, 0, 70) || nombre,
    lugar: texto(stt, 70, 60),
    cliente: texto(stt, 130, 60),
    fecha: fechaOle(sv.getFloat64(190, true)),
    moneda: sv.getInt16(198, true),
    cambioDolar: limpiar32(sv.getFloat32(200, true)),
    memo: texto(stt, 730, 240),
    responsable: texto(stt, 970, 60),
    plantilla,
    grupos: leerGrupos(buscar('GRP')),
    modulos,
    insumos: bd.insumos,
    partidas,
  };
}
