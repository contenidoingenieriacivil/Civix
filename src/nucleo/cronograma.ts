import type { Partida, Proyecto } from '../datos/modelo';

export interface ConfigCronograma {
  /** Horas de trabajo por día. */
  horasDia: number;
  /** Días laborables por semana a partir del lunes (6 = lunes a sábado). */
  diasLaborables: number;
  /** Usar el rendimiento máximo de la mano de obra en lugar del promedio (como PRESCOM 2013). */
  rendimientoMaximo: boolean;
}

export const CRONOGRAMA_DEFECTO: ConfigCronograma = { horasDia: 8, diasLaborables: 6, rendimientoMaximo: false };

export interface Actividad {
  partida: Partida;
  /** Posición del módulo (base 1) y de la actividad dentro de él. */
  modulo: number;
  posicion: number;
  duracion: number; // días laborables
  inicio: string; // yyyy-mm-dd
  fin: string;
  /** Posición de la predecesora en el módulo (0 = ninguna). */
  predecesor: number;
  holgura: number; // días laborables
  critica: boolean;
}

export interface ModuloProgramado {
  indice: number;
  nombre: string;
  inicio: string;
  fin: string;
  actividades: Actividad[];
}

export interface Programa {
  inicio: string;
  fin: string;
  modulos: ModuloProgramado[];
  /** Días calendario de la obra. */
  diasCalendario: number;
  config: ConfigCronograma;
}

const DIA = 86_400_000;
const aMs = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y!, m! - 1, d!); };
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const diaSemana = (ms: number) => (new Date(ms).getUTCDay() + 6) % 7; // 0 = lunes
export const esLaborable = (ms: number, n: number) => diaSemana(ms) < n;

/** Primer día laborable igual o posterior a la fecha. */
export function siguienteLaborable(iso: string, n: number): string {
  let ms = aMs(iso);
  while (!esLaborable(ms, n)) ms += DIA;
  return aIso(ms);
}

/** Avanza `dias` días laborables desde una fecha laborable. */
export function sumarLaborables(iso: string, dias: number, n: number): string {
  let ms = aMs(iso);
  while (dias > 0) { ms += DIA; if (esLaborable(ms, n)) dias--; }
  return aIso(ms);
}

/** Número de día laborable (continuo) de una fecha, para comparar posiciones. */
export function indiceLaborable(iso: string, n: number): number {
  const d = Math.floor(aMs(iso) / DIA) + 3; // 1970-01-01 fue jueves
  return Math.floor(d / 7) * n + Math.min(d % 7, n);
}

/** ¿El plazo de esta partida tiene fundamento (días fijados o mano de obra en su análisis)? Si no, se asume 1 día. */
export const tienePlazo = (p: Partida): boolean => (p.duracion !== undefined && p.duracion > 0) || p.item.manoObra.some((l) => l.rendimiento > 0);

/** Rendimiento de mano de obra por unidad de ítem (horas): promedio o máximo de sus obreros. */
export function rendimientoManoObra(p: Partida, max: boolean): number {
  const r = p.item.manoObra.map((l) => l.rendimiento).filter((x) => x > 0);
  if (!r.length) return 0;
  return max ? Math.max(...r) : r.reduce((a, b) => a + b, 0) / r.length;
}

/** Duración en días laborables: la fijada (admite fracciones) o cantidad × horas/unidad ÷ (horas por día × cuadrilla), redondeada, mínimo 1. */
export function duracionDias(p: Partida, cfg: ConfigCronograma): number {
  if (p.duracion !== undefined && p.duracion > 0) return p.duracion;
  const horas = p.cantidad * rendimientoManoObra(p, cfg.rendimientoMaximo);
  return Math.max(1, Math.round(horas / (cfg.horasDia * Math.max(1, p.cuadrilla ?? 1))));
}

/**
 * Programa el proyecto con tiempos fraccionarios (en días laborables desde el inicio): cada actividad empieza
 * cuando termina su predecesora (por defecto la anterior del módulo). Un módulo empieza en su fecha de inicio,
 * al terminar el módulo indicado en `despuesDe` o, por defecto, al terminar el módulo anterior de la lista.
 * Calcula holguras y ruta crítica por módulo.
 */
