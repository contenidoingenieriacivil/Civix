// Convierte un catálogo de costos en Markdown (análisis de precios + listas de precios) al formato
// de intercambio de Civix. Es lo que haría una IA con la instrucción de "Copiar instrucciones de datos".
// Uso: node tools/convertir-costos.mjs costos.md salida-base.json salida-precios.json
import { readFileSync, writeFileSync } from 'node:fs';

const num = (s) => {
  const t = String(s ?? '').replace(/[^\d.,-]/g, '');
  if (!t) return null;
  const c = t.lastIndexOf(','), p = t.lastIndexOf('.');
  const limpio = c >= 0 && p >= 0 ? (c > p ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')) : c >= 0 ? t.replace(',', '.') : t;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
};
const celdas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.replace(/<br\s*\/?>/g, ' ').replace(/\*\*/g, '').trim());
const limpiarTitulo = (l) => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim().replace(/^[-•]\s*/, '');

export function convertir(md) {
  const lineas = md.split('\n');
  const items = [];
  const avisos = [];
  const insumos = new Map(); // rubro|descripcion → {unidad, precio}
  let it = null, rubro = null, fila = null;

  const RUBRO = (t) => /^materiales/i.test(t) ? 'material' : /^mano de obra/i.test(t) ? 'mano_de_obra' : /^herramientas y equipo|^equipo/i.test(t) ? 'equipo' : null;
  let parte = 1;
  for (let i = 0; i < lineas.length; i++) {
    const raw = lineas[i];
    const t = limpiarTitulo(raw);
    if (/^PARTE 3/i.test(t)) { parte = 3; break; }
    const h = /^([A-Z]{0,3}\d{0,4}[a-z]?)\s*\|\s*(.+?)\s*\*?\s+—\s+Unidad:\s*(.+?)\s+—\s+Costo Total:\s*Bs\s*([\d.,]+)\s*(.*)$/.exec(t);
    if (h) { it = { codigo: h[1], descripcion: h[2].trim(), unidad: h[3].trim(), costoTotal: num(h[4]), insumos: [], herramientasPct: null, sumaFilas: 0 }; items.push(it); rubro = RUBRO(h[5].replace(/:$/, '')) ?? null; fila = null; continue; }
    if (!it) continue;
    const r = RUBRO(t.replace(/:$/, ''));
    if (r && !raw.startsWith('|') && /:\s*$/.test(t)) { rubro = r; fila = null; continue; }
    if (!raw.startsWith('|') || !rubro) continue;
    const c = celdas(raw);
    if (c.length < 5 || /^-+$/.test(c[0]) || /^descripci/i.test(c[0])) continue;
    if (/^sub\s*total/i.test(c[0]) || /^\(?bs\)?$/i.test(c[0])) { fila = null; continue; }
    const vacia = !c[1] && !c[2] && !c[3];
    if (vacia && fila) { fila.descripcion = `${fila.descripcion} ${c[0]}`.trim(); if (fila.esHerr) fila.descripcion = fila.descripcion; continue; }
    if (vacia) continue;
    const rend = num(c[2]), pu = num(c[3]);
    if (rend === null || pu === null) { if (/n\/d/i.test(raw)) it.nd = true; else avisos.push(`${it.codigo}: fila no interpretada "${raw.slice(0, 80)}"`); continue; }
    if (/^herramientas menores/i.test(c[0]) && c[1].trim() === '%') { it.herramientasPct = rend; it.sumaFilas += num(c[4]) ?? 0; fila = { descripcion: c[0], esHerr: true }; continue; }
    // El catálogo imprime los rendimientos redondeados (0,016 → 0,02): se recupera el exacto desde la columna Total.
    const total = num(c[4]);
    const exacto = total !== null && pu > 0 && Math.abs(rend * pu - total) > 0.006 ? total / pu : rend;
    it.sumaFilas += total ?? rend * pu;
    fila = { descripcion: c[0], unidad: c[1], rendimiento: exacto, precio: pu, rubro };
    it.insumos.push(fila);
  }
  // Catálogo de insumos: se arma al final porque una descripción larga puede ocupar varias filas.
  for (const x of items) for (const l of x.insumos) {
    const k = `${l.rubro}|${l.descripcion.toLowerCase()}`;
    const prev = insumos.get(k);
    if (prev && Math.abs(prev.precio - l.precio) > 1e-9) {
      // El catálogo usa precios distintos para el mismo insumo según el análisis: se conserva cada uno como variante
      // para reproducir exactamente cada costo; el usuario puede unificarlos después con «Actualizar precios».
      const variante = `${l.descripcion} [Bs ${l.precio.toFixed(2).replace('.', ',')}]`;
      avisos.push(`Precio distinto para "${l.descripcion}" (${prev.precio} y ${l.precio}) en ${x.codigo}: se creó la variante "${variante}"`);
      l.descripcion = variante;
      insumos.set(`${l.rubro}|${variante.toLowerCase()}`, { descripcion: variante, unidad: l.unidad, rubro: l.rubro, precio: l.precio });
      continue;
    }
    insumos.set(k, { descripcion: l.descripcion, unidad: l.unidad, rubro: l.rubro, precio: l.precio });
  }
  return { items, insumos: [...insumos.values()], avisos };
}

