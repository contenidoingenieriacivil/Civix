import type { BaseDatos, Partida, Proyecto } from '../datos/modelo';
import { calcularItem, redondear } from './calculo';
import { CRONOGRAMA_DEFECTO, esLaborable, programar } from './cronograma';
import { agregarItemDeBase, posicionesDelModulo, renumerar, sinAcentos, traerInsumo } from './operaciones';
import { calcularProyecto } from './presupuesto';
import type { Insumo, Item, Linea, Plantilla, Rubro } from './tipos';

// Herramientas del presupuesto equivalentes a las de PRESCOM 2013: insumos globales, igualar precio,
// copiar/pegar, módulos, calculadoras, flujos mensuales y exportación a MS Project.

const RUBRO_CLAVE = { M: 'materiales', O: 'manoObra', E: 'equipo' } as const;
const lineas = (i: Item) => [...i.materiales, ...i.manoObra, ...i.equipo];

/** Veces que cada insumo aparece en las partidas del proyecto. */
export function usoDeInsumos(p: Proyecto): Map<number, number> {
  const m = new Map<number, number>();
  for (const x of p.partidas) for (const l of lineas(x.item)) m.set(l.insumo, (m.get(l.insumo) ?? 0) + 1);
  return m;
}

/** Reemplaza un insumo por otro (del mismo rubro) en todas las partidas; si ya estaba, suma rendimientos. Devuelve cuántas partidas cambió. */
export function reemplazarInsumo(p: Proyecto, de: number, por: number): number {
  const a = p.insumos.find((i) => i.id === de), b = p.insumos.find((i) => i.id === por);
  if (!a || !b || de === por) return 0;
  if (a.rubro !== b.rubro) throw new Error('Solo se puede reemplazar por un insumo del mismo rubro');
  let n = 0;
  for (const x of p.partidas) {
    const ls = x.item[RUBRO_CLAVE[a.rubro]];
    const k = ls.findIndex((l) => l.insumo === de);
    if (k < 0) continue;
    n++;
    const ya = ls.find((l) => l.insumo === por);
    if (ya) { ya.rendimiento += ls[k]!.rendimiento; ls.splice(k, 1); } else ls[k] = { ...ls[k]!, insumo: por };
  }
  if (!usoDeInsumos(p).has(de)) p.insumos = p.insumos.filter((i) => i.id !== de);
  return n;
}

export function eliminarInsumosSinUso(p: Proyecto): number {
  const uso = usoDeInsumos(p);
  const antes = p.insumos.length;
  p.insumos = p.insumos.filter((i) => uso.has(i.id));
  return antes - p.insumos.length;
}

/** Toma de la base los precios de los insumos del proyecto con el mismo nombre y rubro. */
export function sincronizarPreciosConBase(p: Proyecto, base: BaseDatos): { actualizados: number; sinCoincidencia: string[] } {
  const idx = new Map(base.insumos.map((i) => [`${i.rubro}|${sinAcentos(i.descripcion)}`, i]));
  let actualizados = 0;
  const sinCoincidencia: string[] = [];
  for (const i of p.insumos) {
    const b = idx.get(`${i.rubro}|${sinAcentos(i.descripcion)}`);
    if (!b) { sinCoincidencia.push(i.descripcion); continue; }
    if (b.precio !== i.precio) { i.precio = b.precio; i.cotizacion = b.cotizacion; actualizados++; }
  }
  return { actualizados, sinCoincidencia };
}

/**
 * Igualar precio unitario (cálculo inverso de PRESCOM): multiplica los rendimientos por un mismo factor para que el
 * análisis dé el precio pedido. Con `soloManoObraYEquipo` no toca los materiales.
 */
