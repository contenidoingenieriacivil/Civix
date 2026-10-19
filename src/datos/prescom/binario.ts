/** Utilidades para leer los formatos binarios de PRESCOM (VB6, cp1252, little-endian). */
const dec = new TextDecoder('windows-1252');

export function texto(buf: Uint8Array, desde: number, largo: number): string {
  let fin = desde + largo;
  while (fin > desde && (buf[fin - 1] === 0x20 || buf[fin - 1] === 0)) fin--;
  return dec.decode(buf.subarray(desde, fin));
}

export const vista = (buf: Uint8Array) => new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

/** Fecha OLE de VB (días desde 1899-12-30) → "yyyy-mm-dd", o null si es 0. */
export function fechaOle(dias: number): string | null {
  if (!Number.isFinite(dias) || dias < 1) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(dias) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Los float32 de VB no son exactos en decimal: se limpian a 6 cifras significativas. */
export const limpiar32 = (x: number) => Number.parseFloat(x.toPrecision(7));