/** Listas de precios de materiales (parte 3), mano de obra (parte 4) y equipo (parte 5). */
export function convertirPrecios(md) {
  const out = [];
  let parte = 0, seccion = '';
  for (const raw of md.split('\n')) {
    const t = limpiarTitulo(raw);
    const p = /^PARTE (\d)/i.exec(t);
    if (p) { parte = Number(p[1]); continue; }
    if (parte < 3) continue;
    if (/^#+\s/.test(raw)) { seccion = t; continue; }
    if (!raw.startsWith('|')) continue;
    const c = celdas(raw);
    if (c.length < 3 || /^-+$/.test(c[0]) || /^descripci/i.test(c[0])) continue;
    const precio = num(c[2]);
    if (!c[0] || precio === null || !c[1]) continue;
    out.push({ descripcion: c[0], unidad: c[1], precio, rubro: parte === 3 ? 'material' : parte === 4 ? 'mano_de_obra' : 'equipo', grupo: seccion });
  }
  return out;
}

if (process.argv[1]?.endsWith('convertir-costos.mjs')) {
  const [,, entrada, salidaBase, salidaPrecios] = process.argv;
  const md = readFileSync(entrada, 'utf8');
  const r = convertir(md);
  // Ítems con datos "n/d" (sin precios de insumos): solo se conserva el costo total como precio directo.
  const base = { civix: 1, insumos: r.insumos, items: r.items.map((x) => x.nd || !x.insumos.length
    ? { codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad, precioUnitario: x.costoTotal, insumos: [] }
    : { codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad, ...(x.herramientasPct === 6 ? {} : { porcentajes: { H: x.herramientasPct ?? 0 } }),
        insumos: x.insumos.map((l) => ({ descripcion: l.descripcion, rubro: l.rubro, rendimiento: l.rendimiento })) }) };
  writeFileSync(salidaBase.replace(/\.json$/, '-referencia.json'), JSON.stringify(Object.fromEntries(r.items.map((x) => [x.codigo || x.descripcion, { costo: x.costoTotal, coherente: !x.nd && Math.abs(x.sumaFilas - x.costoTotal) <= 0.06 }]))));
  const rotos = r.items.filter((x) => !x.nd && Math.abs(x.sumaFilas - x.costoTotal) > 0.06);
  console.log(`${rotos.length} análisis cuyos renglones impresos no suman su costo total (defecto del documento): ${rotos.slice(0, 6).map((x) => x.codigo || x.descripcion).join(', ')}…`);
  writeFileSync(salidaBase, JSON.stringify(base));
  const precios = convertirPrecios(md);
  writeFileSync(salidaPrecios, JSON.stringify({ civix: 1, tipo: 'precios', moneda: 'Bs', precios }));
  console.log(`${r.items.length} ítems, ${r.insumos.length} insumos, ${precios.length} precios de listas; ${r.avisos.length} avisos`);
  for (const a of r.avisos.slice(0, 15)) console.log(' -', a);
}
