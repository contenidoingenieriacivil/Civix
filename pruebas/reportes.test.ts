import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calcularProyecto, desgloseInsumos, resumenPorRubro } from '../src/nucleo/presupuesto';
import { costoHorarioEquipo } from '../src/nucleo/equipos';
import { leerProyecto } from '../src/datos/prescom/leerProyecto';
import { formularioB1, formularioB2, formularioB3, formularioB4, totalEquipo } from '../src/reportes/formularios';
import { num } from '../src/reportes/formato';

describe('formato numérico boliviano', () => {
  it.each([[1234.5, '1.234,50'], [0, '0,00'], [-1234567.891, '-1.234.567,89'], [999.999, '1.000,00']])('%s → %s', (x, s) => expect(num(x)).toBe(s));
});

describe('formulario A-8', () => {
  it('dibuja una barra por actividad con la ruta crítica', async () => {
    const { formularioA8 } = await import('../src/reportes/cronograma');
    const { nuevoProyecto } = await import('../src/nucleo/operaciones');
    const { PLANTILLA_SABS } = await import('../src/nucleo/plantillas');
    const p = nuevoProyecto('Cronograma', PLANTILLA_SABS);
    p.fecha = '2024-03-04';
    const item = { id: 1, descripcion: 'x', unidad: 'm²', grupo: 0, materiales: [], equipo: [], manoObra: [{ insumo: 1, rendimiento: 0.8 }] };
    p.partidas = [{ modulo: 1, numero: 1, descripcion: 'Excavación', unidad: 'm³', grupo: 0, cantidad: 80, item },
      { modulo: 1, numero: 2, descripcion: 'Cimientos', unidad: 'm³', grupo: 0, cantidad: 40, item }];
    const html = formularioA8(p);
    expect(html).toContain('FORMULARIO A-8');
    expect(html.match(/class="a8-barra( critica)?"/g)).toHaveLength(2);
    expect(html).toContain('critica');
    expect(html).toContain('04/03/2024');
    expect(html).toContain('landscape');
  });
});

describe('costo horario de equipo (B-4)', () => {
  it('suma los componentes', () => {
    const e = costoHorarioEquipo({
      descripcion: 'Mezcladora', potencia: 9, valorComercial: 20000, valorLlantas: 0, valorPiezasEspeciales: 0,
      vidaUtilHoras: 8000, vidaUtilLlantasHoras: 0, vidaUtilPiezasHoras: 0, factorRescate: 20, tasaInteresAnual: 10,
      primaSeguroAnual: 2, horasPorAnio: 2000, coeficienteMantenimiento: 80, consumoCombustible: 2, precioCombustible: 3.72,
      consumoLubricante: 0.05, precioLubricante: 20, costoHorarioOperador: 10, factorSeguroSocialOperador: 55,
    });
    expect(e.basico).toBeCloseTo(2 + 0.72, 6); // dep 16000/8000=2 ; interés (20000+4000)/2*12%/2000
    expect(e.mantenimiento).toBeCloseTo(1.6, 6);
    expect(e.combustibles).toBeCloseTo(7.44 + 1, 6);
    expect(e.otros).toBeCloseTo(15.5, 6);
    expect(totalEquipo(e)).toBeCloseTo(e.basico + 1.6 + 8.44 + 15.5, 6);
  });
});

const RAIZ = process.env.CIVIX_PRESCOM_DIR;
const hay = !!RAIZ && existsSync(join(RAIZ, 'proyectos'));
(hay ? describe : describe.skip)('formularios con el proyecto VIVIENDA SANCHEZ', () => {
  const c = () => calcularProyecto(leerProyecto(readFileSync(join(RAIZ!, 'proyectos', 'VIVIENDA SANCHEZ.DDP'))));
  it('B-1 incluye todas las partidas, el total y el monto en literal', () => {
    const calc = c();
    const html = formularioB1(calc);
    expect(html).toContain('FORMULARIO B-1');
    expect(html).toContain('Instalacion de faenas');
    expect(html).toContain(num(calc.total));
    expect(html).toMatch(/Son: .* \d\d\/100 Bolivianos/);
    expect((html.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(82);
  });
  it('B-2 tiene una hoja por partida con el PU adoptado', () => {
    const calc = c();
    const html = formularioB2(calc);
    expect((html.match(/FORMULARIO B-2/g) ?? []).length).toBe(82);
    expect(html).toContain('TOTAL PRECIO UNITARIO ADOPTADO');
    expect(html).toContain(num(calc.modulos[0]!.partidas[0]!.precioUnitario));
  });
  it('B-3 lista cada insumo usado una sola vez y B-3 coincide con los precios del B-2', () => {
    const calc = c();
    const des = desgloseInsumos(calc);
    const ids = [...des.M, ...des.O, ...des.E].map((f) => f.insumo.id);
    expect(new Set(ids).size).toBe(ids.length);
    const html = formularioB3(calc);
    for (const f of [...des.M, ...des.O, ...des.E]) expect(html).toContain(num(f.insumo.precio, 3));
  });
  it('B-4 y resumen por rubro', () => {
    const calc = c();
    expect(formularioB4(calc, [])).toContain('FORMULARIO B-4');
    const r = resumenPorRubro(calc);
    expect(r.reduce((a, x) => a + x.porcentaje, 0)).toBeCloseTo(100, 6);
  });
});

describe('formato de números', () => {
  it('redondea como el cálculo (11,315 → 11,32) y no muestra «-0,00»', async () => {
    const { num } = await import('../src/reportes/formato');
    expect(num(11.315)).toBe('11,32');
    expect(num(1234567.891)).toBe('1.234.567,89');
    expect(num(-0.001)).toBe('0,00');
    expect(num(-2.5, 1)).toBe('-2,5');
  });
});
