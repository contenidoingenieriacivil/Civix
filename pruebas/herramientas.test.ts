import { describe, expect, it } from 'vitest';
import type { BaseDatos, Proyecto } from '../src/datos/modelo';
import { calcularItem } from '../src/nucleo/calculo';
import { copiarPartidas, duplicarModulo, eliminarInsumosSinUso, exportarMsProject, flujoInversiones, igualarPrecioUnitario, kgPorMetro, partidasDesdeTabla, pegarPartidas, pesoFierro, piesTablares, reemplazarInsumo, reemplazarItemDePartida, requerimientoMensual, sincronizarPreciosConBase, unirModulos } from '../src/nucleo/herramientas';
import { agregarLineaApu, nuevaPartidaDirecta, nuevoInsumo, nuevoProyecto } from '../src/nucleo/operaciones';
import { PLANTILLA_SABS } from '../src/nucleo/plantillas';
import { calcularProyecto } from '../src/nucleo/presupuesto';

function proyecto(): Proyecto {
  const p = nuevoProyecto('t', PLANTILLA_SABS);
  p.fecha = '2026-01-05';
  p.modulos = [{ nombre: 'A', inicio: null, fin: null }, { nombre: 'B', inicio: null, fin: null }];
  const muro = nuevaPartidaDirecta(p, 1, { descripcion: 'Muro', unidad: 'm2', cantidad: 10, precio: 0 });
  delete p.partidas[muro]!.item.precioFijo;
  const lad = nuevoInsumo(p, { descripcion: 'Ladrillo', unidad: 'pza', rubro: 'M', precio: 1 });
  const alb = nuevoInsumo(p, { descripcion: 'Albañil', unidad: 'hr', rubro: 'O', precio: 20 });
  agregarLineaApu(p, muro, lad, 40); agregarLineaApu(p, muro, alb, 2);
  nuevaPartidaDirecta(p, 2, { descripcion: 'Letrero', unidad: 'pza', cantidad: 1, precio: 500 });
  return p;
}
const mapa = (p: Proyecto) => new Map(p.insumos.map((i) => [i.id, i]));

