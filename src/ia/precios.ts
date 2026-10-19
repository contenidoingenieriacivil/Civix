import type { Proyecto } from '../datos/modelo';
import { sinAcentos } from '../nucleo/operaciones';
import { redondear } from '../nucleo/calculo';
import type { Insumo } from '../nucleo/tipos';
import { aNumero, normalizarUnidad } from './intercambio';

/**
 * Actualización de precios con ayuda de una IA: la IA lee un PDF/planilla de costos y devuelve
 * este JSON; Civix lo cruza con los insumos del proyecto, muestra qué cambiaría y aplica solo
 * lo que el usuario confirma.
 */
export interface ListaPrecios {
  civix: 1;
  tipo: 'precios';
  /** Moneda de la lista: "Bs" o "USD". Si difiere de la del proyecto se convierte con su tipo de cambio. */
  moneda?: string;
  fecha?: string;
  precios: { descripcion: string; unidad?: string; precio: number | string; rubro?: string; fecha?: string }[];
}

export interface CambioPrecio {
  insumo: Insumo;
  anterior: number;
  nuevo: number;
  variacion: number; // %
  coincidencia: 'exacta' | 'aproximada';
  /** Texto de la lista que originó el cambio. */
  origen: string;
  fecha: string | null;
  /** Las aproximadas llegan sin marcar: el usuario debe confirmarlas. */
  aceptar: boolean;
}

export interface InformeActualizacion {
  cambios: CambioPrecio[];
  sinCambio: number; // misma descripción y mismo precio
  sinCoincidencia: string[]; // líneas de la lista que no encontraron insumo
  invalidos: string[];
  /** Insumos del proyecto para los que la lista no trajo precio. */
  sinPrecioNuevo: Insumo[];
  errores: string[];
}

const RUBROS: Record<string, Insumo['rubro']> = { material: 'M', materiales: 'M', mano_de_obra: 'O', 'mano de obra': 'O', obrero: 'O', equipo: 'E', maquinaria: 'E' };

