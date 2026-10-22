import { Button, Checkbox, Textarea } from '@fluentui/react-components';
import { useEffect, useState } from 'react';
import { importarPaquete, INSTRUCCIONES_IA } from '../../ia/intercambio';
import { aplicarActualizacion, exportarInsumosParaIA, INSTRUCCIONES_PRECIOS, planificarActualizacion, type InformeActualizacion } from '../../ia/precios';
import { importarProyecto, INSTRUCCIONES_PROYECTO } from '../../ia/proyecto';
import type { Proyecto } from '../../datos/modelo';
import { num } from '../../reportes/formato';
import { avisar, baseActual, cambiar, guardarBase, obtener, reemplazarProyecto } from '../almacen';
import { elegirArchivos, escribirPortapapeles } from '../persistencia';
import { puedeDescartar } from '../acciones';

type Analisis =
  | { tipo: 'error'; mensajes: string[] }
  | { tipo: 'datos'; mensajes: string[] }
  | { tipo: 'proyecto'; mensajes: string[]; proyecto: Proyecto }
  | { tipo: 'precios'; mensajes: string[]; informe: InformeActualizacion };

const quitarCercos = (t: string) => t.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

/** Detecta qué trajo la IA (datos, proyecto o precios) y prepara la vista previa; solo «datos» se guarda de inmediato. */
export function analizarJson(texto: string): Analisis {
  let d: { tipo?: string; insumos?: unknown; items?: unknown } | null;
  try { d = JSON.parse(quitarCercos(texto)); } catch (e) { return { tipo: 'error', mensajes: [`El texto no es un JSON válido: ${e instanceof Error ? e.message : e}`] }; }
  const { proyecto, bases } = obtener();
  if (d?.tipo === 'proyecto') {
    const r = importarProyecto(d, bases);
    if (!r.proyecto) return { tipo: 'error', mensajes: r.informe.errores };
    return { tipo: 'proyecto', proyecto: r.proyecto, mensajes: [`Proyecto «${r.proyecto.nombre}»: ${r.informe.partidas} partidas en ${r.proyecto.modulos.length} módulos (${r.informe.conAnalisis} con análisis de precios, ${r.informe.precioDirecto} con precio directo).`, ...r.informe.advertencias] };
  }
  if (d?.tipo === 'precios') {
    const inf = planificarActualizacion(proyecto, d);
    if (inf.errores.length) return { tipo: 'error', mensajes: inf.errores };
    return { tipo: 'precios', informe: inf, mensajes: [] };
  }
  if (d && (d.insumos || d.items)) {
    if (!Array.isArray(d.insumos) && !Array.isArray(d.items)) return { tipo: 'error', mensajes: ['«insumos» e «items» deben ser listas.'] };
    if (!((d.insumos as unknown[] | undefined)?.length) && !((d.items as unknown[] | undefined)?.length)) return { tipo: 'error', mensajes: ['El paquete está vacío: no trae insumos ni ítems.'] };
    const base = baseActual() ?? { nombre: 'Mi base de datos', moneda: 2, grupos: [], insumos: [], items: [] };
    const { base: nueva, informe } = importarPaquete(d, base);
    if (informe.errores.length) return { tipo: 'error', mensajes: informe.errores };
    guardarBase(nueva);
    return { tipo: 'datos', mensajes: [`Importado en «${nueva.nombre}»: ${informe.insumosNuevos} insumos nuevos, ${informe.insumosActualizados} actualizados, ${informe.itemsNuevos} ítems nuevos, ${informe.itemsReemplazados} reemplazados.`, ...informe.advertencias] };
  }
  return { tipo: 'error', mensajes: ['No reconozco el contenido: debe ser un paquete de datos (insumos/ítems), un proyecto («tipo»: «proyecto») o una lista de precios («tipo»: «precios»).'] };
}

