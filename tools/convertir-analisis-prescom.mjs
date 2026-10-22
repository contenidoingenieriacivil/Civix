// Lee análisis de precios unitarios impresos por PRESCOM (Markdown obtenido de un PDF) y los convierte a un paquete
// de datos de Civix (insumos + ítems). Admite las variantes de tabla del OCR: «1<br>- CEMENTO|KG|7.00|1.11|7.77» o
// «|1|-|CEMENTO|KG|...», encabezados «Ítem:» o «Item:» con la unidad en la misma línea o en las siguientes, y números con
// punto o coma decimal. Guarda también los valores impresos D…Q de cada análisis para compararlos con el cálculo.
// Uso: node tools/convertir-analisis-prescom.mjs anexos.md salida   →  salida-base.json, salida-apu-impreso.json
import { readFileSync, writeFileSync } from 'node:fs';

const limpiar = (t) => String(t ?? '').replace(/<br\s*\/?>/g, ' ').replace(/<\/?sup>|~~/g, '').replace(/\*\*/g, '').replace(/\\>/g, '>').replace(/\s+/g, ' ').trim();
/** Número con punto o coma decimal («1,312.13», «1.312,13», «=305.69»); null si no hay número. */
export function num(s) {
  const m = /-?\d[\d.,]*/.exec(String(s ?? '').replace(/\s/g, ''));
  if (!m) return null;
  let t = m[0].replace(/[.,]$/, '');
  const c = t.lastIndexOf(','), p = t.lastIndexOf('.');
  if (c >= 0 && p >= 0) t = c > p ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (c >= 0) t = /,\d{3}$/.test(t) && !/^-?0,/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const esNumero = (s) => /^[-=]?\s*-?\d[\d.,]*\s*$/.test(String(s).replace(/[()%]/g, '').trim());

export function leerAnalisisPrescom(md) {
  const items = [];
  let it = null, rubro = null, pendiente = null, unidadPrevia = null;
  const lineas = md.split('\n');
  for (let k = 0; k < lineas.length; k++) {
    const raw = lineas[k];
    const t = limpiar(raw.replace(/^#+\s*/, ''));
    // a veces la unidad está impresa justo antes del «Ítem:»
    if (!raw.startsWith('|') && !/(?:Í|I)tem:/.test(t)) { const u = /^Unidad:\s*(\S+)$/.exec(t); if (u) unidadPrevia = { u: u[1].replace(/\.$/, ''), k }; }
    const h = /(?:Í|I)tem:\s*(.+?)(?:\s+Unidad:\s*(\S+))?(?:\s+Proyecto:|\s+Fecha:|$)/.exec(t);
    if (h && !raw.startsWith('|')) {
      const modulo = /Módulo:\s*\((M\d+)\)\s*-\s*(.+?)(?:\s+Tipo de cambio|$)/.exec(t);
      it = { descripcion: h[1].trim(), unidad: (h[2] ?? '').replace(/\.$/, ''), modulo: modulo ? `${modulo[1]} - ${modulo[2].trim()}` : null, insumos: [], impreso: {}, pct: {}, adoptado: null };
      if (!it.unidad && unidadPrevia && k - unidadPrevia.k <= 4) it.unidad = unidadPrevia.u;
      items.push(it); rubro = null; pendiente = it.unidad ? null : it;
      continue;
    }
    if (pendiente && !raw.startsWith('|')) { const u = /Unidad:\s*(\S+)/.exec(t); if (u) { pendiente.unidad = u[1].replace(/\.$/, ''); pendiente = null; } continue; }
    if (!it || !raw.startsWith('|')) continue;
    const c = raw.trim().replace(/^\||\|$/g, '').split('|').map(limpiar);
    const texto = c.join(' ').trim();
    if (!texto || /^-+$/.test(c[0] ?? '')) continue;
    if (/Insumo\/Par/i.test(texto)) { if (/MATERIALES/.test(texto)) rubro = 'material'; continue; } // a veces el título del rubro queda en el encabezado
    if (/PRECIO ADOPTADO/i.test(texto)) { it.adoptado = num(c.filter((x) => x).at(-1)); it = null; continue; }
    // títulos de rubro
    const r = /^(?:>\s*)?(?:[ABC]\s+)?(MATERIALES|MANO DE OBRA|EQUIPO)/.exec(texto);
    if (r && !c.slice(1).some((x) => esNumero(x))) { rubro = r[1] === 'MATERIALES' ? 'material' : r[1] === 'MANO DE OBRA' ? 'mano_de_obra' : 'equipo'; continue; }
    // parámetros D…Q: «> D TOTAL MATERIALES … (A) = 17.89», «F Cargas Sociales … 55.00% de (E)= 21.11»
    const p = /^(?:>\s*)?([D-Q])\b\s*(.*)$/.exec(texto.replace(/^>\s*/, '> '));
    const letra = p && /^(D|E|F|G|H|I|J|L|M|N|O|P|Q)$/.test(p[1]) && !/^\d/.test(c[0] ?? '') ? p[1] : null;
    if (letra && /(TOTAL|SUBTOTAL|SUB TOTAL|PARCIAL|Cargas|Impuesto|Herramientas|Gastos|Utilidad)/i.test(texto)) {
      const valor = num(c.filter((x) => x).at(-1));
      if (valor !== null) it.impreso[letra] = valor;
      const pc = /([\d.,]+)\s*%\s*de/.exec(texto);
      if (pc) it.pct[letra] = num(pc[1]);
      continue;
    }
    // línea de insumo: …descripción | unidad | cantidad | precio | parcial
    if (!rubro) continue;
    const llenas = c.filter((x) => x !== '');
    if (llenas.length < 4) continue;
    const [cant, pu, parcial] = llenas.slice(-3).map(num);
    const und = llenas.at(-4);
    if (cant === null || pu === null || parcial === null || esNumero(und)) continue;
    const desc = llenas.slice(0, -4).join(' ').replace(/^\d+\s*-?\s*/, '').replace(/^-\s*/, '').trim();
    if (!desc) continue;
    // la cantidad impresa puede estar redondeada: si no reproduce el parcial, se recupera de él
    const rend = pu > 0 && Math.abs(Math.round(cant * pu * 100) / 100 - parcial) > 0.005 ? parcial / pu : cant;
    it.insumos.push({ descripcion: desc, unidad: und, rubro, rendimiento: rend, precio: pu, parcial });
  }
  return items.filter((x) => x.insumos.length || x.impreso.Q);
}

/** Paquete de datos de Civix: variantes de precio del mismo insumo y nombres de ítem repetidos se distinguen. */
export function aPaquete(apu) {
  const precios = new Map(), insumos = [];
  const clave = (r, d) => `${r}|${d.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')}`;
  const DEF = { F: 55, O: 14.94, H: 5, L: 10, M: 10, P: 3.09 };
  const vistos = new Map();
  const items = apu.map((x, idx) => {
    const lineas = x.insumos.map((l) => {
      let nombre = l.descripcion;
      const previo = precios.get(clave(l.rubro, nombre));
      if (previo !== undefined && Math.abs(previo - l.precio) > 1e-9) nombre = `${l.descripcion} [Bs ${l.precio.toFixed(2).replace('.', ',')}]`;
      if (!precios.has(clave(l.rubro, nombre))) { precios.set(clave(l.rubro, nombre), l.precio); insumos.push({ descripcion: nombre, unidad: l.unidad, rubro: l.rubro, precio: l.precio }); }
      return { descripcion: nombre, rubro: l.rubro, rendimiento: l.rendimiento };
    });
    const k = x.descripcion.toLowerCase();
    let nombre = x.descripcion;
    if (vistos.has(k)) nombre = `${x.descripcion} (${String(x.impreso.Q ?? x.adoptado).replace('.', ',')})`;
    if (vistos.has(nombre.toLowerCase())) nombre = `${nombre} #${idx + 1}`;
    vistos.set(nombre.toLowerCase(), true);
    vistos.set(k, true);
    x.nombre = nombre;
    const desv = Object.fromEntries(Object.entries(x.pct).filter(([L, v]) => DEF[L] !== undefined && Math.abs(DEF[L] - v) > 1e-9));
    return { descripcion: nombre, unidad: x.unidad || 'glb', ...(Object.keys(desv).length ? { porcentajes: desv } : {}), insumos: lineas };
  });
  return { civix: 1, insumos, items };
}

if (process.argv[1]?.endsWith('convertir-analisis-prescom.mjs')) {
  const [,, entrada, salida] = process.argv;
  const apu = leerAnalisisPrescom(readFileSync(entrada, 'utf8'));
  const paquete = aPaquete(apu);
  writeFileSync(`${salida}-base.json`, JSON.stringify(paquete));
  writeFileSync(`${salida}-apu-impreso.json`, JSON.stringify(Object.fromEntries(apu.map((a) => [a.nombre, { impreso: a.impreso, adoptado: a.adoptado, modulo: a.modulo, unidad: a.unidad }]))));
  console.log(`análisis ${apu.length}; insumos ${paquete.insumos.length}; sin unidad ${apu.filter((a) => !a.unidad).length}; sin Q impreso ${apu.filter((a) => a.impreso.Q === undefined).length}; sin insumos ${apu.filter((a) => !a.insumos.length).length}`);
}
