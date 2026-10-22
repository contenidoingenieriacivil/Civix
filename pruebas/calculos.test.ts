import { describe, expect, it } from 'vitest';
import { areaCirculo, areaTrapecio, convertir, dosificacion, impuestosIncluidos, ladrillosPorM2, manningLleno, pendiente, volumenCilindro, volumenZanja } from '../src/nucleo/calculos';

describe('caja de herramientas', () => {
  it('áreas y volúmenes', () => {
    expect(areaTrapecio(2, 4, 3)).toBe(9);
    expect(areaCirculo(2)).toBeCloseTo(Math.PI, 10);
    expect(volumenCilindro(1.2, 2)).toBeCloseTo(2.26195, 4);
    expect(volumenZanja(100, 0.7, 1.5)).toBeCloseTo(105, 10); // paredes verticales
    expect(volumenZanja(10, 0.6, 2, 0.5)).toBeCloseTo(32, 10); // ancho medio 1,6 m
  });
  it('dosificación de hormigón 1:2:3 (método volumétrico, factor 1,55)', () => {
    const d = dosificacion(1, 1, 2, 3);
    expect(d.cementoKg).toBeCloseTo(372, 0); // 1,55/6 × 1.440
    expect(d.bolsas).toBeCloseTo(7.44, 2);
    expect(d.arena).toBeCloseTo(0.517, 3);
    expect(d.grava).toBeCloseTo(0.775, 3);
    expect(d.agua).toBe(186);
    expect(dosificacion(1, 1, 4, 0).arena).toBeCloseTo(1.064, 3); // mortero 1:4, factor 1,33
    expect(() => dosificacion(1, 0, 2, 3)).toThrow();
  });
  it('ladrillos por m², pendiente, Manning, conversiones e impuestos', () => {
    expect(ladrillosPorM2(24, 11.5, 1.5, 12).piezas).toBeCloseTo(30.17, 2); // 1/(0,255 × 0,13)
    expect(pendiente(1903.56, 1901.07, 78)).toBe(3.192);
    const m = manningLleno(150, 1, 0.009);
    expect(m.velocidad).toBeCloseTo(1.245, 3); // (1/0,009)·0,0375^(2/3)·0,1
    expect(m.caudal).toBeCloseTo(22.0, 1);
    expect(convertir(1, 'Longitud', 'pulgada', 'mm')).toBeCloseTo(25.4, 10);
    expect(convertir(3, 'Presión', 'MPa', 'kg/cm²')).toBeCloseTo(30.59, 2);
    expect(impuestosIncluidos(1000)).toEqual({ iva: 130, it: 30, neto: 840 });
  });
});
