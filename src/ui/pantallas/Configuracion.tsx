import { Dropdown, Input, Option, Textarea } from '@fluentui/react-components';
import { PLANTILLAS_PREDEFINIDAS } from '../../nucleo/plantillas';
import { evaluarPlantilla, terminosDeFormula } from '../../nucleo/calculo';
import { useMemo, useState } from 'react';
import { costoHorarioEquipo, equipoPorDefecto, type DatosEquipo } from '../../nucleo/equipos';
import { calcularProyecto, desgloseInsumos } from '../../nucleo/presupuesto';
import { num } from '../../reportes/formato';
import { avisar, cambiar, useEstado } from '../almacen';
import { cambiarMoneda } from '../../nucleo/operaciones';
import { Numero, Texto } from '../campos';

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

/** Fórmula de un parámetro: se guarda solo cuando es válida (letras A…Q unidas por + y −). */
function Formula({ valor, alCambiar, probar }: { valor: string; alCambiar: (f: string) => void; probar: (f: string) => string | null }) {
  const [t, setT] = useState<string | null>(null);
  const v = t ?? valor;
  const ok = validar(v);
  const confirmar = () => {
    if (t === null) return;
    setT(null);
    const f = t.toUpperCase().replace(/\s+/g, '');
    if (f === valor) return;
    if (!validar(f)) { avisar(`Fórmula «${t}» no válida: use letras A…Q con + y − (p. ej. E+F). Se conserva «${valor}».`); return; }
    const error = probar(f);
    if (error) { avisar(`${error}. Se conserva «${valor}».`); return; }
    alCambiar(f);
  };
  return <input className="celda-txt" data-testid="formula" style={{ width: 140, borderColor: ok ? undefined : '#b91c1c' }} value={v} maxLength={20} title={ok ? '' : 'Use letras A…Q unidas por + y −'}
    onFocus={() => setT(valor)} onChange={(e) => setT(e.target.value.toUpperCase())} onBlur={confirmar} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setT(null); e.currentTarget.blur(); } }} />;
}

