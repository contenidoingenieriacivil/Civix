import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { preview } from 'vite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Edición en la interfaz: partidas, análisis, cómputos, especificaciones, módulos, búsqueda, bases y configuración. */
const CHROMIUM = process.env.CIVIX_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let servidor: Awaited<ReturnType<typeof preview>>;
let navegador: Browser;
let page: Page;
const errores: string[] = [];

const id = (t: string) => page.getByTestId(t);
const cmd = (t: string) => id(`cmd-${t}`).click();
const n = (s: string) => Number(s.replace(/[^\d,-]/g, '').replace(',', '.'));
const total = async () => n(await id('total-general').innerText());
const escribir = async (campo: ReturnType<typeof id>, v: string) => { await campo.click(); await campo.fill(v); await campo.press('Enter'); };

async function nuevaPartida(desc: string, unidad: string, cant: string, precio: string) {
  await id('boton-nueva-partida').click();
  await id('np-descripcion').fill(desc); await id('np-unidad').fill(unidad); await id('np-cantidad').fill(cant); await id('np-precio').fill(precio);
  await id('crear-partida').click();
  await id('dialogo-nueva-partida').waitFor({ state: 'detached' });
}

beforeAll(async () => {
  servidor = await preview({ preview: { port: 4175, strictPort: true, host: '127.0.0.1' } });
  navegador = await chromium.launch({ ...(CHROMIUM ? { executablePath: CHROMIUM } : {}), args: ['--no-sandbox'] });
});
afterAll(async () => { await navegador?.close(); await new Promise((r) => servidor?.httpServer.close(() => r(null))); });
beforeEach(async () => {
  errores.length = 0;
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('dialog', (d) => void d.accept());
  await page.goto('http://127.0.0.1:4175/');
  await id('titulo-proyecto').waitFor();
});

