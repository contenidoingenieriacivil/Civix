import type { BaseDatos, Proyecto } from '../datos/modelo';

/** Almacenamiento local (IndexedDB): las bases de datos y el proyecto actual sobreviven al cerrar la app. */
const NOMBRE = 'civix';
const abrir = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open(NOMBRE, 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

async function leer<T>(k: string): Promise<T | undefined> {
  try {
    const db = await abrir();
    return await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result as T | undefined); q.onerror = () => rej(q.error); });
  } catch { return undefined; }
}
async function escribir(k: string, v: unknown): Promise<void> {
  try {
    const db = await abrir();
    await new Promise<void>((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  } catch { /* sin almacenamiento disponible: la app sigue funcionando sin persistir */ }
}

// En el programa de escritorio, además de IndexedDB, se guarda una copia en disco (carpeta de datos de Civix):
// es lo que se lee primero al volver a entrar.
async function deDisco<T>(clave: 'proyecto' | 'bases'): Promise<T | undefined> {
  try { const t = await nativo()?.recuperar(clave); return t ? (JSON.parse(t) as T) : undefined; } catch { return undefined; }
}
const aDisco = (clave: 'proyecto' | 'bases', v: unknown) => nativo()?.autoguardar(clave, JSON.stringify(v)).catch(() => false);

export const cargarBases = async () => (await deDisco<BaseDatos[]>('bases')) ?? leer<BaseDatos[]>('bases');
export const guardarBases = async (b: BaseDatos[]) => { await Promise.all([escribir('bases', b), aDisco('bases', b)]); };
type Ultimo = { proyecto: Proyecto; archivo: { ruta: string | null; modificado: boolean } };
export async function cargarUltimoTrabajo(): Promise<Partial<Ultimo>> {
  const d = await deDisco<Ultimo>('proyecto');
  if (d?.proyecto) return d;
  return { proyecto: await leer<Proyecto>('proyecto'), archivo: await leer<Ultimo['archivo']>('archivo') };
}
export async function guardarUltimoTrabajo(u: Ultimo) {
  await Promise.all([escribir('proyecto', u.proyecto), escribir('archivo', u.archivo), aDisco('proyecto', u)]);
}

type Filtro = 'proyecto' | 'base' | 'excel' | 'html' | 'json' | 'csv' | 'msproject' | 'abrir';
export interface Nativo {
  guardar: (o: { contenido: string | Uint8Array; ruta?: string | null; comoNuevo?: boolean; nombre: string; tipo?: Filtro; titulo?: string }) => Promise<{ ok: boolean; ruta?: string }>;
  abrir: (o: { tipo?: Filtro; titulo?: string; binario?: boolean }) => Promise<{ ok: boolean; ruta?: string; texto?: string; bytes?: Uint8Array; error?: string }>;
  leer: (ruta: string, binario?: boolean) => Promise<{ ok: boolean; ruta?: string; texto?: string; bytes?: Uint8Array; error?: string }>;
  recientes: () => Promise<{ ruta: string; existe: boolean; fecha: string | null }[]>;
  quitarReciente: (ruta: string) => Promise<boolean>;
  imprimir: (html: string) => Promise<{ ok: boolean }>;
  autoguardar: (clave: 'proyecto' | 'bases', texto: string) => Promise<boolean>;
  recuperar: (clave: 'proyecto' | 'bases') => Promise<string | null>;
  alVolcar: (f: () => Promise<void>) => void;
  mostrarEnCarpeta: (ruta: string) => Promise<boolean>;
  ponerModificado: (si: boolean, nombre: string) => void;
  alAbrirRuta: (f: (ruta: string) => void) => void;
  alPedirGuardar: (f: () => Promise<boolean>) => void;
}
/** Funciones del programa de escritorio (Electron); undefined en el navegador. */
export const nativo = (): Nativo | undefined => (typeof window !== 'undefined' ? (window as unknown as { civix?: Nativo }).civix : undefined);

/** Guarda un archivo: con el diálogo de Windows en el programa de escritorio, como descarga en el navegador. */
export async function guardarArchivo(nombre: string, contenido: string | Uint8Array, tipo: Filtro, mime: string): Promise<string | null> {
  const n = nativo();
  if (n) { const r = await n.guardar({ contenido, nombre, tipo }); return r.ok ? r.ruta ?? nombre : null; }
  descargar(nombre, contenido as BlobPart, mime);
  return nombre;
}

export function descargar(nombre: string, contenido: BlobPart, tipo = 'application/octet-stream') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function elegirArchivos(accept: string, multiple = false, carpeta = false): Promise<File[]> {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = multiple;
    if (carpeta) i.setAttribute('webkitdirectory', '');
    i.onchange = () => res([...(i.files ?? [])]);
    i.oncancel = () => res([]);
    i.click();
  });
}
