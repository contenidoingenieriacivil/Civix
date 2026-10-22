import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { preview } from 'vite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Funciones de PRESCOM añadidas: insumos del proyecto, portapapeles y Excel, igualar precio, cambiar ítem, módulos, calculadoras y reportes nuevos. */
const CHROMIUM = process.env.CIVIX_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let servidor: Awaited<ReturnType<typeof preview>>;
let navegador: Browser;
let page: Page;
const errores: string[] = [];
const id = (t: string) => page.getByTestId(t);
const cmd = (t: string) => id(`cmd-${t}`).click();
const n = (s: string) => Number(s.replace(/[^\d,-]/g, '').replace(',', '.'));
const total = async () => n(await id('total-pie').innerText());
const escribir = async (c: ReturnType<typeof id>, v: string) => { await c.click(); await c.fill(v); await c.press('Enter'); };

const BASE = { civix: 1, insumos: [
  { descripcion: 'Cemento', unidad: 'kg', rubro: 'material', precio: 1.2 }, { descripcion: 'Cemento IP-40', unidad: 'kg', rubro: 'material', precio: 1.5 },
  { descripcion: 'Arena', unidad: 'm3', rubro: 'material', precio: 120 }, { descripcion: 'Albañil', unidad: 'hr', rubro: 'mano_de_obra', precio: 18 },
  { descripcion: 'Ayudante', unidad: 'hr', rubro: 'mano_de_obra', precio: 12 }, { descripcion: 'Mezcladora', unidad: 'hr', rubro: 'equipo', precio: 30 }],
items: [
  { descripcion: 'Hormigón simple', unidad: 'm3', insumos: [{ descripcion: 'Cemento', rendimiento: 300 }, { descripcion: 'Arena', rendimiento: 0.5 }, { descripcion: 'Albañil', rendimiento: 6 }, { descripcion: 'Ayudante', rendimiento: 8 }, { descripcion: 'Mezcladora', rendimiento: 0.5 }] },
  { descripcion: 'Contrapiso de cemento', unidad: 'm2', insumos: [{ descripcion: 'Cemento', rendimiento: 12 }, { descripcion: 'Albañil', rendimiento: 0.8 }] }] };

async function cargar() {
  await id('pestana-base').click(); await cmd('pegar-ia');
  await id('json-ia').fill(JSON.stringify(BASE)); await id('importar-json').click(); await id('resultado-importacion').waitFor(); await id('cerrar-pegar').click();
  await id('fila-item').first().click(); await id('cantidad-nueva').fill('10'); await id('anadir-presupuesto').click();
  await id('fila-item').nth(1).click(); await id('cantidad-nueva').fill('50'); await id('anadir-presupuesto').click();
  await id('pestana-inicio').click();
}

beforeAll(async () => {
  servidor = await preview({ preview: { port: 4178, strictPort: true, host: '127.0.0.1' } });
  navegador = await chromium.launch({ ...(CHROMIUM ? { executablePath: CHROMIUM } : {}), args: ['--no-sandbox'] });
});
afterAll(async () => { await navegador?.close(); await new Promise((r) => servidor?.httpServer.close(() => r(null))); });
beforeEach(async () => {
  errores.length = 0;
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('dialog', (d) => void d.accept());
  await page.goto('http://127.0.0.1:4178/');
  await id('titulo-proyecto').waitFor();
  await cargar();
});

