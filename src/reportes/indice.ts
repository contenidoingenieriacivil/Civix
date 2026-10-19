import { calcularProyecto, costosEquipos } from '../nucleo/presupuesto';
import type { Proyecto } from '../datos/modelo';
import { formularioA8 } from './cronograma';
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
] as { id: string; titulo: string; corto?: string }[];

export function htmlReporte(id: string, proyecto: Proyecto): string {
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
    default: throw new Error(`Reporte desconocido: ${id}`);
  }
}
