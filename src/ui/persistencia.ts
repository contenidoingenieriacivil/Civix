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

export const cargarBases = () => leer<BaseDatos[]>('bases');
export const guardarBases = (b: BaseDatos[]) => escribir('bases', b);
export const cargarProyectoActual = () => leer<Proyecto>('proyecto');
export const guardarProyectoActual = (p: Proyecto) => escribir('proyecto', p);

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
