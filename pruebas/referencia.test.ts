import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BaseDatos } from '../src/datos/modelo';
import { importarPaquete } from '../src/ia/intercambio';
import { importarProyecto } from '../src/ia/proyecto';
import { aplicarActualizacion, exportarInsumosParaIA, planificarActualizacion } from '../src/ia/precios';
import { calcularItem } from '../src/nucleo/calculo';
import { montoALiteral } from '../src/nucleo/literal';
import { calcularProyecto } from '../src/nucleo/presupuesto';
import { PLANTILLA_COSTO_DIRECTO } from '../src/nucleo/plantillas';
import { formularioB1 } from '../src/reportes/formularios';
import { num } from '../src/reportes/formato';

/**
 * Calibración con documentos reales (no se versionan). Se generan con tools/:
 *   node tools/convertir-costos.mjs costos.md $D/base.json $D/precios.json
 *   node tools/convertir-presupuesto.mjs tesis.md $D/proyecto.json "Nombre"
 * y se activan con CIVIX_REF_DIR=$D.
 */
const D = process.env.CIVIX_REF_DIR;
const leer = <T,>(f: string) => JSON.parse(readFileSync(join(D!, f), 'utf8')) as T;
const hay = !!D && existsSync(join(D, 'proyecto.json')) && existsSync(join(D, 'base.json'));
const vacia = (): BaseDatos => ({ nombre: 'costos', moneda: 2, grupos: [], insumos: [], items: [] });

(hay ? describe : describe.skip)('presupuesto de referencia (alcantarillado Tolomosa Grande)', () => {
  type Esperado = { modulos: number[]; total: number; partidas: { n: number; cantidad: number; unitario: number; parcial: number }[] };
  const esperado = () => leer<Esperado>('proyecto-esperado.json');
  const importar = () => importarProyecto(leer('proyecto.json'), []);

  it('se importa completo, sin errores', () => {
    const { proyecto, informe } = importar();
    expect(informe.errores).toEqual([]);
    expect(proyecto!.modulos).toHaveLength(21);
    expect(informe.partidas).toBe(189);
    expect(informe.precioDirecto).toBe(189);
  });

  it('cada partida reproduce su parcial impreso', () => {
    const c = calcularProyecto(importar().proyecto!);
    const e = esperado().partidas;
    const todas = c.modulos.flatMap((m) => m.partidas);
    expect(todas).toHaveLength(e.length);
    const malas = todas.flatMap((x, k) => (Math.abs(x.parcial - e[k]!.parcial) > 0.011 ? [`${e[k]!.n}: civix ${x.parcial} / documento ${e[k]!.parcial}`] : []));
    expect(malas).toEqual([]);
  });

  it('los totales de módulo coinciden con el documento (salvo el defecto conocido del M21)', () => {
    const c = calcularProyecto(importar().proyecto!);
    const e = esperado();
    c.modulos.forEach((m, i) => {
      const dif = m.total - e.modulos[i]!;
      // M21 «DESINFECCIÓN UV»: el documento imprime su última partida (3.254,00) pero no la incluye en el total del módulo.
      if (m.nombre.startsWith('M21')) expect(dif).toBeCloseTo(3254, 1);
      else expect(Math.abs(dif), m.nombre).toBeLessThanOrEqual(0.06);
    });
  });

  it('el total del presupuesto coincide con el del documento más ese defecto', () => {
    const c = calcularProyecto(importar().proyecto!);
    expect(c.total - esperado().total).toBeCloseTo(3254, 0);
    expect(Math.abs(c.total - 3254 - esperado().total)).toBeLessThan(0.1);
  });

  it('el monto en literal es el mismo que escribe el documento', () => {
    expect(montoALiteral(4555157.44)).toBe('Son: Cuatro millones quinientos cincuenta y cinco mil ciento cincuenta y siete 44/100 Bolivianos');
  });

  it('el formulario B-1 lista las 189 partidas con sus 21 módulos', () => {
    const html = formularioB1(calcularProyecto(importar().proyecto!));
    expect((html.match(/<td class="c">\d+<\/td><td>/g) ?? []).length).toBe(189);
    expect((html.match(/class="sub"/g) ?? []).length).toBe(42); // encabezado + total por módulo
    expect(html).toContain(num(esperado().modulos[1]!)); // M02: 1.930.949,00
  });
});

