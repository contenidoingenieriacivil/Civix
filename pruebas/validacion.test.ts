import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Proyecto } from '../src/datos/modelo';
import { importarPaquete } from '../src/ia/intercambio';
import { importarProyecto } from '../src/ia/proyecto';
import { programar } from '../src/nucleo/cronograma';
import { flujoInversiones, requerimientoMensual } from '../src/nucleo/herramientas';
import { montoALiteral } from '../src/nucleo/literal';
import { cantidadDeComputo } from '../src/nucleo/operaciones';
import { calcularProyecto, desgloseInsumos, resumenPorRubro } from '../src/nucleo/presupuesto';
import { presupuestoAExcel } from '../src/reportes/excel';
import { htmlLote, htmlReporte, REPORTES } from '../src/reportes/indice';
import { nombreInsumo } from '../src/reportes/formato';

/**
 * Validación integral con la tesis «Alcantarillado sanitario y PTAR – Tolomosa Grande»: los datos entran en el formato
 * que siempre recibe Civix (paquete de datos + paquete de proyecto) y cada resultado se compara con lo impreso en la tesis
 * y entre reportes. Archivos: tools/convertir-anexos.mjs y tools/aplicar-cronograma.mjs → CIVIX_REF_DIR.
 */
const D = process.env.CIVIX_REF_DIR;
const hay = !!D && ['tesis-base.json', 'tesis-proyecto-gantt.json', 'tesis-esperado.json', 'tesis-apu-impreso.json'].every((f) => existsSync(join(D, f)));
const leer = <T,>(f: string) => JSON.parse(readFileSync(join(D!, f), 'utf8')) as T;
const texto = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const numBo = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const filasTabla = (html: string) => [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => texto(c[1]!).trim()));

