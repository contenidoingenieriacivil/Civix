import type { BaseDatos } from '../datos/modelo';
import { sinAcentos } from '../nucleo/operaciones';
import type { Insumo, Item, Linea, Rubro } from '../nucleo/tipos';

/**
 * Formato de intercambio "Civix": un JSON que cualquier IA puede redactar a partir de documentos,
 * cotizaciones o planillas y que la app valida antes de guardar. Los insumos de un ítem se
 * referencian por descripción (la IA no necesita manejar identificadores).
 */
export interface PaqueteDatos {
  civix: 1;
  insumos?: { descripcion: string; unidad: string; rubro: string; precio: number | string; fecha?: string; grupo?: string }[];
  items?: {
    descripcion: string; unidad: string; grupo?: string;
    insumos: { descripcion: string; rendimiento: number | string; rubro?: string }[];
  }[];
}

export interface InformeImportacion {
  insumosNuevos: number;
  insumosActualizados: number;
  itemsNuevos: number;
  itemsReemplazados: number;
  errores: string[];
  advertencias: string[];
}

const RUBROS: Record<string, Rubro> = {
  m: 'M', material: 'M', materiales: 'M',
  o: 'O', mano_de_obra: 'O', manodeobra: 'O', 'mano de obra': 'O', obrero: 'O',
  e: 'E', equipo: 'E', equipos: 'E', maquinaria: 'E', 'equipo y maquinaria': 'E',
};

export const MAX_LINEAS = { M: 30, O: 10, E: 20 } as const;

/** Acepta "1.234,56", "1234,56", "1,234.56", "12,5" y números. */
export function aNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  const c = s.lastIndexOf(','), p = s.lastIndexOf('.');
  if (c >= 0 && p >= 0) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c >= 0) s = /,\d{3}$/.test(s) && !/,\d{3}.*,/.test(s) && s.length > 4 ? s.replace(',', '') : s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const fechaIso = (v?: string): string | null => {
  if (!v) return null;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v.trim());
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
};

/** Mapa de unidades habituales a su forma de PRESCOM (m2 → m², m3 → m³, und → pza…). */
const UNIDADES: Record<string, string> = { m2: 'm²', m3: 'm³', und: 'pza', unidad: 'pza', unid: 'pza', gl: 'glb', global: 'glb', hr: 'hr', hora: 'hr', hrs: 'hr' };
export const normalizarUnidad = (u: string) => UNIDADES[u.trim().toLowerCase().replace(/\.$/, '')] ?? u.trim();

/**
 * Valida un paquete y lo fusiona en la base (no guarda nada fuera de la copia devuelta).
 * Los insumos se identifican por descripción + rubro; los ítems, por descripción.
 */
