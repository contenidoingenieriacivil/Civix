import { useSyncExternalStore } from 'react';
import type { BaseDatos, Proyecto } from '../datos/modelo';
import { nuevoProyecto } from '../nucleo/operaciones';
import { PLANTILLA_SABS } from '../nucleo/plantillas';
import { cargarBases, cargarUltimoTrabajo, guardarBases, guardarUltimoTrabajo, nativo } from './persistencia';

export interface Estado {
  proyecto: Proyecto;
  bases: BaseDatos[];
  /** Posición (base 1) del módulo que se está viendo. */
  modulo: number;
  deshacer: Proyecto[];
  rehacer: Proyecto[];
  aviso: string;
  /** Posición de la partida seleccionada en proyecto.partidas (-1 = ninguna). */
  seleccion: number;
  reporte: string;
  asistente: boolean;
  pestana: string;
  /** Texto JSON que debe analizarse en «Importar de IA» (p. ej. un archivo abierto por el botón equivocado). */
  importarTexto: string | null;
  /** Nombre de la base de datos elegida en la pestaña «Base de datos». */
  baseSel: string;
  /** Cuadro de diálogo abierto sobre la partida seleccionada (o sobre el módulo actual). */
  dialogo: Dialogo | null;
  /** Archivo .civix del proyecto (null = aún no se guardó) y si hay cambios sin guardar. */
  archivo: Archivo;
  /** Pregunta con varios botones esperando respuesta (p. ej. guardar antes de abrir otro proyecto). */
  pregunta: { texto: string; botones: string[]; responder: (k: number) => void } | null;
  /** Reportes: todo el proyecto, solo el módulo actual o solo la partida seleccionada; y lista para imprimir varios juntos. */
  alcance: 'todo' | 'modulo' | 'partida';
  lote: string[] | null;
}

export interface Archivo { ruta: string | null; modificado: boolean }

export type Dialogo = { tipo: 'apu' | 'computo' | 'especificacion' | 'guardar-en-base' | 'mover-modulo' | 'cambiar-item'; pos: number } | { tipo: 'nueva-partida' | 'buscar' | 'calculadora' | 'sincronizar' | 'unir-modulo' } | { tipo: 'reemplazar-insumo'; id: number };

let estado: Estado = { proyecto: nuevoProyecto('Proyecto nuevo', PLANTILLA_SABS), bases: [], modulo: 1, deshacer: [], rehacer: [], aviso: '', seleccion: -1, reporte: 'B-1', asistente: false, pestana: 'inicio', importarTexto: null, baseSel: '', dialogo: null, archivo: { ruta: null, modificado: false }, pregunta: null, alcance: 'todo', lote: null };
const oyentes = new Set<() => void>();
const emitir = () => oyentes.forEach((f) => f());
const poner = (e: Partial<Estado>) => { estado = { ...estado, ...e }; emitir(); };

export const obtener = () => estado;
export const useEstado = <T,>(sel: (e: Estado) => T): T => useSyncExternalStore((f) => (oyentes.add(f), () => oyentes.delete(f)), () => sel(estado));

let temporizador: ReturnType<typeof setTimeout> | undefined;
let pendiente = false;
const autoguardar = () => { pendiente = true; clearTimeout(temporizador); temporizador = setTimeout(() => void volcar(), 300); };
/** Escribe ya la recuperación automática (también lo pide el programa de escritorio antes de cerrar la ventana). */
export async function volcar() {
  clearTimeout(temporizador);
  if (!pendiente) return;
  pendiente = false;
  await guardarUltimoTrabajo({ proyecto: estado.proyecto, archivo: estado.archivo });
}
/** Avisa al programa de escritorio si hay cambios sin guardar (para preguntar al cerrar la ventana). */
function marcar(archivo: Archivo) { nativo()?.ponerModificado(archivo.modificado, estado.proyecto.nombre); return archivo; }
export function ponerArchivo(a: Partial<Archivo>) { poner({ archivo: marcar({ ...estado.archivo, ...a }) }); autoguardar(); }

let ultimo = { clave: '', t: 0 };
/**
 * Aplica un cambio al proyecto guardando el estado anterior para deshacer. Con `clave`, los cambios seguidos
 * del mismo campo (p. ej. escribir letra por letra) se deshacen de una sola vez.
 */
