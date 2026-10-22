import { Button, Dropdown, Input, Option, Tab, TabList, Textarea } from '@fluentui/react-components';
import { useMemo, useState } from 'react';
import { calcularItem } from '../../nucleo/calculo';
import { agregarItemDeBase, ajustarPrecios, insumoEnUso, sinAcentos } from '../../nucleo/operaciones';
import type { BaseDatos } from '../../datos/modelo';
import type { Item } from '../../nucleo/tipos';
import { leerNumero, Numero, Texto } from '../campos';
import { num } from '../../reportes/formato';
import { avisar, baseActual, cambiar, elegirBase, guardarBase, obtener, ponerBases, useEstado } from '../almacen';

const RUBRO = { M: 'Material', O: 'Mano de obra', E: 'Equipo' } as const;

export function BaseDatosPantalla() {
  const bases = useEstado((e) => e.bases);
  const proyecto = useEstado((e) => e.proyecto);
  const moduloActual = useEstado((e) => e.modulo);
  const base = useEstado((e) => baseActual(e));
  const [vista, setVista] = useState<'items' | 'insumos'>('items');
  const [filtro, setFiltro] = useState('');
  const [rubro, setRubro] = useState<'' | 'M' | 'O' | 'E'>('');
  const [sel, setSel] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [pct, setPct] = useState('5');
  const [nuevoNombre, setNuevoNombre] = useState<string | null>(null);

  const q = sinAcentos(filtro);
  const mapa = useMemo(() => new Map((base?.insumos ?? []).map((i) => [i.id, i])), [base]);
  const items = useMemo(() => (base ? base.items.filter((i) => !q || sinAcentos(i.descripcion).includes(q) || sinAcentos(i.codigo ?? '') === q) : []), [base, q]);
  const insumos = useMemo(() => (base ? base.insumos.filter((i) => (!q || sinAcentos(i.descripcion).includes(q)) && (!rubro || i.rubro === rubro)) : []), [base, q, rubro]);
  const item = base?.items.find((i) => i.id === sel);
  const apu = useMemo(() => (base && item ? calcularItem(item, mapa, proyecto.plantilla) : null), [base, item, mapa, proyecto.plantilla]);
  const pu = (i: Item) => { try { return calcularItem(i, mapa, proyecto.plantilla).precioUnitario; } catch { return NaN; } };

  if (!base) return (
    <div className="pantalla vacio-grande" data-testid="sin-bases">
      <h2>Aún no hay bases de datos</h2>
      <p>Use <b>Importar de PRESCOM</b> para cargar las bases de su instalación (carpeta <code>datos</code>), <b>Importar de IA</b> para crear una a partir de lo que le prepare una IA, o <b>Nueva base</b> para empezar una vacía.</p>
      <Button appearance="primary" onClick={() => crearBaseVacia()} data-testid="crear-base-vacia">Crear una base vacía</Button>
    </div>
  );

  const editar = (f: (b: BaseDatos) => void, aviso = '') => { const b = structuredClone(base); f(b); guardarBase(b); if (aviso) avisar(aviso); };
  const anadir = (it: Item | undefined = item) => {
    const c = leerNumero(cantidad);
    if (!it) return;
    if (c === null || c < 0 || c > 1e10) { avisar('Escriba una cantidad válida (número mayor o igual a cero)'); return; }
    const m = Math.min(Math.max(1, moduloActual), proyecto.modulos.length);
    cambiar((p) => { agregarItemDeBase(p, base, it.id, m, c); }, `Añadido a «${proyecto.modulos[m - 1]?.nombre}»: ${it.descripcion}`);
  };
  const borrarItem = (it: Item) => {
    if (!window.confirm(`¿Eliminar el ítem «${it.descripcion}» de la base «${base.nombre}»? Los proyectos que ya lo usan no cambian.`)) return;
    editar((b) => { b.items = b.items.filter((x) => x.id !== it.id); }, `Ítem «${it.descripcion}» eliminado de la base`);
    setSel(null);
  };

  return (
    <div className="pantalla base">
      <div className="barra-filtros">
        <Dropdown value={base.nombre} selectedOptions={[base.nombre]} onOptionSelect={(_, d) => { elegirBase(d.optionValue ?? ''); setSel(null); }} data-testid="selector-base" style={{ minWidth: 280 }}>
          {bases.map((b) => <Option key={b.nombre} value={b.nombre}>{`${b.nombre} (${b.items.length} ítems)`}</Option>)}
        </Dropdown>
        {nuevoNombre === null
          ? <Button size="small" appearance="subtle" onClick={() => setNuevoNombre(base.nombre)} data-testid="renombrar-base">Renombrar</Button>
          : <span className="barra-filtros"><Input value={nuevoNombre} autoFocus maxLength={60} onChange={(_, d) => setNuevoNombre(d.value)} data-testid="nombre-base" onKeyDown={(e) => { if (e.key === 'Enter') { renombrarBase(base, nuevoNombre); setNuevoNombre(null); } if (e.key === 'Escape') setNuevoNombre(null); }} />
            <Button size="small" appearance="primary" onClick={() => { renombrarBase(base, nuevoNombre); setNuevoNombre(null); }} data-testid="aceptar-nombre-base">Aceptar</Button><Button size="small" onClick={() => setNuevoNombre(null)}>Cancelar</Button></span>}
        <Input placeholder="Buscar por descripción o código…" value={filtro} onChange={(_, d) => setFiltro(d.value)} data-testid="buscar" style={{ width: 280 }} />
        <TabList selectedValue={vista} onTabSelect={(_, d) => setVista(d.value as 'items' | 'insumos')} size="small">
          <Tab value="items" data-testid="ver-items">Ítems ({items.length})</Tab><Tab value="insumos" data-testid="ver-insumos">Insumos ({insumos.length})</Tab>
        </TabList>
      </div>

      {vista === 'items' ? (
        <div className="dos-paneles">
          <div className="tabla-contenedor"><table className="grilla"><thead><tr><th style={{ width: 70 }}>Código</th><th>Descripción</th><th style={{ width: 60 }}>Unid.</th><th style={{ width: 100 }} className="n">P. unitario</th></tr></thead><tbody>
            {!items.length && <tr><td colSpan={4} className="vacio">{base.items.length ? 'Ningún ítem coincide con la búsqueda.' : 'La base no tiene ítems. Importe datos de IA, o arme una partida en el presupuesto y use «A la base».'}</td></tr>}
            {items.slice(0, 400).map((i) => <tr key={i.id} className={i.id === sel ? 'sel' : ''} onClick={() => setSel(i.id)} onDoubleClick={() => anadir(i)} title="Doble clic: añadir al presupuesto con la cantidad indicada" data-testid="fila-item">
              <td>{i.codigo ?? ''}</td><td>{i.descripcion}</td><td className="c">{i.unidad}</td><td className="n">{num(pu(i))}</td></tr>)}
            {items.length > 400 && <tr><td colSpan={4} className="vacio">Se muestran 400 de {items.length}: afine la búsqueda.</td></tr>}
          </tbody></table></div>
          <div className="panel-apu">
            {item && apu ? (<>
              <h3>{item.descripcion} <small>({item.unidad})</small></h3>
              <div className="barra-filtros">
                <span>Cantidad</span><Input value={cantidad} onChange={(_, d) => setCantidad(d.value)} style={{ width: 90 }} data-testid="cantidad-nueva" aria-label="Cantidad" onKeyDown={(e) => e.key === 'Enter' && anadir()} />
                <Button appearance="primary" onClick={() => anadir()} data-testid="anadir-presupuesto">Añadir a «{proyecto.modulos[Math.min(Math.max(1, moduloActual), proyecto.modulos.length) - 1]?.nombre}»</Button>
                <Button appearance="subtle" onClick={() => borrarItem(item)} data-testid="eliminar-item">Eliminar de la base</Button>
              </div>
              <table className="grilla compacta"><thead><tr><th>Insumo</th><th>Unid.</th><th className="n">Rend.</th><th className="n">Precio</th></tr></thead><tbody>
                {(['materiales', 'manoObra', 'equipo'] as const).flatMap((c) => item[c].map((l, k) => { const i = mapa.get(l.insumo); return i ? <tr key={c + k}><td>{i.descripcion}</td><td className="c">{i.unidad}</td><td className="n">{num(l.rendimiento, 4)}</td><td className="n">{num(i.precio, 3)}</td></tr> : null; }))}
                {item.precioFijo !== undefined && <tr><td colSpan={4}>Precio directo: {num(item.precioFijo)}</td></tr>}
              </tbody></table>
              <table className="grilla compacta" style={{ marginTop: 6 }}><tbody>
                {proyecto.plantilla.parametros.filter((x) => x.formula.trim() && !['A', 'B', 'C'].includes(x.letra)).map((x) => <tr key={x.letra} className={x.resaltar ? 'sub' : ''}><td>{x.descripcion}</td><td className="n">{num(apu.valores[x.letra] ?? 0)}</td></tr>)}
              </tbody></table>
              <p className="literal">Precio unitario: <b data-testid="pu-base">{num(apu.precioUnitario)}</b> (con la plantilla del proyecto)</p>
            </>) : <p className="vacio">Elija un ítem para ver su análisis. Doble clic lo añade al módulo actual del presupuesto.</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="barra-filtros">
            <Dropdown value={rubro ? RUBRO[rubro] : 'Todos los rubros'} selectedOptions={[rubro]} onOptionSelect={(_, d) => setRubro((d.optionValue ?? '') as '' | 'M' | 'O' | 'E')} style={{ minWidth: 160 }} data-testid="filtro-rubro">
              <Option value="">Todos los rubros</Option><Option value="M">Material</Option><Option value="O">Mano de obra</Option><Option value="E">Equipo</Option>
            </Dropdown>
            <span>Ajustar precios de los {insumos.length} insumos mostrados en</span>
            <Input value={pct} onChange={(_, d) => setPct(d.value)} style={{ width: 70 }} aria-label="Porcentaje" data-testid="porcentaje-ajuste" /><span>%</span>
            <Button onClick={() => { const n = leerNumero(pct); if (n === null || n <= -100 || n > 1000) { avisar('Porcentaje no válido (entre −99 y 1000)'); return; } const ids = new Set(insumos.map((i) => i.id)); editar((b) => ajustarPrecios(b.insumos.filter((i) => ids.has(i.id)), n), `Precios de ${ids.size} insumos ajustados ${n} %`); }} data-testid="ajustar-precios">Aplicar</Button>
            <Button onClick={() => editar((b) => { const id = Math.max(0, ...b.insumos.map((i) => i.id)) + 1; b.insumos.unshift({ id, rubro: rubro || 'M', descripcion: `Insumo nuevo ${id}`, unidad: 'u', precio: 0, cotizacion: null, grupo: 0 }); }, 'Insumo nuevo al inicio de la lista: escriba su nombre, unidad y precio')} data-testid="nuevo-insumo-base">＋ Insumo</Button>
          </div>
          <div className="tabla-contenedor"><table className="grilla"><thead><tr><th>Descripción</th><th style={{ width: 80 }}>Unid.</th><th style={{ width: 120 }}>Rubro</th><th style={{ width: 110 }} className="n">Precio</th><th style={{ width: 100 }}>Cotización</th><th style={{ width: 34 }}></th></tr></thead><tbody>
            {insumos.slice(0, 400).map((i) => (
              <tr key={i.id} data-testid="fila-insumo"><td><Texto id="insumo-descripcion" valor={i.descripcion} alCambiar={(t) => editar((b) => { b.insumos.find((x) => x.id === i.id)!.descripcion = t; })} /></td>
                <td><Texto id="insumo-unidad" valor={i.unidad} max={5} requerido={false} alCambiar={(t) => editar((b) => { b.insumos.find((x) => x.id === i.id)!.unidad = t; })} /></td>
                <td>{RUBRO[i.rubro]}</td>
                <td className="n"><Numero id="insumo-precio" valor={i.precio} decimales={3} alCambiar={(n) => editar((b) => { const x = b.insumos.find((y) => y.id === i.id)!; x.precio = n; x.cotizacion = new Date().toISOString().slice(0, 10); })} /></td>
                <td className="c">{i.cotizacion ?? ''}</td>
                <td className="c">{insumoEnUso(base, i.id) ? '' : <button className="boton-icono" title="Ningún ítem lo usa: eliminar" data-testid="eliminar-insumo" onClick={() => editar((b) => { b.insumos = b.insumos.filter((x) => x.id !== i.id); }, `Insumo «${i.descripcion}» eliminado`)}>✕</button>}</td></tr>
            ))}
            {insumos.length > 400 && <tr><td colSpan={6} className="vacio">Se muestran 400 de {insumos.length}: afine la búsqueda.</td></tr>}
          </tbody></table></div>
          <p className="nota-ui">Los cambios en la base no modifican los proyectos que ya la usaron (cada proyecto guarda sus propios precios). Para actualizar el proyecto use «Actualizar precios».</p>
        </>
      )}
    </div>
  );
}

export function crearBaseVacia() {
  const { bases } = obtener();
  let n = 'Mi base de datos', k = 2;
  while (bases.some((b) => b.nombre === n)) n = `Mi base de datos ${k++}`;
  guardarBase({ nombre: n, moneda: 2, grupos: [], insumos: [], items: [] });
  elegirBase(n);
  avisar(`Base «${n}» creada`);
}

function renombrarBase(base: BaseDatos, nombre: string | null | undefined) {
  const n = (nombre ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!n || n === base.nombre) return;
  if (obtener().bases.some((b) => b.nombre === n)) { avisar(`Ya existe una base «${n}»`); return; }
  ponerBases(obtener().bases.map((b) => (b.nombre === base.nombre ? { ...b, nombre: n } : b)));
  elegirBase(n);
  avisar(`Base renombrada a «${n}»`);
}

/** Cuadro para pegar el JSON que devuelve una IA. */
export function PegarDatos({ alImportar, alCerrar }: { alImportar: (t: string) => { ok: boolean; mensajes: string[] }; alCerrar: () => void }) {
  const [texto, setTexto] = useState('');
  const [res, setRes] = useState<{ ok: boolean; mensajes: string[] } | null>(null);
  return (
    <div className="modal-fondo"><div className="modal" role="dialog" aria-label="Pegar datos de IA">
      <h3>Pegar datos preparados con IA</h3>
      <p>Pegue el JSON que le devolvió la IA. Civix lo valida completo y no guarda nada si hay errores.</p>
      <Textarea value={texto} onChange={(_, d) => setTexto(d.value)} rows={14} style={{ width: '100%', fontFamily: 'Consolas, monospace' }} data-testid="json-ia" />
      {res && <ul className={res.ok ? 'ok' : 'errores'} data-testid="resultado-importacion">{res.mensajes.slice(0, 12).map((m, k) => <li key={k}>{m}</li>)}</ul>}
      <div className="acciones"><Button appearance="primary" onClick={() => setRes(alImportar(texto))} data-testid="importar-json">Importar</Button><Button onClick={alCerrar} data-testid="cerrar-pegar">Cerrar</Button></div>
    </div></div>
  );
}