describe('funciones de PRESCOM en la interfaz', () => {
  it('pestaña Insumos: cambiar un precio recalcula todas las partidas; reemplazar y ajustar %', async () => {
    const t0 = await total();
    await id('pestana-insumos').click();
    expect(await id('fila-insumo-proyecto').count()).toBe(5);
    await id('buscar-insumo').fill('Cemento');
    await escribir(id('ip-precio').first(), '2');
    const t1 = await total();
    expect(t1).toBeGreaterThan(t0); // las dos partidas usan cemento
    await id('reemplazar-insumo').first().click();
    expect(await id('opcion-insumo').count()).toBe(1); // solo «Arena», del mismo rubro (Cemento IP-40 aún no está en el proyecto)
    await page.keyboard.press('Escape');
    await id('buscar-insumo').fill('');
    await id('pct-insumos').fill('10');
    await id('ajustar-insumos').click();
    expect(await total()).toBeCloseTo(t1 * 1.1, -1);
    await id('ni-descripcion').fill('Cemento IP-40'); await id('ni-unidad').fill('kg'); await id('ni-precio').fill('1,5');
    await id('crear-insumo-proyecto').click();
    await id('buscar-insumo').fill('Cemento');
    await id('reemplazar-insumo').first().click();
    await id('buscar-reemplazo').fill('IP-40');
    await id('opcion-insumo').first().click();
    expect(await id('aviso').innerText()).toContain('en 2 partida(s)');
    expect(errores).toEqual([]);
  });

  it('copiar y pegar partidas (Ctrl+C / Ctrl+V) y pegar filas de Excel', async () => {
    await id('fila-partida').first().locator('td').first().click();
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(300);
    expect(await id('aviso').innerText()).toContain('copiada');
    // Windows devuelve el texto con saltos \r\n: debe reconocerse igual como la partida copiada (con su análisis)
    await page.evaluate(async () => navigator.clipboard.writeText(`${(await navigator.clipboard.readText()).replace(/\n/g, '\r\n').replace(/(\d),(\d)/g, '$1.$2')}\r\n`));
    await id('nuevo-modulo').click();
    await page.keyboard.press('Control+v');
    await expect.poll(() => id('fila-partida').count()).toBe(1);
    expect(await id('ver-apu').count()).toBe(1); // conserva el análisis de precio unitario
    const enExcel = await page.evaluate(() => navigator.clipboard.readText());
    expect(enExcel).toContain('Hormigón simple\tm³\t10\t');
    await page.evaluate(() => navigator.clipboard.writeText('Ítem\tDescripción\tUnidad\tCantidad\tP.U.\n1\tExcavación manual\tm3\t25,5\t48,30\n2\tRelleno compactado\tm3\t20\t35'));
    await cmd('pegar');
    await expect.poll(() => id('fila-partida').count()).toBe(3);
    expect(await id('descripcion').nth(1).inputValue()).toBe('Excavación manual');
    expect(n(await id('total-modulo').innerText())).toBeCloseTo(n(await id('ver-apu').first().innerText()) * 10 + 25.5 * 48.3 + 20 * 35, 0);
    expect(errores).toEqual([]);
  });

  it('igualar precio unitario y cambiar el ítem de una partida', async () => {
    await id('ver-apu').first().click();
    await id('igualar-objetivo').fill('2500');
    await id('igualar-aplicar').click();
    expect(await id('pu-adoptado').innerText()).toBe('2.500,00');
    await id('igualar-objetivo').fill('100');
    await id('igualar-solo-mo').click();
    await id('igualar-aplicar').click();
    expect(await id('aviso').innerText()).toMatch(/materiales/); // con solo mano de obra no se puede bajar tanto
    await id('cerrar-dialogo').click();
    await id('fila-partida').first().locator('td').first().click();
    await cmd('cambiar-item');
    await id('buscar-item-cambio').fill('contrapiso');
    await id('opcion-item').first().click();
    expect(await id('descripcion').first().inputValue()).toBe('Contrapiso de cemento');
    expect(await id('cantidad').first().inputValue()).toBe('10,00');
    expect(errores).toEqual([]);
  });

  it('duplicar y unir módulos', async () => {
    const t = await total();
    await id('duplicar-modulo').click();
    expect(await total()).toBe(t * 2);
    await id('unir-modulo').click();
    await id('destino-unir').first().click();
    expect(await id('modulo-2').count()).toBe(0);
    expect(await id('fila-partida').count()).toBe(4);
    expect(errores).toEqual([]);
  });

  it('reportes nuevos, por módulo y varios juntos; firmas de los responsables', async () => {
    await id('pestana-config').click();
    await id('cfg-revisado').fill('Ing. Revisor'); await id('cfg-empresa').fill('Constructora Andina SRL');
    await id('pestana-reportes').click();
    const marco = page.frameLocator('#vista-reporte');
    for (const [r, titulo] of [['incidencia', 'POR INCIDENCIA'], ['insumos-item', 'INSUMOS POR ÍTEM'], ['flujo', 'FLUJO DE INVERSIONES'], ['personal', 'FLUJO DE PERSONAL'], ['materiales-mes', 'MATERIALES'], ['equipo-mes', 'EQUIPO'], ['graficos', 'GRÁFICOS']] as const) {
      await cmd(`rep-${r}`);
      await marco.locator('h1', { hasText: titulo }).waitFor();
      expect(await marco.locator('body').innerText()).not.toMatch(/No se pudo generar|NaN|undefined/);
    }
    await cmd('rep-resumen');
    expect(await marco.locator('body').innerText()).toContain('Ing. Revisor');
    expect(await marco.locator('.membrete').innerText()).toBe('Constructora Andina SRL');
    // por módulo
    await id('pestana-inicio').click(); await id('nuevo-modulo').click();
    console.log('MOD', await id('nombre-modulo-actual').innerText());
    await id('pestana-reportes').click(); await cmd('rep-B-1');
    await id('alcance-reporte').click(); await page.getByRole('option', { name: /Solo el módulo/ }).click();
    await page.waitForTimeout(300);
    expect(await marco.locator('table.t tbody tr').count()).toBe(1);
    // varios juntos
    await id('elegir-varios').click();
    await id('ver-lote').click();
    expect(await id('titulo-reporte').innerText()).toBe('5 reportes juntos');
    expect(await marco.locator('section.lote').count()).toBe(5);
    expect(errores).toEqual([]);
  });

  it('Configuración: «decimales de cálculo» redondea el costo de cada línea del análisis y se puede quitar', async () => {
    const t0 = await total();
    await id('pestana-config').click();
    await id('cfg-decimales-calculo').click(); await page.getByRole('option', { name: '0', exact: true }).click();
    const t1 = await total();
    expect(t1).not.toBe(t0); // 0,8 hr × 18 = 14,4 pasa a 14
    await id('cfg-decimales-calculo').click(); await page.getByRole('option', { name: 'Sin redondeo' }).click();
    expect(await total()).toBe(t0);
    expect(errores).toEqual([]);
  });
});