(hay ? describe : describe.skip)('catálogo de costos (costos.md): análisis de precios unitarios', () => {
  const bases = () => importarPaquete(leer('base.json'), vacia());
  const ref = () => leer<Record<string, { costo: number; coherente: boolean }>>('base-referencia.json');

  it('se importa sin errores', () => {
    const { base, informe } = bases();
    expect(informe.errores).toEqual([]);
    expect(base.items.length).toBeGreaterThanOrEqual(185);
  });

  it('Civix recalcula cada precio unitario con insumos y obtiene el costo total impreso', () => {
    const { base } = bases();
    const mapa = new Map(base.insumos.map((i) => [i.id, i]));
    const r = ref();
    let comparados = 0, incoherentes = 0;
    const malos: string[] = [];
    for (const it of base.items) {
      if (it.precioFijo !== undefined) continue; // sin análisis (datos "n/d" en el original)
      const e = r[it.codigo ?? it.descripcion];
      if (!e) continue;
      // Solo se exige a los análisis cuya aritmética impresa es coherente: los demás vienen mal escaneados en el documento.
      if (!e.coherente) { incoherentes++; continue; }
      comparados++;
      const pu = calcularItem(it, mapa, PLANTILLA_COSTO_DIRECTO).precioUnitario;
      if (Math.abs(pu - e.costo) > 0.06) malos.push(`${it.codigo} ${it.descripcion}: civix ${pu} / costos.md ${e.costo}`);
    }
    expect(comparados).toBeGreaterThan(100);
    expect(malos).toEqual([]);
    expect(incoherentes).toBeLessThan(comparados); // el defecto del documento es minoritario
  });
});

(hay && existsSync(join(D ?? '', 'precios.json')) ? describe : describe.skip)('actualización de precios (flujo con IA) con las listas de costos.md', () => {
  const armar = () => {
    const { base } = importarPaquete(leer('base.json'), vacia());
    const paquete = { civix: 1, tipo: 'proyecto', proyecto: { nombre: 'Prueba', plantilla: 'Costo directo' },
      modulos: [{ nombre: 'OBRAS', partidas: [{ item: 'R052', cantidad: 100 }, { item: 'Zapata de Ho. Ao.', cantidad: 10 }, { item: 'Excavación 0-1.5 m. Terr. Duro', cantidad: 50 }] }] };
    const r = importarProyecto(paquete, [base]);
    expect(r.informe.errores).toEqual([]);
    return r.proyecto!;
  };

  it('una lista cruda de otro documento cruza solo parcialmente (otra granularidad y otros nombres)', () => {
    const p = armar();
    const inf = planificarActualizacion(p, leer('precios.json'));
    expect(inf.errores).toEqual([]);
    const cruzados = p.insumos.length - inf.sinPrecioNuevo.length;
    expect(cruzados).toBeGreaterThan(0);
    expect(cruzados).toBeLessThan(p.insumos.length); // por eso la IA debe alinearla con la lista exportada de Civix
  });

  it('con la lista de insumos exportada por Civix, la respuesta alineada de la IA cruza al 100 %', () => {
    const p = armar();
    const exportada = exportarInsumosParaIA(p);
    expect(exportada.insumos).toHaveLength(p.insumos.length);
    // Simula lo que devolvería la IA: mismos nombres y unidades, precios nuevos (+10 %)
    const respuesta = { civix: 1, tipo: 'precios', moneda: 'Bs', fecha: '2026-03-15',
      precios: exportada.insumos.map((i) => ({ descripcion: i.descripcion, unidad: i.unidad, rubro: i.rubro, precio: Math.round(i.precioActual * 1.1 * 1000) / 1000 })) };
    const inf = planificarActualizacion(p, respuesta);
    expect(inf.sinCoincidencia).toEqual([]);
    expect(inf.cambios.every((c) => c.coincidencia === 'exacta' && c.aceptar)).toBe(true);
    expect(inf.sinPrecioNuevo).toEqual([]);
    const antes = calcularProyecto(p).total;
    expect(aplicarActualizacion(p, inf)).toBe(inf.cambios.length);
    const despues = calcularProyecto(p).total;
    // todo +10 % en insumos (el 6 % de herramientas sigue siendo 6 % de la mano de obra): el total sube ~10 %
    expect(despues / antes).toBeGreaterThan(1.09);
    expect(despues / antes).toBeLessThan(1.11);
    expect(p.insumos.every((i) => i.cotizacion === '2026-03-15')).toBe(true);
  });
});

