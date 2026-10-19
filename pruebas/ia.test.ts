import { describe, expect, it } from 'vitest';
import type { BaseDatos } from '../src/datos/modelo';
import { aNumero, importarPaquete } from '../src/ia/intercambio';
import { ejecutarOrdenes, interpretarFrase } from '../src/ia/ordenes';
import { calcularProyecto } from '../src/nucleo/presupuesto';
import { agregarItemDeBase, nuevoProyecto } from '../src/nucleo/operaciones';
import { PLANTILLA_SABS } from '../src/nucleo/plantillas';

const vacia = (): BaseDatos => ({ nombre: 'demo', moneda: 2, grupos: [], insumos: [], items: [] });
const paquete = {
  civix: 1,
  insumos: [
    { descripcion: 'Cemento portland IP-30', unidad: 'bolsa', rubro: 'material', precio: '62,50' },
    { descripcion: 'Arena fina', unidad: 'm3', rubro: 'material', precio: 120 },
    { descripcion: 'Albañil', unidad: 'hr', rubro: 'mano_de_obra', precio: '1.250,50'.replace('1.250,50', '12,5') },
    { descripcion: 'Mezcladora', unidad: 'hr', rubro: 'equipo', precio: 30 },
  ],
  items: [{ descripcion: 'Hormigón simple', unidad: 'm3', grupo: 'Hormigones',
    insumos: [{ descripcion: 'Cemento portland IP-30', rendimiento: 7.5 }, { descripcion: 'Arena fina', rendimiento: '0,5' },
      { descripcion: 'Albañil', rendimiento: 6 }, { descripcion: 'Mezcladora', rendimiento: 0.5 }] }],
};

describe('conversión de números escritos por una IA', () => {
  it.each([['62,50', 62.5], ['1.234,56', 1234.56], ['1,234.56', 1234.56], ['Bs 12', 12], ['12.5', 12.5], ['0,5', 0.5], ['abc', null], ['', null]])('%s', (e, s) => expect(aNumero(e)).toBe(s));
});

describe('importación de paquetes (IA → Civix)', () => {
  it('importa, normaliza unidades y crea grupos', () => {
    const { base, informe } = importarPaquete(paquete, vacia());
    expect(informe.errores).toEqual([]);
    expect(informe).toMatchObject({ insumosNuevos: 4, itemsNuevos: 1 });
    expect(base.insumos.find((i) => i.descripcion === 'Arena fina')!.unidad).toBe('m³');
    expect(base.items[0]!.materiales).toHaveLength(2);
    expect(base.items[0]!.manoObra[0]!.rendimiento).toBe(6);
    expect(base.grupos[0]!.descripcion).toBe('HORMIGONES');
  });
  it('es todo o nada y explica cada error', () => {
    const malo = { civix: 1, insumos: [{ descripcion: 'X', unidad: 'u', rubro: 'cosa', precio: 1 }, { descripcion: 'Y', unidad: 'u', rubro: 'material', precio: 'gratis' }],
      items: [{ descripcion: 'Z', unidad: 'm', insumos: [{ descripcion: 'No existe', rendimiento: 1 }] }] };
    const b = vacia();
    const { base, informe } = importarPaquete(malo, b);
    expect(informe.errores).toHaveLength(3);
    expect(informe.errores.join('\n')).toMatch(/rubro no válido/);
    expect(base).toBe(b);
  });
  it('reimportar actualiza precios sin duplicar', () => {
    const una = importarPaquete(paquete, vacia()).base;
    const { base, informe } = importarPaquete({ ...paquete, insumos: [{ descripcion: 'cemento portland ip-30', unidad: 'bolsa', rubro: 'material', precio: 70 }], items: [] }, una);
    expect(base.insumos).toHaveLength(4);
    expect(informe.insumosActualizados).toBe(1);
    expect(informe.advertencias[0]).toMatch(/62.5 a 70/);
  });
  it('rechaza lo que no es un paquete', () => expect(importarPaquete({ hola: 1 }, vacia()).informe.errores[0]).toMatch(/no es un paquete/));
});

