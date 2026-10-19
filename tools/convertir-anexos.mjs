// Convierte los anexos de una tesis/proyecto (Markdown) —Anexo 10 de precios unitarios, Anexo 9 de cómputos métricos y
// Anexo 1 de especificaciones técnicas— junto con su presupuesto general, a dos archivos de Civix:
//   <salida>-base.json     paquete de datos (insumos + ítems con su análisis)
//   <salida>-proyecto.json paquete de proyecto (partidas que referencian esos ítems, con cómputo y especificación)
// Uso: node tools/convertir-anexos.mjs tesis.md anexos.md salida "Nombre del proyecto"
import { readFileSync, writeFileSync } from 'node:fs';
import { convertirPresupuesto } from './convertir-presupuesto.mjs';

const quitar = (t) => String(t ?? '').replace(/<br\s*\/?>/g, ' ').replace(/\*\*/g, '').replace(/\\>/g, '>').replace(/\s+/g, ' ').trim();
const celdas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(quitar);
const num = (s) => {
  const t = String(s ?? '').replace(/[^\d.,-]/g, '');
  if (!t || t === '-') return null;
  const c = t.lastIndexOf(','), p = t.lastIndexOf('.');
  const l = c >= 0 && p >= 0 ? (c > p ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')) : c >= 0 ? t.replace(',', '.') : t;
  const n = Number(l);
  return Number.isFinite(n) ? n : null;
};
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const bigramas = (s) => { const t = norm(s).replace(/ /g, ''); const m = new Map(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
/** Coeficiente de Dice sobre bigramas de caracteres: tolera descripciones truncadas o con ruido. */
export function dice(a, b) {
  const A = bigramas(a), B = bigramas(b);
  let inter = 0, ta = 0, tb = 0;
  for (const [g, n] of A) { ta += n; inter += Math.min(n, B.get(g) ?? 0); }
  for (const n of B.values()) tb += n;
  return ta + tb === 0 ? 0 : (2 * inter) / (ta + tb);
}

/** Anexo 10: un bloque por ítem con insumos de materiales, mano de obra y equipo y los parámetros A…Q. */
const UNIDAD_APU = /^(m|m2|m²|m3|m³|kg|pza|pz|glb|gbl|und|unid|pto|ml|l|lt|hr|dm3|jgo|gl|tn|ton)$/i;

/** Encabezado en párrafos («**Item: …** **Unidad: m²** **continuación** **Proyecto: …**»): descripción y unidad. */
function leerEncabezado(lineas) {
  const segs = [];
  for (const raw of lineas) for (const m of raw.matchAll(/\*\*([^*]*)\*\*/g)) { const t = quitar(m[1]); if (t) segs.push(t); }
  let desc = [], unidad = '', hayItem = false;
  for (let t of segs) {
    if (/^Proyecto:/i.test(t)) break;
    const inline = /^(.*?\S)\s+Unidad:\s*(\S*)\s*$/i.exec(t);
    if (inline) { t = inline[1]; if (inline[2]) unidad = inline[2]; }
    if (/^Item:/i.test(t)) { hayItem = true; desc.push(t.replace(/^Item:\s*/i, '')); continue; }
    const u = /^Unidad:\s*(.*)$/i.exec(t);
    if (u) { if (u[1]) unidad = u[1]; continue; }
    if (!unidad && UNIDAD_APU.test(t)) { unidad = t; continue; }
    if (hayItem) desc.push(t);
  }
  return hayItem ? { descripcion: desc.join(' ').replace(/\s+/g, ' ').trim(), unidad } : null;
}

/** Anexo 10: un bloque por ítem con insumos de materiales, mano de obra y equipo y los parámetros A…Q. */
export function leerAnalisis(md) {
  const items = [];
  let it = null, rubro = null, zona = [];
  for (const l of md.split('\n')) {
    if (!l.startsWith('|')) { if (l.trim()) zona.push(l); continue; }
    const c = celdas(l);
    if (/^Nº$/.test(c[0] ?? '') && /Insumo/i.test(c[2] ?? '')) {
      const e = zona.length ? leerEncabezado(zona) : null;
      zona = [];
      if (e && e.descripcion) { it = { descripcion: e.descripcion, unidad: e.unidad, insumos: [], pct: {}, adoptado: null, total: null }; items.push(it); rubro = null; }
      continue;
    }
    if (!/^[-: ]+$/.test(c.join(''))) zona = [];
    if (it && !it.unidad && it.insumos.length === 0 && c.length === 2 && c[0] && !/^(Proyecto|Cliente|---)/i.test(c[0]) && UNIDAD_APU.test(c[1])) { it.descripcion += ` ${c[0]}`; it.unidad = c[1]; continue; }
    const h = /^Item:\s*(.+)$/.exec(c[0] ?? '');
    if (h && /^Unidad:/i.test(c[1] ?? '')) { it = { descripcion: h[1].trim(), unidad: c[1].replace(/^Unidad:\s*/i, '').trim(), insumos: [], pct: {}, adoptado: null, total: null }; items.push(it); rubro = null; continue; }
    if (!it || /^-+$/.test(c[0] ?? '') || c[0] === 'Nº') continue;
    // el encabezado de rubro trae la letra en la columna 0 o 1 y el nombre en la 1 o 2
    const nombreRubro = [c[2], c[1]].find((x) => /^(MATERIALES|MANO DE OBRA|EQUIPO)/i.test(x ?? ''));
    if (nombreRubro && /^[A-Q]?$/.test(c[0] === '' || /^[A-Q]$/.test(c[0]) ? c[0] : c[1] ?? '')) {
      rubro = /^MAT/i.test(nombreRubro) ? 'material' : /^MANO/i.test(nombreRubro) ? 'mano_de_obra' : 'equipo';
      continue;
    }
    const letra = c[1];
    // fila de insumo: «n | - | nombre | und | cant | unit | parcial»; algunas no traen número ni guion
    if (rubro && (/^\d+$/.test(c[0]) || c[0] === '') && (c[1] === '-' || c[1] === '') && c[2]) {
      const cant = num(c[4]), pu = num(c[5]), parcial = num(c[6]);
      if (cant !== null && pu !== null) {
        // la cantidad impresa puede estar redondeada: si no reproduce el parcial, se recupera de él
        const rend = parcial !== null && pu > 0 && Math.abs(Math.round(cant * pu * 100) / 100 - parcial) > 0.005 ? parcial / pu : cant;
        it.insumos.push({ descripcion: c[2], unidad: c[3], rubro, rendimiento: rend, precio: pu });
      }
      continue;
    }
    const m = /^([\d.,]+)%\s*de/.exec(c[4] ?? '');
    if (/^[A-Q]$/.test(letra) && m) { it.pct[letra] = Number(m[1].replace(',', '.')); continue; }
    if (letra === 'Q') it.total = num(c[6]);
    if (/PRECIO ADOPTADO/i.test(c[0] + c[1] + c[2])) it.adoptado = num(c[6]);
  }
  return items.filter((x) => x.insumos.length);
}

/** Anexo 9: ítems con su total y sus líneas de medición. Hay dos diseños de tabla (por módulo) y se leen los dos. */
export function leerComputos(md) {
  const out = [];
  let cur = null;
  const ini = md.indexOf('Anexo No. 9'), fin = md.indexOf('Anexo No. 10');
  const UNIDAD = /^(m|m2|m²|m3|m³|kg|pza|pz|glb|gbl|und|unid|pto|ml|l|lt|hr|dm3)$/i;
  for (const l of md.slice(ini, fin).split('\n')) {
    if (!l.startsWith('|')) continue;
    const c = celdas(l);
    while (c.length < 9) c.push('');
    if (/^-+$/.test(c[0]) || /^(Ítem|Nº|Item)$/i.test(c[0]) && !/^\d/.test(c[1]) || /DESCRIPCION|Descripción\/parte|DIMENSIONES|NUNID|UNID$/i.test(c[1] + c[2]) && !num(c[8])) continue;
    const vacios = (a, b) => c.slice(a, b + 1).every((x) => !x);
    // diseño 2: «N | DESCRIPCIÓN | (repetida) | …» y luego líneas y una fila con unidad y total
    // (la descripción puede repetirse en las celdas combinadas siguientes)
    const repetidas = c.slice(2, 9).every((x) => !x || x === c[1]);
    if (/^\d+$/.test(c[0]) && c[1] && repetidas && !UNIDAD.test(c[2])) { cur = { descripcion: c[1], unidad: '', total: null, lineas: [] }; out.push(cur); continue; }
    // diseño 3 (estructuras): «N | descripción | unidad | veces | … | total» en una sola fila, repetida sin texto
    if (/^\d+$/.test(c[0]) && !c[1] && !c[2]) continue;
    if (/^\d+$/.test(c[0]) && c[1] && UNIDAD.test(c[2]) && num(c[8]) !== null) { cur = { descripcion: c[1], unidad: c[2], total: num(c[8]), lineas: [], unica: true }; out.push(cur); continue; }
    // diseño 1: «| | descripción | unidad | | | | | total |»
    if (!c[0] && c[1] && UNIDAD.test(c[2]) && vacios(3, 7)) { cur = { descripcion: c[1], unidad: c[2], total: num(c[8]), lineas: [] }; out.push(cur); continue; }
    if (!cur) continue;
    // fila de cierre del diseño 2: «| | | unidad | … | total |»
    if (!c[0] && !c[1] && UNIDAD.test(c[2]) && vacios(3, 7)) { cur.unidad = c[2]; cur.total = num(c[8]); continue; }
    const veces = num(c[3]), largo = num(c[4]), ancho = num(c[5]), alto = num(c[6]), parcial = num(c[7]) ?? num(c[8]);
    if (parcial === null) continue;
    const hayDims = veces !== null || largo !== null || ancho !== null || alto !== null;
    const producto = (veces ?? 1) * (largo ?? 1) * (ancho ?? 1) * (alto ?? 1);
    const linea = { descripcion: c[1] || 'Parte' };
    if (hayDims && Math.abs(producto - parcial) <= Math.max(0.02, Math.abs(parcial) * 0.002)) Object.assign(linea, { ...(veces !== null ? { veces } : {}), ...(largo !== null ? { largo } : {}), ...(ancho !== null ? { ancho } : {}), ...(alto !== null ? { alto } : {}) });
    else linea.cantidad = parcial;
    cur.lineas.push(linea);
  }
  for (const x of out) if (x.total === null) x.total = x.lineas.reduce((a, l) => a + (l.cantidad ?? (l.veces ?? 1) * (l.largo ?? 1) * (l.ancho ?? 1) * (l.alto ?? 1)), 0);
  for (const x of out) if (!x.lineas.length && x.total) x.lineas.push({ descripcion: 'Total', cantidad: x.total });
  return out.filter((x) => x.lineas.length);
}

/** Anexo 1: bloques «ITEM n…: TÍTULO» seguidos del texto de la especificación. */
export function leerEspecificaciones(md) {
  const fin = md.indexOf('Anexo No. 2');
  const ls = md.slice(0, fin > 0 ? fin : undefined).split('\n');
  const bloques = [];
  let b = null;
  for (const raw of ls) {
    const t = quitar(raw);
    const h = /^ITEM[S]?\b[^:]*:(.*)$/i.exec(t);
    if (h && t.length < 400) {
      const titulo = h[1].trim();
      b = { titulo, texto: [] };
      bloques.push(b);
      continue;
    }
    if (/^UNIDAD:/i.test(t) && b && !b.texto.length) { b.unidad = t.replace(/^UNIDAD:\s*/i, ''); continue; }
    if (b && t) b.texto.push(t);
  }
  return bloques.filter((x) => x.texto.length > 3).map((x) => ({ ...x, texto: x.texto.join('\n\n') }));
}

function main() {
  const [,, tesis, anexos, salida, nombre] = process.argv;
  const T = readFileSync(tesis, 'utf8'), A = readFileSync(anexos, 'utf8');
  const { paquete: pres } = convertirPresupuesto(T, nombre);
  const apu = leerAnalisis(A);
  const comp = leerComputos(A);
  const esp = leerEspecificaciones(A);

  // --- Base: insumos e ítems (variantes de precio cuando el mismo insumo se paga distinto en otro análisis)
  const precios = new Map(), insumos = [];
  const items = apu.map((x) => ({ x, lineas: x.insumos.map((l) => {
    const k = `${l.rubro}|${norm(l.descripcion)}`;
    let nombreIns = l.descripcion;
    const previo = precios.get(k);
    if (previo !== undefined && Math.abs(previo - l.precio) > 1e-9) { nombreIns = `${l.descripcion} [Bs ${l.precio.toFixed(2).replace('.', ',')}]`; }
    const k2 = `${l.rubro}|${norm(nombreIns)}`;
    if (!precios.has(k2)) { precios.set(k2, l.precio); insumos.push({ descripcion: nombreIns, unidad: l.unidad, rubro: l.rubro, precio: l.precio }); }
    return { descripcion: nombreIns, rubro: l.rubro, rendimiento: l.rendimiento };
  }) }));
  const DEF = { F: 55, O: 14.94, H: 5, L: 10, M: 9.4, P: 3.09 };
  const vistos = new Map();
  const baseItems = items.map(({ x, lineas }) => {
    const desv = Object.fromEntries(Object.entries(x.pct).filter(([k, v]) => DEF[k] !== undefined && Math.abs(DEF[k] - v) > 1e-9));
    let nom = x.descripcion;
    if (vistos.has(norm(nom))) nom = `${nom} (${x.adoptado ?? x.total})`;
    vistos.set(norm(nom), true);
    x.nombre = nom;
    return { descripcion: nom, unidad: x.unidad, ...(Object.keys(desv).length ? { porcentajes: desv } : {}), insumos: lineas };
  });

  // --- Proyecto: cruce partida ↔ análisis ↔ cómputo ↔ especificación
  const informe = { partidas: 0, conAnalisis: 0, conAnalisisPrecioDistinto: [], sinAnalisis: [], conComputo: 0, sinComputo: [], computoDifiere: [], conEspecificacion: 0 };
  let ptr = 0;
  const usadosComp = new Set();
  const todas = pres.modulos.flatMap((m) => m.partidas.map((p) => ({ m, p })));
  for (const { p } of todas) {
    informe.partidas++;
    const cand = apu.filter((a) => Math.abs((a.adoptado ?? a.total ?? -1) - p.precioUnitario) <= 0.011);
    const mejor = cand.map((a) => ({ a, s: dice(a.descripcion, p.descripcion) })).sort((u, v) => v.s - u.s)[0];
    if (mejor && mejor.s >= 0.3) { p.item = mejor.a.nombre; informe.conAnalisis++; }
    else {
      const aprox = apu.map((a) => ({ a, s: dice(a.descripcion, p.descripcion) })).sort((u, v) => v.s - u.s)[0];
      if (aprox && aprox.s >= 0.85) informe.conAnalisisPrecioDistinto.push(`${p._n} ${p.descripcion}: tesis ${p.precioUnitario}, el análisis «${aprox.a.descripcion}» da ${aprox.a.adoptado}`);
      informe.sinAnalisis.push(`${p._n} ${p.descripcion} (${p.precioUnitario})`);
    }
    // cómputo: ventana alrededor del puntero, por nombre y por cantidad
    let best = null;
    for (let j = Math.max(0, ptr - 4); j < Math.min(comp.length, ptr + 60); j++) {
      if (usadosComp.has(j)) continue;
      const c = comp[j];
      const s = dice(c.descripcion, p.descripcion);
      const q = c.total !== null && p.cantidad ? Math.abs(c.total - p.cantidad) / p.cantidad : 1;
      const ok = (s >= 0.6 && q <= 0.03) || (q <= 0.002 && s >= 0.3);
      const puntos = s + (q <= 0.03 ? 1 : 0) - Math.abs(j - ptr) * 0.01;
      if (ok && (!best || puntos > best.puntos)) best = { j, puntos };
    }
    if (best) {
      const c = comp[best.j];
      const suma = c.lineas.reduce((a, l) => a + (l.cantidad ?? (l.veces ?? 1) * (l.largo ?? 1) * (l.ancho ?? 1) * (l.alto ?? 1)), 0);
      if (c.total !== null && Math.abs(suma - c.total) > Math.max(0.02, c.total * 0.002)) {
        // celdas combinadas o ilegibles en el anexo: no se adjunta el cómputo, se conserva la cantidad del presupuesto
        informe.computoDifiere.push(`${p._n} ${p.descripcion}: líneas ${suma.toFixed(2)} / total ${c.total}`);
      } else {
        usadosComp.add(best.j); ptr = best.j + 1;
        p.computo = c.lineas;
        informe.conComputo++;
        delete p.cantidad;
      }
    } else informe.sinComputo.push(`${p._n} ${p.descripcion}`);
    // especificación por similitud de título
    const sp = esp.map((e) => ({ e, s: dice(e.titulo, p.descripcion) })).sort((u, v) => v.s - u.s)[0];
    if (sp && sp.s >= 0.7) { p.especificacion = sp.e.texto; informe.conEspecificacion++; }
  }
  const proyecto = { civix: 1, tipo: 'proyecto', proyecto: { ...pres.proyecto, parametros: [{ parametro: 'utilidad', porcentaje: 9.4 }] },
    modulos: pres.modulos.map((m) => ({ nombre: m.nombre, partidas: m.partidas.map((p) => ({ descripcion: p.descripcion, unidad: p.unidad, ...(p.item ? { item: p.item } : { precioUnitario: p.precioUnitario }), ...(p.computo ? { computo: p.computo } : { cantidad: p.cantidad }), ...(p.especificacion ? { especificacion: p.especificacion } : {}) })) })) };
  const strip = (k, v) => (k.startsWith('_') ? undefined : v);
  writeFileSync(`${salida}-base.json`, JSON.stringify({ civix: 1, insumos, items: baseItems }, strip));
  writeFileSync(`${salida}-proyecto.json`, JSON.stringify(proyecto, strip));
  writeFileSync(`${salida}-informe.json`, JSON.stringify({ ...informe, analisis: apu.length, computos: comp.length, especificaciones: esp.length }, null, 1));
  // referencia para pruebas: unitario y parcial impresos por partida, en el mismo orden que el proyecto
  writeFileSync(`${salida}-esperado.json`, JSON.stringify(todas.map(({ p }) => ({ n: p._n, descripcion: p.descripcion, unitario: p.precioUnitario, parcial: p._parcial, conAnalisis: !!p.item }))));
  console.log(`análisis ${apu.length}, cómputos ${comp.length}, especificaciones ${esp.length}`);
  console.log(`partidas ${informe.partidas}: con análisis ${informe.conAnalisis}, sin ${informe.sinAnalisis.length}; con cómputo ${informe.conComputo}; con especificación ${informe.conEspecificacion}`);
}
if (process.argv[1]?.endsWith('convertir-anexos.mjs')) main();
