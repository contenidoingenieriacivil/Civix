import type { BaseDatos, Proyecto } from '../datos/modelo';
import { CRONOGRAMA_DEFECTO } from '../nucleo/cronograma';
import { calcularProyecto } from '../nucleo/presupuesto';
import { ajustarPrecios, agregarItemDeBase, agregarModulo, buscarInsumos, buscarModulo, buscarPartidas, sinAcentos } from '../nucleo/operaciones';
import { PLANTILLAS_PREDEFINIDAS } from '../nucleo/plantillas';
import type { Rubro } from '../nucleo/tipos';
import { aNumero } from './intercambio';

/** Lenguaje de órdenes: lista de acciones que cualquier IA puede redactar y Civix ejecuta sin conexión. */
export type Orden =
  | { accion: 'ajustar_precios'; porcentaje: number; texto?: string; rubro?: string }
  | { accion: 'fijar_precio'; insumo: string; precio: number }
  | { accion: 'crear_modulo'; nombre: string }
  | { accion: 'agregar_partida'; item: string; cantidad: number; modulo?: string | number }
  | { accion: 'fijar_cantidad'; partida: string; cantidad: number }
  | { accion: 'eliminar_partida'; partida: string }
  | { accion: 'configurar_parametro'; parametro: string; porcentaje: number }
  | { accion: 'elegir_plantilla'; nombre: string }
  | { accion: 'datos_proyecto'; nombre?: string; lugar?: string; cliente?: string; responsable?: string }
  | { accion: 'fijar_cuadrilla'; partida: string; cuadrilla: number }
  | { accion: 'configurar_cronograma'; horasDia?: number; diasLaborables?: number }
  | { accion: 'generar_reporte'; reporte: 'B-1' | 'B-2' | 'B-3' | 'B-4' | 'A-8' | 'resumen' };

export interface ResultadoOrdenes {
  proyecto: Proyecto;
  /** Qué hizo (o haría) cada orden, en español, para mostrar la vista previa. */
  registro: string[];
  errores: string[];
  /** Reportes pedidos: los genera la interfaz. */
  reportes: string[];
}

const RUBRO: Record<string, Rubro> = { material: 'M', materiales: 'M', mano_de_obra: 'O', mano: 'O', obrero: 'O', equipo: 'E', equipos: 'E', maquinaria: 'E' };

/**
 * Ejecuta las órdenes sobre una COPIA del proyecto. Si alguna falla, esa orden se omite y se informa;
 * la interfaz muestra el registro como vista previa y solo aplica el resultado al confirmar.
 */