describe('edición del presupuesto en la interfaz', () => {
  it('nueva partida, edición en la tabla, duplicar, subir, eliminar con Supr y deshacer', async () => {
    await nuevaPartida('Letrero de obra', 'pza', '1', '1.500,50');
    await nuevaPartida('Limpieza final', 'glb', '2', '300');
    expect(await id('fila-partida').count()).toBe(2);
    expect(await total()).toBe(2100.5);
    await escribir(id('descripcion').first(), 'Letrero de obra 3x2 m');
    expect(await id('descripcion').first().inputValue()).toBe('Letrero de obra 3x2 m');
    await escribir(id('descripcion').first(), '   '); // vacío: se conserva
    expect(await id('descripcion').first().inputValue()).toBe('Letrero de obra 3x2 m');
    await escribir(id('precio-unitario').nth(1), '350');
    expect(await total()).toBe(2200.5);
    await escribir(id('cantidad').first(), 'muchos'); // texto: se rechaza y se avisa
    expect(await id('aviso').innerText()).toContain('no es un número');
    expect(await total()).toBe(2200.5);
    // duplicar y bajar
    await id('fila-partida').first().locator('td').first().click();
    await cmd('duplicar-partida');
    expect(await id('fila-partida').count()).toBe(3);
    expect(await total()).toBe(3701);
    await cmd('bajar-partida');
    await cmd('bajar-partida');
    expect(await id('descripcion').nth(2).inputValue()).toBe('Letrero de obra 3x2 m');
    // Supr elimina la seleccionada y Ctrl+Z la recupera
    await id('fila-partida').nth(2).locator('td').first().click();
    await page.keyboard.press('Delete');
    expect(await id('fila-partida').count()).toBe(2);
    await page.keyboard.press('Control+z');
    expect(await id('fila-partida').count()).toBe(3);
    expect(errores).toEqual([]);
  });

  it('arma un análisis de precio unitario desde cero', async () => {
    await nuevaPartida('Muro de ladrillo', 'm2', '10', '0');
    await id('fila-partida').first().locator('td').first().click();
    await cmd('ver-analisis');
    await id('armar-analisis').click();
    await id('buscar-insumo-apu').fill('Ladrillo 6 huecos');
    await id('nuevo-insumo').click();
    await id('nuevo-insumo-unidad').fill('pza'); await id('nuevo-insumo-precio').fill('1,20');
    await id('rendimiento-nuevo').fill('36');
    await id('crear-insumo').click();
    await id('buscar-insumo-apu').fill('Albañil');
    await id('nuevo-insumo').click();
    await id('nuevo-insumo-unidad').fill('hr'); await id('nuevo-insumo-precio').fill('18');
    await page.locator('[data-testid=dialogo-apu] [role=combobox]').click();
    await page.getByRole('option', { name: 'Mano de obra' }).click();
    await id('rendimiento-nuevo').fill('1,5');
    await id('crear-insumo').click();
    expect(await id('linea-apu').count()).toBe(2);
    const pu = n(await id('pu-adoptado').innerText());
    expect(pu).toBeGreaterThan(43.2 + 27); // materiales + mano de obra con cargas, IVA, etc.
    // el mismo insumo existente se sugiere y suma rendimiento
    await id('buscar-insumo-apu').fill('ladrillo');
    await id('rendimiento-nuevo').fill('2');
    await id('sugerencia-insumo').first().click();
    expect(await id('linea-apu').count()).toBe(2);
    await escribir(id('apu-rendimiento').first(), '-3'); // negativo: rechazado
    expect(await id('apu-rendimiento').first().inputValue()).toBe('38,0000');
    await id('quitar-linea').first().click();
    expect(await id('linea-apu').count()).toBe(1);
    await id('cerrar-dialogo').click();
    expect(n(await id('ver-apu').first().innerText())).toBeGreaterThan(0);
    expect(errores).toEqual([]);
  });

  it('cómputo métrico y especificación de una partida', async () => {
    await nuevaPartida('Excavación', 'm3', '1', '50');
    await id('fila-partida').first().locator('td').first().click();
    await cmd('ver-computo');
    await id('anadir-linea-computo').click(); // la primera toma la cantidad actual
    await escribir(id('comp-largo').first(), '12');
    await escribir(id('comp-ancho').first(), '0,8');
    await escribir(id('comp-alto').first(), '1,5');
    await id('copiar-linea-computo').click();
    await escribir(id('comp-veces').nth(1), '2');
    await escribir(id('comp-cantidad').nth(1), '-1'); // cantidad directa negativa (descuento)
    expect(await id('total-computo').innerText()).toContain('13,40');
    await escribir(id('comp-alto').first(), ''); // borrar una dimensión
    expect(await id('total-computo').innerText()).toContain('8,60');
    await id('cerrar-dialogo').click();
    expect(await id('cantidad-computo').innerText()).toContain('8,60');
    await cmd('ver-especificacion');
    await id('texto-especificacion').fill('1. DEFINICIÓN\nExcavación manual en terreno semiduro.');
    await id('guardar-especificacion').click();
    await id('pestana-reportes').click();
    await cmd('rep-esp');
    await page.frameLocator('#vista-reporte').getByText('Excavación manual en terreno semiduro.').waitFor();
    expect(errores).toEqual([]);
  });

  it('módulos: añadir, renombrar, mover, pasar una partida y eliminar', async () => {
    await nuevaPartida('Partida A', 'm', '1', '10');
    await id('nuevo-modulo').click();
    await id('renombrar-modulo').click();
    await id('nombre-modulo').fill('estructura');
    await id('aceptar-nombre').click();
    expect(await id('nombre-modulo-actual').innerText()).toBe('ESTRUCTURA');
    await nuevaPartida('Partida B', 'm', '1', '20');
    await id('modulo-izquierda').click();
    expect(await id('modulo-1').innerText()).toContain('ESTRUCTURA');
    await id('fila-partida').first().locator('td').first().click();
    await cmd('mover-partida');
    await id('destino-modulo').nth(1).click();
    expect(await id('nombre-modulo-actual').innerText()).toBe('MÓDULO 1');
    expect(await id('fila-partida').count()).toBe(2);
    await id('modulo-1').click();
    await id('eliminar-modulo').click(); // vacío
    expect(await id('modulo-2').count()).toBe(0);
    expect(await total()).toBe(30);
    expect(errores).toEqual([]);
  });

  it('buscar una partida con Ctrl+F lleva a su módulo', async () => {
    await nuevaPartida('Replanteo', 'm2', '1', '5');
    await id('nuevo-modulo').click();
    await nuevaPartida('Pintura látex', 'm2', '3', '25');
    await id('modulo-1').click();
    await id('grilla-presupuesto').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+f');
    await id('texto-buscar').fill('latex');
    await id('resultado-busqueda').first().click();
    expect(await id('nombre-modulo-actual').innerText()).toBe('MÓDULO 2');
    expect(await page.locator('tr.sel [data-testid=descripcion]').inputValue()).toBe('Pintura látex');
  });

  it('bases: guardar un análisis del proyecto, reutilizarlo, editar insumos y eliminar', async () => {
    await nuevaPartida('Contrapiso', 'm2', '4', '0');
    await id('fila-partida').first().locator('td').first().click();
    await cmd('ver-analisis');
    await id('armar-analisis').click();
    await id('buscar-insumo-apu').fill('Cemento');
    await id('nuevo-insumo').click();
    await id('nuevo-insumo-unidad').fill('kg'); await id('nuevo-insumo-precio').fill('1,1');
    await id('rendimiento-nuevo').fill('12');
    await id('crear-insumo').click();
    await id('cerrar-dialogo').click();
    await cmd('guardar-en-base');
    await id('confirmar-guardar-base').click();
    await id('pestana-base').click();
    await id('fila-item').first().click();
    expect(await id('pu-base').innerText()).toMatch(/\d/);
    await id('cantidad-nueva').fill('-2');
    await id('anadir-presupuesto').click();
    expect(await id('aviso').innerText()).toContain('cantidad válida');
    await id('cantidad-nueva').fill('3');
    await id('fila-item').first().dblclick();
    await id('ver-insumos').click();
    await escribir(id('insumo-precio').first(), '2');
    await id('ver-items').click();
    await id('fila-item').first().click();
    await id('eliminar-item').click();
    expect(await id('fila-item').count()).toBe(0);
    await id('pestana-inicio').click();
    expect(await id('fila-partida').count()).toBe(2);
    expect(errores).toEqual([]);
  });

  it('configuración: rechaza fórmulas inválidas o circulares y acepta las válidas', async () => {
    await nuevaPartida('Algo', 'm', '1', '10');
    await id('pestana-config').click();
    const f = id('formula').first();
    const antes = await f.inputValue();
    await escribir(f, 'X+1');
    expect(await id('aviso').innerText()).toContain('no válida');
    expect(await f.inputValue()).toBe(antes);
    // F = 55 % de E → ponerle G (que depende de F) es circular
    const filaF = page.locator('[data-testid=tabla-parametros] tr', { hasText: /^F/ }).first();
    await escribir(filaF.getByTestId('formula'), 'G');
    expect(await id('aviso').innerText()).toMatch(/circular/i);
    await escribir(id('pct-F'), '60');
    expect(await id('pct-F').inputValue()).toBe('60,00');
    await id('cfg-fecha').fill('2027-03-01');
    await id('pestana-cronograma').click();
    expect(await id('fecha-inicio').inputValue()).toBe('2027-03-01');
    expect(errores).toEqual([]);
  });
});
