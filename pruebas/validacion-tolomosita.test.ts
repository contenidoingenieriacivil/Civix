import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Proyecto } from '../src/datos/modelo';
import { importarPaquete } from '../src/ia/intercambio';
import { importarProyecto } from '../src/ia/proyecto';
import { calcularItem, redondear } from '../src/nucleo/calculo';
import { montoALiteral } from '../src/nucleo/literal';
import { cantidadDeComputo } from '../src/nucleo/operaciones';
import { PLANTILLA_SABS } from '../src/nucleo/plantillas';
import { calcularProyecto, desgloseInsumos, resumenPorRubro } from '../src/nucleo/presupuesto';
import { presupuestoAExcel } from '../src/reportes/excel';
import { htmlReporte, REPORTES } from '../src/reportes/indice';
import { leerArchivoProyecto, serializarProyecto } from '../src/ui/acciones';

/**
 * Validación con el documento «Sistema de alcantarillado y PTAR – Tolomosita Sud» (anexos 11–14: cómputos métricos y
 * 162 análisis de precios impresos por PRESCOM con 2 decimales de cálculo). El documento no trae formulario B-1: el
 * presupuesto se arma con sus cómputos y sus análisis. Archivos: tools/convertir-analisis-prescom.mjs y
 * tools/convertir-computos-prescom.mjs (con tools/datos/tolomosita-componentes.json) → CIVIX_REF_DIR.
 */
const D = process.env.CIVIX_REF_DIR;
const hay = !!D && ['tolomosita-base.json', 'tolomosita-apu-impreso.json', 'tolomosita-proyecto.json'].every((f) => existsSync(join(D, f)));
const leer = <T,>(f: string) => JSON.parse(readFileSync(join(D!, f), 'utf8')) as T;
const texto = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const numBo = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const filasTabla = (html: string) => [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => texto(c[1]!).trim()));

