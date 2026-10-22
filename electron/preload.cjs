const { contextBridge, ipcRenderer } = require('electron');

// Puente entre la interfaz y el sistema: archivos (abrir/guardar con diálogos de Windows), recientes, PDF e impresión.
contextBridge.exposeInMainWorld('civixPdf', (html, nombreSugerido) => ipcRenderer.invoke('civix:pdf', html, nombreSugerido));
contextBridge.exposeInMainWorld('civix', {
  /** Guarda texto o bytes; sin ruta (o con comoNuevo) pregunta dónde. Devuelve { ok, ruta }. */
  guardar: (opciones) => ipcRenderer.invoke('civix:guardar', opciones),
  /** Pregunta qué archivo abrir y lo lee. Devuelve { ok, ruta, texto?, bytes? }. */
  abrir: (opciones) => ipcRenderer.invoke('civix:abrir', opciones),
  /** Lee un archivo conocido (p. ej. de la lista de recientes). */
  leer: (ruta, binario) => ipcRenderer.invoke('civix:leer', ruta, binario),
  recientes: () => ipcRenderer.invoke('civix:recientes'),
  quitarReciente: (ruta) => ipcRenderer.invoke('civix:quitar-reciente', ruta),
  /** Recuperación automática en disco (carpeta de datos de Civix): último proyecto y bases. */
  autoguardar: (clave, texto) => ipcRenderer.invoke('civix:autoguardar', clave, texto),
  recuperar: (clave) => ipcRenderer.invoke('civix:recuperar', clave),
  alVolcar: (f) => ipcRenderer.on('civix:volcar', async () => { try { await f(); } finally { ipcRenderer.send('civix:volcado'); } }),
  leerPortapapeles: () => ipcRenderer.invoke('civix:portapapeles-leer'),
  escribirPortapapeles: (t) => ipcRenderer.invoke('civix:portapapeles-escribir', t),
  imprimir: (html) => ipcRenderer.invoke('civix:imprimir', html),
  mostrarEnCarpeta: (ruta) => ipcRenderer.invoke('civix:mostrar', ruta),
  /** La ventana avisa si hay cambios sin guardar (para preguntar al cerrar). */
  ponerModificado: (si, nombre) => ipcRenderer.send('civix:modificado', !!si, String(nombre || '')),
  /** Archivo pedido al abrir Civix con doble clic en un .civix / .civbd, o al guardar antes de cerrar. */
  alAbrirRuta: (f) => ipcRenderer.on('civix:abrir-ruta', (_e, ruta) => f(ruta)),
  alPedirGuardar: (f) => ipcRenderer.on('civix:guardar-y-cerrar', async () => { const ok = await f(); ipcRenderer.send('civix:guardado-para-cerrar', !!ok); }),
});
