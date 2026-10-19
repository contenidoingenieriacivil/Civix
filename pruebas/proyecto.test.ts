import { describe, expect, it } from 'vitest';
import { importarPaquete } from '../src/ia/intercambio';
import { importarProyecto } from '../src/ia/proyecto';
import { calcularProyecto } from '../src/nucleo/presupuesto';
import { cantidadDeComputo } from '../src/nucleo/operaciones';
import { PLANTILLA_COSTO_DIRECTO } from '../src/nucleo/plantillas';
import { calcularItem } from '../src/nucleo/calculo';
import { reporteComputos, reporteEspecificaciones } from '../src/reportes/formularios';
import type { BaseDatos } from '../src/datos/modelo';

const vacia = (): BaseDatos => ({ nombre: 'b', moneda: 2, grupos: [], insumos: [], items: [] });
const { base } = importarPaquete({
  civix: 1,
  insumos: [{ descripcion: 'Madera', unidad: 'p2', rubro: 'material', precio: 10 }, { descripcion: 'Topógrafo', unidad: 'hr', rubro: 'mano_de_obra', precio: 20 }],
  items: [
    { codigo: 'R052', descripcion: 'Replanteo y trazado', unidad: 'm2', insumos: [{ descripcion: 'Madera', rendimiento: 0.25 }, { descripcion: 'Topógrafo', rendimiento: 0.02 }] },
    { codigo: 'X1', descripcion: 'Sin herramientas', unidad: 'm', porcentajes: { H: 0 }, insumos: [{ descripcion: 'Topógrafo', rendimiento: 1 }] },
    { descripcion: 'Cotizado', unidad: 'pza', precioUnitario: '1.234,50' },
  ],
}, vacia());

const paquete = (partidas: unknown[], extra: object = {}) => ({ civix: 1, tipo: 'proyecto', proyecto: { nombre: 'Prueba', plantilla: 'Costo directo', ...extra }, modulos: [{ nombre: 'obras', partidas }] });

describe('plantilla «Costo directo» y porcentajes por ítem', () => {
  it('suma materiales, mano de obra y herramientas (6 % de la mano de obra)', () => {
    const mapa = new Map(base.insumos.map((i) => [i.id, i]));
    expect(calcularItem(base.items[0]!, mapa, PLANTILLA_COSTO_DIRECTO).precioUnitario).toBe(2.92); // 2,5 + 0,4 + 6 % de 0,4 (0,024)
    expect(calcularItem(base.items[1]!, mapa, PLANTILLA_COSTO_DIRECTO).precioUnitario).toBe(20); // porcentajes {H:0}
    expect(calcularItem(base.items[2]!, mapa, PLANTILLA_COSTO_DIRECTO).precioUnitario).toBe(1234.5); // precio directo
  });
});

describe('importación de proyecto desde JSON (IA)', () => {
  it('toma el análisis de la base por código o descripción y respeta precios directos', () => {
    const { proyecto, informe } = importarProyecto(paquete([
      { item: 'R052', cantidad: 100 }, { item: 'sin herramientas', cantidad: '2,5' }, { descripcion: 'Letrero', unidad: 'pza', cantidad: 1, precioUnitario: 2944.41 },
    ]), [base]);
    expect(informe.errores).toEqual([]);
    expect(informe).toMatchObject({ partidas: 3, conAnalisis: 2, precioDirecto: 1 });
    const c = calcularProyecto(proyecto!);
    expect(c.modulos[0]!.nombre).toBe('OBRAS');
    expect(c.modulos[0]!.partidas.map((x) => x.precioUnitario)).toEqual([2.92, 20, 2944.41]);
    expect(c.total).toBeCloseTo(292 + 50 + 2944.41, 2);
  });

  it('calcula la cantidad desde el cómputo métrico y lo conserva', () => {
    const { proyecto } = importarProyecto(paquete([{ item: 'R052', computo: [
      { descripcion: 'Planta', veces: 1, largo: 10, ancho: 5 }, { descripcion: 'Patio', veces: 2, largo: '3,5', ancho: 2 }] }]), [base]);
    expect(proyecto!.partidas[0]!.cantidad).toBe(64);
    expect(proyecto!.partidas[0]!.computo).toHaveLength(2);
    expect(cantidadDeComputo([{ veces: 3, largo: 2 }, { largo: 4 }])).toBe(10);
  });

  it('aplica parámetros de la plantilla y explica todos los errores sin importar nada', () => {
    const ok = importarProyecto(paquete([{ item: 'R052', cantidad: 1 }], { plantilla: 'SABS', parametros: [{ parametro: 'cargas sociales', porcentaje: 71.18 }] }), [base]);
    expect(ok.proyecto!.plantilla.parametros.find((p) => p.letra === 'F')!.porcentaje).toBe(71.18);
    const mal = importarProyecto(paquete([{ item: 'inexistente', cantidad: 1 }, { descripcion: 'x', unidad: 'm' }, { item: 'R052' }], { plantilla: 'rara' }), [base]);
    expect(mal.proyecto).toBeNull();
    expect(mal.informe.errores).toHaveLength(4);
    expect(importarProyecto({ civix: 1 }, [base]).informe.errores[0]).toMatch(/no es un proyecto/);
  });

  it('detecta ítems ambiguos', () => {
    const b2 = structuredClone(base);
    b2.items.push({ ...b2.items[0]!, id: 99, codigo: undefined, descripcion: 'Replanteo y trazado lineal' });
    b2.items[0]!.codigo = undefined;
    const r = importarProyecto(paquete([{ item: 'trazado', cantidad: 1 }]), [b2]);
    expect(r.informe.errores[0]).toMatch(/coincide con 2/);
  });
});