export function igualarPrecioUnitario(item: Item, insumos: ReadonlyMap<number, Insumo>, plantilla: Plantilla, objetivo: number, soloManoObraYEquipo = false): { item: Item; factor: number } {
  if (!(objetivo > 0)) throw new Error('El precio objetivo debe ser mayor que cero');
  const variable = (r: Rubro) => !soloManoObraYEquipo || r !== 'M';
  const con = (k: number): Item => ({ ...item, precioFijo: undefined,
    materiales: item.materiales.map((l) => ({ ...l, rendimiento: variable('M') ? l.rendimiento * k : l.rendimiento })),
    manoObra: item.manoObra.map((l) => ({ ...l, rendimiento: l.rendimiento * k })),
    equipo: item.equipo.map((l) => ({ ...l, rendimiento: l.rendimiento * k })) });
  const pu = (k: number) => calcularItem(con(k), insumos, plantilla, 6).valores.Q ?? 0;
  const fijo = pu(0), uno = pu(1);
  if (uno - fijo <= 1e-9) throw new Error(soloManoObraYEquipo ? 'El análisis no tiene mano de obra ni equipo con costo' : 'El análisis no tiene insumos con costo');
  const factor = (objetivo - fijo) / (uno - fijo);
  if (factor <= 0) throw new Error(`Con solo mano de obra y equipo no se puede bajar a ${objetivo}: los materiales ya cuestan más`);
  const r = con(factor);
  for (const c of ['materiales', 'manoObra', 'equipo'] as const) for (const l of r[c]) l.rendimiento = redondear(l.rendimiento, 6);
  delete r.precioFijo;
  return { item: r, factor };
}

/** Cambia el ítem (análisis) de una partida por otro de una base, conservando cantidad, cómputo y cronograma. */
export function reemplazarItemDePartida(p: Proyecto, posicion: number, base: BaseDatos, itemId: number): void {
  const x = p.partidas[posicion];
  if (!x) return;
  const nueva = agregarItemDeBase(p, base, itemId, x.modulo, x.cantidad);
  p.partidas.pop();
  x.item = { ...nueva.item, id: x.item.id };
  x.descripcion = nueva.descripcion;
  x.unidad = nueva.unidad;
  delete x.sinDetalle;
  delete x.referenciaPrescom;
}

/** Copia un módulo completo justo después del original. Devuelve la posición del nuevo módulo. */
export function duplicarModulo(p: Proyecto, modulo: number): number {
  const m = p.modulos[modulo - 1];
  if (!m) return modulo;
  for (const x of p.partidas) if (x.modulo > modulo) x.modulo++;
  for (const mm of p.modulos) if (mm.despuesDe !== undefined && mm.despuesDe > modulo) mm.despuesDe++;
  p.modulos.splice(modulo, 0, { ...structuredClone(m), nombre: `${m.nombre} (COPIA)`.slice(0, 50), despuesDe: modulo });
  delete p.modulos[modulo]!.despuesDeActividad;
  let id = Math.max(0, ...p.partidas.map((x) => x.item.id));
  const copias = p.partidas.filter((x) => x.modulo === modulo).map((x) => { const c = structuredClone(x); c.modulo = modulo + 1; c.item.id = ++id; delete c.referenciaPrescom; return c; });
  const pos = posicionesDelModulo(p, modulo);
  p.partidas.splice((pos.at(-1) ?? p.partidas.length - 1) + 1, 0, ...copias);
  renumerar(p);
  return modulo + 1;
}

/** Pasa todas las partidas de un módulo al final de otro y elimina el primero (integrar módulos). */
export function unirModulos(p: Proyecto, de: number, a: number): void {
  if (de === a || !p.modulos[de - 1] || !p.modulos[a - 1]) return;
  const mover = p.partidas.filter((x) => x.modulo === de);
  p.partidas = p.partidas.filter((x) => x.modulo !== de);
  for (const x of mover) { x.modulo = a; delete x.predecesor; }
  const pos = posicionesDelModulo(p, a);
  p.partidas.splice((pos.at(-1) ?? p.partidas.length - 1) + 1, 0, ...mover);
  // quitar el módulo vacío y renumerar
  for (const x of p.partidas) if (x.modulo > de) x.modulo--;
  p.modulos.splice(de - 1, 1);
  for (const m of p.modulos) {
    if (m.despuesDe === de) { delete m.despuesDe; delete m.despuesDeActividad; } else if (m.despuesDe !== undefined && m.despuesDe > de) m.despuesDe--;
  }
  renumerar(p);
}

