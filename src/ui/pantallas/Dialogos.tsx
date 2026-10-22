import { Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Input, Option, Textarea } from '@fluentui/react-components';
import { useMemo, useState, type ReactNode } from 'react';
import type { LineaComputo } from '../../datos/modelo';
import { calcularItem, redondear } from '../../nucleo/calculo';
import { agregarLineaApu, moverAModulo, cantidadDeComputo, cantidadLinea, nuevaPartidaDirecta, nuevoInsumo, partidaABase, quitarLineaApu, sinAcentos } from '../../nucleo/operaciones';
import { calcularProyecto } from '../../nucleo/presupuesto';
import type { Linea, Rubro } from '../../nucleo/tipos';
import { num } from '../../reportes/formato';
import { abrirDialogo, avisar, cambiar, elegirPartida, guardarBase, irAModulo, irAPartida, useEstado } from '../almacen';
import { igualarPrecioUnitario, kgPorMetro, pesoFierro, piesTablares, reemplazarInsumo, reemplazarItemDePartida, sincronizarPreciosConBase, unirModulos } from '../../nucleo/herramientas';
import { leerNumero, Numero, Texto } from '../campos';

const RUBROS: [Rubro, string, 'materiales' | 'manoObra' | 'equipo'][] = [['M', 'Materiales', 'materiales'], ['O', 'Mano de obra', 'manoObra'], ['E', 'Equipo y maquinaria', 'equipo']];
const NOMBRE_RUBRO: Record<Rubro, string> = { M: 'Material', O: 'Mano de obra', E: 'Equipo' };

function Marco({ titulo, ancho = 860, children, acciones, id }: { titulo: ReactNode; ancho?: number; children: ReactNode; acciones?: ReactNode; id?: string }) {
  const cerrar = () => abrirDialogo(null);
  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) cerrar(); }}>
      <DialogSurface style={{ maxWidth: ancho, width: '94vw' }} data-testid={id}><DialogBody>
        <DialogTitle>{titulo}</DialogTitle>
        <DialogContent>{children}</DialogContent>
        <DialogActions>{acciones}<Button appearance="primary" onClick={cerrar} data-testid="cerrar-dialogo">Cerrar</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

/** Pregunta con botones (Guardar / No guardar / Cancelar…). */
export function Pregunta() {
  const q = useEstado((e) => e.pregunta);
  if (!q) return null;
  const ultimo = q.botones.length - 1;
  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) q.responder(ultimo); }}>
      <DialogSurface style={{ maxWidth: 520 }} data-testid="pregunta"><DialogBody>
        <DialogTitle>Civix</DialogTitle>
        <DialogContent><p>{q.texto}</p></DialogContent>
        <DialogActions>{q.botones.map((b, k) => <Button key={b} appearance={k === 0 ? 'primary' : 'secondary'} onClick={() => q.responder(k)} data-testid={`respuesta-${k}`}>{b}</Button>)}</DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

/** Abre el cuadro que corresponda al estado. */
export function Dialogos() {
  const d = useEstado((e) => e.dialogo);
  const proyecto = useEstado((e) => e.proyecto);
  if (!d) return null;
  if ('pos' in d && !proyecto.partidas[d.pos]) return null;
  switch (d.tipo) {
    case 'apu': return <DialogoApu pos={d.pos} />;
    case 'computo': return <DialogoComputo pos={d.pos} />;
    case 'especificacion': return <DialogoEspecificacion pos={d.pos} />;
    case 'guardar-en-base': return <DialogoGuardarEnBase pos={d.pos} />;
    case 'mover-modulo': return <DialogoMoverModulo pos={d.pos} />;
    case 'cambiar-item': return <DialogoCambiarItem pos={d.pos} />;
    case 'calculadora': return <DialogoCalculadora />;
    case 'sincronizar': return <DialogoSincronizar />;
    case 'unir-modulo': return <DialogoUnirModulo />;
    case 'reemplazar-insumo': return <DialogoReemplazarInsumo id={d.id} />;
    case 'nueva-partida': return <DialogoNuevaPartida />;
    case 'buscar': return <DialogoBuscar />;
  }
}

