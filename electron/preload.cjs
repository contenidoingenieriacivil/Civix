const { contextBridge, ipcRenderer } = require('electron');

// Único puente entre la interfaz y el sistema: guardar un reporte (HTML) como PDF.
contextBridge.exposeInMainWorld('civixPdf', (html, nombreSugerido) => ipcRenderer.invoke('civix:pdf', html, nombreSugerido));