describe('reportes de especificaciones y cómputos', () => {
  const { proyecto } = importarProyecto(paquete([
    { item: 'R052', cantidad: 10, especificacion: 'Se materializarán ejes con estacas.\n\nSe medirá por m².' },
    { item: 'X1', computo: [{ descripcion: 'Eje A', veces: 2, largo: 12.5 }] },
  ]), [base]);
  const c = calcularProyecto(proyecto!);
  it('especificaciones: texto del usuario y pendientes marcados', () => {
    const html = reporteEspecificaciones(c);
    expect(html).toContain('ÍTEM 1. REPLANTEO Y TRAZADO');
    expect(html).toContain('Se materializarán ejes con estacas.');
    expect(html).toContain('Especificación pendiente de redactar');
    expect(html).toContain('1 de 2 pendientes');
  });
  it('cómputos: detalle de líneas y cantidad directa', () => {
    const html = reporteComputos(c);
    expect(html).toContain('Eje A');
    expect(html).toContain('25,00'); // 2 × 12,5
    expect(html).toContain('Cantidad directa');
  });
});

describe('proyecto con precios directos: qué falta y cómo lo dice cada formulario', () => {
  const directo = importarProyecto(paquete([
    { descripcion: 'Excavación', unidad: 'm3', cantidad: 100, precioUnitario: 25 },
    { descripcion: 'Relleno', unidad: 'm3', cantidad: 50, precioUnitario: 20, duracion: 3, predecesor: 1 },
  ]), []).proyecto!;
  const c = calcularProyecto(directo);

  it('diagnostica los datos faltantes', async () => {
    const { diagnosticar } = await import('../src/nucleo/presupuesto');
    const d = diagnosticar(c);
    expect(d).toMatchObject({ partidas: 2, sinAnalisis: 2, sinPlazo: 1 });
    expect(d.avisos.join(' ')).toMatch(/2 de 2 partidas tienen precio unitario directo.*B-2, B-3 y B-4 no pueden generarse/);
    expect(d.avisos.join(' ')).toMatch(/1 de 2 partidas no tienen plazo/);
  });

  it('B-2, B-3 y B-4 explican que faltan los análisis en vez de mostrar tablas vacías', async () => {
    const { formularioB2, formularioB3, formularioB4 } = await import('../src/reportes/formularios');
    const b2 = formularioB2(c);
    expect(b2).toContain('PRECIO UNITARIO DIRECTO (SIN ANÁLISIS)');
    expect(b2).toContain('no tienen análisis de insumos');
    expect(b2).not.toContain('1. MATERIALES');
    expect(formularioB3(c)).toContain('no tiene insumos');
    expect(formularioB4(c, [])).toContain('Sin equipos');
  });

  it('el plazo fijado a mano manda y las vinculadas se encadenan; las sin plazo se avisan en el A-8', async () => {
    const { programar } = await import('../src/nucleo/cronograma');
    const { formularioA8 } = await import('../src/reportes/cronograma');
    const g = programar(directo).modulos[0]!.actividades;
    expect(g[1]!.duracion).toBe(3);
    expect(g[1]!.predecesor).toBe(1);
    expect(g[1]!.inicio > g[0]!.fin).toBe(true);
    expect(formularioA8(directo)).toContain('Plazos incompletos');
  });
});
