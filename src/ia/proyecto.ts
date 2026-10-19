import type { BaseDatos, LineaComputo, Partida, Proyecto } from '../datos/modelo';
import { agregarItemDeBase, cantidadDeComputo, nuevoProyecto, sinAcentos } from '../nucleo/operaciones';
import { PLANTILLAS_PREDEFINIDAS, PLANTILLA_SABS } from '../nucleo/plantillas';
import { aNumero } from './intercambio';

/**
 * Paquete de proyecto: lo que el usuario le pide a una IA a partir de sus cómputos métricos,
 * especificaciones y de un presupuesto o lista de partidas. Cada partida referencia un ítem de
 * las bases (por código o descripción) o trae su precio unitario directo.
 */
export interface PaqueteProyecto {
  civix: 1;
  tipo: 'proyecto';
  proyecto: {
    nombre: string; lugar?: string; cliente?: string; fecha?: string; responsable?: string;
    /** "Bs" o "USD". */ moneda?: string; tipoCambio?: number | string;
    /** Nombre de una plantilla de cálculo: "Normas básicas del SABS", "Costo directo"… */
    plantilla?: string;
    /** Cambios de porcentaje sobre la plantilla, p. ej. [{ "parametro": "cargas sociales", "porcentaje": 55 }]. */
    parametros?: { parametro: string; porcentaje: number | string }[];
    memo?: string;
  };
  modulos: {
    nombre: string;
    partidas: {
      descripcion?: string; unidad?: string;
      /** Cantidad total; si hay "computo", se calcula de él. */
      cantidad?: number | string;
      computo?: { descripcion: string; veces?: number | string; largo?: number | string; ancho?: number | string; alto?: number | string }[];
      /** Código o descripción del ítem en las bases de datos cargadas. */
      item?: string;
      precioUnitario?: number | string;
      especificacion?: string;
    }[];
  }[];
}

export interface InformeProyecto { errores: string[]; advertencias: string[]; partidas: number; conAnalisis: number; precioDirecto: number }

const n = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : aNumero(v));

export function importarProyecto(entrada: unknown, bases: BaseDatos[]): { proyecto: Proyecto | null; informe: InformeProyecto } {
  const informe: InformeProyecto = { errores: [], advertencias: [], partidas: 0, conAnalisis: 0, precioDirecto: 0 };
  const paq = entrada as Partial<PaqueteProyecto> | null;
  if (!paq || typeof paq !== 'object' || paq.civix !== 1 || paq.tipo !== 'proyecto' || !paq.proyecto || !Array.isArray(paq.modulos)) {
    informe.errores.push('El archivo no es un proyecto de Civix (se espera {"civix":1,"tipo":"proyecto","proyecto":{…},"modulos":[…]}).');
    return { proyecto: null, informe };
  }
  const d = paq.proyecto;
  const plantilla = d.plantilla ? PLANTILLAS_PREDEFINIDAS.find((x) => sinAcentos(x.nombre).includes(sinAcentos(d.plantilla!))) : PLANTILLA_SABS;
  if (!plantilla) informe.errores.push(`Plantilla desconocida "${d.plantilla}". Disponibles: ${PLANTILLAS_PREDEFINIDAS.map((x) => x.nombre).join('; ')}`);
  const p = nuevoProyecto(String(d.nombre ?? 'Proyecto').slice(0, 70), structuredClone(plantilla ?? PLANTILLA_SABS));
  p.lugar = d.lugar ?? ''; p.cliente = d.cliente ?? ''; p.responsable = d.responsable ?? ''; p.memo = d.memo ?? '';
  if (d.fecha) p.fecha = d.fecha;
  p.moneda = /^(usd|\$us|\$)/i.test(String(d.moneda ?? 'Bs')) ? 1 : 2;
  const tc = n(d.tipoCambio); if (tc) p.cambioDolar = tc;
  p.modulos = [];
  for (const o of d.parametros ?? []) {
    const q = sinAcentos(String(o.parametro));
    const par = p.plantilla.parametros.find((x) => x.letra.toLowerCase() === q) ?? p.plantilla.parametros.find((x) => x.descripcion && sinAcentos(x.descripcion).includes(q));
    const pct = n(o.porcentaje);
    if (!par || par.porcentaje === null || pct === undefined || pct === null) informe.errores.push(`parametros: "${o.parametro}" no existe en la plantilla o no tiene porcentaje`);
    else par.porcentaje = pct;
  }

  const buscarItem = (ref: string): { base: BaseDatos; id: number }[] => {
    const q = sinAcentos(ref);
    const todos = bases.flatMap((b) => b.items.map((i) => ({ b, i })));
    const porCodigo = todos.filter((h) => h.i.codigo && sinAcentos(h.i.codigo) === q);
    if (porCodigo.length) return porCodigo.map((h) => ({ base: h.b, id: h.i.id }));
    const exactos = todos.filter((h) => sinAcentos(h.i.descripcion) === q);
    if (exactos.length) return exactos.map((h) => ({ base: h.b, id: h.i.id }));
    return todos.filter((h) => sinAcentos(h.i.descripcion).includes(q)).map((h) => ({ base: h.b, id: h.i.id }));
  };

  paq.modulos.forEach((m, mk) => {
    p.modulos.push({ nombre: String(m.nombre ?? `MÓDULO ${mk + 1}`).toUpperCase().slice(0, 50), inicio: null, fin: null });
    (m.partidas ?? []).forEach((x, k) => {
      const etq = `módulo ${mk + 1}, partida ${k + 1} "${x?.descripcion ?? x?.item ?? ''}"`;
      let computo: LineaComputo[] | undefined;
      if (x.computo?.length) computo = x.computo.map((l) => ({ descripcion: String(l.descripcion ?? ''), veces: n(l.veces) ?? undefined, largo: n(l.largo) ?? undefined, ancho: n(l.ancho) ?? undefined, alto: n(l.alto) ?? undefined }));
      const cantidad = computo ? cantidadDeComputo(computo) : n(x.cantidad);
      if (cantidad === undefined || cantidad === null || cantidad < 0) return void informe.errores.push(`${etq}: falta una cantidad válida (cantidad o computo)`);
      let partida: Partida;
      if (x.item) {
        const hall = buscarItem(x.item);
        if (hall.length !== 1) return void informe.errores.push(`${etq}: el ítem "${x.item}" ${hall.length ? `coincide con ${hall.length} ítems de las bases` : 'no está en las bases cargadas'}`);
        partida = agregarItemDeBase(p, hall[0]!.base, hall[0]!.id, mk + 1, cantidad);
        if (x.descripcion) partida.descripcion = x.descripcion.slice(0, 70);
        if (x.unidad) partida.unidad = x.unidad.slice(0, 5);
        if (x.precioUnitario !== undefined) informe.advertencias.push(`${etq}: se ignoró precioUnitario porque el ítem tiene análisis en la base`);
        informe.conAnalisis++;
      } else {
        const pu = n(x.precioUnitario);
        if (!x.descripcion || pu === undefined || pu === null || pu < 0) return void informe.errores.push(`${etq}: sin "item" debe traer descripcion y precioUnitario`);
        partida = { modulo: mk + 1, numero: p.partidas.filter((y) => y.modulo === mk + 1).length + 1, descripcion: x.descripcion.slice(0, 70), unidad: (x.unidad ?? '').slice(0, 5), grupo: 0, cantidad,
          item: { id: Math.max(0, ...p.partidas.map((y) => y.item.id)) + 1, descripcion: x.descripcion.slice(0, 70), unidad: (x.unidad ?? '').slice(0, 5), grupo: 0, materiales: [], manoObra: [], equipo: [], precioFijo: pu } };
        p.partidas.push(partida);
        informe.precioDirecto++;
      }
      if (computo) partida.computo = computo;
      if (x.especificacion) partida.item.especificacion = x.especificacion;
      informe.partidas++;
    });
  });
  return { proyecto: informe.errores.length ? null : p, informe };
}

