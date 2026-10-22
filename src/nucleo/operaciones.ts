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

// ---------------------------------------------------------------------------------------------
// Edición del presupuesto: estas funciones mantienen coherentes la numeración, las predecesoras
// del cronograma (posiciones dentro del módulo) y las referencias entre módulos («despuesDe»).

/** Posiciones (en p.partidas) de las partidas de un módulo, en su orden. */
export const posicionesDelModulo = (p: Proyecto, modulo: number): number[] => p.partidas.flatMap((x, i) => (x.modulo === modulo ? [i] : []));

/** Vuelve a numerar 1, 2, 3… las partidas de cada módulo según su orden. */
export function renumerar(p: Proyecto): void {
  const n = new Map<number, number>();
  for (const x of p.partidas) { const k = (n.get(x.modulo) ?? 0) + 1; n.set(x.modulo, k); x.numero = k; }
}

/** Reemplaza el orden de las partidas de un módulo; `orden` son las posiciones antiguas (1…n) en el orden nuevo, o null si la partida se quita. */
function reordenarModulo(p: Proyecto, modulo: number, orden: number[], quitada?: number): void {
  const pos = posicionesDelModulo(p, modulo);
  const viejas = pos.map((i) => p.partidas[i]!);
  const nueva = new Map<number, number>(); // posición antigua (1…n) → nueva (1…n)
  orden.forEach((v, k) => nueva.set(v, k + 1));
  for (const x of viejas) {
    if (x.predecesor === undefined || x.predecesor === 0) continue;
    if (x.predecesor === quitada) delete x.predecesor; // pasa a depender de la anterior
    else x.predecesor = nueva.get(x.predecesor) ?? 0;
  }
  const resto = p.partidas.filter((x) => x.modulo !== modulo);
  const primera = pos[0] ?? p.partidas.length;
  const antes = p.partidas.slice(0, primera).filter((x) => x.modulo !== modulo).length;
  const delModulo = orden.map((v) => viejas[v - 1]!);
  p.partidas = [...resto.slice(0, antes), ...delModulo, ...resto.slice(antes)];
  renumerar(p);
}

export function eliminarPartida(p: Proyecto, posicion: number): void {
  const x = p.partidas[posicion];
  if (!x) return;
  const pos = posicionesDelModulo(p, x.modulo);
  const enModulo = pos.indexOf(posicion) + 1;
  reordenarModulo(p, x.modulo, pos.map((_, k) => k + 1).filter((v) => v !== enModulo), enModulo);
}

/** Sube (−1) o baja (+1) una partida dentro de su módulo. Devuelve su nueva posición en p.partidas. */
export function moverPartida(p: Proyecto, posicion: number, dir: -1 | 1): number {
  const x = p.partidas[posicion];
  if (!x) return posicion;
  const pos = posicionesDelModulo(p, x.modulo);
  const k = pos.indexOf(posicion);
  const j = k + dir;
  if (j < 0 || j >= pos.length) return posicion;
  const orden = pos.map((_, i) => i + 1);
  [orden[k], orden[j]] = [orden[j]!, orden[k]!];
  reordenarModulo(p, x.modulo, orden);
  return p.partidas.indexOf(x);
}

const siguienteItemId = (p: Proyecto) => Math.max(0, ...p.partidas.map((x) => x.item.id)) + 1;

/** Copia la partida justo debajo de ella. Devuelve la posición de la copia. */
export function duplicarPartida(p: Proyecto, posicion: number): number {
  const x = p.partidas[posicion];
  if (!x) return posicion;
  const copia = structuredClone(x);
  copia.item.id = siguienteItemId(p);
  delete copia.predecesor;
  delete copia.referenciaPrescom;
  p.partidas.splice(posicion + 1, 0, copia);
  // las predecesoras que apuntaban más abajo se corren un lugar
  const pos = posicionesDelModulo(p, x.modulo);
  const lugar = pos.indexOf(posicion + 1) + 1;
  for (const i of pos) { const y = p.partidas[i]!; if (y !== copia && y.predecesor !== undefined && y.predecesor >= lugar) y.predecesor++; }
  renumerar(p);
  return posicion + 1;
}

/** Pasa la partida al final de otro módulo. */
export function moverAModulo(p: Proyecto, posicion: number, modulo: number): number {
  const x = p.partidas[posicion];
  if (!x || modulo < 1 || modulo > p.modulos.length || modulo === x.modulo) return posicion;
  const copia = structuredClone(x);
  eliminarPartida(p, posicion);
  copia.modulo = modulo;
  delete copia.predecesor;
  const pos = posicionesDelModulo(p, modulo);
  const destino = pos.length ? pos[pos.length - 1]! + 1 : p.partidas.length;
  p.partidas.splice(destino, 0, copia);
  renumerar(p);
  return destino;
}

/** Partida con precio unitario directo (cotización o sin análisis de insumos). */
export function nuevaPartidaDirecta(p: Proyecto, modulo: number, d: { descripcion: string; unidad: string; cantidad: number; precio: number }): number {
  const pos = posicionesDelModulo(p, modulo);
  const destino = pos.length ? pos[pos.length - 1]! + 1 : p.partidas.length;
  const descripcion = d.descripcion.trim().slice(0, 70) || 'Partida nueva';
  const unidad = d.unidad.trim().slice(0, 5);
  p.partidas.splice(destino, 0, { modulo, numero: 0, descripcion, unidad, grupo: 0, cantidad: d.cantidad,
    item: { id: siguienteItemId(p), descripcion, unidad, grupo: 0, materiales: [], manoObra: [], equipo: [], precioFijo: d.precio } });
  renumerar(p);
  return destino;
}

