import { Checkbox, Input } from '@fluentui/react-components';
import { useMemo } from 'react';
import { CRONOGRAMA_DEFECTO, programar, tienePlazo } from '../../nucleo/cronograma';
import { barra, mesesDelPrograma } from '../../reportes/cronograma';
import { fechaBo } from '../../reportes/formato';
import { avisar, cambiar, useEstado } from '../almacen';
import { Numero } from '../campos';

/** Diagrama de Gantt interactivo: cuadrilla y predecesora editables, ruta crítica en rojo. */
export function CronogramaPantalla() {
  const proyecto = useEstado((e) => e.proyecto);
  const g = useMemo(() => programar(proyecto), [proyecto]);
  const meses = mesesDelPrograma(g);
  const total = Math.max(1, g.diasCalendario);
  const cfg = proyecto.cronograma ?? CRONOGRAMA_DEFECTO;
  const sinPlazo = g.modulos.flatMap((m) => m.actividades).filter((a) => !tienePlazo(a.partida)).length;
  const poner = (c: Partial<typeof cfg>) => cambiar((p) => { p.cronograma = { ...(p.cronograma ?? CRONOGRAMA_DEFECTO), ...c }; });

  return (
    <div className="pantalla cronograma">
      <div className="barra-filtros">
        <label>Horas por día <Numero id="horas-dia" ancho={60} decimales={1} valor={cfg.horasDia} min={1} max={24} alCambiar={(n) => poner({ horasDia: n })} /></label>
        <label>Días laborables por semana <Numero id="dias-laborables" ancho={50} decimales={0} valor={cfg.diasLaborables} min={1} max={7} alCambiar={(n) => poner({ diasLaborables: Math.round(n) })} /></label>
        <label>Inicio de obra <Input type="date" style={{ width: 150 }} value={proyecto.fecha ?? ''} data-testid="fecha-inicio" onChange={(_, d) => { if (/^\d{4}-\d{2}-\d{2}$/.test(d.value)) cambiar((p) => { p.fecha = d.value; }, 'Fecha de inicio cambiada', 'fecha-inicio'); }} /></label>
        <Checkbox label="Rendimiento máximo de la mano de obra" checked={cfg.rendimientoMaximo} onChange={(_, d) => poner({ rendimientoMaximo: !!d.checked })} />
        <span data-testid="plazo" className="literal">{g.inicio ? `Inicio ${fechaBo(g.inicio)} · Conclusión ${fechaBo(g.fin)} · ${g.diasCalendario} días calendario` : 'Sin actividades'}</span>
      </div>
      {sinPlazo > 0 && <div className="bienvenida" data-testid="aviso-plazos"><b>{sinPlazo} actividades sin plazo.</b> No tienen días fijados ni mano de obra en su análisis, así que se asume 1 día. Escriba los días en la columna «Días» (se guardan con el proyecto) o impórtelos con el campo «duracion».</div>}
      <div className="tabla-contenedor">
        <table className="grilla gantt" data-testid="tabla-gantt">
          <thead><tr><th style={{ width: 52 }}>N°</th><th>Actividad</th><th style={{ width: 52 }}>Días</th><th style={{ width: 66 }}>Cuadrilla</th><th style={{ width: 60 }}>Pred.</th><th style={{ width: 84 }}>Inicio</th><th style={{ width: 84 }}>Fin</th>
            <th style={{ width: '42%', position: 'sticky' }}><div className="gantt-meses">{meses.map((m) => <span key={m.desde} style={{ left: `${(m.desde / total) * 100}%`, width: `${(m.dias / total) * 100}%` }}>{m.etiqueta}</span>)}</div></th></tr></thead>
          <tbody>
            {g.modulos.flatMap((m) => [
              <tr key={`m${m.indice}`} className="sub"><td colSpan={7}>{m.nombre}
                <span className="inicio-modulo"> · empieza
                  <select value={proyecto.modulos[m.indice - 1]?.despuesDe ?? ''} data-testid={`despues-de-${m.indice}`} onChange={(ev) => cambiar((p) => { const mm = p.modulos[m.indice - 1]!; const v = ev.target.value; delete mm.despuesDeActividad; if (v) mm.despuesDe = Number(v); else delete mm.despuesDe; }, 'Inicio del módulo cambiado')}>
                    <option value="">{m.indice === 1 ? 'al inicio de la obra' : 'al terminar el módulo anterior'}</option>
                    {proyecto.modulos.map((x, k) => (k + 1 === m.indice ? null : <option key={k} value={k + 1}>al terminar {k + 1}. {x.nombre.slice(0, 40)}</option>))}
                  </select>
                  {proyecto.modulos[m.indice - 1]?.despuesDeActividad ? ` (tras su actividad ${proyecto.modulos[m.indice - 1]!.despuesDeActividad})` : ''}
                </span></td><td>{fechaBo(m.inicio)} → {fechaBo(m.fin)}</td></tr>,
              ...m.actividades.map((a) => {
                const pos = proyecto.partidas.indexOf(a.partida);
                const b = barra(g, a.inicio, a.fin);
                return (
                  <tr key={pos} data-testid="fila-actividad">
                    <td className="c">{a.modulo}.{a.posicion}</td><td>{a.partida.descripcion}</td><td className="n"><Numero id="duracion" ancho={52} decimales={Number.isInteger(a.duracion) ? 0 : 2} valor={a.duracion} min={0.01} max={100000} alCambiar={(n) => cambiar((p) => { p.partidas[pos]!.duracion = Math.max(0.01, Math.round(n * 100) / 100); })} /></td>
                    <td className="n"><Numero id="cuadrilla" ancho={52} decimales={0} min={1} max={500} valor={a.partida.cuadrilla ?? 1} alCambiar={(n) => cambiar((p) => { p.partidas[pos]!.cuadrilla = Math.max(1, Math.round(n)); })} /></td>
                    <td className="n"><Numero id="predecesor" ancho={46} decimales={0} valor={a.predecesor} max={m.actividades.length} titulo={`0 = empieza con el módulo; 1…${m.actividades.length} = después de esa actividad`} alCambiar={(n) => { const v = Math.round(n); if (v === a.posicion) { avisar('Una actividad no puede depender de sí misma'); return; } cambiar((p) => { p.partidas[pos]!.predecesor = v; }, 'Predecesora cambiada'); }} /></td>
                    <td className="c">{fechaBo(a.inicio)}</td><td className="c">{fechaBo(a.fin)}</td>
                    <td className="gantt-celda" title={a.critica ? 'Ruta crítica' : `Holgura: ${a.holgura} días laborables`}>
                      {meses.map((x) => <i key={x.desde} className="gantt-linea" style={{ left: `${(x.desde / total) * 100}%` }} />)}
                      <div className={`gantt-barra${a.critica ? ' critica' : ''}`} data-critica={a.critica} style={{ left: `${b.izq}%`, width: `${b.ancho}%` }} />
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      <p className="nota-ui">Pred. = número de la actividad previa dentro del módulo (0 = independiente). Plazo = cantidad × rendimiento de mano de obra ÷ (horas por día × cuadrilla). La ruta crítica (rojo) son las actividades sin holgura.</p>
    </div>
  );
}