/** Texto para pegar en cualquier IA junto con los cómputos métricos / el presupuesto de referencia. */
export const INSTRUCCIONES_PROYECTO = `Convierte mis cómputos métricos, especificaciones y partidas (adjuntos) en UN SOLO JSON para Civix, sin texto adicional:

{
  "civix": 1,
  "tipo": "proyecto",
  "proyecto": { "nombre": "Alcantarillado sanitario – Comunidad X", "lugar": "Tarija", "cliente": "GAM …", "fecha": "2026-03-01", "responsable": "…",
                "moneda": "Bs", "plantilla": "Normas básicas del SABS",
                "parametros": [ { "parametro": "cargas sociales", "porcentaje": 55 } ] },
  "modulos": [
    { "nombre": "OBRAS PRELIMINARES",
      "partidas": [
        { "item": "R052", "descripcion": "Replanteo y trazado de superficie", "unidad": "m2",
          "computo": [ { "descripcion": "Planta de tratamiento", "veces": 1, "largo": 120, "ancho": 95.2 } ],
          "especificacion": "Texto de la especificación técnica del ítem…" },
        { "descripcion": "Letrero de obra", "unidad": "pza", "cantidad": 1, "precioUnitario": 2944.41 }
      ] } ]
}

Reglas:
- "item": código (p. ej. R052) o descripción EXACTA de un ítem de mis bases de datos; así Civix toma su análisis de precios unitarios (B-2). Si el ítem no existe en mis bases, NO lo inventes: dame "precioUnitario" directo si lo conozco, o déjalo fuera y avísame al final.
- Cantidad: usa "cantidad" (total) o "computo" (líneas con veces, largo, ancho, alto; Civix multiplica lo informado y suma las líneas). Las unidades deben ser coherentes (m → largo; m² → largo×ancho; m³ → largo×ancho×alto).
- Respeta el orden y los módulos (capítulos) de mi presupuesto. No cambies descripciones. Números con punto decimal.
- "plantilla": "Normas básicas del SABS" (licitaciones públicas, con IVA 14,94 % e IT 3,09 %), "Costo directo" o "Formato completo más IVA".`;
