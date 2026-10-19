import { useSyncExternalStore } from 'react';
import type { BaseDatos, Proyecto } from '../datos/modelo';
import { nuevoProyecto } from '../nucleo/operaciones';
import { PLANTILLA_SABS } from '../nucleo/plantillas';
import { cargarBases, cargarProyectoActual, guardarBases, guardarProyectoActual } from './persistencia';

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
}

let estado: Estado = { proyecto: nuevoProyecto('Proyecto nuevo', PLANTILLA_SABS), bases: [], modulo: 1, deshacer: [], rehacer: [], aviso: '', seleccion: -1, reporte: 'B-1', asistente: false, pestana: 'inicio', importarTexto: null };
const oyentes = new Set<() => void>();
const emitir = () => oyentes.forEach((f) => f());
const poner = (e: Partial<Estado>) => { estado = { ...estado, ...e }; emitir(); };

export const obtener = () => estado;
export const useEstado = <T,>(sel: (e: Estado) => T): T => useSyncExternalStore((f) => (oyentes.add(f), () => oyentes.delete(f)), () => sel(estado));

let temporizador: ReturnType<typeof setTimeout> | undefined;
const autoguardar = () => { clearTimeout(temporizador); temporizador = setTimeout(() => void guardarProyectoActual(estado.proyecto), 400); };

/** Aplica un cambio al proyecto guardando el estado anterior para deshacer. */
export function cambiar(f: (p: Proyecto) => void, aviso = '') {
  const copia = structuredClone(estado.proyecto);
  f(copia);
  poner({ proyecto: copia, deshacer: [...estado.deshacer.slice(-49), estado.proyecto], rehacer: [], aviso });
  autoguardar();
}
export function reemplazarProyecto(p: Proyecto, aviso = '') {
  poner({ proyecto: p, modulo: 1, deshacer: [...estado.deshacer.slice(-49), estado.proyecto], rehacer: [], aviso });
  autoguardar();
}
export function deshacer() {
  const a = estado.deshacer.at(-1);
  if (a) { poner({ proyecto: a, deshacer: estado.deshacer.slice(0, -1), rehacer: [...estado.rehacer, estado.proyecto], aviso: 'Deshecho' }); autoguardar(); }
}
export function rehacer() {
  const a = estado.rehacer.at(-1);
  if (a) { poner({ proyecto: a, rehacer: estado.rehacer.slice(0, -1), deshacer: [...estado.deshacer, estado.proyecto], aviso: 'Rehecho' }); autoguardar(); }
}
export const irAModulo = (modulo: number) => poner({ modulo });
export const elegirPartida = (seleccion: number) => poner({ seleccion });
export const elegirReporte = (reporte: string) => poner({ reporte });
export const solicitarImportacion = (importarTexto: string | null) => poner({ importarTexto });
export const irAPestana = (pestana: string) => poner({ pestana });
export const alternarAsistente = () => poner({ asistente: !estado.asistente });
export const avisar = (aviso: string) => poner({ aviso });

export function ponerBases(bases: BaseDatos[]) { poner({ bases }); void guardarBases(bases); }
export function guardarBase(b: BaseDatos) {
  const i = estado.bases.findIndex((x) => x.nombre === b.nombre);
  ponerBases(i >= 0 ? estado.bases.map((x, k) => (k === i ? b : x)) : [...estado.bases, b]);
}

export async function iniciar() {
  const [bases, proyecto] = await Promise.all([cargarBases(), cargarProyectoActual()]);
  poner({ ...(bases ? { bases } : {}), ...(proyecto ? { proyecto } : {}) });
}
