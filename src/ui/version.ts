/** Versión de la app (la inyecta Vite desde package.json; en las pruebas unitarias no existe). */
export const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';