export function importarPaquete(entrada: unknown, base: BaseDatos): { base: BaseDatos; informe: InformeImportacion } {
  const informe: InformeImportacion = { insumosNuevos: 0, insumosActualizados: 0, itemsNuevos: 0, itemsReemplazados: 0, errores: [], advertencias: [] };
  const salida: BaseDatos = structuredClone(base);
  const paq = entrada as Partial<PaqueteDatos> | null;
  if (!paq || typeof paq !== 'object' || paq.civix !== 1) {
    informe.errores.push('El archivo no es un paquete Civix (falta "civix": 1).');
    return { base, informe };
  }
  let sigInsumo = Math.max(0, ...salida.insumos.map((i) => i.id)) + 1;
  const buscarInsumo = (desc: string, rubro: Rubro) => salida.insumos.find((i) => i.rubro === rubro && sinAcentos(i.descripcion) === sinAcentos(desc));
  const grupoId = (nombre?: string): number => {
    if (!nombre?.trim()) return 0;
    const q = sinAcentos(nombre);
    let k = salida.grupos.findIndex((g) => sinAcentos(g.descripcion) === q);
    if (k < 0) { salida.grupos.push({ tipo: 'I', descripcion: nombre.trim().slice(0, 30).toUpperCase() }); k = salida.grupos.length - 1; }
    return k + 1;
  };

  (paq.insumos ?? []).forEach((x, k) => {
    const etq = `insumos[${k + 1}] "${x?.descripcion ?? ''}"`;
    const rubro = RUBROS[sinAcentos(String(x?.rubro ?? '')).replace(/ /g, '_')] ?? RUBROS[sinAcentos(String(x?.rubro ?? ''))];
    const precio = aNumero(x?.precio);
    if (!x?.descripcion?.trim()) return void informe.errores.push(`${etq}: falta la descripción`);
    if (!rubro) return void informe.errores.push(`${etq}: rubro no válido ("${x.rubro}"); use material, mano_de_obra o equipo`);
    if (precio === null || precio < 0) return void informe.errores.push(`${etq}: precio no válido ("${x.precio}")`);
    if (x.descripcion.length > 70) informe.advertencias.push(`${etq}: la descripción se recortó a 70 caracteres`);
    const existente = buscarInsumo(x.descripcion, rubro);
    const fecha = fechaIso(x.fecha) ?? new Date().toISOString().slice(0, 10);
    if (existente) {
      if (existente.precio !== precio) informe.advertencias.push(`${etq}: precio actualizado de ${existente.precio} a ${precio}`);
      existente.precio = precio; existente.cotizacion = fecha; informe.insumosActualizados++;
    } else {
      const nuevo: Insumo = { id: sigInsumo++, rubro, descripcion: x.descripcion.trim().slice(0, 70), unidad: normalizarUnidad(x.unidad ?? '').slice(0, 5), precio, cotizacion: fecha, grupo: 0 };
      salida.insumos.push(nuevo); informe.insumosNuevos++;
    }
  });

  let sigItem = Math.max(0, ...salida.items.map((i) => i.id)) + 1;
  (paq.items ?? []).forEach((x, k) => {
    const etq = `items[${k + 1}] "${x?.descripcion ?? ''}"`;
    if (!x?.descripcion?.trim()) return void informe.errores.push(`${etq}: falta la descripción`);
    const lineas: Record<Rubro, Linea[]> = { M: [], O: [], E: [] };
    let ok = true;
    for (const l of x.insumos ?? []) {
      const rend = aNumero(l.rendimiento);
      const candidatos = salida.insumos.filter((i) => sinAcentos(i.descripcion) === sinAcentos(l.descripcion ?? '') && (!l.rubro || i.rubro === RUBROS[sinAcentos(l.rubro)]));
      if (candidatos.length === 0) { informe.errores.push(`${etq}: el insumo "${l.descripcion}" no existe (inclúyalo en "insumos")`); ok = false; continue; }
      if (candidatos.length > 1) informe.advertencias.push(`${etq}: "${l.descripcion}" existe en varios rubros; se usó ${candidatos[0]!.rubro}`);
      if (rend === null || rend < 0) { informe.errores.push(`${etq}: rendimiento no válido para "${l.descripcion}" ("${l.rendimiento}")`); ok = false; continue; }
      lineas[candidatos[0]!.rubro].push({ insumo: candidatos[0]!.id, rendimiento: rend });
    }
    for (const r of ['M', 'O', 'E'] as Rubro[]) if (lineas[r].length > MAX_LINEAS[r]) { informe.errores.push(`${etq}: máximo ${MAX_LINEAS[r]} insumos de ${r === 'M' ? 'materiales' : r === 'O' ? 'mano de obra' : 'equipo'}`); ok = false; }
    if (!ok) return;
    const existente = salida.items.findIndex((i) => sinAcentos(i.descripcion) === sinAcentos(x.descripcion));
    const item: Item = { id: existente >= 0 ? salida.items[existente]!.id : sigItem++, descripcion: x.descripcion.trim().slice(0, 70),
      unidad: normalizarUnidad(x.unidad ?? '').slice(0, 5), grupo: grupoId(x.grupo), materiales: lineas.M, manoObra: lineas.O, equipo: lineas.E };
    if (existente >= 0) { salida.items[existente] = item; informe.itemsReemplazados++; } else { salida.items.push(item); informe.itemsNuevos++; }
  });

  if (informe.errores.length) return { base, informe }; // todo o nada: no se guarda un paquete con errores
  return { base: salida, informe };
}

/** Texto que el usuario pega en cualquier IA (Gemini, ChatGPT, Claude…) junto con sus documentos. */
export const INSTRUCCIONES_IA = `Eres un asistente de presupuestos de obra para Bolivia. Convierte el documento que te adjunto
(cotizaciones, planillas, cómputos o análisis de precios unitarios) en UN SOLO JSON con este formato, sin texto adicional:

{
  "civix": 1,
  "insumos": [
    { "descripcion": "Cemento portland IP-30 (bolsa 50 kg)", "unidad": "bolsa", "rubro": "material", "precio": 62.50, "fecha": "2025-03-15" }
  ],
  "items": [
    { "descripcion": "Hormigón simple 1:2:3", "unidad": "m³", "grupo": "HORMIGONES",
      "insumos": [ { "descripcion": "Cemento portland IP-30 (bolsa 50 kg)", "rendimiento": 7.5 } ] }
  ]
}

Reglas:
- "rubro" es "material", "mano_de_obra" o "equipo". Precios en la moneda del documento, con punto decimal.
- "rendimiento" es la cantidad de ese insumo por UNA unidad del ítem. Un ítem admite hasta 30 materiales, 10 de mano de obra y 20 equipos.
- Toda descripción usada en un ítem debe existir en "insumos" con exactamente el mismo texto (máximo 70 caracteres).
- Unidades: m, m², m³, kg, pza, glb, hr, l, bolsa, etc. No inventes datos: si falta un precio, no incluyas ese insumo y avísame al final fuera del JSON.`;
