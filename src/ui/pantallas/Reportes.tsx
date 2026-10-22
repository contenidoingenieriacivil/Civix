import { Button, Checkbox, Dropdown, Option } from '@fluentui/react-components';
import { useMemo, useState } from 'react';
import { calcularProyecto, diagnosticar } from '../../nucleo/presupuesto';
import { CON_ALCANCE, REPORTES } from '../../reportes/indice';
import { htmlActual } from '../acciones';
import { ponerAlcance, ponerLote, useEstado } from '../almacen';

export function ReportesPantalla() {
  const proyecto = useEstado((e) => e.proyecto);
  const reporte = useEstado((e) => e.reporte);
  const alcance = useEstado((e) => e.alcance);
  const lote = useEstado((e) => e.lote);
  const modulo = useEstado((e) => e.modulo);
  const seleccion = useEstado((e) => e.seleccion);
  const [eligiendo, setEligiendo] = useState(false);
  const [marcados, setMarcados] = useState<string[]>(['B-1', 'B-2', 'B-3', 'B-4', 'A-8']);
  const html = useMemo(() => { try { return htmlActual(); } catch (e) { return `<p style="color:#b91c1c;font-family:sans-serif">No se pudo generar el reporte: ${e instanceof Error ? e.message : e}</p>`; } }, [reporte, proyecto, alcance, lote, modulo, seleccion]); // eslint-disable-line react-hooks/exhaustive-deps
  const diag = useMemo(() => diagnosticar(calcularProyecto(proyecto)), [proyecto]);
  const nombreModulo = proyecto.modulos[modulo - 1]?.nombre ?? '';
  const partida = proyecto.partidas[seleccion];
  const etiqueta = { todo: 'Todo el proyecto', modulo: `Solo el módulo «${nombreModulo}»`, partida: partida ? `Solo la partida «${partida.descripcion.slice(0, 40)}»` : 'Solo la partida seleccionada (ninguna)' };
  const conAlcance = lote ? lote.some((r) => CON_ALCANCE.has(r)) : CON_ALCANCE.has(reporte);

  return (
    <div className="pantalla reportes">
      <div className="barra-filtros" aria-live="polite">
        Vista previa: <b data-testid="titulo-reporte">{lote ? `${lote.length} reportes juntos` : REPORTES.find((r) => r.id === reporte)?.titulo}</b>
        {conAlcance && (
          <Dropdown value={etiqueta[alcance]} selectedOptions={[alcance]} onOptionSelect={(_, d) => ponerAlcance(d.optionValue as typeof alcance)} data-testid="alcance-reporte" style={{ minWidth: 300 }}>
            <Option value="todo">{etiqueta.todo}</Option><Option value="modulo">{etiqueta.modulo}</Option><Option value="partida" disabled={!partida}>{etiqueta.partida}</Option>
          </Dropdown>)}
        <Button size="small" onClick={() => setEligiendo(!eligiendo)} data-testid="elegir-varios">{eligiendo ? 'Ocultar lista' : 'Varios reportes a la vez…'}</Button>
        {lote && <Button size="small" appearance="subtle" onClick={() => ponerLote(null)} data-testid="quitar-lote">Volver a uno solo</Button>}
        <span className="nota-ui">Use «Guardar PDF», «Imprimir», «HTML» o «Excel» en la cinta.</span>
      </div>
      {eligiendo && (
        <div className="bienvenida" style={{ margin: 0 }} data-testid="lista-lote">
          <b>Marque los reportes que quiere imprimir o guardar en un solo PDF:</b>
          <div className="rejilla-lote">{REPORTES.map((r) => <Checkbox key={r.id} label={r.titulo} checked={marcados.includes(r.id)} onChange={(_, d) => setMarcados(d.checked ? [...marcados, r.id] : marcados.filter((x) => x !== r.id))} data-testid={`lote-${r.id}`} />)}</div>
          <div className="acciones"><Button appearance="primary" disabled={!marcados.length} onClick={() => { ponerLote(REPORTES.map((r) => r.id).filter((id) => marcados.includes(id))); setEligiendo(false); }} data-testid="ver-lote">Ver los {marcados.length} reportes juntos</Button></div>
        </div>)}
      {diag.avisos.length > 0 && <div className="bienvenida" data-testid="diagnostico" style={{ margin: 0 }}><b>Datos que faltan para completar los formularios:</b><ul style={{ margin: '4px 0 0' }}>{diag.avisos.map((a, k) => <li key={k}>{a}</li>)}</ul></div>}
      <iframe id="vista-reporte" title="Vista previa del reporte" className="vista-reporte" srcDoc={html} data-testid="vista-reporte" />
    </div>
  );
}