/** Análisis de precio unitario: rendimientos y precios editables, añadir o quitar insumos, o precio directo. */
function DialogoApu({ pos }: { pos: number }) {
  const proyecto = useEstado((e) => e.proyecto);
  const partida = proyecto.partidas[pos]!;
  const mapa = useMemo(() => new Map(proyecto.insumos.map((i) => [i.id, i])), [proyecto]);
  const apu = calcularItem(partida.item, mapa, proyecto.plantilla);
  const directo = partida.item.precioFijo !== undefined;
  const lineas = (r: Rubro, clave: 'materiales' | 'manoObra' | 'equipo', ls: Linea[]) => ls.map((l, k) => {
    const i = mapa.get(l.insumo);
    if (!i) return null;
    return (
      <tr key={`${clave}${k}`} data-testid="linea-apu">
        <td>{i.descripcion}</td><td className="c">{i.unidad}</td>
        <td className="n"><Numero id="apu-rendimiento" valor={l.rendimiento} decimales={4} alCambiar={(n) => cambiar((p) => { p.partidas[pos]!.item[clave][k]!.rendimiento = n; }, 'Rendimiento cambiado')} /></td>
        <td className="n"><Numero id="apu-precio" valor={i.precio} decimales={3} titulo="Cambia el precio del insumo en todo el proyecto" alCambiar={(n) => cambiar((p) => { p.insumos.find((x) => x.id === i.id)!.precio = n; }, `Precio de «${i.descripcion}» cambiado en todo el proyecto`)} /></td>
        <td className="n">{num(redondear(l.rendimiento * i.precio, 4))}</td>
        <td className="c"><button className="boton-icono" title="Quitar este insumo del análisis" data-testid="quitar-linea" onClick={() => cambiar((p) => quitarLineaApu(p, pos, r, k), `«${i.descripcion}» quitado del análisis`)}>✕</button></td>
      </tr>
    );
  });
  return (
    <Marco id="dialogo-apu" titulo={<>Análisis de precio unitario · {partida.descripcion} ({partida.unidad})</>}>
      {directo ? (
        <div className="bienvenida" style={{ margin: 0 }}>
          <p>Esta partida tiene <b>precio unitario directo</b> (cotización o sin análisis de insumos).</p>
          <div className="barra-filtros">Precio unitario directo:
            <Numero id="precio-directo" valor={partida.item.precioFijo} alCambiar={(n) => cambiar((p) => { p.partidas[pos]!.item.precioFijo = n; }, 'Precio directo cambiado')} />
            <Button onClick={() => cambiar((p) => { delete p.partidas[pos]!.item.precioFijo; delete p.partidas[pos]!.sinDetalle; }, 'Ahora el precio se calcula con el análisis de insumos')} data-testid="armar-analisis">Armar análisis de insumos</Button>
          </div>
        </div>
      ) : (<>
        <div className="tabla-contenedor" style={{ maxHeight: '40vh' }}>
          <table className="grilla" data-testid="tabla-apu">
            <thead><tr><th>Insumo</th><th style={{ width: 60 }}>Unid.</th><th style={{ width: 110 }}>Rendimiento</th><th style={{ width: 110 }}>Precio</th><th style={{ width: 100 }} className="n">Costo</th><th style={{ width: 34 }}></th></tr></thead>
            <tbody>
              {RUBROS.every(([, , c]) => !partida.item[c].length) && <tr><td colSpan={6} className="vacio">El análisis no tiene insumos. Añádalos abajo.</td></tr>}
              {RUBROS.map(([r, t, c]) => partida.item[c].length ? [<tr key={t} className="sub"><td colSpan={6}>{t}</td></tr>, ...lineas(r, c, partida.item[c])] : null)}
            </tbody>
          </table>
        </div>
        <AnadirInsumo pos={pos} />
        <table className="grilla compacta" style={{ marginTop: 8 }}>
          <tbody>
            {proyecto.plantilla.parametros.filter((q) => q.formula.trim() && !['A', 'B', 'C'].includes(q.letra)).map((q) => (
              <tr key={q.letra} className={q.resaltar ? 'sub' : ''}><td style={{ width: 30 }}>{q.letra}</td><td>{q.descripcion}{q.porcentaje !== null ? ` (${num(partida.item.porcentajes?.[q.letra] ?? q.porcentaje)}%)` : ''}</td><td className="n">{num(apu.valores[q.letra] ?? 0)}</td></tr>
            ))}
          </tbody>
        </table>
        <Igualar pos={pos} />
        <div className="barra-filtros"><Button size="small" onClick={() => cambiar((p) => { p.partidas[pos]!.item.precioFijo = apu.precioUnitario; }, 'La partida pasa a precio directo')} data-testid="pasar-a-directo">Usar precio directo en vez del análisis</Button></div>
      </>)}
      <p className="literal">Precio unitario adoptado: <b data-testid="pu-adoptado">{num(apu.precioUnitario)}</b></p>
    </Marco>
  );
}

