import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron, type ElectronApplication, type Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';

/**
 * El programa de escritorio real (Electron): guardar en archivo .civix, cambios sin guardar, cerrar y volver a entrar,
 * abrir con doble clic, recientes y exportar. Requiere el binario de Electron y una pantalla (xvfb-run en Linux).
 */
const RAIZ = join(__dirname, '..', '..');
// En Windows no hace falta pantalla virtual; en Linux, xvfb-run. Con CIVIX_EXE se prueba el programa empaquetado (Civix.exe).
const EXE = process.env.CIVIX_EXE;
const hayElectron = (EXE ? existsSync(EXE) : existsSync(join(RAIZ, 'node_modules', 'electron', 'dist')) && existsSync(join(RAIZ, 'dist', 'index.html'))) && (process.platform === 'win32' || !!process.env.DISPLAY);

async function abrir(env: Record<string, string>, args: string[] = []): Promise<{ app: ElectronApplication; w: Page }> {
  const app = await _electron.launch({ ...(EXE ? { executablePath: EXE, args } : { args: [RAIZ, '--no-sandbox', ...args] }), cwd: RAIZ, env: { ...process.env, ...env } as Record<string, string>, timeout: 60_000 });
  const w = await app.firstWindow();
  await w.getByTestId('titulo-proyecto').waitFor();
  await w.waitForTimeout(600); // recuperación del último trabajo
  return { app, w };
}
async function nuevaPartida(w: Page, desc: string, precio: string) {
  await w.getByTestId('pestana-inicio').click();
  await w.getByTestId('boton-nueva-partida').click();
  await w.getByTestId('np-descripcion').fill(desc); await w.getByTestId('np-cantidad').fill('2'); await w.getByTestId('np-precio').fill(precio);
  await w.getByTestId('crear-partida').click();
}
const total = async (w: Page) => (await w.getByTestId('total-general').innerText()).replace(/\s+/g, ' ');

