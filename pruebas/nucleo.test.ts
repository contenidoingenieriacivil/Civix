import { describe, expect, it } from 'vitest';
import { calcularItem, evaluarPlantilla, ordenLogico, redondear, totalPresupuesto } from '../src/nucleo/calculo';
import { PLANTILLA_SABS, PLANTILLA_COMPLETA_MAS_IVA } from '../src/nucleo/plantillas';
import { enteroALetras, montoALiteral } from '../src/nucleo/literal';
import type { Insumo, Item } from '../src/nucleo/tipos';

const ins = (id: number, rubro: Insumo['rubro'], precio: number): Insumo =>
  ({ id, rubro, descripcion: `i${id}`, unidad: 'u', precio, cotizacion: null, grupo: 0 });

describe('cálculo del precio unitario (plantilla SABS)', () => {
  // Valores reales de "Instalación de faenas" del proyecto VIVIENDA SANCHEZ: PRESCOM da 100,87.
  it('reproduce el resultado de PRESCOM', () => {
    const v = evaluarPlantilla(PLANTILLA_SABS, { M: 5.1, O: 40.5, E: 0 });
    expect(v.F).toBeCloseTo(22.275, 6);
    expect(v.G).toBeCloseTo(72.1532, 3); // depende de O (IVA), que depende de E+F
    expect(redondear(v.Q!, 2)).toBe(100.87);
  });

  it('calcula un ítem desde sus insumos', () => {
    const m = new Map([[1, ins(1, 'M', 5)], [2, ins(2, 'M', 0.1)], [3, ins(3, 'O', 6)], [4, ins(4, 'O', 3)]]);
    const item: Item = {
      id: 155, descripcion: 'Instalación de faenas', unidad: 'm²', grupo: 0,
      materiales: [{ insumo: 1, rendimiento: 1 }, { insumo: 2, rendimiento: 1 }],
      manoObra: [{ insumo: 3, rendimiento: 4.5 }, { insumo: 4, rendimiento: 4.5 }], equipo: [],
    };
    expect(calcularItem(item, m, PLANTILLA_SABS).precioUnitario).toBe(100.87);
  });

  it('detecta referencias circulares', () => {
    const p = { nombre: 'x', parametros: [
      { letra: 'A', descripcion: '', porcentaje: null, formula: 'B', orden: 1, resaltar: false },
      { letra: 'B', descripcion: '', porcentaje: null, formula: 'A', orden: 2, resaltar: false }] };
    expect(() => evaluarPlantilla(p, { M: 0, O: 0, E: 0 })).toThrow(/circular/);
  });

  it('admite restas en la fórmula (IT sobre N-A)', () => {
    const v = evaluarPlantilla(PLANTILLA_COMPLETA_MAS_IVA, { M: 100, O: 0, E: 0 });
    expect(v.P).toBeCloseTo(0.03 * (v.N! - v.A!), 9); // IT sobre N-A
    expect(v.Q).toBeCloseTo(v.N! + v.O! + v.P!, 9);
  });

  it('redondea mitades hacia arriba', () => {
    expect(redondear(1.005, 2)).toBe(1.01);
    expect(redondear(2.675, 2)).toBe(2.68);
    expect(redondear(-1.005, 2)).toBe(-1.01);
  });

  it('suma el presupuesto sumando parciales redondeados', () => {
    expect(totalPresupuesto([{ cantidad: 3, precioUnitario: 0.335 }, { cantidad: 3, precioUnitario: 0.335 }])).toBe(2.02);
  });
});

describe('orden de lectura de las incidencias', () => {
  it('pone cada parámetro después de sus dependencias (SABS)', () => {
    expect(ordenLogico(PLANTILLA_SABS).filter((p) => p.formula && !'ABC'.includes(p.letra)).map((p) => p.letra).join('')).toBe('DEFOGHIJLMNPQ');
  });
});

describe('monto en literal', () => {
  it.each([
    [0, 'cero'], [1, 'uno'], [21, 'veintiuno'], [30, 'treinta'], [31, 'treinta y uno'], [100, 'cien'],
    [101, 'ciento uno'], [1000, 'mil'], [1001, 'mil uno'], [21000, 'veintiún mil'], [31000, 'treinta y un mil'],
    [1_000_000, 'un millón'], [2_500_000, 'dos millones quinientos mil'],
    [21_000_000, 'veintiún millones'], [2_000_000_000, 'dos mil millones'], [1_234_567, 'un millón doscientos treinta y cuatro mil quinientos sesenta y siete'],
  ])('%i → %s', (n, esperado) => expect(enteroALetras(n)).toBe(esperado));

  it('formatea como los formularios SABS', () => {
    expect(montoALiteral(1250.5)).toBe('Son: Mil doscientos cincuenta 50/100 Bolivianos');
    expect(montoALiteral(280_800.00)).toBe('Son: Doscientos ochenta mil ochocientos 00/100 Bolivianos');
  });
});

describe('decimales de cálculo (PRESCOM)', () => {
  // «Replanteo y trazado de una superficie» del documento Tolomosita Sud, impreso por PRESCOM con 2 decimales de cálculo:
  // D 2,42 · G 1,91 · I 5,32 · J 9,64 · N 11,67 · Q 12,03 (clavos 12,5 × 0,01 = 0,125 → 0,13; estuco 0,68 × 0,07 → 0,05)
  const m = new Map([[1, 8], [2, 12], [3, 12.5], [4, 0.68], [5, 19.5], [6, 14], [7, 20], [8, 0.87]].map(([id, p]) => [id!, ins(id!, id! <= 4 ? 'M' : id! <= 7 ? 'O' : 'E', p!)]));
  const item: Item = {
    id: 1, descripcion: 'Replanteo', unidad: 'm²', grupo: 0,
    materiales: [{ insumo: 1, rendimiento: 0.25 }, { insumo: 2, rendimiento: 0.02 }, { insumo: 3, rendimiento: 0.01 }, { insumo: 4, rendimiento: 0.07 }],
    manoObra: [{ insumo: 5, rendimiento: 0.02 }, { insumo: 6, rendimiento: 0.02 }, { insumo: 7, rendimiento: 0.02 }], equipo: [{ insumo: 8, rendimiento: 6 }],
  };
  it('redondea el costo de cada línea, no los parámetros', () => {
    const v = calcularItem(item, m, { ...PLANTILLA_SABS, decimalesCalculo: 2 }).valores;
    expect(v.D).toBeCloseTo(2.42, 9);
    expect(redondear(v.J!, 2)).toBe(9.64); // con D, G, I redondeados daría 9,65
    expect(redondear(v.N!, 2)).toBe(11.67);
    expect(redondear(v.Q!, 2)).toBe(12.03);
    expect(redondear(calcularItem(item, m, PLANTILLA_SABS).valores.Q!, 2)).toBe(12.02); // sin la opción
  });
});
