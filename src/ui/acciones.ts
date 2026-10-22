import type { BaseDatos, Proyecto } from '../datos/modelo';
import { leerBaseDatos } from '../datos/prescom/leerBd';
import { leerProyecto } from '../datos/prescom/leerProyecto';
import { importarPaquete } from '../ia/intercambio';
import { calcularProyecto } from '../nucleo/presupuesto';
import { nuevoProyecto } from '../nucleo/operaciones';
import { PLANTILLA_SABS } from '../nucleo/plantillas';
import { presupuestoAExcel } from '../reportes/excel';
import { htmlLote, htmlReporte } from '../reportes/indice';
import { opcionesReporte, avisar, elegirBase, guardarBase, irAPestana, obtener, ponerArchivo, ponerBases, preguntar, reemplazarProyecto, solicitarImportacion } from './almacen';
import { VERSION } from './version';
import { descargar, elegirArchivos, guardarArchivo, nativo } from './persistencia';

const bytes = async (f: File) => new Uint8Array(await f.arrayBuffer());
const seguro = (n: string) => n.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'civix';

export function crearProyecto(d: { nombre: string; lugar?: string; cliente?: string; moneda?: number; plantilla?: Proyecto['plantilla'] }) {
  const p = nuevoProyecto(d.nombre.trim() || 'Proyecto nuevo', structuredClone(d.plantilla ?? PLANTILLA_SABS));
  p.lugar = d.lugar ?? ''; p.cliente = d.cliente ?? ''; p.moneda = d.moneda ?? 2;
  reemplazarProyecto(p, `Proyecto «${p.nombre}» creado: use Guardar (Ctrl+S) para elegir dónde guardarlo`, { ruta: null, modificado: false });
  irAPestana('inicio');
}

