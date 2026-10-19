import type { DatosEquipo } from '../nucleo/equipos';
import type { ConfigCronograma } from '../nucleo/cronograma';
import type { Insumo, Item, Plantilla } from '../nucleo/tipos';

export interface Grupo {
  tipo: 'I' | 'M' | 'O' | 'E';
  descripcion: string;
}

/** Base de datos de precios (insumos + ítems con su APU). */
export interface BaseDatos {
  nombre: string;
  /** Índice de la moneda (1 = $US, 2 = Bs, …) como en monedas.cfg de PRESCOM. */
  moneda: number;
  /** Los grupos se referencian por su posición (base 1) en esta lista. */
  grupos: Grupo[];
  insumos: Insumo[];
  items: Item[];
  /** Avisos de la importación (datos inconsistentes en el origen). */
  advertencias?: string[];
}

export interface Modulo {
  nombre: string;
  inicio: string | null;
  fin: string | null;
  /** Módulo (posición, base 1) tras cuyo fin empieza este; por defecto, el módulo anterior de la lista. */
  despuesDe?: number;
  /** Con `despuesDe`: posición (base 1) de la actividad de ese módulo tras cuyo fin empieza este, en vez de su fin. */
  despuesDeActividad?: number;
}

export interface LineaComputo {
  descripcion: string;
  veces?: number;
  largo?: number;
  ancho?: number;
  alto?: number;
  /** Cantidad directa de la línea cuando no resulta de las dimensiones (p. ej. parcial copiado de un cómputo externo). */
  cantidad?: number;
}

export interface Partida {
  /** Posición (base 1) en la lista de módulos. */
  modulo: number;
  numero: number;
  descripcion: string;
  unidad: string;
  cantidad: number;
  grupo: number;
  item: Item;
  /** Cómputo métrico: la cantidad es la suma de sus líneas (veces × largo × ancho × alto, según lo informado). */
  computo?: LineaComputo[];
  /** Plazo en días laborables fijado a mano; sustituye al calculado con la mano de obra (útil con precio directo). */
  duracion?: number;
  /** Personas/equipos de trabajo simultáneos (acorta el plazo). Por defecto 1. */
  cuadrilla?: number;
  /** Posición (en su módulo) de la actividad previa; 0 = independiente; sin definir = la anterior. */
  predecesor?: number;
  /** El archivo de origen no incluye el detalle (APU) de la partida: solo su precio. */
  sinDetalle?: boolean;
  /** Valores calculados por PRESCOM, solo cuando el proyecto se importó de él. */
  referenciaPrescom?: { precioUnitario: number; materiales: number; manoObra: number; equipo: number; inicio: string | null; fin: string | null };
}

export interface Proyecto {
  nombre: string;
  lugar: string;
  cliente: string;
  fecha: string | null;
  moneda: number;
  cambioDolar: number;
  memo: string;
  responsable: string;
  plantilla: Plantilla;
  grupos: Grupo[];
  modulos: Modulo[];
  insumos: Insumo[];
  partidas: Partida[];
  /** Datos para el costo horario (formulario B-4), por id de insumo de equipo. */
  equipos?: Record<number, DatosEquipo>;
  cronograma?: ConfigCronograma;
}
