import { describe, expect, it } from 'vitest';
import { aplicarActualizacion, planificarActualizacion, similitud } from '../src/ia/precios';
import { importarPaquete } from '../src/ia/intercambio';
import { agregarItemDeBase, nuevoProyecto } from '../src/nucleo/operaciones';
import { PLANTILLA_SABS } from '../src/nucleo/plantillas';
import { calcularProyecto } from '../src/nucleo/presupuesto';
import type { BaseDatos } from '../src/datos/modelo';

const base = importarPaquete({
  civix: 1,
  insumos: [
    { descripcion: 'Cemento portland IP-30 (bolsa 50 kg)', unidad: 'bolsa', rubro: 'material', precio: 62.5 },
    { descripcion: 'Tubería PVC ø 1/2"', unidad: 'm', rubro: 'material', precio: 8 },
    { descripcion: 'Tubería PVC ø 3/4"', unidad: 'm', rubro: 'material', precio: 12 },
    { descripcion: 'Albañil', unidad: 'hr', rubro: 'mano_de_obra', precio: 12.5 },
    { descripcion: 'Mezcladora', unidad: 'hr', rubro: 'equipo', precio: 30 },
  ],
  items: [{ descripcion: 'Instalación', unidad: 'm', insumos: [
    { descripcion: 'Cemento portland IP-30 (bolsa 50 kg)', rendimiento: 0.1 }, { descripcion: 'Tubería PVC ø 1/2"', rendimiento: 1 },
    { descripcion: 'Tubería PVC ø 3/4"', rendimiento: 0.5 }, { descripcion: 'Albañil', rendimiento: 0.8 }, { descripcion: 'Mezcladora', rendimiento: 0.1 }] }],
}, { nombre: 'b', moneda: 2, grupos: [], insumos: [], items: [] } as BaseDatos).base;
const proyecto = () => { const p = nuevoProyecto('t', PLANTILLA_SABS); agregarItemDeBase(p, base, base.items[0]!.id, 1, 100); return p; };
const lista = (precios: unknown[], extra: object = {}) => ({ civix: 1, tipo: 'precios', precios, ...extra });

describe('similitud de descripciones', () => {
  it('distingue medidas distintas', () => {
    expect(similitud('Tubería PVC ø 1/2"', 'Tuberia PVC diam 3/4')).toBeLessThan(0.6);
    expect(similitud('Cemento portland IP-30 (bolsa 50 kg)', 'CEMENTO PORTLAND IP-30 BOLSA 50KG')).toBeGreaterThan(0.75);
  });
});

describe('actualización de precios con lista de una IA', () => {
  it('encuentra coincidencias exactas aunque cambien mayúsculas y acentos', () => {
    const inf = planificarActualizacion(proyecto(), lista([{ descripcion: 'ALBAÑIL', unidad: 'hr', precio: '14,00' }, { descripcion: 'tuberia pvc ø 1/2"', precio: 9 }]));
    expect(inf.cambios.map((c) => [c.insumo.descripcion, c.nuevo, c.coincidencia, c.aceptar])).toEqual([['Albañil', 14, 'exacta', true], ['Tubería PVC ø 1/2"', 9, 'exacta', true]]);
    expect(inf.cambios[0]!.variacion).toBeCloseTo(12, 6);
  });

  it('las aproximadas llegan sin marcar y las de otra medida no coinciden', () => {
    const inf = planificarActualizacion(proyecto(), lista([{ descripcion: 'Cemento Portland IP-30 bolsa 50 kg Soboce', precio: 70 }, { descripcion: 'Tubería PVC ø 1"', precio: 20 }]));
    expect(inf.cambios).toHaveLength(1);
    expect(inf.cambios[0]).toMatchObject({ coincidencia: 'aproximada', aceptar: false });
    expect(inf.sinCoincidencia).toHaveLength(1);
  });

  it('convierte de dólares con el tipo de cambio del proyecto', () => {
    const inf = planificarActualizacion(proyecto(), lista([{ descripcion: 'Mezcladora', precio: 5 }], { moneda: 'USD' }));
    expect(inf.cambios[0]!.nuevo).toBeCloseTo(5 * 6.96, 6);
  });

  it('informa sin cambio, inválidos y los insumos sin precio nuevo', () => {
    const inf = planificarActualizacion(proyecto(), lista([{ descripcion: 'Albañil', precio: 12.5 }, { descripcion: 'X', precio: 'gratis' }, { descripcion: 'Mezcladora', precio: 35 }]));
    expect(inf.sinCambio).toBe(1);
    expect(inf.invalidos).toHaveLength(1);
    expect(inf.sinPrecioNuevo.map((i) => i.descripcion)).toContain('Cemento portland IP-30 (bolsa 50 kg)');
  });

  it('aplica solo lo confirmado, actualiza la fecha y cambia el total del presupuesto', () => {
    const p = proyecto();
    const antes = calcularProyecto(p).total;
    const inf = planificarActualizacion(p, lista([{ descripcion: 'Albañil', precio: 20 }, { descripcion: 'Cemento Portland IP-30 bolsa 50 kg Soboce', precio: 100 }], { fecha: '2025-10-15' }));
    expect(aplicarActualizacion(p, inf)).toBe(1); // la aproximada no estaba confirmada
    expect(p.insumos.find((i) => i.descripcion === 'Albañil')).toMatchObject({ precio: 20, cotizacion: '2025-10-15' });
    expect(p.insumos.find((i) => i.descripcion.startsWith('Cemento'))!.precio).toBe(62.5);
    expect(calcularProyecto(p).total).toBeGreaterThan(antes);
  });

  it('rechaza archivos que no son una lista de precios', () => {
    expect(planificarActualizacion(proyecto(), { civix: 1, insumos: [] }).errores[0]).toMatch(/no es una lista de precios/);
  });
});
