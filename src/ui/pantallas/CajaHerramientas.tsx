import { escribirPortapapeles } from '../persistencia';
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, Button, Dropdown, Input, Option } from '@fluentui/react-components';
import { useState, type ReactNode } from 'react';
import { areaCirculo, areaRectangulo, areaTrapecio, areaTriangulo, convertir, dosificacion, impuestosIncluidos, ladrillosPorM2, manningLleno, pendiente, UNIDADES, volumenCilindro, volumenPrisma, volumenZanja } from '../../nucleo/calculos';
import { kgPorMetro, pesoFierro, piesTablares } from '../../nucleo/herramientas';
import { montoALiteral } from '../../nucleo/literal';
import { cantidadDeComputo } from '../../nucleo/operaciones';
import { redondear } from '../../nucleo/calculo';
import { num } from '../../reportes/formato';
import { avisar, cambiar, obtener, useEstado } from '../almacen';
import { leerNumero } from '../campos';

/** Campos numéricos de una herramienta: guarda el texto escrito y lee números con coma o punto. */
function useValores<T extends Record<string, string>>(inicial: T) {
  const [v, setV] = useState(inicial);
  const n = (k: keyof T) => leerNumero(v[k]!);
  const campo = (k: keyof T, etiqueta: string, ancho = 80) => (
    <label className="campo-herr"><span>{etiqueta}</span><Input size="small" value={v[k]} style={{ width: ancho }} data-testid={`h-${String(k)}`} onChange={(_, d) => setV({ ...v, [k]: d.value })} /></label>
  );
  return { v, setV, n, campo };
}

/** Lleva un resultado a la partida seleccionada: como su cantidad o como una línea de su cómputo métrico. */
function Usar({ valor, descripcion }: { valor: number | null; descripcion: string }) {
  const sel = useEstado((e) => e.seleccion);
  const partida = useEstado((e) => e.proyecto.partidas[e.seleccion]);
  if (valor === null || !Number.isFinite(valor)) return null;
  const v = redondear(valor, 4);
  return (
    <div className="usar-resultado">
      <Button size="small" disabled={!partida} data-testid="usar-cantidad" title={partida ? `Poner ${num(v, 3)} como cantidad de «${partida.descripcion}»` : 'Elija una partida en la pestaña Inicio'}
        onClick={() => cambiar((p) => { const x = p.partidas[sel]!; x.cantidad = v; delete x.computo; }, `Cantidad de «${partida!.descripcion}»: ${num(v, 3)}`)}>Usar como cantidad</Button>
      <Button size="small" disabled={!partida} data-testid="usar-computo" title={partida ? 'Añadir como línea del cómputo métrico de la partida seleccionada' : 'Elija una partida en la pestaña Inicio'}
        onClick={() => cambiar((p) => {
          const x = p.partidas[sel]!;
          const ls = x.computo ?? (x.cantidad ? [{ descripcion: 'Cantidad anterior', cantidad: x.cantidad }] : []);
          ls.push({ descripcion: descripcion.slice(0, 60), cantidad: v });
          x.computo = ls; x.cantidad = redondear(cantidadDeComputo(ls), 4);
        }, `Línea «${descripcion}» añadida al cómputo de «${partida!.descripcion}»`)}>Añadir al cómputo</Button>
      <Button size="small" appearance="subtle" onClick={() => { void escribirPortapapeles(String(v).replace('.', ',')); avisar(`${num(v, 3)} copiado`); }}>Copiar</Button>
    </div>
  );
}

const Res = ({ children, id }: { children: ReactNode; id?: string }) => <div className="resultado-herr" data-testid={id}>{children}</div>;
const fmt = (x: number | null, d = 3, u = '') => (x === null || !Number.isFinite(x) ? '—' : `${num(x, d)}${u ? ` ${u}` : ''}`);
const todos = (...xs: (number | null)[]) => xs.every((x) => x !== null && x >= 0);