describe('órdenes', () => {
  const escenario = () => {
    const base = importarPaquete(paquete, vacia()).base;
    const p = nuevoProyecto('Prueba', PLANTILLA_SABS);
    agregarItemDeBase(p, base, base.items[0]!.id, 1, 10);
    return { base, p };
  };

  it('el precio unitario del ítem copiado es el de la base', () => {
    const { p } = escenario();
    const c = calcularProyecto(p);
    expect(c.modulos[0]!.partidas[0]!.precioUnitario).toBeGreaterThan(0);
    expect(c.total).toBe(c.modulos[0]!.partidas[0]!.parcial);
  });

  it('ajusta precios, cambia un parámetro y muestra el efecto en el total sin tocar el original', () => {
    const { p } = escenario();
    const antes = calcularProyecto(p).total;
    const r = ejecutarOrdenes(p, [
      { accion: 'ajustar_precios', porcentaje: 10, texto: 'cemento' },
      { accion: 'configurar_parametro', parametro: 'cargas sociales', porcentaje: 71.18 },
    ]);
    expect(r.errores).toEqual([]);
    expect(calcularProyecto(r.proyecto).total).toBeGreaterThan(antes);
    expect(calcularProyecto(p).total).toBe(antes); // el original no cambia hasta confirmar
    expect(r.registro.join(' ')).toMatch(/Total del presupuesto/);
  });

  it('agrega y elimina partidas y módulos', () => {
    const { base, p } = escenario();
    const r = ejecutarOrdenes(p, [
      { accion: 'crear_modulo', nombre: 'obra fina' },
      { accion: 'agregar_partida', item: 'hormigon simple', cantidad: 5, modulo: 'obra fina' },
      { accion: 'fijar_cantidad', partida: '1.1', cantidad: 99 },
      { accion: 'eliminar_partida', partida: '2.1' },
    ], [base]);
    expect(r.errores).toEqual([]);
    expect(r.proyecto.modulos.map((m) => m.nombre)).toEqual(['MÓDULO 1', 'OBRA FINA']);
    expect(r.proyecto.partidas).toHaveLength(1);
    expect(r.proyecto.partidas[0]!.cantidad).toBe(99);
  });

  it('informa los errores sin detener las demás órdenes', () => {
    const { p } = escenario();
    const r = ejecutarOrdenes(p, [
      { accion: 'fijar_precio', insumo: 'inexistente', precio: 1 },
      { accion: 'elegir_plantilla', nombre: 'completo mas iva' },
      { accion: 'configurar_parametro', parametro: 'zzz', porcentaje: 1 },
    ]);
    expect(r.errores).toHaveLength(2);
    expect(r.proyecto.plantilla.nombre).toBe('Formato completo más IVA');
  });

  it('ajusta cuadrilla y calendario del cronograma', () => {
    const { p } = escenario();
    const r = ejecutarOrdenes(p, [{ accion: 'fijar_cuadrilla', partida: '1.1', cuadrilla: 3 }, { accion: 'configurar_cronograma', horasDia: 10, diasLaborables: 5 }, { accion: 'configurar_cronograma', horasDia: 30 }]);
    expect(r.proyecto.partidas[0]!.cuadrilla).toBe(3);
    expect(r.proyecto.cronograma).toMatchObject({ horasDia: 10, diasLaborables: 5 });
    expect(r.errores).toHaveLength(1);
  });

  it('interpreta frases en español sin IA', () => {
    expect(interpretarFrase('Sube 5% el cemento')).toEqual({ accion: 'ajustar_precios', porcentaje: 5, texto: 'cemento' });
    expect(interpretarFrase('baja 10 % los precios de mano de obra')).toEqual({ accion: 'ajustar_precios', porcentaje: -10, rubro: 'mano de obra' });
    expect(interpretarFrase('cambia las cargas sociales a 71,18%')).toEqual({ accion: 'configurar_parametro', parametro: 'cargas sociales', porcentaje: 71.18 });
    expect(interpretarFrase('agrega 120 m2 de revoque interior al módulo obra fina')).toEqual({ accion: 'agregar_partida', item: 'revoque interior', cantidad: 120, modulo: 'obra fina' });
    expect(interpretarFrase('muestra el A-8')).toEqual({ accion: 'generar_reporte', reporte: 'A-8' });
    expect(interpretarFrase('genera el B2')).toEqual({ accion: 'generar_reporte', reporte: 'B-2' });
    expect(interpretarFrase('hola qué tal')).toBeNull();
  });
});
