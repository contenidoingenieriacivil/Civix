import { useMemo } from 'react';
import { REPORTES, htmlReporte } from '../../reportes/indice';
import { useEstado } from '../almacen';

export function ReportesPantalla() {
  const proyecto = useEstado((e) => e.proyecto);
  const reporte = useEstado((e) => e.reporte);
  const html = useMemo(() => htmlReporte(reporte, proyecto), [reporte, proyecto]);
  return (
    <div className="pantalla reportes">
      <div className="barra-filtros" aria-live="polite">Vista previa: <b>{REPORTES.find((r) => r.id === reporte)?.titulo}</b> · use «Guardar PDF» o «Imprimir» de la cinta.</div>
      <iframe id="vista-reporte" title="Vista previa del reporte" className="vista-reporte" srcDoc={html} data-testid="vista-reporte" />
    </div>
  );
}