(hay ? describe : describe.skip)('validación integral con la tesis Tolomosa Grande', () => {
  const cargar = (): Proyecto => {
    const b = importarPaquete(leer('tesis-base.json'), { nombre: 'Tesis', moneda: 2, grupos: [], insumos: [], items: [] });
    expect(b.informe.errores).toEqual([]);
    const r = importarProyecto(leer('tesis-proyecto-gantt.json'), [b.base]);
    expect(r.informe.errores).toEqual([]);
    return r.proyecto!;
  };
  type Esp = { n: number; descripcion: string; unitario: number; parcial: number; conAnalisis: boolean };

  it('1. datos: 108 análisis de la base, 189 partidas en 21 módulos, 151 con análisis', () => {
    const p = cargar();
    expect(p.modulos).toHaveLength(21);
    expect(p.partidas).toHaveLength(189);
    expect(p.partidas.filter((x) => x.item.precioFijo === undefined)).toHaveLength(151);
  });

  it('2. B-2: cada parámetro (D…Q) de cada análisis es el impreso en el Anexo 10', () => {
    const p = cargar();
    const imp = leer<Record<string, { impreso: Record<string, number> }>>('tesis-apu-impreso.json');
    const c = calcularProyecto(p);
    let iguales = 0;
    const distintos = new Set<string>();
    const vistos = new Set<string>();
    for (const m of c.modulos) for (const x of m.partidas) {
      const nombre = x.partida.item.descripcion;
      const r = imp[nombre];
      if (!r || vistos.has(nombre) || x.partida.item.precioFijo !== undefined) continue;
      vistos.add(nombre);
      const mal = Object.entries(r.impreso).filter(([L, v]) => Math.abs((x.apu.valores[L] ?? NaN) - v) > 0.011);
      if (mal.length) distintos.add(nombre); else iguales++;
    }
    expect(vistos.size).toBe(79);
    expect(iguales).toBe(77);
    // Los dos restantes son errores de suma de la propia tesis: «ESTRUCT. CANAL UV» imprime D = 2.514,70 y sus
    // materiales suman 2.504,50; «ACERO ESTRUCTURAL» imprime Q = 16,32 pero N + P = 15,84 + 0,49 = 16,33.
    expect([...distintos].map((n) => n.slice(0, 17)).sort()).toEqual(['ACERO ESTRUCTURAL', 'ESTRUCT. CANAL UV']);
  });

  it('3. B-1: precios unitarios y parciales contra el presupuesto de la tesis; cantidad × P.U. = parcial en cada fila', () => {
    const p = cargar();
    const esp = leer<Esp[]>('tesis-esperado.json');
    const c = calcularProyecto(p);
    const todas = c.modulos.flatMap((m) => m.partidas);
    const puIguales = todas.filter((x, k) => Math.abs(x.precioUnitario - esp[k]!.unitario) <= 0.011).length;
    expect(puIguales).toBeGreaterThanOrEqual(187); // las 2 del punto 2
    // en el formulario impreso: cada fila cuadra y el total es la suma de los parciales
    const html = htmlReporte('B-1', p);
    const filas = filasTabla(html).filter((f) => f.length === 7);
    expect(filas).toHaveLength(189);
    for (const f of filas) expect(Math.abs(numBo(f[3]!) * numBo(f[4]!) - numBo(f[6]!))).toBeLessThanOrEqual(0.006);
    const suma = filas.reduce((a, f) => a + numBo(f[6]!), 0);
    expect(Math.abs(suma - c.total)).toBeLessThan(0.005);
    expect(texto(html)).toContain(montoALiteral(c.total, 'Bolivianos'));
  });

  it('4. total del proyecto: tesis Bs 4.555.157,44 más la partida 184 que la tesis no suma (Bs 3.254,00), ±0,05 %', () => {
    const c = calcularProyecto(cargar());
    const doc = 4_555_157.44 + 3_254.0;
    expect(Math.abs(c.total - doc) / doc).toBeLessThan(0.0005);
  });

  it('5. B-3 y desglose: los precios elementales son los del Anexo 10 y los montos cuadran con el B-2', () => {
    const p = cargar();
    const c = calcularProyecto(p);
    const des = desgloseInsumos(c);
    const usados = new Set(p.partidas.flatMap((x) => [...x.item.materiales, ...x.item.manoObra, ...x.item.equipo].map((l) => l.insumo)));
    expect(des.M.length + des.O.length + des.E.length).toBe(usados.size);
    const html = htmlReporte('B-3', p);
    for (const f of [...des.M, ...des.O, ...des.E]) expect(html).toContain(nombreInsumo(f.insumo.descripcion).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'));
    // costo directo de materiales del desglose = suma de cantidad × A de cada partida
    const directo = c.modulos.flatMap((m) => m.partidas).reduce((a, x) => a + (x.partida.item.precioFijo === undefined ? x.partida.cantidad * (x.apu.valores.A ?? 0) : 0), 0);
    expect(des.M.reduce((a, f) => a + f.monto, 0)).toBeCloseTo(directo, 0);
    expect(resumenPorRubro(c).reduce((a, r) => a + r.porcentaje, 0)).toBeCloseTo(100, 6);
  });

  it('6. cómputos métricos: cada cómputo suma la cantidad de su partida y aparece en el reporte', () => {
    const p = cargar();
    const con = p.partidas.filter((x) => x.computo?.length);
    expect(con).toHaveLength(20);
    for (const x of con) expect(cantidadDeComputo(x.computo!)).toBeCloseTo(x.cantidad, 6);
    const t = texto(htmlReporte('computos', p));
    for (const x of con) expect(t).toContain(x.descripcion.replace(/\s+/g, ' ').trim());
  });

  it('7. especificaciones: las 103 partidas con especificación salen en el reporte', () => {
    const p = cargar();
    const con = p.partidas.filter((x) => x.item.especificacion);
    expect(con.length).toBe(103);
    const t = texto(htmlReporte('esp', p));
    expect(t).toContain(texto(con[0]!.item.especificacion!).slice(0, 60).trim());
  });

  it('8. cronograma A-8: duraciones del Gantt de la tesis y plazo de 504 días (tesis: 506)', () => {
    const p = cargar();
    const filas = readFileSync(join(__dirname, '..', 'tools', 'datos', 'cronograma-tolomosa.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => Number(l.split('|')[2]));
    const durs = p.partidas.map((x) => x.duracion!).sort((a, b) => a - b);
    const delGantt = filas.sort((a, b) => a - b);
    expect(durs.every((d) => delGantt.includes(d))).toBe(true);
    const g = programar(p);
    expect(g.diasCalendario).toBe(504);
    expect(texto(htmlReporte('A-8', p))).toContain('504 días calendario');
  });

  it('9. todos los reportes se generan sin valores inválidos y el total es el mismo en todos', async () => {
    const p = cargar();
    const c = calcularProyecto(p);
    const total = c.total.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, '.');
    for (const r of REPORTES) {
      const t = texto(htmlReporte(r.id, p));
      expect(t, r.id).not.toMatch(/\bNaN\b|undefined|Infinity|\[object|null\b/);
      expect(t.length, r.id).toBeGreaterThan(200);
    }
    for (const id of ['B-1', 'resumen', 'incidencia', 'graficos']) expect(texto(htmlReporte(id, p)), id).toContain(montoALiteral(c.total, 'Bolivianos'));
    expect(texto(htmlReporte('resumen', p))).toMatch(new RegExp(total.replace(/\./g, '\\.')));
    // flujo de inversiones: lo programado mes a mes suma el presupuesto
    const f = flujoInversiones(p);
    expect(f.acumulado.at(-1)).toBeCloseTo(c.total, 0);
    expect(f.porcentajeAcumulado.at(-1)).toBe(100);
    // mano de obra: las horas del flujo de personal son las del desglose (los jornales pasados a horas de 8)
    const horas = requerimientoMensual(p, 'O').filas.reduce((a, x) => a + x.total, 0);
    expect(horas).toBeCloseTo(desgloseInsumos(c).O.reduce((a, x) => a + x.cantidad * (/^jorn/i.test(x.insumo.unidad) ? 8 : 1), 0), -1);
    expect(texto(htmlReporte('B-3', p))).not.toMatch(/\[Bs [\d.,]+\]/); // sin las marcas internas de variantes
    // Excel: mismo total y los parciales con ROUND(cantidad × P.U.)
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load((await presupuestoAExcel(c)).buffer as ArrayBuffer);
    const hoja = wb.worksheets[0]!;
    let totalExcel = 0;
    hoja.eachRow((fila) => { const v = fila.getCell(6).value as { formula?: string; result?: number } | null; if (v?.formula?.startsWith('SUM')) totalExcel = v.result!; });
    expect(totalExcel).toBe(c.total);
    // varios reportes juntos
    const lote = htmlLote(['B-1', 'B-2', 'B-3', 'B-4', 'A-8'], p);
    expect((lote.match(/<section class="lote"/g) ?? []).length).toBe(5);
  });

  it('10. reportes por módulo: la suma de los B-1 de cada módulo es el total', () => {
    const p = cargar();
    const c = calcularProyecto(p);
    let suma = 0;
    for (let m = 1; m <= p.modulos.length; m++) {
      const filas = filasTabla(htmlReporte('B-1', p, { modulo: m })).filter((f) => f.length === 7);
      suma += filas.reduce((a, f) => a + numBo(f[6]!), 0);
    }
    expect(Math.abs(suma - c.total)).toBeLessThan(0.005);
  });
});