export function ejecutarOrdenes(original: Proyecto, ordenes: Orden[], bases: BaseDatos[] = []): ResultadoOrdenes {
  const proyecto = structuredClone(original);
  const registro: string[] = [];
  const errores: string[] = [];
  const reportes: string[] = [];
  const falla = (k: number, msg: string) => errores.push(`Orden ${k + 1}: ${msg}`);

  ordenes.forEach((o, k) => {
    try {
      switch (o.accion) {
        case 'ajustar_precios': {
          const rubro = o.rubro ? RUBRO[sinAcentos(o.rubro).replace(/ /g, '_')] : undefined;
          if (o.rubro && !rubro) return falla(k, `rubro desconocido "${o.rubro}"`);
          const objetivo = o.texto ? buscarInsumos(proyecto, o.texto, rubro) : proyecto.insumos.filter((i) => !rubro || i.rubro === rubro);
          if (!objetivo.length) return falla(k, `ningún insumo coincide con "${o.texto ?? ''}"`);
          ajustarPrecios(objetivo, o.porcentaje);
          registro.push(`Precios ${o.porcentaje >= 0 ? 'subidos' : 'bajados'} ${Math.abs(o.porcentaje)} % en ${objetivo.length} insumo(s)${o.texto ? ` que contienen "${o.texto}"` : ''}.`);
          return;
        }
        case 'fijar_precio': {
          const c = buscarInsumos(proyecto, o.insumo);
          if (c.length !== 1) return falla(k, c.length ? `"${o.insumo}" coincide con ${c.length} insumos: ${c.slice(0, 4).map((i) => i.descripcion).join('; ')}` : `no existe el insumo "${o.insumo}"`);
          registro.push(`${c[0]!.descripcion}: precio ${c[0]!.precio} → ${o.precio}.`);
          c[0]!.precio = o.precio;
          return;
        }
        case 'crear_modulo':
          agregarModulo(proyecto, o.nombre.toUpperCase());
          registro.push(`Módulo "${o.nombre.toUpperCase()}" creado.`);
          return;
        case 'agregar_partida': {
          const m = o.modulo === undefined ? 1 : buscarModulo(proyecto, o.modulo);
          if (m < 0) return falla(k, `no existe el módulo "${o.modulo}"`);
          const q = sinAcentos(o.item);
          const hallados = bases.flatMap((b) => b.items.filter((i) => sinAcentos(i.descripcion).includes(q)).map((i) => ({ b, i })));
          const exacto = hallados.filter((h) => sinAcentos(h.i.descripcion) === q);
          const cand = exacto.length ? exacto : hallados;
          if (cand.length !== 1) return falla(k, cand.length ? `"${o.item}" coincide con ${cand.length} ítems: ${cand.slice(0, 4).map((h) => h.i.descripcion).join('; ')}` : `no se encontró el ítem "${o.item}" en las bases de datos abiertas`);
          agregarItemDeBase(proyecto, cand[0]!.b, cand[0]!.i.id, m, o.cantidad);
          registro.push(`Partida "${cand[0]!.i.descripcion}" (${o.cantidad} ${cand[0]!.i.unidad}) añadida al módulo ${proyecto.modulos[m - 1]!.nombre}.`);
          return;
        }
        case 'fijar_cantidad': {
          const ps = buscarPartidas(proyecto, o.partida);
          if (ps.length !== 1) return falla(k, ps.length ? `"${o.partida}" coincide con ${ps.length} partidas` : `no existe la partida "${o.partida}"`);
          registro.push(`${ps[0]!.descripcion}: cantidad ${ps[0]!.cantidad} → ${o.cantidad}.`);
          ps[0]!.cantidad = o.cantidad;
          return;
        }
        case 'eliminar_partida': {
          const ps = buscarPartidas(proyecto, o.partida);
          if (ps.length !== 1) return falla(k, ps.length ? `"${o.partida}" coincide con ${ps.length} partidas` : `no existe la partida "${o.partida}"`);
          proyecto.partidas.splice(proyecto.partidas.indexOf(ps[0]!), 1);
          registro.push(`Partida "${ps[0]!.descripcion}" eliminada.`);
          return;
        }
        case 'configurar_parametro': {
          const q = sinAcentos(o.parametro);
          const p = proyecto.plantilla.parametros.find((x) => x.letra.toLowerCase() === q) ?? proyecto.plantilla.parametros.find((x) => x.descripcion && sinAcentos(x.descripcion).includes(q));
          if (!p) return falla(k, `no existe el parámetro "${o.parametro}" en la plantilla`);
          if (p.porcentaje === null) return falla(k, `el parámetro ${p.letra} (${p.descripcion}) no tiene porcentaje`);
          registro.push(`${p.descripcion} (${p.letra}): ${p.porcentaje} % → ${o.porcentaje} %.`);
          p.porcentaje = o.porcentaje;
          return;
        }
        case 'elegir_plantilla': {
          const pl = PLANTILLAS_PREDEFINIDAS.find((x) => sinAcentos(x.nombre).includes(sinAcentos(o.nombre)));
          if (!pl) return falla(k, `plantilla desconocida "${o.nombre}"`);
          proyecto.plantilla = structuredClone(pl);
          registro.push(`Plantilla de cálculo: ${pl.nombre}.`);
          return;
        }
        case 'datos_proyecto':
          for (const c of ['nombre', 'lugar', 'cliente', 'responsable'] as const) if (o[c] !== undefined) proyecto[c] = o[c]!;
          registro.push('Datos generales del proyecto actualizados.');
          return;
        case 'fijar_cuadrilla': {
          const ps = buscarPartidas(proyecto, o.partida);
          if (ps.length !== 1) return falla(k, ps.length ? `"${o.partida}" coincide con ${ps.length} partidas` : `no existe la partida "${o.partida}"`);
          if (!(o.cuadrilla >= 1)) return falla(k, 'la cuadrilla debe ser 1 o más');
          registro.push(`${ps[0]!.descripcion}: cuadrilla ${ps[0]!.cuadrilla ?? 1} → ${Math.round(o.cuadrilla)}.`);
          ps[0]!.cuadrilla = Math.round(o.cuadrilla);
          return;
        }
        case 'configurar_cronograma': {
          const c = { ...CRONOGRAMA_DEFECTO, ...(proyecto.cronograma ?? {}) };
          if (o.horasDia !== undefined) { if (!(o.horasDia > 0 && o.horasDia <= 24)) return falla(k, 'horasDia debe estar entre 1 y 24'); c.horasDia = o.horasDia; }
          if (o.diasLaborables !== undefined) { if (!(o.diasLaborables >= 1 && o.diasLaborables <= 7)) return falla(k, 'diasLaborables debe estar entre 1 y 7'); c.diasLaborables = Math.round(o.diasLaborables); }
          proyecto.cronograma = c;
          registro.push(`Cronograma: ${c.horasDia} h/día, ${c.diasLaborables} días laborables por semana.`);
          return;
        }
        case 'generar_reporte':
          reportes.push(o.reporte);
          registro.push(`Se generará el formulario/reporte ${o.reporte}.`);
          return;
        default:
          return falla(k, `acción desconocida "${(o as { accion: string }).accion}"`);
      }
    } catch (e) {
      falla(k, e instanceof Error ? e.message : String(e));
    }
  });

  if (ordenes.length) {
    const antes = calcularProyecto(original).total, despues = calcularProyecto(proyecto).total;
    if (antes !== despues) registro.push(`Total del presupuesto: ${antes} → ${despues}.`);
  }
  return { proyecto, registro, errores, reportes };
}

