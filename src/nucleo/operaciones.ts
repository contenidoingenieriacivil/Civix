import type { BaseDatos, Modulo, Partida, Proyecto } from '../datos/modelo';
import { redondear } from './calculo';
import type { Insumo, Item, Linea } from './tipos';

export const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const nuevoProyecto = (nombre: string, plantilla: Proyecto['plantilla']): Proyecto => ({
  nombre, lugar: '', cliente: '', fecha: new Date().toISOString().slice(0, 10), moneda: 2, cambioDolar: 6.96,
  memo: '', responsable: '', plantilla, grupos: [], modulos: [{ nombre: 'MÓDULO 1', inicio: null, fin: null }],
  insumos: [], partidas: [],
});

export function agregarModulo(p: Proyecto, nombre: string): Modulo {
  const m = { nombre, inicio: null, fin: null };
  p.modulos.push(m);
  return m;
}

/** Busca el módulo por posición (1…n) o por nombre (sin acentos ni mayúsculas, coincidencia parcial). */
export function buscarModulo(p: Proyecto, ref: string | number): number {
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
    const n = Number(ref);
    return n >= 1 && n <= p.modulos.length ? n : -1;
  }
  const q = sinAcentos(String(ref));
  const exacto = p.modulos.findIndex((m) => sinAcentos(m.nombre) === q);
  if (exacto >= 0) return exacto + 1;
  const parcial = p.modulos.findIndex((m) => sinAcentos(m.nombre).includes(q));
  return parcial >= 0 ? parcial + 1 : -1;
}

const siguienteId = (p: Proyecto) => Math.max(0, ...p.insumos.map((i) => i.id)) + 1;

/** Copia un insumo de una base al proyecto (si ya existe uno igual por descripción y rubro, lo reutiliza). */
export function traerInsumo(p: Proyecto, i: Insumo): number {
  const q = sinAcentos(i.descripcion);
  const igual = p.insumos.find((x) => x.rubro === i.rubro && sinAcentos(x.descripcion) === q);
  if (igual) return igual.id;
  const id = siguienteId(p);
  p.insumos.push({ ...i, id });
  return id;
}

/** Añade al proyecto un ítem de una base de datos, con sus insumos, como nueva partida del módulo. */
export function agregarItemDeBase(p: Proyecto, base: BaseDatos, itemId: number, modulo: number, cantidad: number): Partida {
  const item = base.items.find((x) => x.id === itemId);
  if (!item) throw new Error(`La base "${base.nombre}" no tiene el ítem ${itemId}`);
  const porId = new Map(base.insumos.map((i) => [i.id, i]));
  const mapa = (ls: Linea[]): Linea[] =>
    ls.flatMap((l) => {
      const i = porId.get(l.insumo);
      return i ? [{ insumo: traerInsumo(p, i), rendimiento: l.rendimiento }] : [];
    });
  const copia: Item = { ...item, id: Math.max(0, ...p.partidas.map((x) => x.item.id)) + 1,
    materiales: mapa(item.materiales), manoObra: mapa(item.manoObra), equipo: mapa(item.equipo) };
  const partida: Partida = { modulo, numero: p.partidas.filter((x) => x.modulo === modulo).length + 1,
    descripcion: item.descripcion, unidad: item.unidad, grupo: 0, cantidad, item: copia };
  p.partidas.push(partida);
  return partida;
}

/** Busca partidas por número (dentro de su módulo, formato "2.5") o por texto de la descripción. */
export function buscarPartidas(p: Proyecto, ref: string): Partida[] {
  const m = /^(\d+)\.(\d+)$/.exec(ref.trim());
  if (m) return p.partidas.filter((x) => x.modulo === Number(m[1]) && x.numero === Number(m[2]));
  const q = sinAcentos(ref);
  return p.partidas.filter((x) => sinAcentos(x.descripcion).includes(q));
}

export function buscarInsumos(p: Proyecto | BaseDatos, texto: string, rubro?: Insumo['rubro']): Insumo[] {
  const q = sinAcentos(texto);
  return p.insumos.filter((i) => (!rubro || i.rubro === rubro) && sinAcentos(i.descripcion).includes(q));
}

export function ajustarPrecios(insumos: Insumo[], porcentaje: number, decimales = 3): void {
  for (const i of insumos) i.precio = redondear(i.precio * (1 + porcentaje / 100), decimales);
}

/** Cambio de moneda: multiplica todos los precios por el tipo de cambio dado. */
export function cambiarMoneda(p: Proyecto, factor: number, nuevaMoneda: number): void {
  for (const i of p.insumos) i.precio = redondear(i.precio * factor, 4);
  p.moneda = nuevaMoneda;
}

/** Cantidad de una línea de cómputo: producto de las dimensiones informadas (veces por defecto 1). */
export const cantidadLinea = (l: { veces?: number; largo?: number; ancho?: number; alto?: number; cantidad?: number }): number =>
  l.cantidad ?? (l.veces ?? 1) * (l.largo ?? 1) * (l.ancho ?? 1) * (l.alto ?? 1);

export const cantidadDeComputo = (ls: { veces?: number; largo?: number; ancho?: number; alto?: number; cantidad?: number }[]): number =>
  ls.reduce((a, l) => a + cantidadLinea(l), 0);