// --- Copiar y pegar partidas ---------------------------------------------------------------------

export interface Portapapeles { partidas: Partida[]; insumos: Insumo[] }

export function copiarPartidas(p: Proyecto, posiciones: number[]): Portapapeles {
  const partidas = posiciones.map((i) => p.partidas[i]).filter((x): x is Partida => !!x).map((x) => structuredClone(x));
  const ids = new Set(partidas.flatMap((x) => lineas(x.item).map((l) => l.insumo)));
  return { partidas, insumos: p.insumos.filter((i) => ids.has(i.id)).map((i) => ({ ...i })) };
}

/** Pega partidas (con sus insumos) en un módulo, después de la posición dada o al final. Devuelve las posiciones nuevas. */
export function pegarPartidas(p: Proyecto, c: Portapapeles, modulo: number, despuesDe?: number): number[] {
  const porId = new Map(c.insumos.map((i) => [i.id, i]));
  const mapa = (ls: Linea[]) => ls.flatMap((l) => { const i = porId.get(l.insumo); return i ? [{ insumo: traerInsumo(p, i), rendimiento: l.rendimiento }] : []; });
  let id = Math.max(0, ...p.partidas.map((x) => x.item.id));
  const nuevas = c.partidas.map((x) => {
    const n = structuredClone(x);
    n.modulo = modulo; n.item.id = ++id;
    n.item.materiales = mapa(x.item.materiales); n.item.manoObra = mapa(x.item.manoObra); n.item.equipo = mapa(x.item.equipo);
    delete n.predecesor; delete n.referenciaPrescom;
    return n;
  });
  const pos = posicionesDelModulo(p, modulo);
  const destino = despuesDe !== undefined && p.partidas[despuesDe]?.modulo === modulo ? despuesDe + 1 : (pos.at(-1) ?? p.partidas.length - 1) + 1;
  p.partidas.splice(destino, 0, ...nuevas);
  renumerar(p);
  return nuevas.map((_, k) => destino + k);
}

/** Texto copiado de Excel (columnas descripción, unidad, cantidad, precio unitario) → partidas con precio directo. */
export function partidasDesdeTabla(texto: string): { descripcion: string; unidad: string; cantidad: number; precio: number }[] {
  const num = (s: string | undefined): number | null => {
    const t = (s ?? '').trim().replace(/\s/g, '');
    if (!t) return null;
    const l = t.includes(',') ? (t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')) : t;
    const n = Number(l);
    return Number.isFinite(n) ? n : null;
  };
  const out: { descripcion: string; unidad: string; cantidad: number; precio: number }[] = [];
  for (const fila of texto.split(/\r?\n/)) {
    if (!fila.trim()) continue;
    let c = fila.split('\t');
    if (c.length < 3) c = fila.split(';');
    c = c.map((x) => x.trim());
    // se admite una columna inicial de número de ítem (1, 2.3…)
    if (c.length >= 5 && /^\d+(\.\d+)*$/.test(c[0]!) && num(c[3]) !== null) c = c.slice(1);
    const [descripcion, unidad, cant, precio] = c;
    const q = num(cant), pu = num(precio);
    if (!descripcion || q === null || q < 0) continue; // encabezados y filas sin cantidad
    out.push({ descripcion: descripcion.slice(0, 70), unidad: (unidad ?? '').slice(0, 5), cantidad: q, precio: pu !== null && pu >= 0 ? pu : 0 });
  }
  return out;
}

/** Tabla para pegar en Excel: N°, descripción, unidad, cantidad, P.U., parcial. */
export function partidasATabla(p: Proyecto, posiciones: number[]): string {
  const c = calcularProyecto(p);
  const filas = c.modulos.flatMap((m) => m.partidas.filter((x) => posiciones.includes(p.partidas.indexOf(x.partida))).map((x) =>
    [`${m.indice}.${x.numero}`, x.partida.descripcion, x.partida.unidad, String(x.partida.cantidad).replace('.', ','), String(x.precioUnitario).replace('.', ','), String(x.parcial).replace('.', ',')].join('\t')));
  return ['N°\tDescripción\tUnidad\tCantidad\tP. unitario\tParcial', ...filas].join('\n');
}

// --- Calculadoras ----------------------------------------------------------------------------------

/** Peso del acero de refuerzo: kg/m = d² / 162 (d en mm). */
export const pesoFierro = (diametroMm: number, longitudM: number, piezas = 1) => redondear((diametroMm ** 2 / 162) * longitudM * piezas, 3);
export const kgPorMetro = (diametroMm: number) => redondear(diametroMm ** 2 / 162, 3);
/** Madera en pies tablares (pie²): espesor (pulg) × ancho (pulg) × largo (pies) / 12. */
export const piesTablares = (espesorPulg: number, anchoPulg: number, largoM: number, piezas = 1) => redondear((espesorPulg * anchoPulg * (largoM / 0.3048)) / 12 * piezas, 3);

// --- Flujos mensuales según el cronograma -----------------------------------------------------------

const DIA = 86_400_000;
const aMs = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y!, m! - 1, d!); };
const mesDe = (ms: number) => new Date(ms).toISOString().slice(0, 7);

