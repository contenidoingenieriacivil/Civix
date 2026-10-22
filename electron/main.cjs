// Contenedor de escritorio de Civix. La app es 100 % local: sirve los archivos de dist/ con un
// protocolo propio (los módulos ES no cargan desde file://) y no abre ninguna conexión de red.
const { app, BrowserWindow, Menu, protocol, net, shell, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{ scheme: 'civix', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
// Pruebas automáticas: carpeta de datos propia y respuestas fijas a los diálogos.
if (process.env.CIVIX_DATOS) app.setPath('userData', process.env.CIVIX_DATOS);

let ventana = null;
let modificado = false;
let nombreProyecto = '';
let cerrando = false;
const archivoPendiente = [];

/** Archivos .civix / .civbd pasados al abrir (doble clic en el Explorador de Windows). */
const archivosDeArgs = (argv) => argv.slice(1).filter((a) => /\.(civix|civbd|json|ddp)$/i.test(a) && fs.existsSync(a));
function abrirEnVentana(ruta) {
  if (ventana && !ventana.webContents.isLoading()) ventana.webContents.send('civix:abrir-ruta', ruta);
  else archivoPendiente.push(ruta);
}
if (!process.env.CIVIX_DATOS && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv) => {
  for (const r of archivosDeArgs(argv)) abrirEnVentana(r);
  if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); }
});

const rutaRecientes = () => path.join(app.getPath('userData'), 'recientes.json');
function leerRecientes() { try { return JSON.parse(fs.readFileSync(rutaRecientes(), 'utf8')).filter((r) => typeof r === 'string'); } catch { return []; } }
function anotarReciente(ruta) {
  if (!/\.civix$/i.test(ruta)) return;
  const l = [ruta, ...leerRecientes().filter((r) => r.toLowerCase() !== ruta.toLowerCase())].slice(0, 12);
  try { fs.mkdirSync(path.dirname(rutaRecientes()), { recursive: true }); fs.writeFileSync(rutaRecientes(), JSON.stringify(l)); } catch { /* sin recientes */ }
}

function crearVentana() {
  const win = ventana = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640, title: 'Civix', backgroundColor: '#f3f4f6',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('civix://') || url === 'about:blank') return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  void win.loadURL('civix://app/index.html');
  win.webContents.on('did-finish-load', () => { for (const r of archivoPendiente.splice(0)) win.webContents.send('civix:abrir-ruta', r); });
  // Al cerrar con cambios sin guardar: Guardar / No guardar / Cancelar.
  let volcado = false;
  win.on('close', (e) => {
    // 1) antes de cerrar, la interfaz termina de escribir la recuperación automática
    if (!volcado) {
      e.preventDefault();
      let listo = false;
      const seguir = () => { if (listo) return; listo = true; volcado = true; win.close(); };
      ipcMain.once('civix:volcado', seguir);
      setTimeout(seguir, 3000);
      win.webContents.send('civix:volcar');
      return;
    }
    // 2) si hay cambios sin guardar en el archivo, preguntar
    if (cerrando || !modificado) return;
    e.preventDefault();
    const fija = process.env.CIVIX_CERRAR_RESPUESTA;
    const r = fija !== undefined ? Number(fija) : dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Guardar', 'No guardar', 'Cancelar'], defaultId: 0, cancelId: 2, title: 'Civix',
      message: `¿Guardar los cambios de «${nombreProyecto || 'Proyecto'}» antes de salir?`,
      detail: 'Si elige «No guardar», Civix igual recordará su último trabajo y lo abrirá la próxima vez.',
    });
    if (r === 2) { volcado = false; return; }
    if (r === 1) { cerrando = true; win.close(); return; }
    ipcMain.once('civix:guardado-para-cerrar', (_ev, ok) => { if (ok) { cerrando = true; win.close(); } });
    win.webContents.send('civix:guardar-y-cerrar');
  });
  // Prueba de arranque para CI: CIVIX_SMOKE=1 comprueba que la interfaz carga y sale con código 0/1.
  if (process.env.CIVIX_SMOKE) {
    win.webContents.on('did-finish-load', async () => {
      try {
        const ok = await win.webContents.executeJavaScript(
          `new Promise((r) => { const t0 = Date.now(); const v = () => document.querySelector('[data-testid="titulo-proyecto"]') ? r(true) : Date.now() - t0 > 15000 ? r(false) : setTimeout(v, 100); v(); })`);
        console.log(ok ? 'CIVIX_SMOKE_OK' : 'CIVIX_SMOKE_FALLO');
        app.exit(ok ? 0 : 1);
      } catch (e) { console.error(e); app.exit(1); }
    });
  }
}