function AnadirInsumo({ pos }: { pos: number }) {
  const proyecto = useEstado((e) => e.proyecto);
  const bases = useEstado((e) => e.bases);
  const [q, setQ] = useState('');
  const [rend, setRend] = useState('1');
  const [nuevo, setNuevo] = useState<{ unidad: string; rubro: Rubro; precio: string } | null>(null);
  const t = sinAcentos(q);
  // candidatos: insumos del proyecto y, si no están, de las bases cargadas
  const candidatos = useMemo(() => {
    if (t.length < 2) return [];
    const delProyecto = proyecto.insumos.filter((i) => sinAcentos(i.descripcion).includes(t)).map((i) => ({ i, origen: 'proyecto' }));
    const vistos = new Set(delProyecto.map((x) => `${x.i.rubro}|${sinAcentos(x.i.descripcion)}`));
    const deBases = bases.flatMap((b) => b.insumos.filter((i) => sinAcentos(i.descripcion).includes(t) && !vistos.has(`${i.rubro}|${sinAcentos(i.descripcion)}`)).map((i) => ({ i, origen: b.nombre })));
    return [...delProyecto, ...deBases].slice(0, 8);
  }, [t, proyecto.insumos, bases]);
  const r = leerNumero(rend);
  const valido = r !== null && r > 0 && r < 1e7;
  const anadir = (i: { descripcion: string; unidad: string; rubro: Rubro; precio: number }) => {
    if (!valido) { avisar('Escriba un rendimiento mayor que cero'); return; }
    cambiar((p) => { agregarLineaApu(p, pos, nuevoInsumo(p, i), r!); }, `«${i.descripcion}» añadido al análisis`);
    setQ(''); setNuevo(null);
  };
  return (
    <div className="anadir-insumo">
      <div className="barra-filtros">
        <b>Añadir insumo:</b>
        <Input placeholder="Buscar insumo por nombre…" value={q} onChange={(_, d) => { setQ(d.value); setNuevo(null); }} data-testid="buscar-insumo-apu" style={{ width: 300 }} />
        rendimiento <Input value={rend} onChange={(_, d) => setRend(d.value)} style={{ width: 90, borderColor: valido ? undefined : '#b91c1c' }} data-testid="rendimiento-nuevo" />
      </div>
      {t.length >= 2 && (
        <ul className="sugerencias" data-testid="sugerencias-insumo">
          {candidatos.map(({ i, origen }, k) => <li key={k}><button onClick={() => anadir(i)} data-testid="sugerencia-insumo">{i.descripcion} <small>({i.unidad} · {NOMBRE_RUBRO[i.rubro]} · {num(i.precio, 3)} · {origen})</small></button></li>)}
          <li>{nuevo ? (
            <span className="barra-filtros">Nuevo «{q.trim()}»:
              <Input placeholder="unidad" value={nuevo.unidad} onChange={(_, d) => setNuevo({ ...nuevo, unidad: d.value })} style={{ width: 70 }} data-testid="nuevo-insumo-unidad" />
              <Dropdown value={NOMBRE_RUBRO[nuevo.rubro]} selectedOptions={[nuevo.rubro]} onOptionSelect={(_, d) => setNuevo({ ...nuevo, rubro: d.optionValue as Rubro })} style={{ minWidth: 140 }}>
                {RUBROS.map(([k]) => <Option key={k} value={k}>{NOMBRE_RUBRO[k]}</Option>)}</Dropdown>
              precio <Input value={nuevo.precio} onChange={(_, d) => setNuevo({ ...nuevo, precio: d.value })} style={{ width: 90 }} data-testid="nuevo-insumo-precio" />
              <Button size="small" appearance="primary" data-testid="crear-insumo" onClick={() => {
                const pr = leerNumero(nuevo.precio);
                if (!q.trim() || pr === null || pr < 0) { avisar('Escriba nombre y precio válidos del insumo'); return; }
                anadir({ descripcion: q.trim(), unidad: nuevo.unidad, rubro: nuevo.rubro, precio: pr });
              }}>Crear y añadir</Button>
            </span>
          ) : <button onClick={() => setNuevo({ unidad: '', rubro: 'M', precio: '0' })} data-testid="nuevo-insumo">＋ Crear el insumo nuevo «{q.trim()}»</button>}</li>
        </ul>
      )}
    </div>
  );
}