(hay ? describe : describe.skip)('validación con el documento Tolomosita Sud', () => {
  const base = () => {
    const b = importarPaquete(leer('tolomosita-base.json'), { nombre: 'Tolomosita', moneda: 2, grupos: [], insumos: [], items: [] });
    expect(b.informe.errores).toEqual([]);
    return b.base;
  };
  const cargar = (): Proyecto => {
    const r = importarProyecto(leer('tolomosita-proyecto.json'), [base()]);
    expect(r.informe.errores).toEqual([]);
    return r.proyecto!;
  };

  it('1. B-2: con 2 decimales de cálculo, los 162 análisis dan exactamente todos los parámetros impresos (D…Q)', () => {
    const b = base();
    expect(b.items).toHaveLength(162);
    const imp = leer<Record<string, { impreso: Record<string, number> }>>('tolomosita-apu-impreso.json');
    const insumos = new Map(b.insumos.map((i) => [i.id, i]));
    const plantilla = { ...structuredClone(PLANTILLA_SABS), decimalesCalculo: 2 };
    const distintos = b.items.filter((it) => {
      const v = calcularItem(it, insumos, plantilla).valores;
      return Object.entries(imp[it.descripcion]!.impreso).some(([L, x]) => redondear(v[L] ?? NaN, 2) !== x);
    });
    expect(distintos.map((x) => x.descripcion)).toEqual([]);
    // sin el redondeo de PRESCOM los resultados ya no coinciden: la opción es necesaria
    const sin = b.items.filter((it) => Object.entries(imp[it.descripcion]!.impreso).every(([L, x]) => redondear(calcularItem(it, insumos, PLANTILLA_SABS).valores[L] ?? NaN, 2) === x)).length;
    expect(sin).toBe(76);
  });

  it('2. cómputos: 17 componentes, 158 partidas; cada cómputo suma la cantidad de la partida', () => {
    const p = cargar();
    expect(p.modulos).toHaveLength(17);
    expect(p.partidas).toHaveLength(158);
    expect(p.plantilla.decimalesCalculo).toBe(2);
    for (const x of p.partidas) {
      expect(x.computo?.length, x.descripcion).toBeGreaterThan(0);
      expect(cantidadDeComputo(x.computo!)).toBeCloseTo(x.cantidad, 9);
    }
    // valores impresos del documento (columna CANT. TOTAL)
    const buscar = (m: number, d: string) => p.partidas.find((x) => x.modulo === m && x.descripcion.startsWith(d))!;
    expect(buscar(1, 'HORMIGÓN SIMPLE').cantidad).toBeCloseTo(3.87, 2); // 7 líneas, 4 de ellas negativas (vanos)
    expect(buscar(2, 'PRUEBA HIDRÁULICA').cantidad).toBeCloseTo(2022.5, 2);
    expect(buscar(2, 'EXCAVACIÓN DE ZANJAS').cantidad).toBeCloseTo(1209.0, 1);
    expect(buscar(3, 'ESCALONES').cantidad).toBeCloseTo(22.9, 2);
    expect(buscar(17, 'CERCO DE MALLA').cantidad).toBeCloseTo(459.6, 2);
  });

  it('3. B-1: cantidad × P.U. = parcial en cada fila, el total es la suma y los P.U. son los de los análisis impresos', () => {
    const p = cargar();
    const c = calcularProyecto(p);
    const imp = leer<Record<string, { impreso: Record<string, number> }>>('tolomosita-apu-impreso.json');
    const filas = filasTabla(htmlReporte('B-1', p)).filter((f) => f.length === 7);
    expect(filas).toHaveLength(158);
    for (const f of filas) expect(Math.abs(numBo(f[3]!) * numBo(f[4]!) - numBo(f[6]!))).toBeLessThanOrEqual(0.006);
    expect(Math.abs(filas.reduce((a, f) => a + numBo(f[6]!), 0) - c.total)).toBeLessThan(0.005);
    const conApu = c.modulos.flatMap((m) => m.partidas).filter((x) => x.partida.item.precioFijo === undefined);
    expect(conApu).toHaveLength(139);
    for (const x of conApu) expect(x.precioUnitario, x.partida.descripcion).toBe(imp[x.partida.item.descripcion]!.impreso.Q);
    expect(texto(htmlReporte('B-1', p))).toContain(montoALiteral(c.total, 'Bolivianos'));
  });

  it('4. todos los reportes se generan sin valores inválidos; desglose, resumen y Excel cuadran con el total', async () => {
    const p = cargar();
    const c = calcularProyecto(p);
    for (const r of REPORTES) {
      const t = texto(htmlReporte(r.id, p));
      expect(t, r.id).not.toMatch(/\bNaN\b|undefined|Infinity|\[object|null\b/);
    }
    const des = desgloseInsumos(c);
    const directo = c.modulos.flatMap((m) => m.partidas).reduce((a, x) => a + (x.partida.item.precioFijo === undefined ? x.partida.cantidad * (x.apu.valores.A ?? 0) : 0), 0);
    // con decimales de cálculo, A suma costos redondeados línea a línea y el desglose multiplica la cantidad total de
    // cada insumo por su precio: difieren en esos medios centavos (aquí Bs 7,66 en 884.828, 0,001 %)
    expect(Math.abs(des.M.reduce((a, f) => a + f.monto, 0) - directo) / directo).toBeLessThan(1e-4);
    expect(resumenPorRubro(c).reduce((a, r) => a + r.porcentaje, 0)).toBeCloseTo(100, 6);
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load((await presupuestoAExcel(c)).buffer as ArrayBuffer);
    let totalExcel = 0;
    wb.worksheets[0]!.eachRow((fila) => { const v = fila.getCell(6).value as { formula?: string; result?: number } | null; if (v?.formula?.startsWith('SUM')) totalExcel = v.result!; });
    expect(totalExcel).toBe(c.total);
  });

  it('5. guardar y abrir el .civix conserva los decimales de cálculo y el total', () => {
    const p = cargar();
    const q = leerArchivoProyecto(serializarProyecto(p));
    expect(q.plantilla.decimalesCalculo).toBe(2);
    expect(calcularProyecto(q).total).toBe(calcularProyecto(p).total);
  });
});
