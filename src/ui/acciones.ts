import type { BaseDatos, Proyecto } from '../datos/modelo';
import { leerBaseDatos } from '../datos/prescom/leerBd';
import { leerProyecto } from '../datos/prescom/leerProyecto';
import { importarPaquete } from '../ia/intercambio';
import { calcularProyecto } from '../nucleo/presupuesto';
import { nuevoProyecto } from '../nucleo/operaciones';
import { PLANTILLA_SABS } from '../nucleo/plantillas';
import { presupuestoAExcel } from '../reportes/excel';
import { htmlReporte } from '../reportes/indice';
import { avisar, guardarBase, irAPestana, obtener, ponerBases, reemplazarProyecto, solicitarImportacion } from './almacen';
import { descargar, elegirArchivos } from './persistencia';

const bytes = async (f: File) => new Uint8Array(await f.arrayBuffer());
const seguro = (n: string) => n.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'civix';

export function crearProyecto(d: { nombre: string; lugar?: string; cliente?: string; moneda?: number; plantilla?: Proyecto['plantilla'] }) {
  const p = nuevoProyecto(d.nombre.trim() || 'Proyecto nuevo', structuredClone(d.plantilla ?? PLANTILLA_SABS));
  p.lugar = d.lugar ?? ''; p.cliente = d.cliente ?? ''; p.moneda = d.moneda ?? 2;
  reemplazarProyecto(p, `Proyecto «${p.nombre}» creado`);
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

export function guardarProyecto() {
  const p = obtener().proyecto;
  descargar(`${seguro(p.nombre)}.civix`, JSON.stringify({ civix: 1, proyecto: p }, null, 1), 'application/json');
  avisar(`Guardado ${seguro(p.nombre)}.civix`);
}

export async function abrirProyecto() {
  const [f] = await elegirArchivos('.civix,.json');
  if (!f) return;
  try {
    const d = JSON.parse(await f.text()) as { civix?: number; proyecto?: Proyecto };
    if (d.civix !== 1 || !d.proyecto || !Array.isArray(d.proyecto.partidas)) throw new Error('no es un proyecto de Civix');
    reemplazarProyecto(d.proyecto, `Abierto ${f.name}`);
  } catch (e) {
    if (!aImportacion(await f.text(), f.name, 'un proyecto guardado de Civix')) avisar(`No se pudo abrir ${f.name}: ${e instanceof Error ? e.message : e}`);
  }
}

export async function abrirProyectoPrescom() {
  const [f] = await elegirArchivos('.ddp');
  if (!f) return;
  try { reemplazarProyecto(leerProyecto(await bytes(f)), `Importado ${f.name} de PRESCOM`); }
  catch (e) { avisar(`No se pudo importar ${f.name}: ${e instanceof Error ? e.message : e}`); }
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

export function exportarBase(b: BaseDatos) { descargar(`${seguro(b.nombre)}.civbd`, JSON.stringify({ civix: 1, base: b }), 'application/json'); }

export async function abrirBase() {
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

export function imprimirReporte() {
  const f = document.getElementById('vista-reporte') as HTMLIFrameElement | null;
  f?.contentWindow?.focus();
  f?.contentWindow?.print();
}

/** Guarda el reporte actual como PDF: directo en la app de escritorio; en el navegador, vía imprimir. */
export async function guardarReportePdf() {
  const { proyecto, reporte } = obtener();
  const guardar = (window as unknown as { civixPdf?: (h: string, n: string) => Promise<{ ok: boolean; ruta?: string }> }).civixPdf;
  if (!guardar) return imprimirReporte();
  const r = await guardar(htmlReporte(reporte, proyecto), `${seguro(proyecto.nombre)}-${reporte}`);
  if (r.ok) avisar(`PDF guardado: ${r.ruta ?? ''}`);
}

export function descargarReporteHtml() {
  const { proyecto, reporte } = obtener();
  descargar(`${seguro(proyecto.nombre)}-${reporte}.html`, htmlReporte(reporte, proyecto), 'text/html');
}

export async function exportarExcel() {
  const { proyecto } = obtener();
  descargar(`${seguro(proyecto.nombre)}.xlsx`, (await presupuestoAExcel(calcularProyecto(proyecto))) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  avisar('Excel generado');
}