/** Si el archivo no es del tipo que pedía el botón pero es un JSON de Civix (datos, proyecto o precios), lo encamina a «Importar de IA». */
function aImportacion(texto: string, nombre: string, esperado: string): boolean {
  try {
    const d = JSON.parse(texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as { civix?: number; tipo?: string; insumos?: unknown; items?: unknown };
    if (d?.civix === 1 && (d.tipo || d.insumos || d.items)) { solicitarImportacion(texto); avisar(`${nombre} no es ${esperado}; se abrió «Importar de IA» para revisarlo`); return true; }
  } catch { /* no es JSON */ }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Archivo de proyecto «.civix»: JSON con { civix: 1, formato: "proyecto", version, guardado, proyecto }.

export function serializarProyecto(p: Proyecto): string {
  return JSON.stringify({ civix: 1, formato: 'proyecto', version: VERSION, guardado: new Date().toISOString(), proyecto: p }, null, 1);
}

/** Lee un .civix (también los guardados por versiones anteriores) y completa lo que falte. */
export function leerArchivoProyecto(texto: string): Proyecto {
  let d: { civix?: number; proyecto?: Partial<Proyecto> };
  try { d = JSON.parse(texto.replace(/^\uFEFF/, '')); } catch { throw new Error('el archivo está dañado o no es un proyecto de Civix (no es JSON válido)'); }
  const p = d?.proyecto;
  if (d?.civix !== 1 || !p || !Array.isArray(p.partidas) || !Array.isArray(p.modulos)) throw new Error('no es un proyecto de Civix');
  const base = nuevoProyecto(String(p.nombre ?? 'Proyecto'), structuredClone(PLANTILLA_SABS));
  const r = { ...base, ...p } as Proyecto;
  if (!r.plantilla?.parametros?.length) r.plantilla = structuredClone(PLANTILLA_SABS);
  if (!Array.isArray(r.insumos)) r.insumos = [];
  if (!r.modulos.length) r.modulos = base.modulos;
  return r;
}

const nombreArchivo = (ruta: string | null) => (ruta ? ruta.split(/[\\/]/).pop()! : '');

/** Guarda el proyecto en su archivo (o pregunta dónde, la primera vez o con «Guardar como»). Devuelve si se guardó. */
export async function guardarProyecto(como = false): Promise<boolean> {
  const { proyecto: p, archivo } = obtener();
  const n = nativo();
  try {
    if (n) {
      const r = await n.guardar({ contenido: serializarProyecto(p), ruta: archivo.ruta, comoNuevo: como || !archivo.ruta, nombre: archivo.ruta && !como ? nombreArchivo(archivo.ruta) : `${seguro(p.nombre)}.civix`, tipo: 'proyecto', titulo: como ? 'Guardar proyecto como' : 'Guardar proyecto' });
      if (!r.ok || !r.ruta) { avisar('No se guardó (cancelado)'); return false; }
      ponerArchivo({ ruta: r.ruta, modificado: false });
      avisar(`Proyecto guardado en ${r.ruta}`);
      return true;
    }
    descargar(`${seguro(p.nombre)}.civix`, serializarProyecto(p), 'application/json');
    ponerArchivo({ modificado: false });
    avisar(`Descargado ${seguro(p.nombre)}.civix`);
    return true;
  } catch (e) { avisar(`No se pudo guardar: ${e instanceof Error ? e.message : e}`); return false; }
}

/** Antes de reemplazar el proyecto en pantalla: si tiene cambios sin guardar, pregunta. Devuelve si se puede seguir. */
export async function puedeDescartar(): Promise<boolean> {
  const { archivo, proyecto } = obtener();
  if (!archivo.modificado || (!proyecto.partidas.length && !archivo.ruta)) return true;
  const r = await preguntar(`El proyecto «${proyecto.nombre}» tiene cambios sin guardar. ¿Qué desea hacer?`, ['Guardar', 'No guardar', 'Cancelar']);
  if (r === 0) return guardarProyecto();
  return r === 1;
}

export async function nuevoProyectoConfirmado(d: Parameters<typeof crearProyecto>[0]) {
  if (await puedeDescartar()) crearProyecto(d);
}

/** Abre un archivo (diálogo de Windows o del navegador) y lo encamina según su tipo: proyecto, base, PRESCOM o JSON de IA. */
export async function abrirProyecto(ruta?: string) {
  const n = nativo();
  if (n) {
    const r = ruta ? await n.leer(ruta) : await n.abrir({ tipo: 'abrir', titulo: 'Abrir proyecto o base de datos' });
    if (!r.ok) { if (r.error) avisar(`No se pudo abrir: ${r.error}`); return; }
    await abrirContenido(r.ruta ?? '', r.texto, r.bytes);
    return;
  }
  const [f] = await elegirArchivos('.civix,.civbd,.json,.ddp');
  if (!f) return;
  await abrirContenido(f.name, /\.ddp$/i.test(f.name) ? undefined : await f.text(), /\.ddp$/i.test(f.name) ? await bytes(f) : undefined, true);
}

async function abrirContenido(ruta: string, texto?: string, datos?: Uint8Array, sinRuta = false) {
  const nombre = nombreArchivo(ruta) || ruta;
  try {
    if (/\.ddp$/i.test(ruta) && datos) {
      if (!(await puedeDescartar())) return;
      reemplazarProyecto(leerProyecto(datos), `Importado ${nombre} de PRESCOM (guárdelo como proyecto de Civix)`, { ruta: null });
      irAPestana('inicio');
      return;
    }
    const t = texto ?? '';
    const d = JSON.parse(t.replace(/^\uFEFF/, '')) as { civix?: number; proyecto?: unknown; base?: BaseDatos };
    if (d?.civix === 1 && d.base && Array.isArray(d.base.items)) { guardarBase(d.base); elegirBase(d.base.nombre); avisar(`Base «${d.base.nombre}» abierta (${d.base.items.length} ítems)`); irAPestana('base'); return; }
    if (d?.civix === 1 && d.proyecto) {
      const p = leerArchivoProyecto(t);
      if (!(await puedeDescartar())) return;
      reemplazarProyecto(p, `Abierto ${nombre}`, { ruta: sinRuta ? null : ruta, modificado: sinRuta });
      irAPestana('inicio');
      return;
    }
    if (!aImportacion(t, nombre, 'un proyecto guardado de Civix')) avisar(`No se pudo abrir ${nombre}: no es un proyecto ni una base de Civix`);
  } catch (e) {
    if (!aImportacion(texto ?? '', nombre, 'un proyecto guardado de Civix')) avisar(`No se pudo abrir ${nombre}: ${e instanceof Error ? e.message : e}`);
  }
}

export async function abrirProyectoPrescom() {
  const n = nativo();
  if (n) {
    const r = await n.abrir({ tipo: 'abrir', titulo: 'Abrir proyecto de PRESCOM (.DDP)', binario: true });
    if (r.ok && r.bytes) await abrirContenido(r.ruta && /\.ddp$/i.test(r.ruta) ? r.ruta : `${r.ruta}.ddp`, undefined, r.bytes);
    return;
  }
  const [f] = await elegirArchivos('.ddp');
  if (!f) return;
  await abrirContenido(f.name.toLowerCase().endsWith('.ddp') ? f.name : `${f.name}.ddp`, undefined, await bytes(f));
}

/** Importa bases de PRESCOM desde una carpeta (agrupa .nbd/.DAT/.GRP/.CFG por nombre). */
export async function importarBasesPrescom() {
  const fs = await elegirArchivos('', true, true);
  if (!fs.length) return;
  const grupos = new Map<string, Map<string, File>>();
  for (const f of fs) {
    const m = /^(.*)\.(nbd|dat|grp|cfg)$/i.exec(f.name);
    if (!m) continue;
    if (!grupos.has(m[1]!)) grupos.set(m[1]!, new Map());
    grupos.get(m[1]!)!.set(m[2]!.toLowerCase(), f);
  }
  const nuevas: BaseDatos[] = [];
  const problemas: string[] = [];
  for (const [nombre, a] of grupos) {
    if (!a.has('nbd') || !a.has('dat')) continue;
    try {
      nuevas.push(leerBaseDatos({ nombre, nbd: await bytes(a.get('nbd')!), dat: await bytes(a.get('dat')!), grp: a.has('grp') ? await bytes(a.get('grp')!) : undefined, cfg: a.has('cfg') ? await bytes(a.get('cfg')!) : undefined }));
    } catch (e) { problemas.push(`${nombre}: ${e instanceof Error ? e.message : e}`); }
  }
  const resto = obtener().bases.filter((b) => !nuevas.some((n) => n.nombre === b.nombre));
  ponerBases([...resto, ...nuevas]);
  avisar(`${nuevas.length} base(s) importada(s) de PRESCOM${problemas.length ? ` · con problemas: ${problemas.join('; ')}` : ''}`);
}

export async function exportarBase(b: BaseDatos) {
  const r = await guardarArchivo(`${seguro(b.nombre)}.civbd`, JSON.stringify({ civix: 1, formato: 'base', version: VERSION, base: b }), 'base', 'application/json');
  if (r) avisar(`Base guardada: ${r}`);
}

export async function abrirBase() {
  const n = nativo();
  if (n) { const r = await n.abrir({ tipo: 'base', titulo: 'Abrir base de datos (.civbd)' }); if (r.ok) await abrirContenido(r.ruta ?? '', r.texto); return; }
  const [f] = await elegirArchivos('.civbd,.json');
  if (!f) return;
  try {
    const d = JSON.parse(await f.text()) as { civix?: number; base?: BaseDatos };
    if (d.civix !== 1 || !d.base || !Array.isArray(d.base.items)) throw new Error('no es una base de datos de Civix');
    guardarBase(d.base); avisar(`Base "${d.base.nombre}" abierta`);
  } catch (e) {
    if (!aImportacion(await f.text(), f.name, 'una base de datos guardada de Civix')) avisar(`No se pudo abrir ${f.name}: ${e instanceof Error ? e.message : e}`);
  }
}

/** Importa texto JSON (de una IA) a la base indicada; si no hay base, crea "Mi base de datos". */
export function importarJson(texto: string, nombreBase?: string): { ok: boolean; mensajes: string[] } {
  let datos: unknown;
  try {
    const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    datos = JSON.parse(limpio);
  } catch (e) { return { ok: false, mensajes: [`El texto no es un JSON válido: ${e instanceof Error ? e.message : e}`] }; }
  const actual = obtener().bases.find((b) => b.nombre === nombreBase) ?? { nombre: 'Mi base de datos', moneda: 2, grupos: [], insumos: [], items: [] };
  const { base, informe } = importarPaquete(datos, actual);
  if (informe.errores.length) return { ok: false, mensajes: informe.errores };
  guardarBase(base);
  return { ok: true, mensajes: [`Importado en "${base.nombre}": ${informe.insumosNuevos} insumos nuevos, ${informe.insumosActualizados} actualizados, ${informe.itemsNuevos} ítems nuevos, ${informe.itemsReemplazados} reemplazados.`, ...informe.advertencias] };
}

export async function imprimirReporte() {
  const n = nativo();
  if (n) { const r = await n.imprimir(htmlActual()); avisar(r.ok ? 'Reporte enviado a la impresora' : 'Impresión cancelada'); return; }
  const f = document.getElementById('vista-reporte') as HTMLIFrameElement | null;
  f?.contentWindow?.focus();
  f?.contentWindow?.print();
}

/** Guarda el reporte actual como PDF: directo en la app de escritorio; en el navegador, vía imprimir. */
export async function guardarReportePdf() {
  const { proyecto, reporte, lote } = obtener();
  const guardar = (window as unknown as { civixPdf?: (h: string, n: string) => Promise<{ ok: boolean; ruta?: string }> }).civixPdf;
  if (!guardar) { avisar('En el navegador: elija «Guardar como PDF» en la ventana de impresión'); return imprimirReporte(); }
  const r = await guardar(htmlActual(), `${seguro(proyecto.nombre)}-${lote ? 'reportes' : reporte}`);
  avisar(r.ok ? `PDF guardado: ${r.ruta ?? ''}` : 'No se guardó el PDF (cancelado)');
}

export async function descargarReporteHtml() {
  const { proyecto, reporte, lote } = obtener();
  const r = await guardarArchivo(`${seguro(proyecto.nombre)}-${lote ? 'reportes' : reporte}.html`, htmlActual(), 'html', 'text/html');
  if (r) avisar(`Reporte guardado: ${r} (se abre con el navegador o Word)`);
}

export async function exportarExcel() {
  const { proyecto } = obtener();
  const datos = await presupuestoAExcel(calcularProyecto(proyecto));
  const r = await guardarArchivo(`${seguro(proyecto.nombre)}.xlsx`, datos, 'excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (r) avisar(`Excel guardado: ${r}`);
}

/** El reporte que se ve en pantalla (uno o varios a la vez), con el alcance elegido. */
export function htmlActual(): string {
  const e = obtener();
  return e.lote?.length ? htmlLote(e.lote, e.proyecto, opcionesReporte(e)) : htmlReporte(e.reporte, e.proyecto, opcionesReporte(e));
}