function AreasVolumenes() {
  const [forma, setForma] = useState('Rectángulo');
  const { n, campo } = useValores({ a: '5', b: '4', c: '3', d: '1,2', h: '2', l: '100', z: '0' });
  const formas: Record<string, { campos: ReactNode; valor: number | null; unidad: string }> = {
    'Rectángulo': { campos: <>{campo('a', 'Largo')}{campo('b', 'Ancho')}</>, valor: todos(n('a'), n('b')) ? areaRectangulo(n('a')!, n('b')!) : null, unidad: 'm²' },
    'Triángulo': { campos: <>{campo('a', 'Base')}{campo('h', 'Altura')}</>, valor: todos(n('a'), n('h')) ? areaTriangulo(n('a')!, n('h')!) : null, unidad: 'm²' },
    'Trapecio': { campos: <>{campo('a', 'Base mayor')}{campo('b', 'Base menor')}{campo('h', 'Altura')}</>, valor: todos(n('a'), n('b'), n('h')) ? areaTrapecio(n('a')!, n('b')!, n('h')!) : null, unidad: 'm²' },
    'Círculo': { campos: campo('d', 'Diámetro'), valor: todos(n('d')) ? areaCirculo(n('d')!) : null, unidad: 'm²' },
    'Prisma (losa, zapata, muro)': { campos: <>{campo('a', 'Largo')}{campo('b', 'Ancho')}{campo('c', 'Alto')}</>, valor: todos(n('a'), n('b'), n('c')) ? volumenPrisma(n('a')!, n('b')!, n('c')!) : null, unidad: 'm³' },
    'Cilindro (pozo, cámara)': { campos: <>{campo('d', 'Diámetro')}{campo('h', 'Altura')}</>, valor: todos(n('d'), n('h')) ? volumenCilindro(n('d')!, n('h')!) : null, unidad: 'm³' },
    'Zanja (con talud)': { campos: <>{campo('l', 'Largo')}{campo('b', 'Ancho de fondo')}{campo('h', 'Profundidad')}{campo('z', 'Talud z:1')}</>, valor: todos(n('l'), n('b'), n('h'), n('z')) ? volumenZanja(n('l')!, n('b')!, n('h')!, n('z')!) : null, unidad: 'm³' },
  };
  const f = formas[forma]!;
  return (<>
    <Dropdown size="small" value={forma} selectedOptions={[forma]} onOptionSelect={(_, d) => setForma(d.optionValue ?? forma)} data-testid="h-forma">{Object.keys(formas).map((k) => <Option key={k} value={k}>{k}</Option>)}</Dropdown>
    <div className="campos-herr">{f.campos}</div>
    <Res id="r-area">{forma} = <b>{fmt(f.valor, 3, f.unidad)}</b></Res>
    <Usar valor={f.valor} descripcion={forma} />
  </>);
}

