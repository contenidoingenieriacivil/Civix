import { useMemo } from 'react';
import { calcularProyecto, diagnosticar } from '../../nucleo/presupuesto';
import { REPORTES, htmlReporte } from '../../reportes/indice';
import { useEstado } from '../almacen';

export function ReportesPantalla() {
  const proyecto = useEstado((e) => e.proyecto);
  const reporte = useEstado((e) => e.reporte);
  const html = useMemo(() => htmlReporte(reporte, proyecto), [reporte, proyecto]);
  const diag = useMemo(() => diagnosticar(calcularProyecto(proyecto)), [proyecto]);
  return (
    <div className="pantalla reportes">
      <div className="barra-filtros" aria-live="polite">Vista previa: <b>{REPORTES.find((r) => r.id === reporte)?.titulo}</b> · use «Guardar PDF» o «Imprimir» de la cinta.</div>
      {diag.avisos.length > 0 && <div className="bienvenida" data-testid="diagnostico" style={{ margin: 0 }}><b>Datos que faltan para completar los formularios:</b><ul style={{ margin: '4px 0 0' }}>{diag.avisos.map((a, k) => <li key={k}>{a}</li>)}</ul></div>}
      <iframe id="vista-reporte" title="Vista previa del reporte" className="vista-reporte" srcDoc={html} data-testid="vista-reporte" />
    </div>
  );
}
