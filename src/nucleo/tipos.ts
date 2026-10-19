/** Rubros de un ítem (APU): materiales, mano de obra y equipo. */
export type Rubro = 'M' | 'O' | 'E';

/** Un insumo de la base de datos (material, mano de obra o equipo). */
export interface Insumo {
  id: number;
  rubro: Rubro;
  descripcion: string;
  unidad: string;
  precio: number;
  /** Fecha de cotización (ISO yyyy-mm-dd) o null. */
  cotizacion: string | null;
  grupo: number;
  /** Costo no productivo: figura en el ítem pero no suma al costo. */
  noProductivo?: boolean;
}

/** Línea de un ítem: un insumo con su rendimiento (cantidad por unidad de ítem). */
export interface Linea {
  insumo: number;
  rendimiento: number;
}

export interface Item {
  id: number;
  descripcion: string;
  unidad: string;
  grupo: number;
  /** Máximo 30 materiales, 10 mano de obra y 20 equipos (como PRESCOM 2013). */
  materiales: Linea[];
  manoObra: Linea[];
  equipo: Linea[];
  apuntes?: string;
}

/**
 * Parámetro de la plantilla de cálculo (A…Q).
 * - formula "*" en A/B/C: suma del rubro.
 * - Con porcentaje: valor = pct/100 × evaluar(formula).
 * - Sin porcentaje: valor = evaluar(formula).
 */
export interface Parametro {
  letra: string;
  descripcion: string;
  porcentaje: number | null;
  formula: string;
  orden: number;
  resaltar: boolean;
}

export interface Plantilla {
  nombre: string;
  parametros: Parametro[];
}

export type ValoresParametros = Record<string, number>;

export interface ResultadoApu {
  /** Valor de cada parámetro (A…Q), sin redondear. */
  valores: ValoresParametros;
  /** Total del ítem (parámetro Q) redondeado a los decimales indicados. */
  precioUnitario: number;
}
