import { Checkbox, Input } from '@fluentui/react-components';
import { useMemo } from 'react';
import { CRONOGRAMA_DEFECTO, programar, tienePlazo } from '../../nucleo/cronograma';
import { barra, mesesDelPrograma } from '../../reportes/cronograma';
import { fechaBo } from '../../reportes/formato';
import { cambiar, useEstado } from '../almacen';
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
        <label>Horas por día <Input style={{ width: 70 }} value={String(cfg.horasDia)} data-testid="horas-dia" onChange={(_, d) => { const n = Number(d.value.replace(',', '.')); if (n > 0 && n <= 24) poner({ horasDia: n }); }} /></label>
        <label>Días laborables por semana <Input style={{ width: 70 }} value={String(cfg.diasLaborables)} data-testid="dias-laborables" onChange={(_, d) => { const n = Math.round(Number(d.value)); if (n >= 1 && n <= 7) poner({ diasLaborables: n }); }} /></label>
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
              <tr key={`m${m.indice}`} className="sub"><td colSpan={8}>{m.nombre}</td></tr>,
              ...m.actividades.map((a) => {
                const pos = proyecto.partidas.indexOf(a.partida);
                const b = barra(g, a.inicio, a.fin);
                return (
                  <tr key={pos} data-testid="fila-actividad">
                    <td className="c">{a.modulo}.{a.posicion}</td><td>{a.partida.descripcion}</td><td className="n"><Numero id="duracion" ancho={52} decimales={0} valor={a.duracion} alCambiar={(n) => cambiar((p) => { p.partidas[pos]!.duracion = Math.max(1, Math.round(n)); })} /></td>
                    <td className="n"><Numero id="cuadrilla" ancho={52} decimales={0} valor={a.partida.cuadrilla ?? 1} alCambiar={(n) => cambiar((p) => { p.partidas[pos]!.cuadrilla = Math.max(1, Math.round(n)); })} /></td>
                    <td className="n"><Numero id="predecesor" ancho={46} decimales={0} valor={a.predecesor} alCambiar={(n) => cambiar((p) => { p.partidas[pos]!.predecesor = Math.round(n); })} /></td>
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
