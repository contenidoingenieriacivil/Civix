import { Dropdown, Input, Option } from '@fluentui/react-components';
import { PLANTILLAS_PREDEFINIDAS } from '../../nucleo/plantillas';
import { terminosDeFormula } from '../../nucleo/calculo';
import { useMemo } from 'react';
import { costoHorarioEquipo, equipoPorDefecto, type DatosEquipo } from '../../nucleo/equipos';
import { calcularProyecto, desgloseInsumos } from '../../nucleo/presupuesto';
import { num } from '../../reportes/formato';
import { cambiar, useEstado } from '../almacen';
import { Numero } from '../campos';

const CAMPOS_EQUIPO: [keyof DatosEquipo, string, number][] = [
  ['valorComercial', 'Valor comercial', 2], ['vidaUtilHoras', 'Vida útil (h)', 0], ['factorRescate', 'Rescate %', 1], ['tasaInteresAnual', 'Interés %', 1],
  ['primaSeguroAnual', 'Seguro %', 1], ['horasPorAnio', 'Horas/año', 0], ['coeficienteMantenimiento', 'Mant. %', 1], ['consumoCombustible', 'Comb. l/h', 2],
  ['precioCombustible', 'Precio comb.', 2], ['consumoLubricante', 'Lubr. l/h', 2], ['costoHorarioOperador', 'Operador /h', 2], ['potencia', 'Potencia HP', 1],
];

/** Datos del costo horario de cada equipo del proyecto: alimentan el formulario B-4. */
function EquiposB4() {
  const proyecto = useEstado((e) => e.proyecto);
  const equipos = useMemo(() => desgloseInsumos(calcularProyecto(proyecto)).E.map((f) => f.insumo), [proyecto]);
  if (!equipos.length) return <p className="nota-ui">El proyecto aún no usa equipos. Cuando añada ítems con equipo aparecerán aquí.</p>;
  return (
    <div className="tabla-contenedor" style={{ maxHeight: 280 }}>
      <table className="grilla" data-testid="tabla-equipos"><thead><tr><th>Equipo</th>{CAMPOS_EQUIPO.map(([, t]) => <th key={t} className="n">{t}</th>)}<th className="n">Costo /h</th></tr></thead><tbody>
        {equipos.map((i) => {
          const d = proyecto.equipos?.[i.id] ?? equipoPorDefecto(i.descripcion);
          const costo = proyecto.equipos?.[i.id] ? costoHorarioEquipo(d) : null;
          return (
            <tr key={i.id}><td>{i.descripcion}</td>
              {CAMPOS_EQUIPO.map(([k, t, dec]) => <td key={k} className="n"><Numero id={`eq-${i.id}-${k}`} ancho={78} decimales={dec} valor={Number(d[k])}
                alCambiar={(n) => cambiar((p) => { p.equipos ??= {}; p.equipos[i.id] = { ...(p.equipos[i.id] ?? equipoPorDefecto(i.descripcion)), [k]: n }; })} /></td>)}
              <td className="n">{costo ? num(costo.basico + costo.mantenimiento + costo.combustibles + costo.otros) : `${num(i.precio)} (precio)`}</td></tr>
          );
        })}
      </tbody></table>
    </div>
  );
}

const validar = (f: string) => { try { terminosDeFormula(f); return true; } catch { return false; } };

export function ConfiguracionPantalla() {
  const p = useEstado((e) => e.proyecto);
  const campo = (etq: string, k: 'nombre' | 'lugar' | 'cliente' | 'responsable', id: string) => (
    <label className="campo">{etq}<Input value={p[k]} data-testid={id} onChange={(_, d) => cambiar((x) => { x[k] = d.value; })} /></label>
  );
  return (
    <div className="pantalla config">
      <section><h3>Datos generales del proyecto</h3>
        <div className="rejilla-campos">
          {campo('Proyecto', 'nombre', 'cfg-nombre')}{campo('Lugar', 'lugar', 'cfg-lugar')}{campo('Cliente', 'cliente', 'cfg-cliente')}{campo('Elaborado por', 'responsable', 'cfg-responsable')}
          <label className="campo">Moneda<Dropdown value={p.moneda === 1 ? 'Dólares americanos' : 'Bolivianos'} selectedOptions={[String(p.moneda)]} onOptionSelect={(_, d) => cambiar((x) => { x.moneda = Number(d.optionValue); })}><Option value="2">Bolivianos</Option><Option value="1">Dólares americanos</Option></Dropdown></label>
        </div>
      </section>
      <section><h3>Parámetros de cálculo del precio unitario</h3>
        <label className="campo">Plantilla predefinida
          <Dropdown value={p.plantilla.nombre} selectedOptions={[p.plantilla.nombre]} data-testid="cfg-plantilla" onOptionSelect={(_, d) => { const pl = PLANTILLAS_PREDEFINIDAS.find((x) => x.nombre === d.optionValue); if (pl) cambiar((x) => { x.plantilla = structuredClone(pl); }); }}>
            {PLANTILLAS_PREDEFINIDAS.map((x) => <Option key={x.nombre} value={x.nombre}>{x.nombre}</Option>)}
          </Dropdown></label>
        <table className="grilla" data-testid="tabla-parametros"><thead><tr><th style={{ width: 40 }}></th><th>Descripción</th><th style={{ width: 100 }}>%</th><th style={{ width: 160 }}>Fórmula</th></tr></thead><tbody>
          {p.plantilla.parametros.map((q, k) => (
            <tr key={q.letra} className={q.resaltar ? 'sub' : ''}>
              <td className="c"><b>{q.letra}</b></td>
              <td><input className="celda-txt" value={q.descripcion} onChange={(e) => cambiar((x) => { x.plantilla.parametros[k]!.descripcion = e.target.value.slice(0, 50); })} /></td>
              <td className="n">{q.porcentaje === null ? '—' : <input className="celda-num" data-testid={`pct-${q.letra}`} style={{ width: 80 }} defaultValue={String(q.porcentaje).replace('.', ',')} key={q.porcentaje}
                onBlur={(e) => { const n = Number(e.target.value.replace(',', '.')); if (Number.isFinite(n) && n >= 0 && n !== q.porcentaje) cambiar((x) => { x.plantilla.parametros[k]!.porcentaje = n; }); }} />}</td>
              <td>{q.formula === '*' ? <i>suma del rubro</i> : <input className="celda-txt" style={{ width: 140, borderColor: validar(q.formula) ? undefined : 'red' }} value={q.formula} onChange={(e) => cambiar((x) => { x.plantilla.parametros[k]!.formula = e.target.value.toUpperCase().slice(0, 15); })} />}</td>
            </tr>))}
        </tbody></table>
        <p className="nota-ui">Las fórmulas combinan parámetros con + y −. Con SABS el IVA es 14,94 % (13/87) y el IT 3,09 % (3/97). Ajuste las cargas sociales según su régimen laboral.</p>
      </section>
      <section><h3>Costo horario de equipos (Formulario B-4)</h3><EquiposB4 /></section>
    </div>
  );
}