export function ConfiguracionPantalla() {
  const p = useEstado((e) => e.proyecto);
  const campo = (etq: string, k: 'nombre' | 'lugar' | 'cliente' | 'responsable' | 'revisado' | 'aprobado' | 'empresa', id: string) => (
    <label className="campo">{etq}<Input value={p[k] ?? ''} maxLength={k === 'nombre' ? 120 : 80} data-testid={id} onChange={(_, d) => cambiar((x) => { x[k] = d.value; }, '', `cfg-${k}`)}
      onBlur={() => { if (k === 'nombre' && !p.nombre.trim()) cambiar((x) => { x.nombre = 'Proyecto sin nombre'; }); }} /></label>
  );
  const cambiarMonedaA = (m: number) => {
    if (m === p.moneda) return;
    const factor = m === 1 ? 1 / p.cambioDolar : p.cambioDolar;
    const convertir = p.insumos.length > 0 && window.confirm(`¿Convertir también los precios de los ${p.insumos.length} insumos con el tipo de cambio ${num(p.cambioDolar)}? (Aceptar: convierte · Cancelar: solo cambia el nombre de la moneda)`);
    cambiar((x) => { if (convertir) cambiarMoneda(x, factor, m); else x.moneda = m; }, convertir ? 'Moneda y precios convertidos' : 'Moneda cambiada');
  };
  return (
    <div className="pantalla config">
      <section><h3>Datos generales del proyecto</h3>
        <div className="rejilla-campos">
          {campo('Proyecto', 'nombre', 'cfg-nombre')}{campo('Lugar', 'lugar', 'cfg-lugar')}{campo('Cliente', 'cliente', 'cfg-cliente')}{campo('Elaborado por', 'responsable', 'cfg-responsable')}{campo('Revisado por', 'revisado', 'cfg-revisado')}{campo('Aprobado por', 'aprobado', 'cfg-aprobado')}{campo('Empresa (membrete de los reportes)', 'empresa', 'cfg-empresa')}
          <label className="campo">Fecha (inicio de obra)<Input type="date" value={p.fecha ?? ''} data-testid="cfg-fecha" onChange={(_, d) => { if (/^\d{4}-\d{2}-\d{2}$/.test(d.value)) cambiar((x) => { x.fecha = d.value; }, 'Fecha cambiada', 'cfg-fecha'); }} /></label>
          <label className="campo">Moneda<Dropdown value={p.moneda === 1 ? 'Dólares americanos' : 'Bolivianos'} selectedOptions={[String(p.moneda)]} data-testid="cfg-moneda" onOptionSelect={(_, d) => cambiarMonedaA(Number(d.optionValue))}><Option value="2">Bolivianos</Option><Option value="1">Dólares americanos</Option></Dropdown></label>
          <label className="campo">Tipo de cambio (Bs por $US)<Numero id="cfg-cambio" valor={p.cambioDolar} decimales={2} min={0.01} max={1000} ancho={120} alCambiar={(n) => cambiar((x) => { x.cambioDolar = n; }, 'Tipo de cambio actualizado')} /></label>
        </div>
        <label className="campo" style={{ marginTop: 8 }}>Notas del proyecto<Textarea value={p.memo} rows={2} maxLength={2000} data-testid="cfg-memo" onChange={(_, d) => cambiar((x) => { x.memo = d.value; }, '', 'cfg-memo')} /></label>
      </section>
      <section><h3>Parámetros de cálculo del precio unitario</h3>
        <label className="campo">Plantilla predefinida
          <Dropdown value={p.plantilla.nombre} selectedOptions={[p.plantilla.nombre]} data-testid="cfg-plantilla" onOptionSelect={(_, d) => { const pl = PLANTILLAS_PREDEFINIDAS.find((x) => x.nombre === d.optionValue); if (pl) cambiar((x) => { const dc = x.plantilla.decimalesCalculo; x.plantilla = structuredClone(pl); if (dc !== undefined) x.plantilla.decimalesCalculo = dc; }, `Plantilla «${pl.nombre}» aplicada`); }}>
            {PLANTILLAS_PREDEFINIDAS.map((x) => <Option key={x.nombre} value={x.nombre}>{x.nombre}</Option>)}
          </Dropdown></label>
        <label className="campo" title="Como en PRESCOM: redondea el costo de cada insumo del análisis (cantidad × precio) a estos decimales antes de sumarlo.">Decimales de cálculo
          <Dropdown value={p.plantilla.decimalesCalculo === undefined ? 'Sin redondeo' : String(p.plantilla.decimalesCalculo)} selectedOptions={[String(p.plantilla.decimalesCalculo ?? 'no')]} data-testid="cfg-decimales-calculo"
            onOptionSelect={(_, d) => cambiar((x) => { if (d.optionValue === 'no') delete x.plantilla.decimalesCalculo; else x.plantilla.decimalesCalculo = Number(d.optionValue); }, d.optionValue === 'no' ? 'Cálculo sin redondeo intermedio' : `Cálculo redondeado a ${d.optionValue} decimales`)}>
            <Option value="no">Sin redondeo</Option>{[0, 1, 2, 3, 4].map((k) => <Option key={k} value={String(k)}>{String(k)}</Option>)}
          </Dropdown></label>
        <table className="grilla" data-testid="tabla-parametros"><thead><tr><th style={{ width: 40 }}></th><th>Descripción</th><th style={{ width: 100 }}>%</th><th style={{ width: 160 }}>Fórmula</th></tr></thead><tbody>
          {p.plantilla.parametros.map((q, k) => (
            <tr key={q.letra} className={q.resaltar ? 'sub' : ''}>
              <td className="c"><b>{q.letra}</b></td>
              <td><Texto valor={q.descripcion} max={50} requerido={false} alCambiar={(t) => cambiar((x) => { x.plantilla.parametros[k]!.descripcion = t; })} /></td>
              <td className="n">{q.porcentaje === null ? '—' : <Numero id={`pct-${q.letra}`} ancho={80} valor={q.porcentaje} max={1000} alCambiar={(n) => cambiar((x) => { x.plantilla.parametros[k]!.porcentaje = n; }, `${q.descripcion}: ${num(n)} %`)} />}</td>
              <td>{q.formula === '*' ? <i>suma del rubro</i> : <Formula valor={q.formula} probar={(f) => { const pl = structuredClone(p.plantilla); pl.parametros[k]!.formula = f; try { evaluarPlantilla(pl, { M: 1, O: 1, E: 1 }); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } }} alCambiar={(f) => cambiar((x) => { x.plantilla.parametros[k]!.formula = f; }, `Fórmula de ${q.letra} cambiada`)} />}</td>
            </tr>))}
        </tbody></table>
        <p className="nota-ui">Las fórmulas combinan parámetros con + y −. Con SABS el IVA es 14,94 % (13/87) y el IT 3,09 % (3/97). Ajuste las cargas sociales según su régimen laboral.</p>
      </section>
      <section><h3>Costo horario de equipos (Formulario B-4)</h3><EquiposB4 /></section>
    </div>
  );
}
