import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { preview } from 'vite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PRESCOM = process.env.CIVIX_PRESCOM_DIR;
const hayPrescom = !!PRESCOM && existsSync(join(PRESCOM, 'datos'));
const CHROMIUM = process.env.CIVIX_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

let servidor: Awaited<ReturnType<typeof preview>>;
let navegador: Browser;
let page: Page;
const URL_APP = 'http://127.0.0.1:4173/';

const PAQUETE = {
  civix: 1,
  insumos: [
    { descripcion: 'Cemento portland IP-30', unidad: 'bolsa', rubro: 'material', precio: '62,50' },
    { descripcion: 'Arena fina', unidad: 'm3', rubro: 'material', precio: 120 },
    { descripcion: 'Albañil', unidad: 'hr', rubro: 'mano_de_obra', precio: 12.5 },
    { descripcion: 'Mezcladora', unidad: 'hr', rubro: 'equipo', precio: 30 },
  ],
  items: [{ descripcion: 'Hormigón simple', unidad: 'm3', grupo: 'Hormigones', insumos: [
    { descripcion: 'Cemento portland IP-30', rendimiento: 7.5 }, { descripcion: 'Arena fina', rendimiento: '0,5' },
    { descripcion: 'Albañil', rendimiento: 6 }, { descripcion: 'Mezcladora', rendimiento: 0.5 }] }],
};

const pestana = (id: string) => page.getByTestId(`pestana-${id}`).click();
const cmd = (id: string) => page.getByTestId(`cmd-${id}`).click();
const totalGeneral = async () => (await page.getByTestId('total-general').innerText()).replace(/\s+/g, ' ');

async function pegarPaquete(json: unknown) {
  await pestana('base');
  await cmd('pegar-ia');
  await page.getByTestId('json-ia').fill(JSON.stringify(json));
  await page.getByTestId('importar-json').click();
  await page.getByTestId('resultado-importacion').waitFor();
}