/** Quita un módulo con sus partidas; los módulos siguientes se renumeran. */
export function eliminarModulo(p: Proyecto, modulo: number): void {
  if (modulo < 1 || modulo > p.modulos.length) return;
  p.partidas = p.partidas.filter((x) => x.modulo !== modulo);
  for (const x of p.partidas) if (x.modulo > modulo) x.modulo--;
  p.modulos.splice(modulo - 1, 1);
  for (const m of p.modulos) {
    if (m.despuesDe === modulo) { delete m.despuesDe; delete m.despuesDeActividad; }
    else if (m.despuesDe !== undefined && m.despuesDe > modulo) m.despuesDe--;
  }
  if (!p.modulos.length) p.modulos.push({ nombre: 'MÓDULO 1', inicio: null, fin: null });
  renumerar(p);
}

/** Cambia de lugar un módulo con el de al lado (−1 izquierda, +1 derecha). Devuelve su nueva posición. */
export function moverModulo(p: Proyecto, modulo: number, dir: -1 | 1): number {
  const otro = modulo + dir;
  if (modulo < 1 || modulo > p.modulos.length || otro < 1 || otro > p.modulos.length) return modulo;
  const cambio = (k: number) => (k === modulo ? otro : k === otro ? modulo : k);
  [p.modulos[modulo - 1], p.modulos[otro - 1]] = [p.modulos[otro - 1]!, p.modulos[modulo - 1]!];
  for (const x of p.partidas) x.modulo = cambio(x.modulo);
  for (const m of p.modulos) if (m.despuesDe !== undefined) m.despuesDe = cambio(m.despuesDe);
  // el orden plano sigue al de los módulos
  p.partidas.sort((a, b) => a.modulo - b.modulo);
  renumerar(p);
  return otro;
}

const RUBRO_CLAVE = { M: 'materiales', O: 'manoObra', E: 'equipo' } as const;

/** Crea (o reutiliza, si ya existe con el mismo nombre y rubro) un insumo del proyecto. */
export function nuevoInsumo(p: Proyecto, d: { descripcion: string; unidad: string; rubro: Insumo['rubro']; precio: number }): number {
  return traerInsumo(p, { id: 0, rubro: d.rubro, descripcion: d.descripcion.trim().slice(0, 70), unidad: d.unidad.trim().slice(0, 5), precio: d.precio, cotizacion: null, grupo: 0 });
}

/** Añade un insumo al análisis de una partida (si ya está, suma el rendimiento). */
export function agregarLineaApu(p: Proyecto, posicion: number, insumo: number, rendimiento: number): void {
  const x = p.partidas[posicion];
  const i = p.insumos.find((y) => y.id === insumo);
  if (!x || !i) return;
  const ls = x.item[RUBRO_CLAVE[i.rubro]];
  const ya = ls.find((l) => l.insumo === insumo);
  if (ya) ya.rendimiento += rendimiento; else ls.push({ insumo, rendimiento });
  delete x.sinDetalle;
}

export function quitarLineaApu(p: Proyecto, posicion: number, rubro: Insumo['rubro'], indice: number): void {
  p.partidas[posicion]?.item[RUBRO_CLAVE[rubro]].splice(indice, 1);
}

/** Copia el análisis de una partida del proyecto a una base de datos como ítem (para reutilizarlo en otros proyectos). */
export function partidaABase(p: Proyecto, posicion: number, base: BaseDatos): { id: number; reemplazado: boolean } {
  const x = p.partidas[posicion];
  if (!x) throw new Error('No hay partida seleccionada');
  const porId = new Map(p.insumos.map((i) => [i.id, i]));
  const traer = (id: number): number => {
    const i = porId.get(id)!;
    const q = sinAcentos(i.descripcion);
    const igual = base.insumos.find((y) => y.rubro === i.rubro && sinAcentos(y.descripcion) === q);
    if (igual) return igual.id;
    const nuevo = Math.max(0, ...base.insumos.map((y) => y.id)) + 1;
    base.insumos.push({ ...i, id: nuevo });
    return nuevo;
  };
  const mapa = (ls: Linea[]) => ls.filter((l) => porId.has(l.insumo)).map((l) => ({ insumo: traer(l.insumo), rendimiento: l.rendimiento }));
  const previo = base.items.find((i) => sinAcentos(i.descripcion) === sinAcentos(x.descripcion) && i.unidad === x.unidad);
  const id = previo?.id ?? Math.max(0, ...base.items.map((i) => i.id)) + 1;
  const item: Item = { ...structuredClone(x.item), id, descripcion: x.descripcion, unidad: x.unidad, materiales: mapa(x.item.materiales), manoObra: mapa(x.item.manoObra), equipo: mapa(x.item.equipo) };
  if (previo) base.items[base.items.indexOf(previo)] = item; else base.items.push(item);
  return { id, reemplazado: !!previo };
}

/** Insumos de una base que ningún ítem usa (se pueden borrar sin dañar análisis). */
export function insumoEnUso(b: BaseDatos | Proyecto, id: number): boolean {
  const items = 'items' in b ? b.items : b.partidas.map((x) => x.item);
  return items.some((i) => [...i.materiales, ...i.manoObra, ...i.equipo].some((l) => l.insumo === id));
}