/** Reparte un valor entre los días laborables de la actividad y lo acumula por mes. */
function repartir(acum: Map<string, number>, inicio: string, fin: string, valor: number, n: number) {
  const dias: number[] = [];
  for (let t = aMs(inicio); t <= aMs(fin); t += DIA) if (esLaborable(t, n)) dias.push(t);
  if (!dias.length) dias.push(aMs(inicio));
  for (const t of dias) acum.set(mesDe(t), (acum.get(mesDe(t)) ?? 0) + valor / dias.length);
}

export interface Flujo { meses: string[]; filas: { nombre: string; valores: number[]; total: number }[]; total: number[]; acumulado: number[]; porcentajeAcumulado: number[] }

function armarFlujo(filas: { nombre: string; acum: Map<string, number> }[]): Flujo {
  const meses = [...new Set(filas.flatMap((f) => [...f.acum.keys()]))].sort();
  const fs = filas.map((f) => { const valores = meses.map((m) => redondear(f.acum.get(m) ?? 0, 2)); return { nombre: f.nombre, valores, total: redondear(valores.reduce((a, b) => a + b, 0), 2) }; }).filter((f) => f.total !== 0);
  const total = meses.map((_, k) => redondear(fs.reduce((a, f) => a + f.valores[k]!, 0), 2));
  let s = 0;
  const acumulado = total.map((v) => (s = redondear(s + v, 2)));
  const gran = acumulado.at(-1) ?? 0;
  return { meses, filas: fs, total, acumulado, porcentajeAcumulado: acumulado.map((v) => (gran ? redondear((v / gran) * 100, 2) : 0)) };
}

/** Flujo de inversiones (plan de desembolsos): el parcial de cada partida repartido en los meses de su ejecución, por módulo. */
export function flujoInversiones(p: Proyecto): Flujo {
  const c = calcularProyecto(p);
  const g = programar(p);
  const n = (p.cronograma ?? CRONOGRAMA_DEFECTO).diasLaborables;
  return armarFlujo(g.modulos.map((m, k) => {
    const acum = new Map<string, number>();
    m.actividades.forEach((a, i) => repartir(acum, a.inicio, a.fin, c.modulos[k]!.partidas[i]!.parcial, n));
    return { nombre: m.nombre, acum };
  }));
}