beforeAll(async () => {
  servidor = await preview({ preview: { port: 4173, strictPort: true, host: '127.0.0.1' } });
  navegador = await chromium.launch({ ...(CHROMIUM ? { executablePath: CHROMIUM } : {}), args: ['--no-sandbox'], env: { ...process.env, LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' } as Record<string, string> });
});
afterAll(async () => { await navegador?.close(); await new Promise((r) => servidor?.httpServer.close(() => r(null))); });
beforeEach(async () => {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto(URL_APP);
  await page.getByTestId('titulo-proyecto').waitFor();
});

describe('interfaz de Civix', () => {
  it('abre con la cinta de opciones y un proyecto vacío', async () => {
    for (const t of ['archivo', 'inicio', 'base', 'reportes', 'config']) await page.getByTestId(`pestana-${t}`).waitFor();
    expect(await page.getByTestId('titulo-proyecto').innerText()).toBe('Proyecto nuevo');
    expect(await totalGeneral()).toContain('0,00');
    await pestana('base');
    await page.getByTestId('sin-bases').waitFor();
  });

  it('importa datos preparados con IA, arma un presupuesto y recalcula al editar', async () => {
    await pegarPaquete(PAQUETE);
    expect(await page.getByTestId('resultado-importacion').innerText()).toContain('4 insumos nuevos');
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('fila-item').first().click();
    const pu = await page.getByTestId('pu-base').innerText();
    expect(pu).toMatch(/^\d/);
    await page.getByTestId('cantidad-nueva').fill('10');
    await page.getByTestId('anadir-presupuesto').click();
    await pestana('inicio');
    expect(await page.getByTestId('fila-partida').count()).toBe(1);
    const total1 = await totalGeneral();
    await page.getByTestId('cantidad').first().fill('20');
    await page.getByTestId('cantidad').first().press('Enter');
    const total2 = await totalGeneral();
    expect(total2).not.toBe(total1);
    // el doble de cantidad = el doble del total (mismos precios unitarios redondeados a 2 decimales)
    const n = (s: string) => Number(s.replace(/[^\d,]/g, '').replace(',', '.'));
    expect(n(total2)).toBeCloseTo(n(total1) * 2, 1);
    // deshacer devuelve el total anterior
    await cmd('deshacer');
    expect(await totalGeneral()).toBe(total1);
  });

  it('muestra el análisis de precio unitario y permite editar un precio', async () => {
    await pegarPaquete(PAQUETE);
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('fila-item').first().click();
    await page.getByTestId('anadir-presupuesto').click();
    await pestana('inicio');
    const antes = await totalGeneral();
    await page.getByTestId('fila-partida').first().dblclick();
    await page.getByTestId('tabla-apu').waitFor();
    const adoptado = await page.getByTestId('pu-adoptado').innerText();
    expect(adoptado).toMatch(/^\d/);
    const precioCemento = page.getByTestId('tabla-apu').locator('tr', { hasText: 'Cemento' }).locator('input').nth(1);
    await precioCemento.fill('100');
    await precioCemento.press('Enter');
    await page.getByTestId('cerrar-apu').click();
    expect(await totalGeneral()).not.toBe(antes);
  });

  it('genera los formularios B-1…B-4 y descarga el Excel', async () => {
    await pegarPaquete(PAQUETE);
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('fila-item').first().click();
    await page.getByTestId('anadir-presupuesto').click();
    await pestana('reportes');
    const esperados: [string, string][] = [['B-1', 'FORMULARIO B-1'], ['B-2', 'FORMULARIO B-2'], ['B-3', 'FORMULARIO B-3'], ['B-4', 'FORMULARIO B-4']];
    for (const [id, texto] of esperados) {
      await cmd(`rep-${id}`);
      const marco = page.frameLocator('#vista-reporte');
      await marco.locator('h1', { hasText: texto }).waitFor();
    }
    await cmd('rep-B-1');
    expect(await page.frameLocator('#vista-reporte').locator('body').innerText()).toMatch(/Son: .*\d\d\/100 Bolivianos/);
    await cmd('rep-resumen');
    await page.frameLocator('#vista-reporte').locator('h1', { hasText: 'RESUMEN GENERAL' }).waitFor();
    const [descarga] = await Promise.all([page.waitForEvent('download'), cmd('excel2')]);
    const ruta = await descarga.path();
    expect(descarga.suggestedFilename()).toMatch(/\.xlsx$/);
    expect(readFileSync(ruta!).subarray(0, 2).toString()).toBe('PK');
  });

  it('B-4: los datos del equipo se convierten en costo horario', async () => {
    await pegarPaquete(PAQUETE);
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('fila-item').first().click();
    await page.getByTestId('anadir-presupuesto').click();
    await pestana('config');
    await page.getByTestId('tabla-equipos').waitFor();
    const valor = page.locator('[data-testid^="eq-"][data-testid$="-valorComercial"]').first();
    await valor.fill('20000');
    await valor.press('Enter');
    const comb = page.locator('[data-testid^="eq-"][data-testid$="-consumoCombustible"]').first();
    await comb.fill('2');
    await comb.press('Enter');
    await pestana('reportes');
    await cmd('rep-B-4');
    const cuerpo = await page.frameLocator('#vista-reporte').locator('table.t tbody tr').first().innerText();
    expect(cuerpo).toContain('Mezcladora');
    // depreciación 16000/10000 = 1,60 + interés 12000*12%/2000 = 0,72 → básico 2,32 ; combustible 2 l × 3,72 = 7,44
    expect(cuerpo).toMatch(/2,32/);
    expect(cuerpo).toMatch(/7,44/);
  });

  it('el asistente interpreta frases, muestra la vista previa y aplica', async () => {
    await pegarPaquete(PAQUETE);
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('fila-item').first().click();
    await page.getByTestId('anadir-presupuesto').click();
    await pestana('inicio');
    const antes = await totalGeneral();
    await cmd('asistente');
    await page.getByTestId('orden-texto').fill('sube 10% el cemento\ncambia las cargas sociales a 71,18%\nhaz magia');
    await page.getByTestId('interpretar').click();
    const vista = await page.getByTestId('vista-previa-ordenes').innerText();
    expect(vista).toMatch(/Precios subidos 10 %/);
    expect(vista).toMatch(/55 % → 71.18 %/);
    expect(vista).toMatch(/No entendí: «haz magia»/);
    expect(await totalGeneral()).toBe(antes); // nada cambia hasta confirmar
    await page.getByTestId('aplicar-ordenes').click();
    expect(await totalGeneral()).not.toBe(antes);
    await cmd('deshacer');
    expect(await totalGeneral()).toBe(antes);
    // una orden de reporte lleva a la pestaña de reportes
    await page.getByTestId('orden-texto').fill('genera el B-2');
    await page.getByTestId('interpretar').click();
    await page.getByTestId('aplicar-ordenes').click();
    await page.frameLocator('#vista-reporte').locator('h1', { hasText: 'FORMULARIO B-2' }).first().waitFor();
  });

  it('acepta órdenes en JSON redactadas por otra IA y rechaza JSON roto', async () => {
    await cmd('asistente');
    await page.getByTestId('orden-texto').fill('[{"accion":"crear_modulo","nombre":"obra fina"}]');
    await page.getByTestId('interpretar').click();
    expect(await page.getByTestId('vista-previa-ordenes').innerText()).toContain('Módulo "OBRA FINA" creado');
    await page.getByTestId('aplicar-ordenes').click();
    await page.getByTestId('modulo-2').waitFor();
    await page.getByTestId('orden-texto').fill('[{"accion": ');
    await page.getByTestId('interpretar').click();
    expect(await page.getByTestId('vista-previa-ordenes').innerText()).toMatch(/JSON no válido/);
  });

  it('rechaza un paquete de IA con errores sin guardar nada', async () => {
    await pegarPaquete({ civix: 1, insumos: [{ descripcion: 'X', unidad: 'u', rubro: 'cosa', precio: 1 }] });
    expect(await page.getByTestId('resultado-importacion').innerText()).toMatch(/rubro no válido/);
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('sin-bases').waitFor();
  });

  it('configuración: cambiar un porcentaje de la plantilla cambia el precio', async () => {
    await pegarPaquete(PAQUETE);
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('fila-item').first().click();
    await page.getByTestId('anadir-presupuesto').click();
    await pestana('inicio');
    const antes = await totalGeneral();
    await pestana('config');
    const campo = page.getByTestId('pct-F');
    await campo.fill('71,18');
    await campo.blur();
    await pestana('inicio');
    expect(await totalGeneral()).not.toBe(antes);
  });

  it('guarda el proyecto y lo vuelve a abrir', async () => {
    await pegarPaquete(PAQUETE);
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('fila-item').first().click();
    await page.getByTestId('anadir-presupuesto').click();
    await pestana('config');
    await page.getByTestId('cfg-nombre').fill('Mi obra de prueba');
    await pestana('inicio');
    const total = await totalGeneral();
    await pestana('archivo');
    const [descarga] = await Promise.all([page.waitForEvent('download'), cmd('guardar')]);
    expect(descarga.suggestedFilename()).toBe('Mi obra de prueba.civix');
    const ruta = (await descarga.path())!;
    await cmd('nuevo');
    await page.getByTestId('nuevo-nombre').fill('Otro proyecto');
    await page.getByTestId('crear-proyecto').click();
    expect(await page.getByTestId('titulo-proyecto').innerText()).toBe('Otro proyecto');
    expect(await totalGeneral()).toContain('0,00');
    await pestana('archivo');
    const [selector] = await Promise.all([page.waitForEvent('filechooser'), cmd('abrir')]);
    await selector.setFiles(ruta);
    await page.getByTestId('fila-partida').first().waitFor();
    expect(await totalGeneral()).toBe(total);
    expect(await page.getByTestId('titulo-proyecto').innerText()).toBe('Mi obra de prueba');
  });
});

const REF = process.env.CIVIX_REF_DIR;
const hayRef = !!REF && existsSync(join(REF, 'proyecto.json'));

async function pegarYAnalizar(json: string) {
  await page.getByTestId('json-ia').fill(json);
  await page.getByTestId('importar-json').click();
  await page.getByTestId('resultado-importacion').waitFor();
}

const ENTREGA = process.env.CIVIX_ENTREGA ?? '/home/user/civix-entrega';
const hayEntrega = existsSync(join(ENTREGA, '1-proyecto-tolomosa-grande.json'));

describe('uso real: los archivos entregados y los botones equivocados', () => {
  it('muestra la versión y un proyecto vacío invita a importar', async () => {
    expect(await page.getByTestId('version').innerText()).toMatch(/^v\d+\.\d+\.\d+/);
    await page.getByTestId('bienvenida').waitFor();
  });

  it('«Nuevo» pregunta los datos y crea el proyecto', async () => {
    await pestana('archivo');
    await cmd('nuevo');
    await page.getByTestId('nuevo-nombre').fill('Colector Villa Nueva');
    await page.getByTestId('nuevo-lugar').fill('Tarija');
    await page.getByTestId('crear-proyecto').click();
    expect(await page.getByTestId('titulo-proyecto').innerText()).toBe('Colector Villa Nueva');
    await page.getByTestId('bienvenida').waitFor();
  });

  it('un paquete vacío no se da por bueno', async () => {
    await pestana('base');
    await cmd('pegar-ia');
    await pegarYAnalizar(JSON.stringify({ civix: 1, insumos: [] }));
    expect(await page.getByTestId('resultado-importacion').innerText()).toMatch(/vacío/);
  });

  it('un JSON de Civix abierto con «Abrir .civbd» se encamina solo a «Importar de IA»', async () => {
    await pestana('base');
    const [selector] = await Promise.all([page.waitForEvent('filechooser'), cmd('abrir-base')]);
    await selector.setFiles({ name: 'catalogo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(PAQUETE)) });
    await page.getByTestId('resultado-importacion').waitFor();
    expect(await page.getByTestId('resultado-importacion').innerText()).toContain('4 insumos nuevos');
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('fila-item').first().waitFor();
  });

  it('«Elegir archivo .json…» carga un archivo completo', async () => {
    await pestana('base');
    await cmd('pegar-ia');
    const [selector] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('elegir-archivo-ia').click()]);
    await selector.setFiles({ name: 'datos.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(PAQUETE)) });
    await page.getByTestId('resultado-importacion').waitFor();
    expect(await page.getByTestId('resultado-importacion').innerText()).toContain('1 ítems nuevos');
  });

  (hayEntrega ? it : it.skip)('el proyecto de la tesis entregado se carga desde el archivo y da el total esperado', async () => {
    await page.getByTestId('bienvenida-importar').click();
    const [selector] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('elegir-archivo-ia').click()]);
    await selector.setFiles(join(ENTREGA, '1-proyecto-tolomosa-grande.json'));
    await page.getByTestId('abrir-proyecto-ia').waitFor();
    expect(await page.getByTestId('resultado-importacion').innerText()).toContain('189 partidas en 21 módulos');
    await page.getByTestId('abrir-proyecto-ia').click();
    expect(await page.getByTestId('titulo-proyecto').innerText()).toContain('Tolomosa Grande');
    expect(await totalGeneral()).toContain('4.558.411,45');
  });

  (hayEntrega ? it : it.skip)('el catálogo entregado se importa y sus análisis se calculan', async () => {
    await pestana('base');
    await cmd('pegar-ia');
    const [selector] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('elegir-archivo-ia').click()]);
    await selector.setFiles(join(ENTREGA, '2-catalogo-costos.json'));
    await page.getByTestId('resultado-importacion').waitFor();
    expect(await page.getByTestId('resultado-importacion').innerText()).toMatch(/\d+ insumos nuevos.*1\d\d ítems nuevos/);
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('buscar').fill('Replanteo y Trazado de Superficie');
    await page.getByTestId('fila-item').first().click();
    expect(await page.getByTestId('pu-base').innerText()).toMatch(/\d/);
  });
});

describe('proyecto con precios directos en la interfaz', () => {
  it('los formularios dicen qué datos faltan y el plazo se puede escribir a mano', async () => {
    await pestana('base');
    await cmd('pegar-ia');
    await pegarYAnalizar(JSON.stringify({ civix: 1, tipo: 'proyecto', proyecto: { nombre: 'Directo', plantilla: 'SABS' },
      modulos: [{ nombre: 'Obras', partidas: [{ descripcion: 'Excavación', unidad: 'm3', cantidad: 100, precioUnitario: 25 }, { descripcion: 'Relleno', unidad: 'm3', cantidad: 50, precioUnitario: 20 }] }] }));
    await page.getByTestId('abrir-proyecto-ia').click();
    await pestana('reportes');
    await cmd('rep-B-2');
    expect(await page.getByTestId('diagnostico').innerText()).toMatch(/2 de 2 partidas tienen precio unitario directo/);
    expect(await page.frameLocator('#vista-reporte').locator('body').innerText()).toContain('no tienen análisis de insumos');
    await cmd('rep-B-3');
    expect(await page.frameLocator('#vista-reporte').locator('body').innerText()).toContain('no tiene insumos');
    await pestana('cronograma');
    expect(await page.getByTestId('aviso-plazos').innerText()).toMatch(/2 actividades sin plazo/);
    const dias = page.getByTestId('duracion').first();
    await dias.fill('10');
    await dias.press('Enter');
    expect(await page.getByTestId('aviso-plazos').innerText()).toMatch(/1 actividades sin plazo/);
    await cmd('ver-a8');
    expect(await page.frameLocator('#vista-reporte').locator('body').innerText()).toContain('Plazos incompletos');
  });
});

describe('importar de IA: proyecto y actualización de precios', () => {
  it('un proyecto en JSON se revisa antes de abrirse y calcula sus totales', async () => {
    await pestana('base');
    await cmd('pegar-ia');
    await pegarYAnalizar(JSON.stringify({ civix: 1, tipo: 'proyecto', proyecto: { nombre: 'Obra de prueba', plantilla: 'SABS' },
      modulos: [{ nombre: 'Preliminares', partidas: [{ descripcion: 'Letrero', unidad: 'pza', cantidad: 2, precioUnitario: 1500.5 },
        { descripcion: 'Replanteo', unidad: 'm2', computo: [{ descripcion: 'Planta', veces: 1, largo: 10, ancho: 5 }], precioUnitario: 4.39, especificacion: 'Replanteo con teodolito.' }] }] }));
    expect(await page.getByTestId('resultado-importacion').innerText()).toContain('2 partidas en 1 módulos');
    expect(await page.getByTestId('titulo-proyecto').innerText()).toBe('Proyecto nuevo'); // todavía no se aplicó
    await page.getByTestId('abrir-proyecto-ia').click();
    await pestana('inicio');
    expect(await page.getByTestId('titulo-proyecto').innerText()).toBe('Obra de prueba');
    expect(await totalGeneral()).toContain('3.220,50'); // 2 × 1.500,50 + 50 × 4,39 = 3.001,00 + 219,50
    await pestana('reportes');
    await cmd('rep-computos');
    await page.frameLocator('#vista-reporte').locator('h1', { hasText: 'CÓMPUTOS MÉTRICOS' }).waitFor();
    await cmd('rep-esp');
    expect(await page.frameLocator('#vista-reporte').locator('body').innerText()).toContain('Replanteo con teodolito.');
  });

  it('actualizar precios: exporta la lista, la IA responde, se revisa y se aplica solo lo marcado', async () => {
    await pegarPaquete(PAQUETE);
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('fila-item').first().click();
    await page.getByTestId('cantidad-nueva').fill('10');
    await page.getByTestId('anadir-presupuesto').click();
    await pestana('inicio');
    const antes = await totalGeneral();
    await cmd('actualizar-precios');
    await page.getByTestId('copiar-insumos').click();
    const exportada = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as { tipo: string; insumos: { descripcion: string; unidad: string; rubro: string; precioActual: number }[] };
    expect(exportada.tipo).toBe('insumos');
    expect(exportada.insumos.map((i) => i.descripcion)).toContain('Cemento portland IP-30');
    // respuesta de la IA: mismos nombres y unidades, cemento +20 %, albañil +10 %, el resto sin cambio
    const nuevos = exportada.insumos.map((i) => ({ descripcion: i.descripcion, unidad: i.unidad, rubro: i.rubro,
      precio: i.descripcion.startsWith('Cemento') ? i.precioActual * 1.2 : i.descripcion === 'Albañil' ? i.precioActual * 1.1 : i.precioActual }));
    await pegarYAnalizar(JSON.stringify({ civix: 1, tipo: 'precios', moneda: 'Bs', fecha: '2026-03-15', precios: nuevos }));
    const tabla = page.getByTestId('tabla-cambios');
    expect(await tabla.locator('tbody tr').count()).toBe(2);
    expect(await tabla.innerText()).toMatch(/\+20,0 %/);
    expect(await totalGeneral()).toBe(antes); // nada cambia hasta confirmar
    await tabla.locator('tbody tr', { hasText: 'Albañil' }).getByRole('checkbox').uncheck(); // el usuario descarta el del albañil
    await page.getByTestId('aplicar-precios').click();
    const despues = await totalGeneral();
    expect(despues).not.toBe(antes);
    await pestana('base');
    await page.getByTestId('ver-insumos').click();
    expect(await page.locator('tr', { hasText: 'Albañil' }).locator('input').inputValue()).toBe('12,500'); // sigue igual en la base
  });
});

(hayRef ? describe : describe.skip)('proyecto de referencia (Tolomosa Grande) en la interfaz', () => {
  it('se importa desde el JSON y el total coincide con el documento (salvo el defecto del M21)', async () => {
    await pestana('base');
    await cmd('pegar-ia');
    await pegarYAnalizar(readFileSync(join(REF!, 'proyecto.json'), 'utf8'));
    expect(await page.getByTestId('resultado-importacion').innerText()).toContain('189 partidas en 21 módulos');
    await page.getByTestId('abrir-proyecto-ia').click();
    await pestana('inicio');
    expect(await totalGeneral()).toContain('4.558.411,45'); // documento 4.555.157,44 + 3.254,00 que el documento no suma en M21
    await page.getByTestId('modulo-2').click();
    expect(await page.getByTestId('total-modulo').innerText()).toContain('1.930.949,00'); // M02 del documento
    await pestana('reportes');
    await cmd('rep-B-1');
    const b1 = await page.frameLocator('#vista-reporte').locator('body').innerText();
    expect(b1).toContain('1.930.949,00');
    expect(b1).toMatch(/Son: Cuatro millones quinientos cincuenta y ocho mil cuatrocientos once 45\/100 Bolivianos/);
  });
});

describe('cronograma', () => {
  it('muestra el Gantt, recalcula al cambiar la cuadrilla y genera el A-8', async () => {
    await pegarPaquete(PAQUETE);
    await page.getByTestId('cerrar-pegar').click();
    await page.getByTestId('fila-item').first().click();
    await page.getByTestId('cantidad-nueva').fill('400');
    await page.getByTestId('anadir-presupuesto').click();
    await pestana('cronograma');
    await page.getByTestId('fila-actividad').first().waitFor();
    const dias = async () => Number(await page.getByTestId('fila-actividad').first().locator('td').nth(2).locator('input').inputValue());
    const antes = await dias();
    expect(antes).toBeGreaterThan(5);
    expect(await page.locator('[data-critica="true"]').count()).toBe(1);
    const cuad = page.getByTestId('cuadrilla').first();
    await cuad.fill('2');
    await cuad.press('Enter');
    expect(await dias()).toBe(Math.round(antes / 2));
    await cmd('ver-a8');
    await page.frameLocator('#vista-reporte').locator('h1', { hasText: 'FORMULARIO A-8' }).waitFor();
    expect(await page.frameLocator('#vista-reporte').locator('.a8-barra').count()).toBe(1);
  });
});

(hayPrescom ? describe : describe.skip)('con el material original de PRESCOM', () => {
  it('importa las bases de la carpeta «datos» y calcula un ítem', async () => {
    await pestana('archivo');
    const [selector] = await Promise.all([page.waitForEvent('filechooser'), cmd('bases-prescom')]);
    await selector.setFiles(join(PRESCOM!, 'datos'));
    const aviso = page.getByTestId('aviso').filter({ hasText: /base\(s\) importada\(s\) de PRESCOM/ });
    await aviso.waitFor({ timeout: 30_000 });
    expect(await aviso.innerText()).toBe('12 base(s) importada(s) de PRESCOM'); // sin problemas de lectura
    await pestana('base');
    await page.getByTestId('fila-item').first().waitFor();
    await page.getByTestId('fila-item').first().click();
    expect(await page.getByTestId('pu-base').innerText()).toMatch(/\d/);
    await page.getByTestId('anadir-presupuesto').click();
    await pestana('inicio');
    expect(await page.getByTestId('fila-partida').count()).toBe(1);
  });

  it('abre el proyecto VIVIENDA SANCHEZ de PRESCOM con el mismo precio unitario', async () => {
    await pestana('archivo');
    const [selector] = await Promise.all([page.waitForEvent('filechooser'), cmd('abrir-prescom')]);
    await selector.setFiles(join(PRESCOM!, 'proyectos', 'VIVIENDA SANCHEZ.DDP'));
    await page.getByTestId('fila-partida').first().waitFor();
    expect(await page.getByTestId('titulo-proyecto').innerText()).toBe('VIVIENDA SANCHEZ');
    expect(await page.getByTestId('fila-partida').count()).toBe(32); // módulo OBRA GRUESA
    await page.getByTestId('modulo-1').click();
    await page.getByTestId('fila-partida').first().dblclick();
    expect(await page.getByTestId('pu-adoptado').innerText()).toBe('100,87'); // Instalación de faenas
    await page.getByTestId('cerrar-apu').click();
    await pestana('cronograma');
    await page.getByTestId('fila-actividad').first().waitFor();
    expect(await page.getByTestId('fila-actividad').first().locator('td').nth(5).innerText()).toBe('26/03/2007'); // inicio de la obra
    expect(await page.getByTestId('fila-actividad').first().locator('td').nth(6).innerText()).toBe('21/04/2007'); // fin de Instalación de faenas
  });
});