export function cambiar(f: (p: Proyecto) => void, aviso = '', clave = '') {
  const copia = structuredClone(estado.proyecto);
  f(copia);
  const ahora = Date.now();
  const unir = !!clave && clave === ultimo.clave && ahora - ultimo.t < 2000 && estado.deshacer.length > 0;
  ultimo = { clave, t: ahora };
  poner({ proyecto: copia, deshacer: unir ? estado.deshacer : [...estado.deshacer.slice(-49), estado.proyecto], rehacer: [], aviso, archivo: estado.archivo.modificado ? estado.archivo : marcar({ ...estado.archivo, modificado: true }) });
  autoguardar();
}
/**
 * Pone otro proyecto en pantalla. `archivo` indica de dónde viene: { ruta, modificado: false } al abrir un .civix,
 * { ruta: null } para uno nuevo o importado; sin él (p. ej. órdenes del asistente) sigue siendo el mismo documento, con cambios.
 */
export function reemplazarProyecto(p: Proyecto, aviso = '', archivo?: Partial<Archivo>) {
  const a: Archivo = archivo ? { ruta: archivo.ruta ?? null, modificado: archivo.modificado ?? true } : { ...estado.archivo, modificado: true };
  poner({ proyecto: p, modulo: 1, seleccion: -1, deshacer: archivo ? [] : [...estado.deshacer.slice(-49), estado.proyecto], rehacer: [], aviso, archivo: marcar(a) });
  autoguardar();
}
export function deshacer() {
  const a = estado.deshacer.at(-1);
  if (a) { poner({ proyecto: a, deshacer: estado.deshacer.slice(0, -1), rehacer: [...estado.rehacer, estado.proyecto], aviso: 'Deshecho', archivo: marcar({ ...estado.archivo, modificado: true }) }); autoguardar(); }
}
export function rehacer() {
  const a = estado.rehacer.at(-1);
  if (a) { poner({ proyecto: a, rehacer: estado.rehacer.slice(0, -1), deshacer: [...estado.deshacer, estado.proyecto], aviso: 'Rehecho', archivo: marcar({ ...estado.archivo, modificado: true }) }); autoguardar(); }
}
export const irAModulo = (modulo: number) => poner({ modulo });
/** Muestra el módulo de la partida y la selecciona. */
export const irAPartida = (pos: number) => { const x = estado.proyecto.partidas[pos]; if (x) poner({ modulo: x.modulo, seleccion: pos, pestana: 'inicio' }); };
export const elegirBase = (baseSel: string) => poner({ baseSel });
export const abrirDialogo = (dialogo: Dialogo | null) => poner({ dialogo });
/** Base elegida en pantalla (o la primera). */
export const baseActual = (e: Estado = estado) => e.bases.find((b) => b.nombre === e.baseSel) ?? e.bases[0];
export const elegirPartida = (seleccion: number) => poner({ seleccion });
export const elegirReporte = (reporte: string) => poner({ reporte, lote: null });
export const ponerAlcance = (alcance: Estado['alcance']) => poner({ alcance });
export const ponerLote = (lote: string[] | null) => poner({ lote });
/** HTML del reporte (o lote) que se ve en pantalla, con el alcance elegido. */
export function opcionesReporte(e: Estado = estado) {
  return e.alcance === 'modulo' ? { modulo: e.modulo } : e.alcance === 'partida' && e.proyecto.partidas[e.seleccion] ? { partida: e.seleccion } : {};
}
export const solicitarImportacion = (importarTexto: string | null) => poner({ importarTexto });
export const irAPestana = (pestana: string) => poner({ pestana });
export const alternarAsistente = () => poner({ asistente: !estado.asistente });
export const avisar = (aviso: string) => poner({ aviso });
/** Muestra una pregunta y devuelve el número del botón elegido (el último botón = cancelar si se cierra el cuadro). */
export const preguntar = (texto: string, botones: string[]) => new Promise<number>((r) => poner({ pregunta: { texto, botones, responder: (k) => { poner({ pregunta: null }); r(k); } } }));

export function ponerBases(bases: BaseDatos[]) { poner({ bases }); void guardarBases(bases); }
export function quitarBase(nombre: string) { ponerBases(estado.bases.filter((b) => b.nombre !== nombre)); poner({ baseSel: '' }); }
export function guardarBase(b: BaseDatos) {
  const i = estado.bases.findIndex((x) => x.nombre === b.nombre);
  ponerBases(i >= 0 ? estado.bases.map((x, k) => (k === i ? b : x)) : [...estado.bases, b]);
}

export async function iniciar() {
  nativo()?.alVolcar(volcar);
  const [bases, { proyecto, archivo }] = await Promise.all([cargarBases(), cargarUltimoTrabajo()]);
  poner({ ...(bases ? { bases } : {}), ...(proyecto ? { proyecto } : {}), ...(proyecto && archivo ? { archivo: marcar(archivo) } : {}),
    ...(proyecto && (proyecto.partidas.length || archivo?.ruta) ? { aviso: `Se recuperó su último trabajo: «${proyecto.nombre}»${archivo?.modificado ? ' (con cambios sin guardar)' : ''}` } : {}) });
}