export function programar(p: Proyecto, config: ConfigCronograma = p.cronograma ?? CRONOGRAMA_DEFECTO): Programa {
  const n = config.diasLaborables;
  const nombres: Proyecto['modulos'] = p.modulos.length ? p.modulos : [{ nombre: 'MÓDULO ÚNICO', inicio: null, fin: null }];
  const fechas = nombres.flatMap((m) => (m.inicio ? [m.inicio] : []));
  if (!nombres[0]!.inicio) fechas.push(p.fecha ?? new Date().toISOString().slice(0, 10));
  const base = siguienteLaborable([...fechas].sort()[0]!, n);
  const baseIdx = indiceLaborable(base, n);
  const fecha = (t: number) => sumarLaborables(base, Math.max(0, Math.floor(t + 1e-9)), n);
  const fechaFin = (ini: number, fin: number) => sumarLaborables(base, Math.max(Math.floor(ini + 1e-9), Math.ceil(fin - 1e-9) - 1), n);

  interface Interno { a: Actividad; t0: number; t1: number }
  const hechos: ({ mod: ModuloProgramado; internos: Interno[]; fin: number } | undefined)[] = new Array(nombres.length);
  const enCursoMod = new Set<number>();

  const moduloK = (k: number): { mod: ModuloProgramado; internos: Interno[]; fin: number } => {
    if (hechos[k]) return hechos[k]!;
    const m = nombres[k]!;
    const partidas = p.partidas.filter((x) => (p.modulos.length ? x.modulo === k + 1 : true));
    // inicio del módulo
    let t0 = 0;
    const previo = m.despuesDe !== undefined ? m.despuesDe - 1 : k - 1;
    if (m.inicio) t0 = Math.max(0, indiceLaborable(siguienteLaborable(m.inicio, n), n) - baseIdx);
    else if (previo >= 0 && previo < nombres.length && previo !== k && !enCursoMod.has(previo)) {
      enCursoMod.add(k);
      const pm = moduloK(previo);
      enCursoMod.delete(k);
      const ref = m.despuesDe !== undefined && m.despuesDeActividad ? pm.internos[m.despuesDeActividad - 1] : undefined;
      t0 = ref ? ref.t1 : m.despuesDe !== undefined ? pm.fin : Math.max(0, Math.ceil(pm.fin - 1e-9) - 1);
    }
    const internos: Interno[] = new Array(partidas.length);
    const enCurso = new Set<number>();
    const calcular = (pos: number): Interno => {
      if (internos[pos]) return internos[pos]!;
      const partida = partidas[pos]!;
      const pred = partida.predecesor === undefined ? pos : partida.predecesor; // por defecto, la anterior (1-based = pos)
      const duracion = duracionDias(partida, config);
      let ini = t0;
      let predValida = 0;
      if (pred >= 1 && pred <= partidas.length && pred - 1 !== pos && !enCurso.has(pred - 1)) {
        enCurso.add(pos);
        const x = calcular(pred - 1);
        enCurso.delete(pos);
        ini = x.t1;
        predValida = pred;
      }
      const fin = ini + duracion;
      const a: Actividad = { partida, modulo: k + 1, posicion: pos + 1, duracion, inicio: fecha(ini), fin: fechaFin(ini, fin), predecesor: predValida, holgura: 0, critica: false };
      return (internos[pos] = { a, t0: ini, t1: fin });
    };
    partidas.forEach((_, i) => calcular(i));

    // Ruta crítica: pasada hacia atrás sobre la red de predecesoras del módulo.
    const finMod = internos.reduce((mx, x) => Math.max(mx, x.t1), t0);
    const lf = internos.map(() => finMod);
    const orden = [...internos.keys()].sort((u, v) => internos[v]!.t1 - internos[u]!.t1);
    for (const i of orden) {
      const x = internos[i]!;
      if (x.a.predecesor) lf[x.a.predecesor - 1] = Math.min(lf[x.a.predecesor - 1]!, lf[i]! - x.a.duracion);
    }
    internos.forEach((x, i) => { const h = lf[i]! - x.t1; x.a.holgura = Math.round(h * 100) / 100; x.a.critica = h <= 1e-9; });

    const acts = internos.map((x) => x.a);
    const mod: ModuloProgramado = { indice: k + 1, nombre: m.nombre, inicio: acts.length ? acts.reduce((mn, a) => (a.inicio < mn ? a.inicio : mn), acts[0]!.inicio) : fecha(t0), fin: acts.length ? fechaFin(t0, finMod) : fecha(t0), actividades: acts };
    // el fin del módulo es el de su última actividad (no el de la fecha calculada si hay vacíos)
    if (acts.length) mod.fin = acts.reduce((mx, a) => (a.fin > mx ? a.fin : mx), acts[0]!.fin);
    return (hechos[k] = { mod, internos, fin: acts.length ? finMod : t0 });
  };
  nombres.forEach((_, k) => moduloK(k));

  const modulos = hechos.map((h) => h!.mod);
  const con = modulos.filter((m) => m.actividades.length);
  const inicio = con.length ? con.reduce((mn, m) => (m.inicio < mn ? m.inicio : mn), con[0]!.inicio) : (p.fecha ?? '');
  const fin = con.length ? con.reduce((mx, m) => (m.fin > mx ? m.fin : mx), con[0]!.fin) : inicio;
  return { inicio, fin, modulos, diasCalendario: inicio ? Math.round((aMs(fin) - aMs(inicio)) / DIA) + 1 : 0, config };
}
