// Convierte la tabla de un presupuesto general (Markdown: Nº | Descripción | Und. | Cantidad | Unitario | Parcial,
// con filas de módulo "M01 - …") al paquete de proyecto de Civix. Hace de "IA" para el proyecto de referencia.
// Uso: node tools/convertir-presupuesto.mjs documento.md salida.json "Nombre del proyecto"
import { readFileSync, writeFileSync } from 'node:fs';

const num = (s) => {
  const t = String(s ?? '').replace(/[^\d.,-]/g, '');
  if (!t) return null;
  const c = t.lastIndexOf(','), p = t.lastIndexOf('.');
  const limpio = c >= 0 && p >= 0 ? (c > p ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')) : c >= 0 ? t.replace(',', '.') : t;
  const x = Number(limpio);
  return Number.isFinite(x) ? x : null;
};
const celdas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.replace(/<br\s*\/?>/g, ' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim());

const limpio = (t) => t.replace(/<br\s*\/?>/g, ' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const num2 = (t) => num(String(t ?? '').replace(/^[\s,.]+/, ''));

/** Si cantidad × unitario no da el parcial, prueba que el PDF haya perdido comas decimales (÷10, ÷100…). */
export function reparar(cantidad, unitario, parcial) {
  if (parcial === null || Math.abs(cantidad * unitario - parcial) <= Math.max(0.02, parcial * 0.003)) return null;
  let mejor = null;
  for (let a = 0; a <= 3; a++) for (let u = 0; u <= 3; u++) for (let p = 0; p <= 4; p++) {
    const c = cantidad / 10 ** a, x = unitario / 10 ** u, t = parcial / 10 ** p;
    if (Math.abs(c * x - t) <= Math.max(0.02, t * 0.003) && (!mejor || a + u + p < mejor.coste)) mejor = { coste: a + u + p, cantidad: c, unitario: x, parcial: t };
  }
  return mejor;
}

/**
 * Valida cada partida y cada módulo contra los totales impresos y repara lo comprobable:
 * 1) cantidad redondeada en el documento → se recupera la cantidad exacta (parcial ÷ unitario);
 * 2) comas decimales perdidas en una fila → se prueba ÷10/÷100 hasta que el módulo cuadre con su total;
 * 3) si el parcial impreso contradice cantidad × unitario, manda el parcial (se ajusta el unitario).
 * Lo que no se pueda explicar queda en `avisos` (defectos del documento de origen).
 */
export function calibrar(modulos, totales) {
  const avisos = [];
  const suma = (m) => m.partidas.reduce((a, x) => a + x._parcial, 0);
  modulos.forEach((m, i) => {
    const doc = totales.modulos[i];
    if (doc != null && Math.abs(suma(m) - doc) > 0.05) {
      // una fila con comas perdidas: dividir cantidad y parcial por 10 o 100
      const falta = suma(m) - doc;
      for (const x of m.partidas) for (const f of [10, 100]) {
        if (Math.abs(x._parcial - x._parcial / f - falta) <= 0.05) { x.cantidad /= f; x._parcial /= f; x._reparado = `÷${f}`; break; }
      }
    }
    for (const x of m.partidas) {
      const calc = x.cantidad * x.precioUnitario;
      const dif = Math.abs(calc - x._parcial);
      if (dif <= 0.0051) continue;
      if (dif <= x._parcial * 0.005) { x.cantidad = x._parcial / x.precioUnitario; x._cantidadExacta = true; }
      else { x.precioUnitario = x._parcial / x.cantidad; x._unitarioDeducido = true; avisos.push(`Partida ${x._n} "${x.descripcion.slice(0, 40)}": el documento imprime cantidad × unitario ≠ parcial; se respetó el parcial.`); }
    }
    const s = suma(m);
    if (doc != null && Math.abs(s - doc) > 0.05) avisos.push(`${m.nombre.slice(0, 40)}: la suma de sus partidas (${s.toFixed(2)}) no coincide con el total impreso del módulo (${doc.toFixed(2)}); diferencia ${(s - doc).toFixed(2)}.`);
  });
  return avisos;
}

export function convertirPresupuesto(md, nombre) {
  const lineas = md.split('\n');
  const ini = lineas.findIndex((l) => /5\.2\.\s*Presupuesto general/i.test(l));
  const modulos = [];
  const totales = { modulos: [], total: null };
  let m = null;
  for (let i = ini < 0 ? 0 : ini; i < lineas.length; i++) {
    const l = lineas[i];
    if (!l.startsWith('|')) continue;
    const crudas = l.trim().replace(/^\||\|$/g, '').split('|');
    if (/^[-\s:]+$/.test(crudas[0] ?? '')) continue;
    const c = crudas.map(limpio);
    if (/total\s*presupuesto/i.test(c.join(' '))) { totales.total = num2(c[c.length - 1]); break; }
    // Fila con marca de módulo (a veces fundida con la primera partida).
    const mm = /\*\*\s*(M\s?\d+\s*-[^*]+?)\s*\*\*(?:\s*<br>\s*)?([^|]*)$/.exec(crudas[1] ?? '');
    const ultima = crudas[crudas.length - 1] ?? '';
    // "**TOTAL MÓDULO**<br>PARCIAL": cuando la fila funde el módulo con su primera partida
    const fundido = /^\s*\*\*([^*]+)\*\*\s*<br>\s*(.+)$/.exec(ultima);
    let desc = c[1] ?? '', n = c[0].replace(/[>\s]/g, '');
    if (mm) {
      m = { nombre: limpio(mm[1]).replace(/^M\s+(\d)/, 'M$1'), partidas: [] };
      modulos.push(m);
      desc = limpio(mm[2] ?? '');
      const total = fundido ? num2(fundido[1]) : num2(c[c.length - 1]);
      totales.modulos.push(total);
      if (!desc) continue;
    }
    if (!m || !/^\d+$/.test(n)) continue;
    const [, , und, cant, unit, parcial] = c;
    let cantidad = num2(cant), unitario = num2(unit);
    let parc = fundido ? num2(fundido[2]) : num2(parcial);
    if (cantidad === null || unitario === null) continue;
    const reparado = reparar(cantidad, unitario, parc);
    if (reparado) { cantidad = reparado.cantidad; unitario = reparado.unitario; parc = reparado.parcial; }
    m.partidas.push({ descripcion: desc.replace(/(\p{L})y(\p{L})/gu, '$1 y $2'), unidad: und, cantidad, precioUnitario: unitario, _parcial: parc, _n: Number(n), ...(reparado ? { _reparado: true } : {}) });
  }
  const avisos = calibrar(modulos, totales);
  return { paquete: { civix: 1, tipo: 'proyecto', proyecto: { nombre, moneda: 'Bs', plantilla: 'Normas básicas del SABS' }, modulos }, totales, avisos };
}

if (process.argv[1]?.endsWith('convertir-presupuesto.mjs')) {
  const [,, entrada, salida, nombre] = process.argv;
  const r = convertirPresupuesto(readFileSync(entrada, 'utf8'), nombre ?? 'Proyecto');
  writeFileSync(salida, JSON.stringify(r.paquete, (k, v) => (k.startsWith('_') ? undefined : v)));
  writeFileSync(salida.replace(/\.json$/, '-esperado.json'), JSON.stringify({ ...r.totales, partidas: r.paquete.modulos.flatMap((x) => x.partidas.map((p) => ({ n: p._n, cantidad: p.cantidad, unitario: p.precioUnitario, parcial: p._parcial }))) }));
  for (const a of r.avisos) console.log(' !', a);
  console.log(`${r.paquete.modulos.length} módulos, ${r.paquete.modulos.reduce((a, x) => a + x.partidas.length, 0)} partidas, total esperado ${r.totales.total}`);
}
