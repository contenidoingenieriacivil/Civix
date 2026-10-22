const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
  'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos',
  'setecientos', 'ochocientos', 'novecientos'];

function hasta999(n: number): string {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]!);
  if (r < 30) {
    if (r) partes.push(UNIDADES[r]!);
  } else {
    const d = Math.floor(r / 10);
    const u = r % 10;
    partes.push(u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d]!);
  }
  return partes.join(' ');
}

/** Apócope ante "mil"/"millones": uno → un, veintiuno → veintiún. */
const apocopar = (t: string) => t.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');

/** Entero a letras en español (0 … 999.999.999.999). */
export function enteroALetras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) throw new RangeError('Número fuera de rango');
  if (n === 0) return 'cero';
  const miles = (x: number) => (x === 1 ? 'mil' : `${apocopar(hasta999(x))} mil`);
  const millardos = Math.floor(n / 1_000_000_000);
  const millones = Math.floor((n % 1_000_000_000) / 1_000_000);
  const m = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const p: string[] = [];
  // Parte en millones (incluye los millares de millón): "dos mil millones", "un millón".
  const totalMillones = millardos * 1000 + millones;
  if (totalMillones) {
    const base = totalMillones === 1 ? 'un' : totalMillones < 1000 ? apocopar(hasta999(totalMillones)) : '';
    if (totalMillones >= 1000) {
      const r = totalMillones % 1000;
      p.push(`${miles(Math.floor(totalMillones / 1000))}${r ? ` ${apocopar(hasta999(r))}` : ''} millones`);
    } else p.push(`${base} ${totalMillones === 1 ? 'millón' : 'millones'}`);
  }
  if (m) p.push(miles(m));
  if (resto) p.push(hasta999(resto));
  return p.join(' ');
}

/** Monto en literal como en los formularios SABS: "Son: mil doscientos 50/100 Bolivianos". */
export function montoALiteral(monto: number, moneda = 'Bolivianos'): string {
  const centavos = Math.round(Math.abs(monto) * 100);
  const entero = Math.floor(centavos / 100);
  const cc = String(centavos % 100).padStart(2, '0');
  if (!Number.isFinite(monto) || entero > 999_999_999_999) return 'Son: (monto demasiado grande para escribirlo en letras)';
  const letras = enteroALetras(entero);
  return `Son: ${letras.charAt(0).toUpperCase()}${letras.slice(1)} ${cc}/100 ${moneda}`;
}