describe('herramientas de PRESCOM', () => {
  it('igualar precio unitario: todo el análisis o solo mano de obra y equipo', () => {
    const p = proyecto();
    const item = p.partidas[0]!.item;
    for (const solo of [false, true]) {
      const { item: nuevo } = igualarPrecioUnitario(item, mapa(p), p.plantilla, 150, solo);
      expect(calcularItem(nuevo, mapa(p), p.plantilla).precioUnitario).toBeCloseTo(150, 2);
      if (solo) expect(nuevo.materiales[0]!.rendimiento).toBe(40);
    }
    expect(() => igualarPrecioUnitario(item, mapa(p), p.plantilla, 10, true)).toThrow(/materiales/);
  });
  it('reemplazar un insumo en todo el proyecto, borrar los sin uso y tomar precios de una base', () => {
    const p = proyecto();
    const otro = nuevoInsumo(p, { descripcion: 'Ladrillo 6 huecos', unidad: 'pza', rubro: 'M', precio: 1.5 });
    expect(reemplazarInsumo(p, p.insumos[0]!.id, otro)).toBe(1);
    expect(p.insumos.map((i) => i.descripcion)).toEqual(['Albañil', 'Ladrillo 6 huecos']);
    expect(() => reemplazarInsumo(p, otro, p.insumos[0]!.id)).toThrow(/rubro/);
    nuevoInsumo(p, { descripcion: 'Suelto', unidad: 'u', rubro: 'E', precio: 1 });
    expect(eliminarInsumosSinUso(p)).toBe(1);
    const base: BaseDatos = { nombre: 'b', moneda: 2, grupos: [], items: [], insumos: [{ id: 1, rubro: 'O', descripcion: 'ALBAÑIL', unidad: 'hr', precio: 25, cotizacion: '2026-01-01', grupo: 0 }] };
    expect(sincronizarPreciosConBase(p, base)).toEqual({ actualizados: 1, sinCoincidencia: ['Ladrillo 6 huecos'] });
  });
  it('copiar y pegar partidas entre módulos, con sus insumos', () => {
    const p = proyecto();
    const c = copiarPartidas(p, [0]);
    const pos = pegarPartidas(p, c, 2);
    expect(p.partidas[pos[0]!]!.modulo).toBe(2);
    expect(p.insumos).toHaveLength(2); // reutiliza los insumos iguales
    const t = calcularProyecto(p);
    expect(t.modulos[1]!.total).toBe(t.modulos[0]!.total + 500);
  });
  it('pegar desde Excel: descripción, unidad, cantidad y precio; ignora encabezados', () => {
    const t = 'N°\tDescripción\tUnidad\tCantidad\tP.U.\n1\tExcavación\tm3\t12,5\t45,20\n2\tRelleno\tm3\t1.234,5\t30\nTotal\t\t\t\t';
    expect(partidasDesdeTabla(t)).toEqual([{ descripcion: 'Excavación', unidad: 'm3', cantidad: 12.5, precio: 45.2 }, { descripcion: 'Relleno', unidad: 'm3', cantidad: 1234.5, precio: 30 }]);
    expect(partidasDesdeTabla('Pintura;m2;100;12.5')).toEqual([{ descripcion: 'Pintura', unidad: 'm2', cantidad: 100, precio: 12.5 }]);
  });
  it('duplicar y unir módulos', () => {
    const p = proyecto();
    expect(duplicarModulo(p, 1)).toBe(2);
    expect(p.modulos.map((m) => m.nombre)).toEqual(['A', 'A (COPIA)', 'B']);
    const total = calcularProyecto(p).total;
    unirModulos(p, 2, 3);
    expect(p.modulos.map((m) => m.nombre)).toEqual(['A', 'B']);
    expect(p.partidas.filter((x) => x.modulo === 2).map((x) => x.numero)).toEqual([1, 2]);
    expect(calcularProyecto(p).total).toBe(total);
  });
  it('reemplazar el análisis de una partida por un ítem de la base conserva la cantidad', () => {
    const p = proyecto();
    const base: BaseDatos = { nombre: 'b', moneda: 2, grupos: [], insumos: [{ id: 7, rubro: 'M', descripcion: 'Bloque', unidad: 'pza', precio: 3, cotizacion: null, grupo: 0 }], items: [{ id: 1, descripcion: 'Muro de bloque', unidad: 'm2', grupo: 0, materiales: [{ insumo: 7, rendimiento: 12.5 }], manoObra: [], equipo: [] }] };
    reemplazarItemDePartida(p, 0, base, 1);
    expect(p.partidas[0]).toMatchObject({ descripcion: 'Muro de bloque', cantidad: 10 });
    expect(p.partidas).toHaveLength(2);
  });
  it('calculadoras de fierro y madera', () => {
    expect(kgPorMetro(12)).toBe(0.889);
    expect(pesoFierro(10, 12, 10)).toBe(74.074);
    expect(piesTablares(2, 4, 3.048)).toBe(6.667);
  });
  it('flujo de inversiones y requerimiento mensual suman el presupuesto', () => {
    const p = proyecto();
    p.partidas[0]!.duracion = 40; p.partidas[1]!.duracion = 3;
    p.cronograma = { horasDia: 8, diasLaborables: 6, rendimientoMaximo: false };
    const f = flujoInversiones(p);
    expect(f.meses.length).toBeGreaterThanOrEqual(2);
    expect(f.acumulado.at(-1)).toBeCloseTo(calcularProyecto(p).total, 1);
    expect(f.porcentajeAcumulado.at(-1)).toBe(100);
    const mo = requerimientoMensual(p, 'O');
    expect(mo.filas[0]!.total).toBeCloseTo(20, 6); // 2 h × 10 m²
  });
  it('exporta el cronograma en XML para MS Project', () => {
    const x = exportarMsProject(proyecto());
    expect(x).toContain('<Project xmlns="http://schemas.microsoft.com/project">');
    expect((x.match(/<Task>/g) ?? []).length).toBe(4);
    expect(x).toContain('<Summary>1</Summary>');
  });
});