export function ImportarIA({ alCerrar, textoInicial = '' }: { alCerrar: () => void; textoInicial?: string }) {
  const [texto, setTexto] = useState(textoInicial);
  const [res, setRes] = useState<Analisis | null>(null);
  const [marcas, setMarcas] = useState<Record<number, boolean>>({});
  const copiar = (t: string, msg: string) => { void escribirPortapapeles(t); avisar(msg); };

  const analizar = (t: string = texto) => {
    const a = analizarJson(t);
    setRes(a);
    if (a.tipo === 'precios') setMarcas(Object.fromEntries(a.informe.cambios.map((c, k) => [k, c.aceptar])));
  };
  useEffect(() => { if (textoInicial) analizar(textoInicial); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const elegirArchivo = async () => {
    const [f] = await elegirArchivos('.json,.civix,.civbd,.txt');
    if (!f) return;
    const t = await f.text();
    setTexto(t);
    analizar(t);
  };
  const aplicarPrecios = () => {
    if (res?.tipo !== 'precios') return;
    const inf = { ...res.informe, cambios: res.informe.cambios.map((c, k) => ({ ...c, aceptar: !!marcas[k] })) };
    let n = 0;
    cambiar((p) => { n = aplicarActualizacion(p, inf); }, 'Precios actualizados');
    avisar(`${n} precio(s) actualizado(s)`);
    alCerrar();
  };

  return (
    <div className="modal-fondo" onKeyDown={(e) => { if (e.key === 'Escape') alCerrar(); }}><div className="modal" role="dialog" aria-label="Importar datos" style={{ width: 'min(900px, 96vw)' }}>
      <h3>Importar datos (archivo JSON de Civix)</h3>
      <p className="nota-ui">Elija el archivo o pegue su contenido. Civix detecta si son <b>datos</b> (insumos/ítems), un <b>proyecto</b> o una lista de <b>precios</b>, lo valida completo y le muestra qué cambiaría antes de guardar.</p>
      <div className="acciones">
        <Button size="small" appearance="primary" onClick={() => void elegirArchivo()} data-testid="elegir-archivo-ia">Elegir archivo .json…</Button>
        <Button size="small" onClick={() => copiar(INSTRUCCIONES_IA, 'Instrucciones de datos copiadas')} data-testid="copiar-instr-datos">Instrucciones: datos</Button>
        <Button size="small" onClick={() => copiar(INSTRUCCIONES_PROYECTO, 'Instrucciones de proyecto copiadas')} data-testid="copiar-instr-proyecto">Instrucciones: proyecto</Button>
        <Button size="small" onClick={() => copiar(INSTRUCCIONES_PRECIOS, 'Instrucciones de precios copiadas')} data-testid="copiar-instr-precios">Instrucciones: actualizar precios</Button>
        <Button size="small" appearance="primary" onClick={() => copiar(JSON.stringify(exportarInsumosParaIA(obtener().proyecto), null, 1), 'Lista de insumos del proyecto copiada')} data-testid="copiar-insumos">Copiar la lista de insumos de mi proyecto</Button>
      </div>
      <Textarea value={texto} onChange={(_, d) => setTexto(d.value)} rows={9} style={{ width: '100%', fontFamily: 'Consolas, monospace' }} data-testid="json-ia" />
      {res && res.tipo !== 'precios' && <ul className={res.tipo === 'error' ? 'errores' : 'ok'} data-testid="resultado-importacion">{res.mensajes.slice(0, 14).map((m, k) => <li key={k}>{m}</li>)}</ul>}
      {res?.tipo === 'proyecto' && <div className="acciones"><Button appearance="primary" data-testid="abrir-proyecto-ia" onClick={async () => { if (!(await puedeDescartar())) return; reemplazarProyecto(res.proyecto, `Proyecto «${res.proyecto.nombre}» importado: guárdelo con Ctrl+S`, { ruta: null }); alCerrar(); }}>Abrir como proyecto nuevo (reemplaza el actual)</Button></div>}
      {res?.tipo === 'precios' && (() => {
        const inf = res.informe, activos = Object.values(marcas).filter(Boolean).length;
        return (
          <div data-testid="resultado-importacion">
            <p className="ok"><b>{inf.cambios.length}</b> insumos cambiarían · {inf.sinCambio} ya tienen ese precio · {inf.sinCoincidencia.length} líneas sin coincidencia · {inf.sinPrecioNuevo.length} insumos sin precio nuevo (se conservan){inf.invalidos.length ? ` · ${inf.invalidos.length} líneas no válidas` : ''}</p>
            <div className="tabla-contenedor" style={{ maxHeight: 260 }}><table className="grilla" data-testid="tabla-cambios"><thead><tr><th style={{ width: 36 }}></th><th>Insumo</th><th className="n" style={{ width: 90 }}>Actual</th><th className="n" style={{ width: 90 }}>Nuevo</th><th className="n" style={{ width: 70 }}>Var.</th><th style={{ width: 90 }}>Coincide</th></tr></thead><tbody>
              {inf.cambios.map((c, k) => (
                <tr key={k}><td><Checkbox checked={!!marcas[k]} onChange={(_, d) => setMarcas({ ...marcas, [k]: !!d.checked })} aria-label={`Aplicar ${c.insumo.descripcion}`} /></td>
                  <td title={`En la lista: ${c.origen}`}>{c.insumo.descripcion}</td><td className="n">{num(c.anterior, 3)}</td><td className="n">{num(c.nuevo, 3)}</td>
                  <td className="n" style={{ color: Math.abs(c.variacion) > 30 ? '#b91c1c' : undefined }}>{c.variacion >= 0 ? '+' : ''}{num(c.variacion, 1)} %</td>
                  <td>{c.coincidencia === 'exacta' ? 'exacta' : 'aproximada ⚠'}</td></tr>))}
            </tbody></table></div>
            {inf.sinCoincidencia.length > 0 && <details><summary>Líneas de la lista sin insumo en el proyecto ({inf.sinCoincidencia.length})</summary><ul className="errores">{inf.sinCoincidencia.slice(0, 30).map((m, k) => <li key={k}>{m}</li>)}</ul></details>}
            <div className="acciones"><Button appearance="primary" disabled={!activos} onClick={aplicarPrecios} data-testid="aplicar-precios">Aplicar {activos} cambio(s)</Button></div>
          </div>
        );
      })()}
      <div className="acciones"><Button appearance={res ? 'secondary' : 'primary'} onClick={() => analizar()} data-testid="importar-json">Importar</Button><Button onClick={alCerrar} data-testid="cerrar-pegar">Cerrar</Button></div>
    </div></div>
  );
}
