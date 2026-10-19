import type { Plantilla } from './tipos';

type Def = [letra: string, desc: string, pct: number | null, formula: string, orden: number, resaltar?: boolean];

const crear = (nombre: string, defs: Def[]): Plantilla => ({
  nombre,
  parametros: defs.map(([letra, descripcion, porcentaje, formula, orden, resaltar]) => ({
    letra, descripcion, porcentaje, formula, orden, resaltar: resaltar ?? false,
  })),
});

/**
 * Normas Básicas del SABS (DS 181). IVA 13 % = 14,94 % (13/87) sobre mano de obra
 * más cargas sociales; IT 3 % = 3,09 % (3/97) sobre el parcial.
 */
export const PLANTILLA_SABS: Plantilla = crear('Normas básicas del SABS', [
  ['A', 'MATERIALES', null, '*', 1],
  ['B', 'MANO DE OBRA', null, '*', 4, true],
  ['C', 'EQUIPO, MAQUINARIA Y HERRAMIENTAS', null, '*', 2],
  ['D', 'TOTAL MATERIALES', null, 'A', 5, true],
  ['E', 'SUBTOTAL MANO DE OBRA', null, 'B', 6],
  ['F', 'CARGAS SOCIALES', 55, 'E', 15],
  ['G', 'TOTAL MANO DE OBRA', null, 'E+F+O', 7, true],
  ['H', 'HERRAMIENTAS', 5, 'G', 3],
  ['I', 'TOTAL EQUIPO, MAQUINARIA Y HERRAMIENTAS', null, 'C+H', 8],
  ['J', 'SUB TOTAL', null, 'D+G+I', 9, true],
  ['K', '', null, '', 10],
  ['L', 'GASTOS GENERALES Y ADMINISTRATIVOS', 10, 'J', 12],
  ['M', 'UTILIDAD', 10, 'J+L', 13],
  ['N', 'PARCIAL', null, 'J+L+M', 14, true],
  ['O', 'IMPUESTOS IVA', 14.94, 'E+F', 16],
  ['P', 'IMPUESTOS IT', 3.09, 'N', 11],
  ['Q', 'TOTAL PRECIO UNITARIO', null, 'N+P', 17, true],
]);

export const PLANTILLA_COMPLETA_MAS_IVA: Plantilla = crear('Formato completo más IVA', [
  ['A', 'MATERIAL', null, '*', 1], ['B', 'OBRERO', null, '*', 4, true], ['C', 'EQUIPO', null, '*', 2],
  ['D', 'TOTAL MATERIALES', null, 'A', 5], ['E', 'Mano de obra indirecta', 5, 'B', 6],
  ['F', 'Beneficios Sociales', 55, 'B', 7, true], ['G', 'TOTAL MANO DE OBRA', null, 'B+E+F', 3],
  ['H', 'Herramientas menores', 6, 'B', 8], ['I', 'TOTAL HERRAMIENTAS Y EQUIPO', null, 'C+H', 9, true],
  ['J', 'SUB TOTAL', null, 'D+G+I', 10, true], ['K', '', null, '', 11],
  ['L', 'Gastos Generales', 10, 'J', 12], ['M', 'Utilidad', 10, 'J', 13],
  ['N', 'PARCIAL', null, 'J+L+M', 14, true], ['O', 'IVA', 13, 'N', 15], ['P', 'IT', 3, 'N-A', 16],
  ['Q', 'TOTAL ITEM', null, 'N+O+P', 17, true],
]);

export const PLANTILLA_COMPLETA_SIN_IVA: Plantilla = crear('Formato completo SIN IVA', [
  ['A', 'MATERIAL', null, '*', 1], ['B', 'OBRERO', null, '*', 4, true], ['C', 'EQUIPO', null, '*', 2],
  ['D', 'TOTAL MATERIALES', null, 'A', 5], ['E', 'Mano de obra indirecta', 5, 'B', 6],
  ['F', 'Beneficios Sociales', 55, 'B', 7, true], ['G', 'TOTAL MANO DE OBRA', null, 'B+E+F', 3],
  ['H', 'Herramientas menores', 6, 'B', 8], ['I', 'TOTAL HERRAMIENTAS Y EQUIPO', null, 'C+H', 9, true],
  ['J', 'SUB TOTAL', null, 'D+G+I', 10, true], ['K', '', null, '', 11],
  ['L', 'Gastos Generales', 10, 'J', 12], ['M', 'Utilidad', 10, 'J', 13],
  ['N', 'PARCIAL', null, 'J+L+M', 14, true], ['O', '', null, '', 15], ['P', '', null, '', 16],
  ['Q', 'TOTAL ITEM', null, 'N', 17, true],
]);

export const PLANTILLAS_PREDEFINIDAS: Plantilla[] = [
  PLANTILLA_SABS,
  PLANTILLA_COMPLETA_MAS_IVA,
  PLANTILLA_COMPLETA_SIN_IVA,
];
