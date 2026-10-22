// Lee cómputos métricos impresos (tablas LARGO/ALTO/ANCHO/ÁREA/CANT. PARCIAL/PARTES IGUALES/CANT. TOTAL) de un
// Markdown obtenido de un PDF y arma un proyecto de Civix: módulos por componente, partidas con sus líneas de cómputo,
// enlazadas a los análisis de precios (ver convertir-analisis-prescom.mjs) por similitud de nombre y unidad.
// Uso: node tools/convertir-computos-prescom.mjs anexos.md desdeLinea hastaLinea analisis-base.json salida "Nombre"
import { readFileSync, writeFileSync } from 'node:fs';
import { dice } from './convertir-anexos.mjs';
import { num } from './convertir-analisis-prescom.mjs';

const cantidadLinea = (l) => l.cantidad ?? (l.veces ?? 1) * (l.largo ?? 1) * (l.ancho ?? 1) * (l.alto ?? 1);
const limpiar = (t) => String(t ?? '').replace(/<br\s*\/?>/g, ' ').replace(/<\/?sup>|~~/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const esNum = (s) => /^-?\d[\d.,]*$/.test(s.trim()) || /^-?\.\d+$/.test(s.trim());
const UNIDAD = /^(m|m2|m²|m3|m³|ml|kg|pza\.?|pz|glb|gbl|und|unid|pto|l|lt|hr|p2|pie²|e?m2)$/i;
export const unidad = (u) => {
  const t = String(u ?? '').toLowerCase().replace(/\.$/, '').replace(/^em2$/, 'm2');
  return ({ m3: 'm³', m2: 'm²', ml: 'm', pza: 'pza', pz: 'pza', glb: 'glb', gbl: 'glb', kg: 'kg', m: 'm', 'm³': 'm³', 'm²': 'm²', und: 'pza', unid: 'pza', pto: 'pto', l: 'l', lt: 'l' })[t] ?? t;
};

/** Componentes (módulos) con sus ítems de cómputo. */
export function leerComputos(md, desde = 0, hasta = Infinity) {
  const mods = [];
  let mod = null, sub = '', it = null;
  const cerrar = () => {
    if (!it || !mod) { it = null; return; }
    const suma = it.lineas.reduce((a, l) => a + cantidadLinea(l), 0);
    if (it.total === null) it.total = Math.round(suma * 100) / 100;
    // el total impreso es la suma de los parciales ya redondeados: se usan esos parciales
    if (it.lineas.length && Math.round(suma * 100) / 100 !== it.total && Math.abs(it.lineas.reduce((a, l) => a + (l._t ?? 0), 0) - it.total) < 0.005) {
      it.lineas = it.lineas.map((l) => ({ descripcion: l.descripcion, cantidad: l._t }));
      return cerrar2(it.total);
    }
    return cerrar2(suma);
  };
  const cerrar2 = (suma) => {
    // líneas ilegibles (celdas unidas por el OCR): queda una sola línea con el total impreso
    if (!it.lineas.length || Math.abs(suma - it.total) > Math.max(0.02, Math.abs(it.total) * 0.002)) { it.lineasOriginales = it.lineas.length; it.lineas = [{ descripcion: 'Total del cómputo', cantidad: it.total }]; it.ajustado = true; }
    else if (Math.round(suma * 100) / 100 !== it.total) it.difiere = Math.round((suma - it.total) * 100) / 100;
    if (it.descripcion && it.total !== 0) mod.items.push({ ...it, capitulo: sub });
    it = null;
  };
  const ls = md.split('\n');
  for (let k = desde; k < Math.min(ls.length, hasta); k++) {
    const raw = ls[k];
    if (raw.startsWith('#') || (!raw.startsWith('|') && /\*\*/.test(raw))) {
      const t = limpiar(raw.replace(/^#+\s*/, ''));
      const m = /(?:^|")\s*(\d+)\s*\.?\s*-\s*(.+)$/.exec(t.replace(/^.*COMUNIDAD TOLOMOSITA SUD"\s*/, ''));
      if (/COMPONENTE:|RESIDUALES DOMESTICAS/.test(t) && !m) continue;
      cerrar();
      if (m && !/^\d+:/.test(t)) { mod = { numero: Number(m[1]), nombre: m[2].replace(/\s+/g, ' ').trim(), items: [] }; mods.push(mod); sub = ''; continue; }
      const s = /^(\d+)\s*:?\s+(.+)$/.exec(t);
      if (s && mod) { if (/^(\d+):/.test(t) && Number(s[1]) === 7 && /DESGRASADOR/.test(s[2])) { mod = { numero: 7, nombre: s[2], items: [] }; mods.push(mod); sub = ''; } else sub = s[2]; continue; }
      if (t && mod && t.length < 90) sub = t;
      continue;
    }
    if (!raw.startsWith('|') || !mod) continue;
    for (const fila of separarFilas(raw)) procesar(fila);
  }
  cerrar();
  return mods;

  function procesar(raw) {
    const celdas = raw.trim().replace(/^\||\|$/g, '').split('|');
    const c = celdas.map(limpiar);
    const txt = c.join(' ');
    if (/LARGO|PARCIAL|IGUALES|^-+$|DESCRIPCI|ACTIVIDAD/.test(txt) || /^[\s-|]+$/.test(raw.replace(/\|/g, ''))) return;
    // «TOTAL» y el título del ítem siguiente en la misma fila
    const total2 = /^\|\s*TOTAL\s*<br\s*\/?>\s*(\*\*.+?\*\*)\s*\|/.exec(raw);
    if (total2) { procesar(raw.replace(total2[1], '')); procesar(`|${total2[1]}|${c.slice(1).filter((x) => UNIDAD.test(x)).join('')}|`); return; }
    const negrita = /\*\*/.test(raw);
    const numeros = c.filter((x) => esNum(x)).map(num);
    const textos = c.filter((x) => x && !esNum(x) && !UNIDAD.test(x) && !/^[\d.,\s-]+$/.test(x));
    const u = c.find((x) => UNIDAD.test(x));
    const etiqueta = textos.join(' ').replace(/^\d+(\.\d+)?\s+/, '').replace(/^\d+\s*:\s*/, '').trim();
    if (/^TOTAL\b/i.test(etiqueta)) { if (it) { it.total = numeros.length ? numeros.at(-1) : it.total; if (!it.unidad && u) it.unidad = unidad(u); } cerrar(); return; }
    if (!numeros.length) {
      // título (o su continuación) del ítem: en negrita, o un texto en mayúsculas que no es una medición
      const titulo = etiqueta.length > 3 && !/^C[ÁA]MARA \d/i.test(etiqueta) && (negrita || (/^[^a-z]+$/.test(etiqueta) && etiqueta.length >= 6));
      if (!titulo) return;
      if (it && it.lineas.length) cerrar();
      if (!it) it = { descripcion: etiqueta, unidad: u ? unidad(u) : '', lineas: [], total: null };
      else { it.descripcion = `${it.descripcion} ${etiqueta}`.replace(/\s+/g, ' ').trim(); if (!it.unidad && u) it.unidad = unidad(u); }
      return;
    }
    if (numeros.length === 1 && !etiqueta && it?.lineas.length) { if (esNum(c.at(-1) ?? '') && !esNum(c[0] ?? '')) { it.total = numeros[0]; cerrar(); } return; } // total sin la palabra TOTAL (un número suelto en la 1.ª columna es el n.º de ítem)
    if (!it) { if (!(etiqueta.length > 3 && !/^C[ÁA]MARA \d/i.test(etiqueta) && (negrita || /^[^a-z]{6,}$/.test(etiqueta)))) return; it = { descripcion: etiqueta, unidad: u ? unidad(u) : '', lineas: [], total: null }; } // título y medición en la misma fila
    else if (!it.unidad && u) it.unidad = unidad(u);
    it.lineas.push({ descripcion: (etiqueta && etiqueta !== it.descripcion ? etiqueta : 'Parte').slice(0, 60), ...medidas(c, numeros.at(-1)), _t: numeros.at(-1) });
  }
}

/** Medidas de una fila (… LARGO | ALTO | ANCHO | ÁREA | PARCIAL | PARTES | TOTAL): con ellas Civix recalcula la cantidad
 *  sin el redondeo del parcial impreso; si no reproducen el total de la fila, queda el total como cantidad directa. */
export function medidas(c, total) {
  const v = c.slice(-7).map((x) => (esNum(x) ? num(x) : null));
  if (c.length < 7 || v[6] === null) return { cantidad: total };
  const [largo, alto, ancho, area, , partes] = v;
  const veces = partes ?? 1;
  const ok = (prod) => Math.abs(prod * veces - total) <= 0.006 * Math.max(1, Math.abs(veces)) + 1e-9;
  const dims = [largo, ancho, alto].filter((x) => x !== null);
  const d = { ...(largo !== null ? { largo } : {}), ...(ancho !== null ? { ancho } : {}), ...(alto !== null ? { alto } : {}), ...(veces !== 1 ? { veces } : {}) };
  if (dims.length && ok(dims.reduce((a, x) => a * x, 1))) return d;
  if (area !== null && ok(area)) return { largo: area, ...(veces !== 1 ? { veces } : {}) };
  return { cantidad: total };
}

/** Filas que el OCR juntó en una («CÁMARA 4<br>CÁMARA 5|0.15<br>015|…») se separan; «015» junto a «0.15» es 0,15. */
export function separarFilas(raw) {
  const celdas = raw.trim().replace(/^\||\|$/g, '').split('|');
  const partes = celdas.map((x) => x.split(/<br\s*\/?>/).map((y) => y.trim()).filter((y) => y && y !== '.' && y !== '**.**'));
  const etiquetas = partes.flat().filter((y) => /^C[ÁA]MARA \d+$/i.test(y.replace(/\*\*/g, '')));
  const numericas = partes.filter((p) => p.length && p.every((y) => esNum(y)));
  const n = Math.max(0, ...numericas.map((p) => p.length));
  if (etiquetas.length < 2 || n < 2) return [raw];
  return Array.from({ length: n }, (_, k) => '|' + partes.map((p) => {
    if (p.length && p.every((y) => esNum(y))) {
      let v = p[k] ?? '';
      const modelo = p.find((y) => /^\d+\.\d{2}$/.test(y));
      if (/^\d{3}$/.test(v) && modelo) v = (Number(v) / 100).toFixed(2);
      return v;
    }
    return p.some((y) => /^C[ÁA]MARA \d+$/i.test(y.replace(/\*\*/g, ''))) ? (etiquetas[k] ?? '') : p.join(' ');
  }).join('|') + '|');
}

/** Abreviaturas usuales de los nombres de ítem («HºAº» = hormigón armado…) para compararlos. */
export const normalizar = (t) => String(t).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s*\([\d.,]+\)( #\d+)?$/, '')
  .replace(/H[º°O]\s*A[º°O]?\b/g, 'HORMIGON ARMADO').replace(/H[º°O]\s*C[º°O]?\b/g, 'HORMIGON CICLOPEO').replace(/H[º°O]\s*S[º°O]?\b/g, 'HORMIGON SIMPLE')
  .replace(/\bPROV\.?\s*Y?\s*/g, 'PROVISION ').replace(/\bCOLOC\.?,?\s*/g, 'COLOCADO ').replace(/\bTEND(I|\.)?\.?\s*/g, 'TENDIDO ')
  .replace(/[^A-Z0-9"=/ ]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/^REPLANTEO (?!.*(CONTROL|CERCO|LINEAL)).*$/, 'REPLANTEO SUPERFICIE'); // «de estructuras y edificaciones» = «y trazado de una superficie»

/** Proporción de partidas de «a» que están en «b» con el mismo total y un nombre parecido. */
const parecidos = (a, b) => a.filter((x) => b.some((y) => Math.abs(y.total - x.total) < 0.015 && dice(normalizar(x.descripcion), normalizar(y.descripcion)) > 0.6)).length / Math.max(1, a.length);

if (process.argv[1]?.endsWith('convertir-computos-prescom.mjs')) {
  const [,, entrada, desde, hasta, basePath, salida, nombre, rangosPath] = process.argv;
  const md = readFileSync(entrada, 'utf8');
  const mods = leerComputos(md, Number(desde), Number(hasta));
  const base = JSON.parse(readFileSync(basePath, 'utf8'));
  const { rangos = {}, enlaces = {} } = rangosPath ? JSON.parse(readFileSync(rangosPath, 'utf8')) : {};
  // capítulos del componente 2 que se repiten como componente aparte (cámaras, tubería abrazada): se cuentan una sola vez
  const comp2 = mods.find((m) => m.numero === 2);
  const repetidos = [];
  for (const m of mods) {
    if (!comp2 || m === comp2 || !m.items.length) continue;
    for (const cap of [...new Set(comp2.items.map((i) => i.capitulo))]) {
      const deCap = comp2.items.filter((i) => i.capitulo === cap);
      if (deCap.length && parecidos(deCap, m.items) >= 0.6 && parecidos(m.items, deCap) >= 0.6) {
        comp2.items = comp2.items.filter((i) => i.capitulo !== cap);
        repetidos.push(`capítulo «${cap}» del componente 2 (${deCap.length} partidas) = componente ${m.numero} «${m.nombre}»: se cuenta una vez`);
      }
    }
  }
  // enlace con los análisis: dentro del rango de análisis del componente, nombre parecido y misma unidad
  const nombres = base.items.map((i, k) => ({ i, k: k + 1, u: unidad(i.unidad), n: normalizar(i.descripcion) }));
  const informe = { modulos: mods.length, partidas: 0, enlazadas: 0, sinAnalisis: [], ajustadas: [], redondeo: [], repetidos };
  const modulos = mods.filter((m) => m.items.length).map((m) => {
    const [ini, fin] = rangos[m.numero] ?? [1, nombres.length];
    let ptr = ini;
    const nom = `${m.numero} - ${m.nombre.replace(/^C[ÓO]MPUTOS M[ÉE]TRICOS DEL?\s+/i, '')}`;
    return { nombre: nom.length <= 50 ? nom : nom.slice(0, 51).replace(/\s+\S*$/, ''), partidas: m.items.map((x) => {
      informe.partidas++;
      let mejor = null;
      const manual = Object.entries(enlaces).find(([k]) => { const [c, pre] = k.split('|'); return Number(c) === m.numero && normalizar(x.descripcion).startsWith(normalizar(pre)); });
      if (manual) mejor = { s: 1, n: nombres[manual[1] - 1], manual: true };
      else for (const n of nombres) {
        if (n.k < ini || n.k > fin) continue;
        let s = dice(normalizar(x.descripcion), n.n);
        if (n.u && x.unidad && n.u !== x.unidad) s -= 0.2;
        s -= (n.k >= ptr ? (n.k - ptr) * 0.002 : 0.05 + (ptr - n.k) * 0.002); // a igual nombre, el siguiente en el orden impreso
        if (!mejor || s > mejor.s) mejor = { s, n };
      }
      if (x.ajustado) informe.ajustadas.push(`${m.numero} ${x.descripcion}: ${x.total} ${x.unidad} (${x.lineasOriginales} líneas que no suman el total impreso)`);
      if (x.difiere) informe.redondeo.push(`${m.numero} ${x.descripcion}: impreso ${x.total}, las medidas dan ${Math.round((x.total + x.difiere) * 100) / 100}`);
      const p = { descripcion: x.descripcion.slice(0, 70), unidad: x.unidad || mejor?.n.u || 'glb', computo: x.lineas };
      if (mejor && mejor.s >= 0.45) { ptr = mejor.n.k + 1; informe.enlazadas++; return { ...p, item: mejor.n.i.descripcion, _similitud: mejor.manual ? 'manual' : Math.round(mejor.s * 100) / 100 }; }
      informe.sinAnalisis.push(`${m.numero} ${x.descripcion} (${x.total} ${x.unidad})${mejor ? ` — el más parecido: «${mejor.n.i.descripcion}» (${Math.round(mejor.s * 100)} %)` : ''}`);
      return { ...p, precioUnitario: 0, _sinAnalisis: true };
    }) };
  });
  const quitar = (k, v) => (k.startsWith('_') ? undefined : v);
  writeFileSync(`${salida}-proyecto.json`, JSON.stringify({ civix: 1, tipo: 'proyecto', proyecto: { nombre, plantilla: 'Normas básicas del SABS', decimalesCalculo: 2 }, modulos }, quitar));
  writeFileSync(`${salida}-enlaces.json`, JSON.stringify(modulos, null, 1));
  writeFileSync(`${salida}-informe-proyecto.json`, JSON.stringify(informe, null, 1));
  console.log(`módulos ${informe.modulos}; partidas ${informe.partidas}; con análisis ${informe.enlazadas}; sin análisis ${informe.sinAnalisis.length}; cómputos con líneas ilegibles ${informe.ajustadas.length}; capítulos repetidos ${repetidos.length}`);
}
