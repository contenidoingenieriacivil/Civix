import { Button, Dropdown, Input, Option, Tab, TabList, Textarea } from '@fluentui/react-components';
import { useMemo, useState } from 'react';
import { calcularItem } from '../../nucleo/calculo';
import { agregarItemDeBase, ajustarPrecios, sinAcentos } from '../../nucleo/operaciones';
import { num } from '../../reportes/formato';
import { avisar, cambiar, guardarBase, useEstado } from '../almacen';

const RUBRO = { M: 'Material', O: 'Mano de obra', E: 'Equipo' } as const;

export function BaseDatosPantalla() {
  const bases = useEstado((e) => e.bases);
  const proyecto = useEstado((e) => e.proyecto);
  const moduloActual = useEstado((e) => e.modulo);
  const [nombre, setNombre] = useState<string>('');
  const [vista, setVista] = useState<'items' | 'insumos'>('items');
  const [filtro, setFiltro] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [pct, setPct] = useState('5');
  const base = bases.find((b) => b.nombre === nombre) ?? bases[0];

  const q = sinAcentos(filtro);
  const items = useMemo(() => (base ? base.items.filter((i) => !q || sinAcentos(i.descripcion).includes(q)) : []), [base, q]);
  const insumos = useMemo(() => (base ? base.insumos.filter((i) => !q || sinAcentos(i.descripcion).includes(q)) : []), [base, q]);
  const item = base?.items.find((i) => i.id === sel);
  const apu = useMemo(() => (base && item ? calcularItem(item, new Map(base.insumos.map((i) => [i.id, i])), proyecto.plantilla) : null), [base, item, proyecto.plantilla]);

  if (!base) return (
    <div className="pantalla vacio-grande" data-testid="sin-bases">
      <h2>Aún no hay bases de datos</h2>
      <p>Use <b>Importar de PRESCOM</b> para cargar las bases de su instalación (carpeta <code>datos</code>), o <b>Pegar datos de IA</b> para crear una a partir de lo que le prepare una IA.</p>
    </div>
  );

  const anadir = () => {
    const c = Number(cantidad.replace(',', '.'));
    if (!item || !Number.isFinite(c) || c < 0) return;
    cambiar((p) => { agregarItemDeBase(p, base, item.id, moduloActual, c); }, `Añadido: ${item.descripcion}`);
  };

  return (
    <div className="pantalla base">
      <div className="barra-filtros">
        <Dropdown value={base.nombre} selectedOptions={[base.nombre]} onOptionSelect={(_, d) => { setNombre(d.optionValue ?? ''); setSel(null); }} data-testid="selector-base" style={{ minWidth: 280 }}>
          {bases.map((b) => <Option key={b.nombre} value={b.nombre}>{`${b.nombre} (${b.items.length} ítems)`}</Option>)}
        </Dropdown>
        <Input placeholder="Buscar por descripción…" value={filtro} onChange={(_, d) => setFiltro(d.value)} data-testid="buscar" style={{ width: 280 }} />
        <TabList selectedValue={vista} onTabSelect={(_, d) => setVista(d.value as 'items' | 'insumos')} size="small">
          <Tab value="items" data-testid="ver-items">Ítems ({items.length})</Tab><Tab value="insumos" data-testid="ver-insumos">Insumos ({insumos.length})</Tab>
        </TabList>
      </div>

      {vista === 'items' ? (
        <div className="dos-paneles">
          <div className="tabla-contenedor"><table className="grilla"><thead><tr><th>Descripción</th><th style={{ width: 70 }}>Unid.</th></tr></thead><tbody>
            {items.slice(0, 400).map((i) => <tr key={i.id} className={i.id === sel ? 'sel' : ''} onClick={() => setSel(i.id)} data-testid="fila-item"><td>{i.descripcion}</td><td className="c">{i.unidad}</td></tr>)}
            {items.length > 400 && <tr><td colSpan={2} className="vacio">Se muestran 400 de {items.length}: afine la búsqueda.</td></tr>}
          </tbody></table></div>
          <div className="panel-apu">
            {item && apu ? (<>
              <h3>{item.descripcion} <small>({item.unidad})</small></h3>
              <table className="grilla compacta"><tbody>
                {proyecto.plantilla.parametros.filter((x) => x.formula.trim()).map((x) => <tr key={x.letra} className={x.resaltar ? 'sub' : ''}><td>{x.descripcion}</td><td className="n">{num(apu.valores[x.letra] ?? 0)}</td></tr>)}
              </tbody></table>
              <p className="literal">Precio unitario: <b data-testid="pu-base">{num(apu.precioUnitario)}</b></p>
              <div className="barra-filtros">
                <Input value={cantidad} onChange={(_, d) => setCantidad(d.value)} style={{ width: 90 }} data-testid="cantidad-nueva" aria-label="Cantidad" />
                <Button appearance="primary" onClick={anadir} data-testid="anadir-presupuesto">Añadir al presupuesto</Button>
              </div>
            </>) : <p className="vacio">Elija un ítem para ver su análisis de precio unitario.</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="barra-filtros">
            <span>Ajustar precios de los {insumos.length} insumos mostrados en</span>
            <Input value={pct} onChange={(_, d) => setPct(d.value)} style={{ width: 70 }} aria-label="Porcentaje" /><span>%</span>
            <Button onClick={() => { const n = Number(pct.replace(',', '.')); if (!Number.isFinite(n)) return; const b = structuredClone(base); const ids = new Set(insumos.map((i) => i.id)); ajustarPrecios(b.insumos.filter((i) => ids.has(i.id)), n); guardarBase(b); avisar(`Precios ajustados ${n} %`); }} data-testid="ajustar-precios">Aplicar</Button>
          </div>
          <div className="tabla-contenedor"><table className="grilla"><thead><tr><th>Descripción</th><th style={{ width: 70 }}>Unid.</th><th style={{ width: 120 }}>Rubro</th><th style={{ width: 110 }}>Precio</th><th style={{ width: 100 }}>Cotización</th></tr></thead><tbody>
            {insumos.slice(0, 400).map((i) => (
              <tr key={i.id}><td>{i.descripcion}</td><td className="c">{i.unidad}</td><td>{RUBRO[i.rubro]}</td>
                <td className="n"><input className="celda-num" defaultValue={i.precio.toFixed(3).replace('.', ',')} style={{ width: 90 }} onBlur={(e) => { const n = Number(e.target.value.replace(',', '.')); if (Number.isFinite(n) && n >= 0 && n !== i.precio) { const b = structuredClone(base); b.insumos.find((x) => x.id === i.id)!.precio = n; guardarBase(b); } }} /></td>
                <td className="c">{i.cotizacion ?? ''}</td></tr>
            ))}
          </tbody></table></div>
        </>
      )}
    </div>
  );
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
