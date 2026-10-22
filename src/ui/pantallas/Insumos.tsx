import { Button, Dropdown, Input, Option } from '@fluentui/react-components';
import { useMemo, useState } from 'react';
import { usoDeInsumos } from '../../nucleo/herramientas';
import { ajustarPrecios, nuevoInsumo, sinAcentos } from '../../nucleo/operaciones';
import { calcularProyecto, desgloseInsumos } from '../../nucleo/presupuesto';
import type { Rubro } from '../../nucleo/tipos';
import { num } from '../../reportes/formato';
import { abrirDialogo, avisar, cambiar, useEstado } from '../almacen';
import { leerNumero, Numero, Texto } from '../campos';

const RUBRO: Record<Rubro, string> = { M: 'Material', O: 'Mano de obra', E: 'Equipo' };

/** Insumos del proyecto: sus precios valen para todas las partidas que los usan (como en PRESCOM). */
export function InsumosPantalla() {
  const proyecto = useEstado((e) => e.proyecto);
  const [filtro, setFiltro] = useState('');
  const [rubro, setRubro] = useState<'' | Rubro>('');
  const [pct, setPct] = useState('5');
  const [nuevo, setNuevo] = useState({ descripcion: '', unidad: '', rubro: 'M' as Rubro, precio: '' });
  const uso = useMemo(() => usoDeInsumos(proyecto), [proyecto]);
  const des = useMemo(() => { try { const d = desgloseInsumos(calcularProyecto(proyecto)); return new Map([...d.M, ...d.O, ...d.E].map((f) => [f.insumo.id, f])); } catch { return new Map(); } }, [proyecto]);
  const total = [...des.values()].reduce((a, f) => a + f.monto, 0);
  const q = sinAcentos(filtro);
  const lista = proyecto.insumos.filter((i) => (!rubro || i.rubro === rubro) && (!q || sinAcentos(i.descripcion).includes(q))).sort((a, b) => a.rubro.localeCompare(b.rubro) || a.descripcion.localeCompare(b.descripcion));
  const editar = (id: number, f: (i: (typeof proyecto.insumos)[number]) => void, aviso = '') => cambiar((p) => { const i = p.insumos.find((x) => x.id === id); if (i) f(i); }, aviso);

  return (
    <div className="pantalla insumos">
      <div className="barra-filtros">
        <Input placeholder="Buscar insumo…" value={filtro} onChange={(_, d) => setFiltro(d.value)} style={{ width: 260 }} data-testid="buscar-insumo" />
        <Dropdown value={rubro ? RUBRO[rubro] : 'Todos los rubros'} selectedOptions={[rubro]} onOptionSelect={(_, d) => setRubro((d.optionValue ?? '') as '' | Rubro)} style={{ minWidth: 160 }}>
          <Option value="">Todos los rubros</Option><Option value="M">Material</Option><Option value="O">Mano de obra</Option><Option value="E">Equipo</Option>
        </Dropdown>
        <span>Ajustar los {lista.length} mostrados en</span>
        <Input value={pct} onChange={(_, d) => setPct(d.value)} style={{ width: 70 }} data-testid="pct-insumos" /><span>%</span>
        <Button data-testid="ajustar-insumos" onClick={() => { const n = leerNumero(pct); if (n === null || n <= -100 || n > 1000) { avisar('Porcentaje no válido (entre −99 y 1000)'); return; } const ids = new Set(lista.map((i) => i.id)); cambiar((p) => ajustarPrecios(p.insumos.filter((i) => ids.has(i.id)), n), `Precios de ${ids.size} insumos ajustados ${n} %`); }}>Aplicar</Button>
        <span className="literal">Costo directo total de insumos: <b>{num(total)}</b></span>
      </div>
      <div className="tabla-contenedor">
        <table className="grilla" data-testid="tabla-insumos-proyecto">
          <thead><tr><th>Insumo</th><th style={{ width: 70 }}>Unid.</th><th style={{ width: 110 }}>Rubro</th><th className="n" style={{ width: 110 }}>Precio</th><th className="n" style={{ width: 110 }}>Cantidad total</th><th className="n" style={{ width: 120 }}>Monto</th><th className="n" style={{ width: 70 }}>%</th><th className="c" style={{ width: 70 }}>Partidas</th><th style={{ width: 110 }}></th></tr></thead>
          <tbody>
            {!lista.length && <tr><td colSpan={9} className="vacio">{proyecto.insumos.length ? 'Ningún insumo coincide.' : 'El proyecto aún no tiene insumos: aparecen al añadir ítems de una base o al armar análisis de precio unitario.'}</td></tr>}
            {lista.map((i) => {
              const f = des.get(i.id);
              return (
                <tr key={i.id} data-testid="fila-insumo-proyecto">
                  <td><Texto id="ip-descripcion" valor={i.descripcion} alCambiar={(t) => editar(i.id, (x) => { x.descripcion = t; })} /></td>
                  <td><Texto id="ip-unidad" valor={i.unidad} max={5} requerido={false} alCambiar={(t) => editar(i.id, (x) => { x.unidad = t; })} /></td>
                  <td>{RUBRO[i.rubro]}</td>
                  <td className="n"><Numero id="ip-precio" valor={i.precio} decimales={3} alCambiar={(n) => editar(i.id, (x) => { x.precio = n; x.cotizacion = new Date().toISOString().slice(0, 10); }, `Precio de «${i.descripcion}» cambiado en ${uso.get(i.id) ?? 0} partida(s)`)} /></td>
                  <td className="n">{f ? num(f.cantidad, 2) : ''}</td>
                  <td className="n">{f ? num(f.monto, 2) : ''}</td>
                  <td className="n">{f && total ? num((f.monto / total) * 100, 1) : ''}</td>
                  <td className="c">{uso.get(i.id) ?? 0}</td>
                  <td><Button size="small" appearance="subtle" onClick={() => abrirDialogo({ tipo: 'reemplazar-insumo', id: i.id })} data-testid="reemplazar-insumo">Reemplazar…</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="barra-filtros">
        <b>Nuevo insumo:</b>
        <Input placeholder="Descripción" value={nuevo.descripcion} onChange={(_, d) => setNuevo({ ...nuevo, descripcion: d.value })} style={{ width: 260 }} data-testid="ni-descripcion" maxLength={70} />
        <Input placeholder="Unidad" value={nuevo.unidad} onChange={(_, d) => setNuevo({ ...nuevo, unidad: d.value })} style={{ width: 70 }} maxLength={5} data-testid="ni-unidad" />
        <Dropdown value={RUBRO[nuevo.rubro]} selectedOptions={[nuevo.rubro]} onOptionSelect={(_, d) => setNuevo({ ...nuevo, rubro: d.optionValue as Rubro })} style={{ minWidth: 140 }}>
          <Option value="M">Material</Option><Option value="O">Mano de obra</Option><Option value="E">Equipo</Option></Dropdown>
        <Input placeholder="Precio" value={nuevo.precio} onChange={(_, d) => setNuevo({ ...nuevo, precio: d.value })} style={{ width: 90 }} data-testid="ni-precio" />
        <Button data-testid="crear-insumo-proyecto" onClick={() => {
          const pr = leerNumero(nuevo.precio);
          if (!nuevo.descripcion.trim() || pr === null || pr < 0) { avisar('Escriba la descripción y un precio válido'); return; }
          cambiar((p) => { nuevoInsumo(p, { ...nuevo, precio: pr }); }, `Insumo «${nuevo.descripcion.trim()}» creado: úselo desde el análisis de una partida`);
          setNuevo({ descripcion: '', unidad: '', rubro: nuevo.rubro, precio: '' });
        }}>Crear</Button>
      </div>
      <p className="nota-ui">Cambiar un precio aquí recalcula todas las partidas que usan el insumo. «Reemplazar…» cambia un insumo por otro en todos los análisis (p. ej. un cemento por otra marca).</p>
    </div>
  );
}