/** Convierte el HTML de un reporte a PDF (carta) y lo guarda donde elija el usuario. */
async function guardarPdf(ventana, html, nombre) {
  const oculta = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await oculta.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await oculta.webContents.printToPDF({ pageSize: 'Letter', printBackground: true, preferCSSPageSize: true });
    const seguro = String(nombre || 'reporte').replace(/[\\/:*?"<>|]+/g, '_') + '.pdf';
    let destino;
    if (process.env.CIVIX_PDF_DIR) destino = path.join(process.env.CIVIX_PDF_DIR, seguro); // pruebas automáticas
    else {
      const r = await dialog.showSaveDialog(ventana, { defaultPath: seguro, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled || !r.filePath) return { ok: false };
      destino = r.filePath;
    }
    fs.writeFileSync(destino, pdf);
    return { ok: true, ruta: destino };
  } finally { oculta.destroy(); }
}

const FILTROS = {
  proyecto: [{ name: 'Proyecto Civix', extensions: ['civix'] }],
  base: [{ name: 'Base de datos Civix', extensions: ['civbd'] }],
  excel: [{ name: 'Excel', extensions: ['xlsx'] }],
  html: [{ name: 'Página web', extensions: ['html'] }],
  json: [{ name: 'JSON', extensions: ['json'] }],
  csv: [{ name: 'CSV', extensions: ['csv'] }],
  msproject: [{ name: 'MS Project (XML)', extensions: ['xml'] }],
  abrir: [{ name: 'Archivos de Civix', extensions: ['civix', 'civbd', 'json'] }, { name: 'Proyecto PRESCOM', extensions: ['ddp'] }, { name: 'Todos', extensions: ['*'] }],
};

app.whenReady().then(() => {
  ipcMain.on('civix:modificado', (_e, si, nombre) => { modificado = !!si; nombreProyecto = nombre; });
  ipcMain.handle('civix:guardar', async (ev, o) => {
    const win = BrowserWindow.fromWebContents(ev.sender);
    const nombre = String(o?.nombre || 'civix').replace(/[\\/:*?"<>|]+/g, '_');
    let ruta = o?.comoNuevo ? null : o?.ruta;
    if (!ruta) {
      if (process.env.CIVIX_GUARDAR_EN) ruta = path.join(process.env.CIVIX_GUARDAR_EN, nombre);
      else {
        const r = await dialog.showSaveDialog(win, { title: o?.titulo || 'Guardar', defaultPath: path.join(app.getPath('documents'), nombre), filters: FILTROS[o?.tipo] || [] });
        if (r.canceled || !r.filePath) return { ok: false };
        ruta = r.filePath;
      }
    }
    const datos = typeof o.contenido === 'string' ? o.contenido : Buffer.from(o.contenido);
    // copia de respaldo del archivo anterior (proyecto.civix.bak) y escritura segura
    if (/\.civix$/i.test(ruta) && fs.existsSync(ruta)) { try { fs.copyFileSync(ruta, ruta + '.bak'); } catch { /* sin respaldo */ } }
    const tmp = ruta + '.tmp';
    fs.writeFileSync(tmp, datos);
    fs.renameSync(tmp, ruta);
    anotarReciente(ruta);
    return { ok: true, ruta };
  });
  ipcMain.handle('civix:abrir', async (ev, o) => {
    const win = BrowserWindow.fromWebContents(ev.sender);
    let ruta = process.env.CIVIX_ABRIR;
    if (!ruta) {
      const r = await dialog.showOpenDialog(win, { title: o?.titulo || 'Abrir', defaultPath: app.getPath('documents'), properties: ['openFile'], filters: FILTROS[o?.tipo] || FILTROS.abrir });
      if (r.canceled || !r.filePaths[0]) return { ok: false };
      ruta = r.filePaths[0];
    }
    return leerArchivo(ruta, o?.binario);
  });
  const rutaAuto = (clave) => path.join(app.getPath('userData'), `recuperacion-${clave === 'bases' ? 'bases' : 'proyecto'}.json`);
  ipcMain.handle('civix:autoguardar', (_e, clave, texto) => {
    if (typeof texto !== 'string') return false;
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    const r = rutaAuto(clave);
    fs.writeFileSync(r + '.tmp', texto);
    fs.renameSync(r + '.tmp', r);
    return true;
  });
  ipcMain.handle('civix:recuperar', (_e, clave) => { try { return fs.readFileSync(rutaAuto(clave), 'utf8'); } catch { return null; } });
  ipcMain.handle('civix:leer', (_e, ruta, binario) => leerArchivo(ruta, binario));
  ipcMain.handle('civix:recientes', () => leerRecientes().map((r) => ({ ruta: r, existe: fs.existsSync(r), fecha: fs.existsSync(r) ? fs.statSync(r).mtime.toISOString() : null })));
  ipcMain.handle('civix:quitar-reciente', (_e, ruta) => { try { fs.writeFileSync(rutaRecientes(), JSON.stringify(leerRecientes().filter((r) => r !== ruta))); } catch { /* nada */ } return true; });
  ipcMain.handle('civix:mostrar', (_e, ruta) => { if (typeof ruta === 'string' && fs.existsSync(ruta)) shell.showItemInFolder(ruta); return true; });
  ipcMain.handle('civix:imprimir', async (ev, html) => {
    if (typeof html !== 'string' || html.length > 40_000_000) throw new Error('Contenido no válido');
    const oculta = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      await oculta.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      if (process.env.CIVIX_DATOS) return { ok: true }; // pruebas: no hay impresora
      return await new Promise((r) => oculta.webContents.print({ silent: false, printBackground: true }, (ok, motivo) => r({ ok, motivo })));
    } finally { oculta.destroy(); }
  });
  ipcMain.handle('civix:pdf', (ev, html, nombre) => {
    if (typeof html !== 'string' || html.length > 40_000_000) throw new Error('Contenido no válido');
    return guardarPdf(BrowserWindow.fromWebContents(ev.sender), html, nombre);
  });
  const raiz = path.join(__dirname, '..', 'dist');
  protocol.handle('civix', (req) => {
    const { pathname } = new URL(req.url);
    const archivo = path.normalize(path.join(raiz, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
    if (!archivo.startsWith(raiz)) return new Response('Prohibido', { status: 403 });
    return net.fetch(pathToFileURL(archivo).toString());
  });
  archivoPendiente.push(...archivosDeArgs(process.argv));
  crearVentana();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) crearVentana(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

function leerArchivo(ruta, binario) {
  if (typeof ruta !== 'string' || !fs.existsSync(ruta)) return { ok: false, error: 'El archivo ya no existe' };
  const b = fs.readFileSync(ruta);
  if (/\.civix$/i.test(ruta)) anotarReciente(ruta);
  return binario || /\.ddp$/i.test(ruta) ? { ok: true, ruta, bytes: new Uint8Array(b) } : { ok: true, ruta, texto: b.toString('utf8') };
}