(hayElectron ? describe : describe.skip)('programa de escritorio: guardar y recuperar el trabajo', () => {
  const datos = mkdtempSync(join(tmpdir(), 'civix-datos-'));
  const carpeta = mkdtempSync(join(tmpdir(), 'civix-docs-'));
  const base = { CIVIX_DATOS: datos, CIVIX_GUARDAR_EN: carpeta };
  const archivo = join(carpeta, 'Edificio escolar.civix');

  it('guarda en un .civix, marca los cambios pendientes y deja copia de respaldo', async () => {
    const { app, w } = await abrir(base);
    await w.keyboard.press('Control+n');
    await w.getByTestId('nuevo-nombre').fill('Edificio escolar');
    await w.getByTestId('crear-proyecto').click();
    await nuevaPartida(w, 'Excavación', '50');
    expect(await w.getByTestId('titulo-archivo').innerText()).toContain('●');
    await w.keyboard.press('Control+s');
    await w.waitForTimeout(500);
    expect(existsSync(archivo)).toBe(true);
    expect(await w.getByTestId('titulo-archivo').innerText()).toBe('Edificio escolar.civix');
    const guardado = JSON.parse(readFileSync(archivo, 'utf8'));
    expect(guardado).toMatchObject({ civix: 1, formato: 'proyecto' });
    expect(guardado.proyecto.partidas[0].descripcion).toBe('Excavación');
    await nuevaPartida(w, 'Relleno', '30');
    await w.keyboard.press('Control+s'); // segunda vez: mismo archivo, sin preguntar
    await w.waitForTimeout(500);
    expect(JSON.parse(readFileSync(archivo, 'utf8')).proyecto.partidas).toHaveLength(2);
    expect(existsSync(`${archivo}.bak`)).toBe(true);
    await w.getByTestId('pestana-archivo').click();
    expect(await w.getByTestId('estado-guardado').innerText()).toContain('Todo guardado');
    expect(await w.getByTestId('reciente').count()).toBe(1);
    await app.close();
  });

  it('al salir sin guardar, lo recupera al volver a entrar', async () => {
    let { app, w } = await abrir({ ...base, CIVIX_CERRAR_RESPUESTA: '1' }); // «No guardar»
    expect(await w.getByTestId('titulo-proyecto').innerText()).toBe('Edificio escolar');
    expect(await w.getByTestId('aviso').innerText()).toContain('Se recuperó');
    await nuevaPartida(w, 'Contrapiso', '80');
    const t = await total(w);
    await app.close();
    ({ app, w } = await abrir({ ...base, CIVIX_CERRAR_RESPUESTA: '1' }));
    expect(await total(w)).toBe(t); // el avance sigue ahí
    expect(await w.getByTestId('titulo-archivo').innerText()).toContain('●'); // y se sabe que falta guardarlo en el archivo
    expect(JSON.parse(readFileSync(archivo, 'utf8')).proyecto.partidas).toHaveLength(2);
    await app.close();
  });

  it('al salir eligiendo «Guardar», escribe el archivo', async () => {
    const { app, w } = await abrir({ ...base, CIVIX_CERRAR_RESPUESTA: '0' });
    await app.close();
    expect(JSON.parse(readFileSync(archivo, 'utf8')).proyecto.partidas).toHaveLength(3);
    void w;
  });

  it('abre un .civix con doble clic (argumento) y desde Abrir; exporta Excel y la base', async () => {
    let { app, w } = await abrir({ ...base, CIVIX_DATOS: mkdtempSync(join(tmpdir(), 'civix-otro-')) }, [archivo]);
    await w.getByTestId('fila-partida').first().waitFor();
    expect(await w.getByTestId('fila-partida').count()).toBe(3);
    expect(await w.getByTestId('titulo-archivo').innerText()).toBe('Edificio escolar.civix');
    await w.getByTestId('pestana-archivo').click();
    await w.getByTestId('cmd-excel').click();
    await w.waitForTimeout(800);
    expect(readdirSync(carpeta)).toContain('Edificio escolar.xlsx');
    await app.close();
    ({ app, w } = await abrir({ ...base, CIVIX_ABRIR: archivo }));
    await w.getByTestId('pestana-archivo').click();
    await w.getByTestId('archivo-abrir').click();
    await w.getByTestId('fila-partida').first().waitFor();
    expect(await w.getByTestId('fila-partida').count()).toBe(3);
    await app.close();
  });

  it('copiar y pegar una partida con el portapapeles del sistema conserva su análisis; pega filas de Excel', async () => {
    const { app, w } = await abrir({ ...base, CIVIX_DATOS: mkdtempSync(join(tmpdir(), 'civix-pp-')), CIVIX_CERRAR_RESPUESTA: '1' });
    await nuevaPartida(w, 'Muro', '0');
    await w.getByTestId('fila-partida').first().locator('td').first().click();
    await w.getByTestId('cmd-ver-analisis').click();
    await w.getByTestId('armar-analisis').click();
    await w.getByTestId('buscar-insumo-apu').fill('Ladrillo');
    await w.getByTestId('nuevo-insumo').click();
    await w.getByTestId('nuevo-insumo-precio').fill('1,5');
    await w.getByTestId('rendimiento-nuevo').fill('36');
    await w.getByTestId('crear-insumo').click();
    await w.getByTestId('cerrar-dialogo').click();
    await w.getByTestId('fila-partida').first().locator('td').first().click();
    await w.keyboard.press('Control+c');
    await w.waitForTimeout(400);
    const copiado = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(copiado).toContain('Muro\t');
    await w.keyboard.press('Control+v');
    await expect.poll(() => w.getByTestId('fila-partida').count()).toBe(2);
    expect(await w.getByTestId('ver-apu').count()).toBe(2); // las dos con su análisis
    await app.evaluate(({ clipboard }) => clipboard.writeText('Excavación\tm3\t12,5\t45\r\nRelleno\tm3\t10\t30\r\n'));
    await w.getByTestId('cmd-pegar').click();
    await expect.poll(() => w.getByTestId('fila-partida').count()).toBe(4);
    await app.close();
  });
});