function Hormigon() {
  const { n, campo } = useValores({ vol: '1', c: '1', a: '2', g: '3', ac: '0,5', desp: '5', factor: '1,55' });
  let r: ReturnType<typeof dosificacion> | null = null, error = '';
  try { if (todos(n('vol'), n('c'), n('a'), n('g'), n('ac'), n('desp'), n('factor'))) r = dosificacion(n('vol')!, n('c')!, n('a')!, n('g')!, { aguaCemento: n('ac')!, desperdicio: n('desp')!, factor: n('factor')! }); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  return (<>
    <div className="campos-herr">{campo('vol', 'Volumen m³')}{campo('c', 'Cemento', 50)}{campo('a', 'Arena', 50)}{campo('g', 'Grava', 50)}{campo('ac', 'Agua/cemento', 60)}{campo('desp', 'Desperdicio %', 60)}{campo('factor', 'Factor', 60)}</div>
    {r ? <Res id="r-hormigon">Cemento <b>{fmt(r.cementoKg, 1, 'kg')}</b> = <b>{fmt(r.bolsas, 2, 'bolsas')}</b> · Arena <b>{fmt(r.arena, 3, 'm³')}</b> · Grava <b>{fmt(r.grava, 3, 'm³')}</b> · Agua <b>{fmt(r.agua, 0, 'l')}</b></Res> : <Res>{error || 'Complete los datos'}</Res>}
    <p className="nota-ui">Método volumétrico: factor 1,55 para hormigón y 1,33 para mortero (grava = 0). Es una estimación; use su dosificación de laboratorio cuando la tenga.</p>
  </>);
}

function Ladrillos() {
  const { n, campo } = useValores({ l: '24', h: '11,5', j: '1,5', e: '12', desp: '5', area: '10' });
  let r: ReturnType<typeof ladrillosPorM2> | null = null;
  try { if (todos(n('l'), n('h'), n('j'), n('e'), n('desp'))) r = ladrillosPorM2(n('l')!, n('h')!, n('j')!, n('e')!, n('desp')!); } catch { r = null; }
  const area = n('area');
  return (<>
    <div className="campos-herr">{campo('l', 'Largo cm', 55)}{campo('h', 'Alto cm', 55)}{campo('j', 'Junta cm', 55)}{campo('e', 'Espesor muro cm', 55)}{campo('desp', 'Desperdicio %', 55)}{campo('area', 'Área de muro m²', 70)}</div>
    {r ? <Res id="r-ladrillo"><b>{fmt(r.piezas, 2)}</b> piezas/m² y <b>{fmt(r.mortero, 4, 'm³')}</b> de mortero/m²{area !== null ? <> → para {fmt(area, 2, 'm²')}: <b>{fmt(Math.ceil(r.piezas * area), 0, 'piezas')}</b> y <b>{fmt(r.mortero * area, 3, 'm³')}</b> de mortero</> : null}</Res> : <Res>Complete los datos</Res>}
    <Usar valor={r ? r.piezas : null} descripcion="Ladrillos por m²" />
  </>);
}

function Fierro() {
  const { n, campo } = useValores({ d: '12', l: '12', p: '1' });
  const kg = todos(n('d'), n('l'), n('p')) ? pesoFierro(n('d')!, n('l')!, n('p')!) : null;
  return (<>
    <div className="campos-herr">{campo('d', 'Diámetro mm', 60)}{campo('l', 'Largo m', 60)}{campo('p', 'N° barras', 60)}</div>
    <Res id="r-fierro"><b>{fmt(kg, 2, 'kg')}</b>{n('d') ? ` (${num(kgPorMetro(n('d')!), 3)} kg/m)` : ''}</Res>
    <table className="grilla compacta"><tbody><tr><td>Ø mm</td>{[6, 8, 10, 12, 16, 20, 25].map((d) => <td key={d} className="n">{d}</td>)}</tr><tr><td>kg/m</td>{[6, 8, 10, 12, 16, 20, 25].map((d) => <td key={d} className="n">{num(kgPorMetro(d), 3)}</td>)}</tr></tbody></table>
    <Usar valor={kg} descripcion={`Fierro Ø${n('d') ?? ''} mm`} />
  </>);
}

function Madera() {
  const { n, campo } = useValores({ e: '2', a: '4', l: '3', p: '1' });
  const pies = todos(n('e'), n('a'), n('l'), n('p')) ? piesTablares(n('e')!, n('a')!, n('l')!, n('p')!) : null;
  return (<>
    <div className="campos-herr">{campo('e', 'Espesor pulg', 55)}{campo('a', 'Ancho pulg', 55)}{campo('l', 'Largo m', 55)}{campo('p', 'Piezas', 55)}</div>
    <Res id="r-madera"><b>{fmt(pies, 2, 'pie²')}</b></Res>
    <Usar valor={pies} descripcion="Madera (pie²)" />
  </>);
}

function Tuberia() {
  const { n, campo } = useValores({ c1: '1903,56', c2: '1901,07', dist: '78', d: '150', s: '1', rug: '0,009' });
  const s = todos(n('c1'), n('c2'), n('dist')) ? pendiente(n('c1')!, n('c2')!, n('dist')!) : null;
  let m: ReturnType<typeof manningLleno> | null = null;
  try { if (todos(n('d'), n('s'), n('rug'))) m = manningLleno(n('d')!, n('s')!, n('rug')!); } catch { m = null; }
  return (<>
    <b className="sub-herr">Pendiente entre cámaras</b>
    <div className="campos-herr">{campo('c1', 'Cota inicio', 75)}{campo('c2', 'Cota final', 75)}{campo('dist', 'Distancia m', 60)}</div>
    <Res id="r-pendiente">Pendiente <b>{fmt(s, 3, '%')}</b></Res>
    <b className="sub-herr">Tubería llena (Manning)</b>
    <div className="campos-herr">{campo('d', 'Ø interior mm', 60)}{campo('s', 'Pendiente %', 60)}{campo('rug', 'n', 55)}</div>
    {m ? <Res id="r-manning">Caudal <b>{fmt(m.caudal, 2, 'l/s')}</b> · Velocidad <b>{fmt(m.velocidad, 2, 'm/s')}</b></Res> : <Res>Complete los datos</Res>}
    <p className="nota-ui">n: PVC 0,009–0,010 · hormigón 0,013 · HDPE 0,009.</p>
  </>);
}

function Unidades() {
  const [grupo, setGrupo] = useState('Longitud');
  const us = Object.keys(UNIDADES[grupo]!);
  const [de, setDe] = useState(us[0]!);
  const [a, setA] = useState(us[1]!);
  const { n, campo } = useValores({ v: '1' });
  const desde = us.includes(de) ? de : us[0]!, hasta = us.includes(a) ? a : us[1]!;
  const r = n('v') !== null ? convertir(n('v')!, grupo, desde, hasta) : null;
  const lista = (v: string, set: (s: string) => void) => <Dropdown size="small" value={v} selectedOptions={[v]} onOptionSelect={(_, d) => set(d.optionValue ?? v)} style={{ minWidth: 120 }}>{us.map((u) => <Option key={u} value={u}>{u}</Option>)}</Dropdown>;
  return (<>
    <Dropdown size="small" value={grupo} selectedOptions={[grupo]} onOptionSelect={(_, d) => { const g = d.optionValue ?? grupo; setGrupo(g); const u = Object.keys(UNIDADES[g]!); setDe(u[0]!); setA(u[1]!); }}>{Object.keys(UNIDADES).map((g) => <Option key={g} value={g}>{g}</Option>)}</Dropdown>
    <div className="campos-herr">{campo('v', 'Valor', 90)}{lista(desde, setDe)}<span>→</span>{lista(hasta, setA)}</div>
    <Res id="r-unidades">{fmt(n('v'), 4)} {desde} = <b>{r === null ? '—' : num(r, Math.abs(r) < 1 ? 6 : 4)} {hasta}</b></Res>
  </>);
}

function Montos() {
  const { n, campo } = useValores({ m: obtener().proyecto.partidas.length ? '' : '1250,50' });
  const m = n('m');
  const moneda = obtener().proyecto.moneda === 1 ? 'Dólares americanos' : 'Bolivianos';
  const imp = m !== null ? impuestosIncluidos(m) : null;
  return (<>
    <div className="campos-herr">{campo('m', 'Monto', 120)}</div>
    <Res id="r-literal">{m !== null ? montoALiteral(m, moneda) : 'Escriba un monto'}</Res>
    {imp && <Res>Impuestos incluidos en una factura: IVA 13 % <b>{num(imp.iva)}</b> · IT 3 % <b>{num(imp.it)}</b> · neto <b>{num(imp.neto)}</b></Res>}
  </>);
}

/** Panel lateral con cálculos de obra; los resultados se pueden llevar a la partida seleccionada. */
export function CajaHerramientas({ alCerrar }: { alCerrar: () => void }) {
  const partida = useEstado((e) => e.proyecto.partidas[e.seleccion]);
  return (
    <aside className="asistente caja-herramientas" aria-label="Caja de herramientas" data-testid="caja-herramientas">
      <div className="asistente-cab"><b>Caja de herramientas</b><Button size="small" appearance="subtle" onClick={alCerrar} aria-label="Cerrar caja de herramientas" data-testid="cerrar-herramientas">✕</Button></div>
      <p className="nota-ui">{partida ? <>Partida elegida: <b>{partida.descripcion}</b>. Los resultados se pueden usar como su cantidad o añadir a su cómputo.</> : 'Elija una partida en Inicio para llevarle los resultados.'}</p>
      <Accordion multiple collapsible defaultOpenItems={['areas']}>
        <AccordionItem value="areas"><AccordionHeader data-testid="h-sec-areas">Áreas y volúmenes</AccordionHeader><AccordionPanel><AreasVolumenes /></AccordionPanel></AccordionItem>
        <AccordionItem value="hormigon"><AccordionHeader data-testid="h-sec-hormigon">Hormigón y mortero (dosificación)</AccordionHeader><AccordionPanel><Hormigon /></AccordionPanel></AccordionItem>
        <AccordionItem value="ladrillos"><AccordionHeader data-testid="h-sec-ladrillos">Ladrillos y bloques por m²</AccordionHeader><AccordionPanel><Ladrillos /></AccordionPanel></AccordionItem>
        <AccordionItem value="fierro"><AccordionHeader data-testid="h-sec-fierro">Peso del fierro</AccordionHeader><AccordionPanel><Fierro /></AccordionPanel></AccordionItem>
        <AccordionItem value="madera"><AccordionHeader data-testid="h-sec-madera">Madera (pies tablares)</AccordionHeader><AccordionPanel><Madera /></AccordionPanel></AccordionItem>
        <AccordionItem value="tuberia"><AccordionHeader data-testid="h-sec-tuberia">Tuberías: pendiente y caudal</AccordionHeader><AccordionPanel><Tuberia /></AccordionPanel></AccordionItem>
        <AccordionItem value="unidades"><AccordionHeader data-testid="h-sec-unidades">Conversión de unidades</AccordionHeader><AccordionPanel><Unidades /></AccordionPanel></AccordionItem>
        <AccordionItem value="montos"><AccordionHeader data-testid="h-sec-montos">Monto en literal e impuestos</AccordionHeader><AccordionPanel><Montos /></AccordionPanel></AccordionItem>
      </Accordion>
    </aside>
  );
}
