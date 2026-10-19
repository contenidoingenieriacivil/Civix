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

/** Duración en días laborables: cantidad × horas/unidad ÷ (horas por día × cuadrilla), redondeada, mínimo 1. */
export function duracionDias(p: Partida, cfg: ConfigCronograma): number {
  if (p.duracion !== undefined && p.duracion > 0) return Math.max(1, Math.round(p.duracion));
  const horas = p.cantidad * rendimientoManoObra(p, cfg.rendimientoMaximo);
  return Math.max(1, Math.round(horas / (cfg.horasDia * Math.max(1, p.cuadrilla ?? 1))));
}

/**
 * Programa el proyecto: cada módulo arranca en su fecha de inicio (o al terminar el anterior);
 * cada actividad empieza el día laborable siguiente al fin de su predecesora. Calcula holguras
 * y ruta crítica por módulo.
 */
export function programar(p: Proyecto, config: ConfigCronograma = p.cronograma ?? CRONOGRAMA_DEFECTO): Programa {
  const n = config.diasLaborables;
  const nombres = p.modulos.length ? p.modulos : [{ nombre: 'MÓDULO ÚNICO', inicio: null, fin: null }];
  const modulos: ModuloProgramado[] = [];
  let finAnterior = p.fecha ?? new Date().toISOString().slice(0, 10);

  nombres.forEach((m, k) => {
    const partidas = p.partidas.filter((x) => (p.modulos.length ? x.modulo === k + 1 : true));
    const inicioModulo = siguienteLaborable(m.inicio ?? finAnterior, n);
    const acts: Actividad[] = new Array(partidas.length);
    const enCurso = new Set<number>();

    const calcular = (pos: number): Actividad => {
      if (acts[pos]) return acts[pos]!;
      const partida = partidas[pos]!;
      const pred = partida.predecesor === undefined ? pos : partida.predecesor; // por defecto, la anterior (1-based = pos)
      const duracion = duracionDias(partida, config);
      let inicio = inicioModulo;
      let predValida = 0;
      if (pred >= 1 && pred <= partidas.length && pred - 1 !== pos && !enCurso.has(pred - 1)) {
        enCurso.add(pos);
        const a = calcular(pred - 1);
        enCurso.delete(pos);
        inicio = siguienteLaborable(aIso(aMs(a.fin) + DIA), n);
        predValida = pred;
      }
      return (acts[pos] = { partida, modulo: k + 1, posicion: pos + 1, duracion, inicio, fin: sumarLaborables(inicio, duracion - 1, n), predecesor: predValida, holgura: 0, critica: false });
    };
    partidas.forEach((_, i) => calcular(i));

    // Ruta crítica: pasada hacia atrás sobre la red de predecesoras del módulo.
    const fin = acts.reduce((mx, a) => (a.fin > mx ? a.fin : mx), inicioModulo);
    const finIdx = indiceLaborable(fin, n);
    const lf = acts.map(() => finIdx);
    const orden = [...acts.keys()].sort((a, b) => (acts[b]!.fin > acts[a]!.fin ? 1 : -1));
    for (const i of orden) {
      const a = acts[i]!;
      if (a.predecesor) lf[a.predecesor - 1] = Math.min(lf[a.predecesor - 1]!, lf[i]! - a.duracion);
    }
    acts.forEach((a, i) => { a.holgura = lf[i]! - indiceLaborable(a.fin, n); a.critica = a.holgura <= 0; });

    modulos.push({ indice: k + 1, nombre: m.nombre, inicio: acts.length ? acts.reduce((mn, a) => (a.inicio < mn ? a.inicio : mn), acts[0]!.inicio) : inicioModulo, fin: acts.length ? fin : inicioModulo, actividades: acts });
    finAnterior = acts.length ? fin : finAnterior;
  });

  const con = modulos.filter((m) => m.actividades.length);
  const inicio = con.length ? con.reduce((mn, m) => (m.inicio < mn ? m.inicio : mn), con[0]!.inicio) : (p.fecha ?? '');
  const fin = con.length ? con.reduce((mx, m) => (m.fin > mx ? m.fin : mx), con[0]!.fin) : inicio;
  return { inicio, fin, modulos, diasCalendario: inicio ? Math.round((aMs(fin) - aMs(inicio)) / DIA) + 1 : 0, config };
}