/** Cómputo métrico de la partida: la cantidad es la suma de las líneas. */
function DialogoComputo({ pos }: { pos: number }) {
  const partida = useEstado((e) => e.proyecto.partidas[pos]!);
  const lineas = partida.computo ?? [];
  const poner = (f: (ls: LineaComputo[]) => void, aviso = '', clave = '') => cambiar((p) => {
    const x = p.partidas[pos]!;
    const ls = x.computo ?? [];
    f(ls);
    if (ls.length) { x.computo = ls; x.cantidad = redondear(cantidadDeComputo(ls), 4); } else delete x.computo;
  }, aviso, clave);
  const dim = (k: number, campo: 'veces' | 'largo' | 'ancho' | 'alto' | 'cantidad') => (
    <Numero id={`comp-${campo}`} valor={lineas[k]![campo]} ancho={74} decimales={campo === 'veces' ? 2 : 3} min={campo === 'cantidad' ? -1e9 : 0}
      alCambiar={(n) => poner((ls) => { ls[k]![campo] = n; if (campo !== 'cantidad') delete ls[k]!.cantidad; })} alVaciar={() => poner((ls) => { delete ls[k]![campo]; })} />
  );
  return (
    <Marco id="dialogo-computo" ancho={980} titulo={<>Cómputo métrico · {partida.descripcion} ({partida.unidad})</>}>
      <p className="nota-ui">Cada línea se multiplica: veces × largo × ancho × alto (deje en blanco lo que no corresponda). «Cant. directa» reemplaza el producto (p. ej. un volumen ya calculado; admite negativos para descontar vanos).</p>
      <div className="tabla-contenedor" style={{ maxHeight: '50vh' }}>
        <table className="grilla" data-testid="tabla-computo">
          <thead><tr><th style={{ width: 34 }}>N°</th><th>Descripción / ubicación</th><th className="n">Veces</th><th className="n">Largo</th><th className="n">Ancho</th><th className="n">Alto</th><th className="n">Cant. directa</th><th className="n" style={{ width: 90 }}>Parcial</th><th style={{ width: 34 }}></th></tr></thead>
          <tbody>
            {!lineas.length && <tr><td colSpan={9} className="vacio">Sin cómputo: la cantidad ({num(partida.cantidad)}) se escribió directamente. Añada líneas para calcularla.</td></tr>}
            {lineas.map((l, k) => (
              <tr key={k} data-testid="linea-computo">
                <td className="c">{k + 1}</td>
                <td><Texto valor={l.descripcion} requerido={false} max={60} id="comp-descripcion" placeholder="p. ej. Eje A, tramo CI1-CI2" alCambiar={(t) => poner((ls) => { ls[k]!.descripcion = t; }, '', `comp-desc-${k}`)} /></td>
                <td className="n">{dim(k, 'veces')}</td><td className="n">{dim(k, 'largo')}</td><td className="n">{dim(k, 'ancho')}</td><td className="n">{dim(k, 'alto')}</td><td className="n">{dim(k, 'cantidad')}</td>
                <td className="n">{num(cantidadLinea(l), 3)}</td>
                <td className="c"><button className="boton-icono" title="Quitar línea" data-testid="quitar-linea-computo" onClick={() => poner((ls) => { ls.splice(k, 1); }, 'Línea quitada')}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="barra-filtros">
        <Button onClick={() => poner((ls) => { ls.push(ls.length ? { descripcion: '', veces: 1 } : { descripcion: 'Total', veces: 1, largo: partida.cantidad }); }, 'Línea añadida')} data-testid="anadir-linea-computo">＋ Añadir línea</Button>
        {lineas.length > 0 && <Button onClick={() => poner((ls) => { ls.push(structuredClone(ls[ls.length - 1]!)); }, 'Línea copiada')} data-testid="copiar-linea-computo">Copiar la última línea</Button>}
        <span className="literal">Cantidad de la partida: <b data-testid="total-computo">{num(partida.cantidad, 2)} {partida.unidad}</b></span>
      </div>
    </Marco>
  );
}

function DialogoEspecificacion({ pos }: { pos: number }) {
  const partida = useEstado((e) => e.proyecto.partidas[pos]!);
  const [t, setT] = useState(partida.item.especificacion ?? '');
  const cambio = t !== (partida.item.especificacion ?? '');
  return (
    <Marco id="dialogo-especificacion" titulo={<>Especificación técnica · {partida.descripcion}</>} acciones={
      <Button appearance="primary" disabled={!cambio} data-testid="guardar-especificacion" onClick={() => { cambiar((p) => { const it = p.partidas[pos]!.item; if (t.trim()) it.especificacion = t; else delete it.especificacion; }, 'Especificación guardada'); abrirDialogo(null); }}>Guardar</Button>}>
      <p className="nota-ui">Sugerido: 1. Definición · 2. Materiales, herramientas y equipo · 3. Procedimiento de ejecución · 4. Medición · 5. Forma de pago. Aparece en el reporte «Especificaciones».</p>
      <Textarea value={t} onChange={(_, d) => setT(d.value)} rows={18} style={{ width: '100%' }} data-testid="texto-especificacion" />
    </Marco>
  );
}

function DialogoNuevaPartida() {
  const modulo = useEstado((e) => e.modulo);
  const proyecto = useEstado((e) => e.proyecto);
  const [d, setD] = useState({ descripcion: '', unidad: '', cantidad: '1', precio: '0' });
  const c = leerNumero(d.cantidad), pr = leerNumero(d.precio);
  const ok = !!d.descripcion.trim() && c !== null && c >= 0 && c < 1e10 && pr !== null && pr >= 0 && pr < 1e10;
  const m = Math.min(Math.max(1, modulo), proyecto.modulos.length);
  const crear = () => {
    if (!ok) return;
    let pos = -1;
    cambiar((p) => { pos = nuevaPartidaDirecta(p, m, { descripcion: d.descripcion, unidad: d.unidad, cantidad: c!, precio: pr! }); }, `Partida «${d.descripcion.trim()}» añadida`);
    abrirDialogo(null);
    elegirPartida(pos);
  };
  const campo = (t: string, k: keyof typeof d, id: string, extra: object = {}) => <label className="campo">{t}<Input value={d[k]} onChange={(_, v) => setD({ ...d, [k]: v.value })} data-testid={id} onKeyDown={(e) => e.key === 'Enter' && crear()} {...extra} /></label>;
  return (
    <Marco id="dialogo-nueva-partida" ancho={560} titulo={`Nueva partida en «${proyecto.modulos[m - 1]?.nombre ?? ''}»`} acciones={<Button appearance="primary" disabled={!ok} onClick={crear} data-testid="crear-partida">Añadir partida</Button>}>
      <div className="rejilla-campos" style={{ gridTemplateColumns: '1fr' }}>
        {campo('Descripción', 'descripcion', 'np-descripcion', { autoFocus: true, maxLength: 70 })}
        <div className="rejilla-campos" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {campo('Unidad', 'unidad', 'np-unidad', { maxLength: 5 })}{campo('Cantidad', 'cantidad', 'np-cantidad')}{campo('Precio unitario', 'precio', 'np-precio')}
        </div>
      </div>
      <p className="nota-ui">Se crea con precio directo. Después puede armar su análisis de insumos (botón «Análisis») o añadir ítems con análisis desde la pestaña «Base de datos».</p>
    </Marco>
  );
}

function DialogoGuardarEnBase({ pos }: { pos: number }) {
  const bases = useEstado((e) => e.bases);
  const proyecto = useEstado((e) => e.proyecto);
  const [nombre, setNombre] = useState(bases[0]?.nombre ?? 'Mi base de datos');
  const guardar = () => {
    const n = nombre.trim() || 'Mi base de datos';
    const base = structuredClone(bases.find((b) => b.nombre === n) ?? { nombre: n, moneda: proyecto.moneda, grupos: [], insumos: [], items: [] });
    const r = partidaABase(proyecto, pos, base);
    guardarBase(base);
    avisar(`«${proyecto.partidas[pos]!.descripcion}» ${r.reemplazado ? 'actualizado' : 'guardado'} en la base «${n}»`);
    abrirDialogo(null);
  };
  return (
    <Marco id="dialogo-guardar-base" ancho={520} titulo="Guardar el análisis en una base de datos" acciones={<Button appearance="primary" onClick={guardar} data-testid="confirmar-guardar-base">Guardar</Button>}>
      <p>Copia el ítem «{proyecto.partidas[pos]!.descripcion}» con su análisis e insumos, para usarlo en otros proyectos. Si ya existe uno con el mismo nombre y unidad, se actualiza.</p>
      <label className="campo">Base de datos (elija una o escriba un nombre nuevo)
        <Input value={nombre} onChange={(_, d) => setNombre(d.value)} list="bases-existentes" data-testid="nombre-base-destino" />
        <datalist id="bases-existentes">{bases.map((b) => <option key={b.nombre} value={b.nombre} />)}</datalist>
      </label>
    </Marco>
  );
}

function DialogoMoverModulo({ pos }: { pos: number }) {
  const proyecto = useEstado((e) => e.proyecto);
  const x = proyecto.partidas[pos]!;
  const mover = (m: number) => {
    let n = pos;
    cambiar((p) => { n = moverAModulo(p, pos, m); }, `Partida pasada a «${proyecto.modulos[m - 1]!.nombre}»`);
    abrirDialogo(null);
    irAPartida(n);
  };
  return (
    <Marco id="dialogo-mover" ancho={560} titulo={`Pasar «${x.descripcion}» a otro módulo`}>
      <ul className="lista-opciones">
        {proyecto.modulos.map((m, k) => <li key={k}><button disabled={k + 1 === x.modulo} onClick={() => mover(k + 1)} data-testid="destino-modulo">{k + 1}. {m.nombre}{k + 1 === x.modulo ? ' (actual)' : ''}</button></li>)}
      </ul>
    </Marco>
  );
}

/** Igualar precio unitario (cálculo inverso): ajusta los rendimientos para llegar al precio pedido. */
function Igualar({ pos }: { pos: number }) {
  const proyecto = useEstado((e) => e.proyecto);
  const [objetivo, setObjetivo] = useState('');
  const [solo, setSolo] = useState(false);
  const aplicar = () => {
    const o = leerNumero(objetivo);
    if (o === null || o <= 0) { avisar('Escriba el precio unitario que desea obtener'); return; }
    try {
      const { item, factor } = igualarPrecioUnitario(proyecto.partidas[pos]!.item, new Map(proyecto.insumos.map((i) => [i.id, i])), proyecto.plantilla, o, solo);
      cambiar((p) => { p.partidas[pos]!.item = { ...item, id: p.partidas[pos]!.item.id }; }, `Rendimientos ${solo ? 'de mano de obra y equipo ' : ''}multiplicados por ${num(factor, 4)} para llegar a ${num(o)}`);
    } catch (e) { avisar(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="barra-filtros" style={{ marginTop: 6 }}>
      <b>Igualar precio unitario a</b>
      <Input value={objetivo} onChange={(_, d) => setObjetivo(d.value)} style={{ width: 100 }} data-testid="igualar-objetivo" onKeyDown={(e) => e.key === 'Enter' && aplicar()} />
      <Checkbox label="solo mano de obra y equipo" checked={solo} onChange={(_, d) => setSolo(!!d.checked)} data-testid="igualar-solo-mo" />
      <Button size="small" onClick={aplicar} data-testid="igualar-aplicar">Igualar</Button>
    </div>
  );
}

/** Reemplaza el ítem (análisis) de la partida por otro de una base, conservando cantidad y cómputo. */
function DialogoCambiarItem({ pos }: { pos: number }) {
  const bases = useEstado((e) => e.bases);
  const partida = useEstado((e) => e.proyecto.partidas[pos]!);
  const [q, setQ] = useState(partida.descripcion.split(/\s+/).slice(0, 2).join(' '));
  const t = sinAcentos(q);
  const res = t.length < 2 ? [] : bases.flatMap((b) => b.items.filter((i) => sinAcentos(i.descripcion).includes(t) || sinAcentos(i.codigo ?? '') === t).map((i) => ({ b, i }))).slice(0, 60);
  return (
    <Marco id="dialogo-cambiar-item" ancho={820} titulo={`Cambiar el ítem de «${partida.descripcion}»`}>
      {!bases.length ? <p>No hay bases de datos cargadas. Impórtelas en la pestaña «Base de datos».</p> : (<>
        <Input value={q} onChange={(_, d) => setQ(d.value)} placeholder="Buscar ítem en las bases…" style={{ width: '100%' }} autoFocus data-testid="buscar-item-cambio" />
        <ul className="lista-opciones" style={{ maxHeight: '45vh' }}>
          {res.map(({ b, i }) => <li key={`${b.nombre}-${i.id}`}><button data-testid="opcion-item" onClick={() => {
            cambiar((p) => reemplazarItemDePartida(p, pos, b, i.id), `Análisis cambiado por «${i.descripcion}» (se conserva la cantidad ${num(partida.cantidad)})`);
            abrirDialogo(null);
          }}>{i.codigo ? `${i.codigo} · ` : ''}{i.descripcion} <small>({i.unidad} · {b.nombre})</small></button></li>)}
          {t.length >= 2 && !res.length && <li className="vacio">Sin resultados</li>}
        </ul>
        <p className="nota-ui">Se conserva la cantidad, el cómputo y el plazo; cambian la descripción, la unidad y el análisis de precio unitario.</p>
      </>)}
    </Marco>
  );
}

function DialogoCalculadora() {
  const [f, setF] = useState({ d: '12', l: '12', n: '1' });
  const [m, setM] = useState({ e: '2', a: '4', l: '3', n: '1' });
  const v = (s: string) => { const x = leerNumero(s); return x !== null && x >= 0 ? x : null; };
  const kg = v(f.d) !== null && v(f.l) !== null && v(f.n) !== null ? pesoFierro(v(f.d)!, v(f.l)!, v(f.n)!) : null;
  const pies = [m.e, m.a, m.l, m.n].every((x) => v(x) !== null) ? piesTablares(v(m.e)!, v(m.a)!, v(m.l)!, v(m.n)!) : null;
  const campo = (t: string, val: string, set: (s: string) => void, id: string) => <label className="campo">{t}<Input value={val} onChange={(_, d) => set(d.value)} style={{ width: 110 }} data-testid={id} /></label>;
  return (
    <Marco id="dialogo-calculadora" ancho={700} titulo="Calculadoras">
      <h4>Peso del fierro (acero de refuerzo)</h4>
      <div className="barra-filtros">{campo('Diámetro (mm)', f.d, (s) => setF({ ...f, d: s }), 'calc-diametro')}{campo('Largo de cada barra (m)', f.l, (s) => setF({ ...f, l: s }), 'calc-largo')}{campo('N° de barras', f.n, (s) => setF({ ...f, n: s }), 'calc-barras')}
        <span className="literal">= <b data-testid="calc-kg">{kg !== null ? `${num(kg, 2)} kg` : '—'}</b>{v(f.d) !== null ? ` (${num(kgPorMetro(v(f.d)!), 3)} kg/m)` : ''}</span></div>
      <table className="grilla compacta" style={{ maxWidth: 520 }}><thead><tr><th>Ø mm</th>{[6, 8, 10, 12, 16, 20, 25, 32].map((d) => <th key={d} className="n">{d}</th>)}</tr></thead><tbody><tr><td>kg/m</td>{[6, 8, 10, 12, 16, 20, 25, 32].map((d) => <td key={d} className="n">{num(kgPorMetro(d), 3)}</td>)}</tr></tbody></table>
      <h4>Madera (pies tablares, pie²)</h4>
      <div className="barra-filtros">{campo('Espesor (pulg)', m.e, (s) => setM({ ...m, e: s }), 'calc-espesor')}{campo('Ancho (pulg)', m.a, (s) => setM({ ...m, a: s }), 'calc-ancho')}{campo('Largo (m)', m.l, (s) => setM({ ...m, l: s }), 'calc-largo-madera')}{campo('Piezas', m.n, (s) => setM({ ...m, n: s }), 'calc-piezas')}
        <span className="literal">= <b data-testid="calc-pies">{pies !== null ? `${num(pies, 2)} pie²` : '—'}</b></span></div>
      <p className="nota-ui">Fierro: kg/m = d² ÷ 162. Madera: espesor × ancho × largo (pies) ÷ 12.</p>
    </Marco>
  );
}

function DialogoSincronizar() {
  const bases = useEstado((e) => e.bases);
  const proyecto = useEstado((e) => e.proyecto);
  const [nombre, setNombre] = useState(bases[0]?.nombre ?? '');
  const base = bases.find((b) => b.nombre === nombre);
  const vista = useMemo(() => (base ? sincronizarPreciosConBase(structuredClone(proyecto), base) : null), [base, proyecto]);
  return (
    <Marco id="dialogo-sincronizar" ancho={620} titulo="Tomar precios de una base de datos" acciones={
      <Button appearance="primary" disabled={!base || !vista?.actualizados} data-testid="aplicar-sincronizar" onClick={() => { cambiar((p) => { sincronizarPreciosConBase(p, base!); }, `${vista!.actualizados} precio(s) del proyecto tomados de «${base!.nombre}»`); abrirDialogo(null); }}>Actualizar {vista?.actualizados ?? 0} precio(s)</Button>}>
      {!bases.length ? <p>No hay bases de datos cargadas.</p> : (<>
        <Dropdown value={nombre} selectedOptions={[nombre]} onOptionSelect={(_, d) => setNombre(d.optionValue ?? '')} style={{ minWidth: 300 }}>{bases.map((b) => <Option key={b.nombre} value={b.nombre}>{b.nombre}</Option>)}</Dropdown>
        {vista && <p data-testid="vista-sincronizar"><b>{vista.actualizados}</b> insumos del proyecto cambiarían de precio · {proyecto.insumos.length - vista.actualizados - vista.sinCoincidencia.length} ya tienen el mismo · {vista.sinCoincidencia.length} no están en la base (se conservan).</p>}
        <p className="nota-ui">Se comparan por nombre (sin importar mayúsculas ni acentos) y rubro.</p>
      </>)}
    </Marco>
  );
}

function DialogoUnirModulo() {
  const proyecto = useEstado((e) => e.proyecto);
  const modulo = useEstado((e) => e.modulo);
  const actual = proyecto.modulos[modulo - 1];
  return (
    <Marco id="dialogo-unir" ancho={560} titulo={`Unir «${actual?.nombre ?? ''}» con otro módulo`}>
      <p>Las partidas de este módulo pasan al final del módulo que elija, y este módulo se elimina.</p>
      <ul className="lista-opciones">{proyecto.modulos.map((m, k) => <li key={k}><button disabled={k + 1 === modulo} data-testid="destino-unir" onClick={() => { const destino = k + 1 > modulo ? k : k + 1; cambiar((p) => unirModulos(p, modulo, k + 1), `Módulo «${actual?.nombre}» unido a «${m.nombre}»`); irAModulo(destino); abrirDialogo(null); }}>{k + 1}. {m.nombre}</button></li>)}</ul>
    </Marco>
  );
}

function DialogoReemplazarInsumo({ id }: { id: number }) {
  const proyecto = useEstado((e) => e.proyecto);
  const i = proyecto.insumos.find((x) => x.id === id);
  const [q, setQ] = useState('');
  if (!i) return null;
  const t = sinAcentos(q);
  const opciones = proyecto.insumos.filter((x) => x.id !== id && x.rubro === i.rubro && (!t || sinAcentos(x.descripcion).includes(t)));
  return (
    <Marco id="dialogo-reemplazar-insumo" ancho={640} titulo={`Reemplazar «${i.descripcion}» en todo el proyecto`}>
      <Input value={q} onChange={(_, d) => setQ(d.value)} placeholder="Buscar el insumo que lo reemplaza…" style={{ width: '100%' }} autoFocus data-testid="buscar-reemplazo" />
      <ul className="lista-opciones" style={{ maxHeight: '45vh' }}>
        {opciones.map((x) => <li key={x.id}><button data-testid="opcion-insumo" onClick={() => { let n = 0; cambiar((p) => { n = reemplazarInsumo(p, id, x.id); }, ''); avisar(`«${i.descripcion}» reemplazado por «${x.descripcion}» en ${n} partida(s)`); abrirDialogo(null); }}>{x.descripcion} <small>({x.unidad} · {num(x.precio, 3)})</small></button></li>)}
        {!opciones.length && <li className="vacio">No hay otro insumo del mismo rubro. Créelo abajo en la pestaña Insumos.</li>}
      </ul>
    </Marco>
  );
}

/** Búsqueda de partidas en todo el proyecto. */
function DialogoBuscar() {
  const proyecto = useEstado((e) => e.proyecto);
  const [q, setQ] = useState('');
  const c = useMemo(() => calcularProyecto(proyecto), [proyecto]);
  const t = sinAcentos(q);
  const res = t ? c.modulos.flatMap((m) => m.partidas.filter((x) => sinAcentos(x.partida.descripcion).includes(t) || `${m.indice}.${x.numero}` === q.trim()).map((x) => ({ m, x }))) : [];
  return (
    <Marco id="dialogo-buscar" ancho={820} titulo="Buscar partida">
      <Input value={q} onChange={(_, d) => setQ(d.value)} placeholder="Texto de la descripción o número (p. ej. 2.5)…" autoFocus style={{ width: '100%' }} data-testid="texto-buscar" />
      <div className="tabla-contenedor" style={{ maxHeight: '50vh', marginTop: 8 }}>
        <table className="grilla"><thead><tr><th style={{ width: 60 }}>N°</th><th>Partida</th><th>Módulo</th><th className="n">Parcial</th></tr></thead><tbody>
          {t && !res.length && <tr><td colSpan={4} className="vacio">Sin resultados</td></tr>}
          {res.slice(0, 100).map(({ m, x }) => (
            <tr key={`${m.indice}.${x.numero}`} data-testid="resultado-busqueda" style={{ cursor: 'pointer' }} onClick={() => { irAPartida(proyecto.partidas.indexOf(x.partida)); abrirDialogo(null); }}>
              <td className="c">{m.indice}.{x.numero}</td><td>{x.partida.descripcion}</td><td>{m.nombre}</td><td className="n">{num(x.parcial)}</td></tr>))}
        </tbody></table>
      </div>
    </Marco>
  );
}