/** Intérprete de frases sencillas en español, sin IA ni conexión. Devuelve null si no entiende. */
export function interpretarFrase(frase: string): Orden | null {
  const f = sinAcentos(frase).replace(/\s+/g, ' ');
  const pct = (s: string) => aNumero(s.replace('%', ''));
  let m = /^(sube|aumenta|incrementa|baja|reduce|disminuye) (?:un |el )?([\d.,]+) ?% (?:a |al |el |la |los |las |de |del )*(.+)$/.exec(f);
  if (m) {
    const p = pct(m[2]!); if (p === null) return null;
    const signo = /^(baja|reduce|disminuye)/.test(m[1]!) ? -1 : 1;
    const resto = m[3]!.replace(/^(todos |todas )?(los |las )?(precios|insumos)( de| del)? ?/, '').trim();
    const rub = RUBRO[resto.replace(/ /g, '_')];
    return { accion: 'ajustar_precios', porcentaje: signo * p, ...(rub ? { rubro: resto } : resto ? { texto: resto } : {}) };
  }
  m = /^(?:cambia|pon|fija|configura) (?:las |los |la |el )?(.+?) (?:a|en|al) ([\d.,]+) ?%?$/.exec(f);
  if (m) { const p = pct(m[2]!); return p === null ? null : { accion: 'configurar_parametro', parametro: m[1]!, porcentaje: p }; }
  m = /^(?:agrega|anade|añade|incluye|pon) ([\d.,]+) ?(?:m2|m3|m|pza|glb|kg|ml|hr)?(?:²|³)? (?:de |del )(.+?)(?: (?:al|en el) modulo (.+))?$/.exec(f);
  if (m) { const c = aNumero(m[1]!); return c === null ? null : { accion: 'agregar_partida', item: m[2]!, cantidad: c, ...(m[3] ? { modulo: m[3] } : {}) }; }
  m = /^(?:crea|anade|añade|agrega) (?:un )?modulo (.+)$/.exec(f);
  if (m) return { accion: 'crear_modulo', nombre: m[1]! };
  m = /^(?:genera|imprime|muestra|dame) (?:el )?(?:formulario )?([ab]-?[1-8])$/.exec(f);
  if (m) return { accion: 'generar_reporte', reporte: m[1]!.toUpperCase().replace(/^([AB])(\d)$/, '$1-$2') as 'B-1' };
  m = /^usa(?:r)? (?:la )?plantilla (.+)$/.exec(f);
  if (m) return { accion: 'elegir_plantilla', nombre: m[1]! };
  return null;
}

export const INSTRUCCIONES_ORDENES = `Redacta mis pedidos como un JSON con una lista de órdenes para Civix (sin texto adicional):
[ { "accion": "ajustar_precios", "porcentaje": 5, "texto": "cemento" },
  { "accion": "fijar_precio", "insumo": "Albañil", "precio": 12.5 },
  { "accion": "crear_modulo", "nombre": "OBRA FINA" },
  { "accion": "agregar_partida", "item": "Revoque interior", "cantidad": 120, "modulo": "OBRA FINA" },
  { "accion": "fijar_cantidad", "partida": "1.3", "cantidad": 64.5 },
  { "accion": "eliminar_partida", "partida": "2.5" },
  { "accion": "configurar_parametro", "parametro": "cargas sociales", "porcentaje": 71.18 },
  { "accion": "elegir_plantilla", "nombre": "SABS" },
  { "accion": "datos_proyecto", "nombre": "...", "lugar": "...", "cliente": "..." },
  { "accion": "fijar_cuadrilla", "partida": "1.2", "cuadrilla": 3 },
  { "accion": "configurar_cronograma", "horasDia": 8, "diasLaborables": 6 },
  { "accion": "generar_reporte", "reporte": "B-1" } ]
Acciones válidas: ajustar_precios (opcional "texto" y "rubro": material|mano_de_obra|equipo), fijar_precio, crear_modulo, agregar_partida,
fijar_cantidad, eliminar_partida ("partida" = "módulo.número" o parte de la descripción), configurar_parametro, elegir_plantilla, datos_proyecto, fijar_cuadrilla, configurar_cronograma, generar_reporte (B-1, B-2, B-3, B-4, A-8, resumen).`;