/**
 * Anexos de la tesis (Anexo 10 precios unitarios, Anexo 9 cómputos, Anexo 1 especificaciones):
 *   node tools/convertir-anexos.mjs tesis.md anexos.md $D/tesis "Nombre"   y   CIVIX_REF_DIR=$D
 */
const hayAnexos = !!D && existsSync(join(D, 'tesis-base.json')) && existsSync(join(D, 'tesis-proyecto.json'));
(hayAnexos ? describe : describe.skip)('anexos de la tesis: Civix recalcula los precios unitarios del Anexo 10', () => {
  type Esp = { n: number; descripcion: string; unitario: number; parcial: number; conAnalisis: boolean };
  const cargar = () => {
    const b = importarPaquete(leer('tesis-base.json'), vacia());
    const p = importarProyecto(leer('tesis-proyecto.json'), [b.base]);
    return { b, p };
  };

  it('base y proyecto se importan sin errores', () => {
    const { b, p } = cargar();
    expect(b.informe.errores).toEqual([]);
    expect(p.informe.errores).toEqual([]);
    expect(p.informe.partidas).toBe(189);
    expect(p.informe.conAnalisis).toBeGreaterThan(100);
  });

  it('cada partida con análisis tiene el mismo precio unitario que la tesis', () => {
    const { p } = cargar();
    const esp = leer<Esp[]>('tesis-esperado.json');
    const c = calcularProyecto(p.proyecto!);
    const todas = c.modulos.flatMap((m) => m.partidas);
    expect(todas).toHaveLength(esp.length);
    const con = todas.flatMap((x, k) => (esp[k]!.conAnalisis ? [{ x, e: esp[k]! }] : []));
    const malas = con.filter(({ x, e }) => Math.abs(x.precioUnitario - e.unitario) > 0.011);
    expect(con.length).toBeGreaterThan(140);
    // El Anexo 10 está escaneado: unas pocas cantidades de insumo vienen redondeadas y el cálculo difiere en centavos o en < 1,1 %.
    expect(malas.length).toBeLessThanOrEqual(6);
    for (const { x, e } of malas) expect(Math.abs(x.precioUnitario - e.unitario) / e.unitario, `${e.n} ${e.descripcion}`).toBeLessThan(0.011);
  });

  it('los cómputos incorporados reproducen la cantidad del presupuesto', () => {
    const { p } = cargar();
    const esp = leer<Esp[]>('tesis-esperado.json');
    const c = calcularProyecto(p.proyecto!);
    const todas = c.modulos.flatMap((m) => m.partidas);
    // tolerancia: 1,1 centavos de diferencia en el unitario por cantidad, o 0,6 % por cantidades redondeadas en el documento
    const malas = todas.flatMap((x, k) => {
      if (!x.partida.computo) return [];
      const d = Math.abs(x.parcial - esp[k]!.parcial);
      return d > Math.max(x.partida.cantidad * 0.012, esp[k]!.parcial * 0.006 + 0.011) ? [`${esp[k]!.n}: parcial civix ${x.parcial} / tesis ${esp[k]!.parcial}`] : [];
    });
    // El presupuesto de la tesis usa 500,14 m³ en «cama de arena» (partida 11) y su propio Anexo 9 suma 488,17: defecto del documento.
    expect(malas.filter((m) => !m.startsWith('11:'))).toEqual([]);
  });
});
