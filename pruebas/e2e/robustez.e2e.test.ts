import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { preview } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Sonda de robustez: escribe valores inválidos en todos los campos de todas las pantallas y exige que la app no falle. */
const CHROMIUM = process.env.CIVIX_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const REF = process.env.CIVIX_REF_DIR;
let servidor: Awaited<ReturnType<typeof preview>>;
let navegador: Browser;

const BASE = {
  civix: 1,
  insumos: [
    { descripcion: 'Cemento portland IP-30', unidad: 'bolsa', rubro: 'material', precio: 62.5 },
    { descripcion: 'Albañil', unidad: 'hr', rubro: 'mano_de_obra', precio: 12.5 },
    { descripcion: 'Mezcladora', unidad: 'hr', rubro: 'equipo', precio: 30 },
  ],
  items: [{ descripcion: 'Hormigón simple', unidad: 'm3', insumos: [{ descripcion: 'Cemento portland IP-30', rendimiento: 7.5 }, { descripcion: 'Albañil', rendimiento: 6 }, { descripcion: 'Mezcladora', rendimiento: 0.5 }] }],
};
const PROYECTO = { civix: 1, tipo: 'proyecto', proyecto: { nombre: 'Sonda' }, modulos: [
  { nombre: 'Obras preliminares', partidas: [{ item: 'Hormigón simple', cantidad: 10 }, { descripcion: 'Letrero', unidad: 'pza', cantidad: 1, precioUnitario: 1500 }] },
  { nombre: 'Estructura', partidas: [{ item: 'Hormigón simple', computo: [{ descripcion: 'Zapatas', veces: 4, largo: 1, ancho: 1, alto: 0.5 }] }] },
] };
const MALOS = ['abc', '-5', '', '1e999', '9'.repeat(30), 'X+Y', '1,2,3', '  ', '😀'];

async function importar(page: Page, json: unknown) {
  await page.getByTestId('pestana-base').click();
  await page.getByTestId('cmd-pegar-ia').click();
  await page.getByTestId('json-ia').fill(typeof json === 'string' ? json : JSON.stringify(json));
  await page.getByTestId('importar-json').click();
  await page.getByTestId('resultado-importacion').waitFor();
  const abrir = page.getByTestId('abrir-proyecto-ia');
  if (await abrir.count()) await abrir.click(); else await page.getByTestId('cerrar-pegar').click();
}

async function sondear(page: Page, errores: string[], limite: number) {
  const sel = 'main input:not([type=file]):not([type=checkbox]):not([type=radio]), main textarea';
  const n = Math.min(await page.locator(sel).count(), limite);
  for (let k = 0; k < n; k++) {
    for (const v of MALOS) {
      const campo = page.locator(sel).nth(k);
      if (!(await campo.count()) || !(await campo.isVisible()) || !(await campo.isEditable())) break;
      await campo.fill(v).catch(() => {});
      await campo.press('Enter').catch(() => {});
      await campo.press('Tab').catch(() => {});
      if (errores.length) return;
    }
  }
}

beforeAll(async () => {
  servidor = await preview({ preview: { port: 4174, strictPort: true, host: '127.0.0.1' } });
  navegador = await chromium.launch({ ...(CHROMIUM ? { executablePath: CHROMIUM } : {}), args: ['--no-sandbox'] });
});
afterAll(async () => { await navegador?.close(); await new Promise((r) => servidor?.httpServer.close(() => r(null))); });

describe('robustez: ningún campo rompe la aplicación', () => {
  const casos: [string, () => [unknown, unknown]][] = [['proyecto de prueba', () => [BASE, PROYECTO]]];
  if (REF && existsSync(join(REF, 'tesis-base.json'))) casos.push(['tesis Tolomosa', () => [readFileSync(join(REF, 'tesis-base.json'), 'utf8'), readFileSync(join(REF, 'tesis-proyecto-gantt.json'), 'utf8')]]);
  for (const [nombre, datos] of casos) it(`todas las pantallas con ${nombre}`, async () => {
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
    await page.goto('http://127.0.0.1:4174/');
    await page.getByTestId('titulo-proyecto').waitFor();
    const [b, p] = datos();
    await importar(page, b);
    await importar(page, p);
    const pantallas = ['inicio', 'insumos', 'base', 'cronograma', 'config', 'reportes', 'archivo'];
    for (const t of pantallas) {
      await page.getByTestId(`pestana-${t}`).click();
      await sondear(page, errores, nombre.startsWith('tesis') ? 12 : 60);
      expect(errores, `pantalla ${t}`).toEqual([]);
      await page.getByTestId('titulo-proyecto').waitFor({ timeout: 2000 });
    }
    await ctx.close();
  }, 400_000);
});
