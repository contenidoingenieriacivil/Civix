import { calcularProyecto, costosEquipos } from '../nucleo/presupuesto';
import type { Proyecto } from '../datos/modelo';
import { formularioA8 } from './cronograma';
import { reporteFlujoInversiones, reporteGraficos, reporteIncidencia, reporteInsumosPorItem, reporteRequerimiento } from './adicionales';
import { documento } from './formato';
import { formularioB1, formularioB2, formularioB3, formularioB4, reporteComputos, reporteDesgloseInsumos, reporteEspecificaciones, reporteResumen } from './formularios';

export const REPORTES = [
  { id: 'B-1', titulo: 'B-1 Presupuesto' },
  { id: 'B-2', titulo: 'B-2 Análisis de precios unitarios' },
  { id: 'B-3', titulo: 'B-3 Precios elementales' },
  { id: 'B-4', titulo: 'B-4 Costo de equipos' },
  { id: 'A-8', titulo: 'A-8 Cronograma de ejecución' },
  { id: 'resumen', titulo: 'Resumen general', corto: 'Resumen' },
  { id: 'insumos', titulo: 'Desglose de insumos', corto: 'Insumos' },
  { id: 'computos', titulo: 'Cómputos métricos', corto: 'Cómputos' },
  { id: 'esp', titulo: 'Especificaciones técnicas', corto: 'Especif.' },
  { id: 'incidencia', titulo: 'Presupuesto por incidencia (ABC)', corto: 'Incidencia' },
  { id: 'insumos-item', titulo: 'Desglose de insumos por ítem', corto: 'Insumos por ítem' },
  { id: 'flujo', titulo: 'Flujo de inversiones y plan de desembolsos', corto: 'Flujo de inversiones' },
  { id: 'personal', titulo: 'Flujo de personal (mano de obra por mes)', corto: 'Flujo de personal' },
  { id: 'materiales-mes', titulo: 'Requerimiento mensual de materiales', corto: 'Materiales por mes' },
  { id: 'equipo-mes', titulo: 'Requerimiento mensual de equipo', corto: 'Equipo por mes' },
  { id: 'graficos', titulo: 'Gráficos del presupuesto', corto: 'Gráficos' },
] as { id: string; titulo: string; corto?: string }[];

/** Reportes que se pueden limitar a un módulo o a una partida. */
export const CON_ALCANCE = new Set(['B-1', 'B-2', 'B-3', 'resumen', 'insumos', 'computos', 'esp', 'incidencia', 'insumos-item']);
export interface OpcionesReporte { modulo?: number; partida?: number }

/** Copia del proyecto solo con un módulo (o una partida), para los reportes por módulo. */
export function recortar(p: Proyecto, o: OpcionesReporte = {}): Proyecto {
  const x = o.partida !== undefined ? p.partidas[o.partida] : undefined;
  const m = x ? x.modulo : o.modulo;
  if (!m || !p.modulos[m - 1]) return p;
  return { ...p, modulos: [p.modulos[m - 1]!], partidas: p.partidas.filter((y) => (x ? y === x : y.modulo === m)).map((y) => ({ ...y, modulo: 1 })) };
}

/** Varios reportes en un solo documento (impresión por lotes), cada uno con su tamaño de hoja. */
export function htmlLote(ids: string[], proyecto: Proyecto, o: OpcionesReporte = {}): string {
  const partes = ids.map((id, k) => {
    const h = htmlReporte(id, proyecto, o);
    const cuerpo = /<body>([\s\S]*)<\/body>/.exec(h)?.[1] ?? '';
    return `<section class="lote" style="page: r${k}">${cuerpo.replace(/@page\s*\{/g, `@page r${k} {`)}</section>`;
  });
  return documento('Reportes', `<style>.lote + .lote { page-break-before: always; }</style>${partes.join('')}`);
}

export function htmlReporte(id: string, proyectoCompleto: Proyecto, o: OpcionesReporte = {}): string {
  const proyecto = CON_ALCANCE.has(id) ? recortar(proyectoCompleto, o) : proyectoCompleto;
  const c = calcularProyecto(proyecto);
  switch (id) {
    case 'B-1': return formularioB1(c);
    case 'B-2': return formularioB2(c);
    case 'B-3': return formularioB3(c);
    case 'B-4': return formularioB4(c, costosEquipos(c));
    case 'A-8': return formularioA8(proyecto);
    case 'resumen': return reporteResumen(c);
    case 'insumos': return reporteDesgloseInsumos(c);
    case 'computos': return reporteComputos(c);
    case 'esp': return reporteEspecificaciones(c);
    case 'incidencia': return reporteIncidencia(c);
    case 'insumos-item': return reporteInsumosPorItem(c);
    case 'flujo': return reporteFlujoInversiones(c);
    case 'personal': return reporteRequerimiento(c, 'O');
    case 'materiales-mes': return reporteRequerimiento(c, 'M');
    case 'equipo-mes': return reporteRequerimiento(c, 'E');
    case 'graficos': return reporteGraficos(c);
    default: throw new Error(`Reporte desconocido: ${id}`);
  }
}