/** Requerimiento mensual de un rubro: cantidad (horas de mano de obra, unidades de material o de equipo) por insumo y mes. */
export function requerimientoMensual(p: Proyecto, rubro: Rubro): Flujo {
  const g = programar(p);
  const n = (p.cronograma ?? CRONOGRAMA_DEFECTO).diasLaborables;
  const h = (p.cronograma ?? CRONOGRAMA_DEFECTO).horasDia;
  const porId = new Map(p.insumos.map((i) => [i.id, i]));
  // Se agrupan las variantes de precio de un mismo insumo; la mano de obra en jornales se pasa a horas.
  const clave = (id: number) => {
    const i = porId.get(id);
    if (!i) return { nombre: `Insumo ${id}`, factor: 1 };
    const nombre = i.descripcion.replace(/\s*\[Bs [\d.,]+\]$/, '');
    if (rubro === 'O' && /^(jorn|jornal|jornales|d[ií]a|d)$/i.test(i.unidad.trim())) return { nombre: `${nombre} (hr)`, factor: h };
    return { nombre: `${nombre} (${rubro === 'O' ? 'hr' : i.unidad})`, factor: 1 };
  };
  const porNombre = new Map<string, Map<string, number>>();
  const nombres = new Map<string, string>();
  for (const m of g.modulos) for (const a of m.actividades) {
    for (const l of a.partida.item[RUBRO_CLAVE[rubro]]) {
      const k = clave(l.insumo);
      const id = sinAcentos(k.nombre); // «Topógrafo», «TOPOGRAFO» y «Topografo» son el mismo
      if (!porNombre.has(id)) { porNombre.set(id, new Map()); nombres.set(id, k.nombre); }
      repartir(porNombre.get(id)!, a.inicio, a.fin, l.rendimiento * a.partida.cantidad * k.factor, n);
    }
  }
  return armarFlujo([...porNombre].map(([id, acum]) => ({ nombre: nombres.get(id)!, acum })));
}

// --- MS Project (XML de intercambio MSPDI) ------------------------------------------------------------

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Exporta el cronograma a MS Project (Archivo → Abrir → XML): módulos como resumen, actividades con duración y predecesoras. */
export function exportarMsProject(p: Proyecto): string {
  const g = programar(p);
  const cfg = p.cronograma ?? CRONOGRAMA_DEFECTO;
  const h = cfg.horasDia;
  let uid = 0;
  const tareas: string[] = [];
  const duracion = (d: number) => `PT${Math.round(d * h * 100) / 100}H0M0S`;
  for (const m of g.modulos) {
    const um = ++uid;
    tareas.push(`<Task><UID>${um}</UID><ID>${um}</ID><Name>${xml(m.nombre)}</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary><Start>${m.inicio}T08:00:00</Start><Finish>${m.fin}T17:00:00</Finish></Task>`);
    const base = uid;
    for (const a of m.actividades) {
      const u = ++uid;
      const pred = a.predecesor ? `<PredecessorLink><PredecessorUID>${base + a.predecesor}</PredecessorUID><Type>1</Type></PredecessorLink>` : '';
      tareas.push(`<Task><UID>${u}</UID><ID>${u}</ID><Name>${xml(a.partida.descripcion)}</Name><OutlineLevel>2</OutlineLevel><Duration>${duracion(a.duracion)}</Duration><DurationFormat>7</DurationFormat><Start>${a.inicio}T08:00:00</Start><Finish>${a.fin}T17:00:00</Finish><ManualStart>${a.inicio}T08:00:00</ManualStart>${pred}</Task>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project"><Name>${xml(p.nombre)}</Name><Title>${xml(p.nombre)}</Title><StartDate>${g.inicio}T08:00:00</StartDate><MinutesPerDay>${h * 60}</MinutesPerDay><MinutesPerWeek>${h * 60 * cfg.diasLaborables}</MinutesPerWeek><DaysPerMonth>${Math.round(cfg.diasLaborables * 4.33)}</DaysPerMonth><Tasks>${tareas.join('')}</Tasks></Project>`;
}