/** Palabras que distinguen insumos (medidas, diámetros) deben coincidir: se comparan como tokens. */
export const tokens = (s: string): string[] =>
  sinAcentos(s).replace(/[^a-z0-9ø/".,x]+/g, ' ').replace(/(\d)\s*(m2|m3|mm|cm|kg|pulg)\b/g, '$1$2').split(/\s+/).filter((t) => t.length > 0 && !['de', 'del', 'la', 'el', 'y', 'con', 'para', 'tipo', 'en'].includes(t));

export function similitud(a: string, b: string): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((t) => B.has(t)).length;
  // las cifras (diámetros, espesores, dosificaciones) deben coincidir: si difieren, no es el mismo insumo
  const num = (s: Set<string>) => [...s].filter((t) => /\d/.test(t)).sort().join('|');
  if (num(A) !== num(B)) return Math.min(0.5, inter / (A.size + B.size - inter));
  return inter / (A.size + B.size - inter);
}

const claveExacta = (s: string) => tokens(s).join(' ');

/** Cruza la lista con los insumos del proyecto y arma el informe (sin modificar nada). */
export function planificarActualizacion(proyecto: Proyecto, entrada: unknown, umbralAproximado = 0.75): InformeActualizacion {
  const inf: InformeActualizacion = { cambios: [], sinCambio: 0, sinCoincidencia: [], invalidos: [], sinPrecioNuevo: [], errores: [] };
  const lista = entrada as Partial<ListaPrecios> | null;
  if (!lista || typeof lista !== 'object' || lista.civix !== 1 || lista.tipo !== 'precios' || !Array.isArray(lista.precios)) {
    inf.errores.push('El archivo no es una lista de precios de Civix (se espera {"civix":1,"tipo":"precios","precios":[…]}).');
    return inf;
  }
  const moneda = String(lista.moneda ?? (proyecto.moneda === 1 ? 'USD' : 'Bs')).toUpperCase();
  const enDolares = /^(USD|\$US|\$|DOLAR)/.test(moneda);
  const factor = proyecto.moneda === 2 && enDolares ? proyecto.cambioDolar : proyecto.moneda === 1 && !enDolares ? 1 / proyecto.cambioDolar : 1;
  if (factor !== 1) inf.errores = []; // conversión informada en el resumen de la interfaz

  const tocados = new Set<number>();
  const usados = new Set<number>();
  for (const [k, x] of lista.precios.entries()) {
    const etq = `precios[${k + 1}] "${x?.descripcion ?? ''}"`;
    const precio = aNumero(x?.precio);
    if (!x?.descripcion?.trim() || precio === null || precio < 0) { inf.invalidos.push(`${etq}: descripción o precio no válido (${x?.precio})`); continue; }
    const rubro = x.rubro ? RUBROS[sinAcentos(x.rubro).replace(/ /g, '_')] ?? RUBROS[sinAcentos(x.rubro)] : undefined;
    const candidatos = proyecto.insumos.filter((i) => !rubro || i.rubro === rubro);
    const unidad = x.unidad ? normalizarUnidad(x.unidad) : '';
    const mismaUnidad = (i: Insumo) => !unidad || !i.unidad || sinAcentos(i.unidad) === sinAcentos(unidad);

    const exactos = candidatos.filter((i) => claveExacta(i.descripcion) === claveExacta(x.descripcion) && mismaUnidad(i));
    let elegidos = exactos, tipo: CambioPrecio['coincidencia'] = 'exacta';
    if (!exactos.length) {
      const puntuados = candidatos.filter(mismaUnidad).map((i) => ({ i, s: similitud(i.descripcion, x.descripcion) })).sort((a, b) => b.s - a.s);
      if (puntuados[0] && puntuados[0].s >= umbralAproximado && (!puntuados[1] || puntuados[0].s - puntuados[1].s >= 0.1)) { elegidos = [puntuados[0].i]; tipo = 'aproximada'; }
    }
    if (!elegidos.length) { inf.sinCoincidencia.push(`${x.descripcion}${unidad ? ` (${unidad})` : ''} — ${precio}`); continue; }
    const nuevo = redondear(precio * factor, 3);
    const fecha = x.fecha ?? lista.fecha ?? null;
    for (const insumo of elegidos) {
      usados.add(insumo.id);
      if (tocados.has(insumo.id)) { inf.invalidos.push(`${etq}: el insumo "${insumo.descripcion}" ya se actualizó con otra línea de la lista`); continue; }
      tocados.add(insumo.id);
      if (Math.abs(insumo.precio - nuevo) < 0.0005) { inf.sinCambio++; continue; }
      inf.cambios.push({ insumo, anterior: insumo.precio, nuevo, variacion: insumo.precio ? ((nuevo - insumo.precio) / insumo.precio) * 100 : 100, coincidencia: tipo, origen: x.descripcion, fecha, aceptar: tipo === 'exacta' });
    }
  }
  inf.sinPrecioNuevo = proyecto.insumos.filter((i) => !usados.has(i.id));
  return inf;
}

/** Aplica al proyecto solo los cambios con `aceptar`. Devuelve cuántos insumos cambió. */
export function aplicarActualizacion(proyecto: Proyecto, informe: InformeActualizacion): number {
  let n = 0;
  for (const c of informe.cambios) {
    if (!c.aceptar) continue;
    const i = proyecto.insumos.find((x) => x.id === c.insumo.id);
    if (!i) continue;
    i.precio = c.nuevo;
    if (c.fecha) i.cotizacion = c.fecha;
    n++;
  }
  return n;
}

/** Lista de insumos del proyecto para entregar a la IA junto con el documento de costos. */
export function exportarInsumosParaIA(proyecto: Proyecto) {
  return {
    civix: 1,
    tipo: 'insumos',
    moneda: proyecto.moneda === 1 ? 'USD' : 'Bs',
    insumos: proyecto.insumos.map((i) => ({ descripcion: i.descripcion, unidad: i.unidad, rubro: i.rubro === 'M' ? 'material' : i.rubro === 'O' ? 'mano_de_obra' : 'equipo', precioActual: i.precio })),
  };
}

/** Texto para pegar en cualquier IA, junto con el PDF o planilla de costos Y la lista de insumos exportada por Civix. */
export const INSTRUCCIONES_PRECIOS = `Te entrego dos cosas: (1) mi LISTA DE INSUMOS en JSON, exportada de mi proyecto, y (2) un documento de costos nuevo (PDF, planilla o cotización).
Tu trabajo es devolverme los precios NUEVOS de MIS insumos, usando el documento. Responde con UN SOLO JSON, sin texto adicional:

{
  "civix": 1,
  "tipo": "precios",
  "moneda": "Bs",
  "fecha": "2026-03-15",
  "precios": [
    { "descripcion": "Cemento Portland", "unidad": "Kg", "precio": 1.84, "rubro": "material" },
    { "descripcion": "Albañil", "unidad": "hr", "precio": 25.00, "rubro": "mano_de_obra" }
  ]
}

Reglas:
- Usa EXACTAMENTE las descripciones, unidades y rubros de mi lista. No inventes insumos nuevos ni cambies nombres.
- Convierte unidades cuando haga falta para que el precio esté en la unidad de MI lista (ej.: bolsa de 50 kg a Bs 92 → "Kg": 1.84; metro cúbico → m³; pie tablar → p2). Si la conversión es ambigua, omite ese insumo.
- "precio" con punto decimal, sin símbolos ni separadores de miles, en la moneda indicada en "moneda" ("Bs" o "USD"). Si el documento está en otra moneda que mi lista, dímelo al final (fuera del JSON) sin convertirla tú.
- "fecha": fecha de vigencia del documento (aaaa-mm-dd); omítela si no aparece.
- Si no encuentras un insumo en el documento, NO lo incluyas (conservaré su precio actual) y dime al final, fuera del JSON, cuáles faltaron.
- Si un precio es ilegible o dudoso, omítelo y avísame.`;
