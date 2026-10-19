// Contenedor de escritorio de Civix. La app es 100 % local: sirve los archivos de dist/ con un
// protocolo propio (los módulos ES no cargan desde file://) y no abre ninguna conexión de red.
const { app, BrowserWindow, Menu, protocol, net, shell, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{ scheme: 'civix', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function crearVentana() {
  const win = new BrowserWindow({
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

app.whenReady().then(() => {
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
  crearVentana();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) crearVentana(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
