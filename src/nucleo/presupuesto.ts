import { costoHorarioEquipo } from './equipos';
import type { CostoEquipo } from '../reportes/formularios';
import type { Partida, Proyecto } from '../datos/modelo';
import { calcularItem, parcial, redondear } from './calculo';
import type { Insumo, ResultadoApu, Rubro } from './tipos';

export interface PartidaCalculada {
  partida: Partida;
  /** Número correlativo dentro del módulo (1, 2, 3…). */
  numero: number;
  apu: ResultadoApu;
  precioUnitario: number;
  parcial: number;
}

export interface ModuloCalculado {
  indice: number; // base 1
  nombre: string;
  partidas: PartidaCalculada[];
  total: number;
}

export interface ProyectoCalculado {
  proyecto: Proyecto;
  insumos: ReadonlyMap<number, Insumo>;
  modulos: ModuloCalculado[];
  total: number;
  decimales: number;
}

export function mapaInsumos(p: Proyecto): Map<number, Insumo> {
  return new Map(p.insumos.map((i) => [i.id, i]));
}

/** Calcula todo el presupuesto: PU de cada partida, parciales y totales por módulo y general. */
export function calcularProyecto(p: Proyecto, decimales = 2): ProyectoCalculado {
  const insumos = mapaInsumos(p);
  const nombres = p.modulos.length ? p.modulos : [{ nombre: 'MÓDULO ÚNICO', inicio: null, fin: null }];
  const modulos: ModuloCalculado[] = nombres.map((m, k) => {
    const delModulo = p.partidas.filter((x) => (p.modulos.length ? x.modulo === k + 1 : true));
    const partidas = delModulo.map((partida, n): PartidaCalculada => {
      // Sin detalle (APU) se respeta el precio que trae el origen.
      const apu = partida.sinDetalle && partida.referenciaPrescom
        ? { valores: { Q: partida.referenciaPrescom.precioUnitario }, precioUnitario: redondear(partida.referenciaPrescom.precioUnitario, decimales) }
        : calcularItem(partida.item, insumos, p.plantilla, decimales);
      return {
        partida, numero: n + 1, apu, precioUnitario: apu.precioUnitario,
        parcial: parcial(partida.cantidad, apu.precioUnitario, decimales),
      };
    });
    return { indice: k + 1, nombre: m.nombre, partidas, total: redondear(partidas.reduce((a, x) => a + x.parcial, 0), decimales) };
  });
  return { proyecto: p, insumos, modulos, total: redondear(modulos.reduce((a, m) => a + m.total, 0), decimales), decimales };
}

export interface FilaInsumo {
  insumo: Insumo;
  cantidad: number; // cantidad total requerida por el proyecto
  monto: number;
}

/** Desglose general de insumos (base del formulario B-3 y del requerimiento de materiales). */
export function desgloseInsumos(c: ProyectoCalculado): Record<Rubro, FilaInsumo[]> {
  const acum = new Map<number, number>();
  for (const m of c.modulos) for (const x of m.partidas) {
    for (const l of [...x.partida.item.materiales, ...x.partida.item.manoObra, ...x.partida.item.equipo]) {
      acum.set(l.insumo, (acum.get(l.insumo) ?? 0) + l.rendimiento * x.partida.cantidad);
    }
  }
  const out: Record<Rubro, FilaInsumo[]> = { M: [], O: [], E: [] };
  for (const [id, cantidad] of acum) {
    const insumo = c.insumos.get(id);
    if (!insumo) continue;
    out[insumo.rubro].push({ insumo, cantidad, monto: cantidad * insumo.precio });
  }
  for (const r of ['M', 'O', 'E'] as Rubro[]) out[r].sort((a, b) => a.insumo.descripcion.localeCompare(b.insumo.descripcion, 'es'));
  return out;
}

/** Resumen por rubro: materiales, mano de obra y equipo del presupuesto (costo directo sin incidencias). */
export function resumenPorRubro(c: ProyectoCalculado): { rubro: Rubro; nombre: string; monto: number; porcentaje: number }[] {
  const d = desgloseInsumos(c);
  const nombres: Record<Rubro, string> = { M: 'Materiales', O: 'Mano de obra', E: 'Equipo y maquinaria' };
  const total = (['M', 'O', 'E'] as Rubro[]).reduce((a, r) => a + d[r].reduce((s, f) => s + f.monto, 0), 0) || 1;
  return (['M', 'O', 'E'] as Rubro[]).map((rubro) => {
    const monto = d[rubro].reduce((s, f) => s + f.monto, 0);
    return { rubro, nombre: nombres[rubro], monto: redondear(monto, c.decimales), porcentaje: (monto / total) * 100 };
  });
}

/** Resumen por grupo (capítulo) del presupuesto. */
export function resumenPorGrupo(c: ProyectoCalculado): { grupo: string; monto: number }[] {
  const acum = new Map<string, number>();
  for (const m of c.modulos) for (const x of m.partidas) {
    const g = c.proyecto.grupos[x.partida.grupo - 1]?.descripcion || 'SIN GRUPO';
    acum.set(g, (acum.get(g) ?? 0) + x.parcial);
  }
  return [...acum].map(([grupo, monto]) => ({ grupo, monto: redondear(monto, c.decimales) }));
}

/** Costos horarios para el formulario B-4: con datos si el usuario los llenó, y si no, el precio del insumo como costo básico. */
export function costosEquipos(c: ProyectoCalculado): CostoEquipo[] {
  return desgloseInsumos(c).E.map(({ insumo }) => {
    const datos = c.proyecto.equipos?.[insumo.id];
    return datos ? costoHorarioEquipo({ ...datos, descripcion: insumo.descripcion })
      : { descripcion: insumo.descripcion, potencia: 0, basico: insumo.precio, mantenimiento: 0, combustibles: 0, otros: 0 };
  });
}

export interface Diagnostico {
  partidas: number;
  sinAnalisis: number; // precio directo: sin B-2/B-3/B-4
  sinPlazo: number; // sin días ni mano de obra: A-8 asume 1 día
  sinEspecificacion: number;
  sinComputo: number;
  /** Mensajes legibles, uno por problema que afecte a algún formulario. */
  avisos: string[];
}

/** Qué datos le faltan al proyecto para que cada formulario salga completo. */
export function diagnosticar(c: ProyectoCalculado): Diagnostico {
  const ps = c.modulos.flatMap((m) => m.partidas.map((x) => x.partida));
  const analisis = (x: (typeof ps)[number]) => x.item.precioFijo === undefined && !x.sinDetalle && (x.item.materiales.length + x.item.manoObra.length + x.item.equipo.length) > 0;
  const d: Diagnostico = {
    partidas: ps.length,
    sinAnalisis: ps.filter((x) => !analisis(x)).length,
    sinPlazo: ps.filter((x) => !((x.duracion ?? 0) > 0 || x.item.manoObra.some((l) => l.rendimiento > 0))).length,
    sinEspecificacion: ps.filter((x) => !x.item.especificacion?.trim()).length,
    sinComputo: ps.filter((x) => !x.computo?.length).length,
    avisos: [],
  };
  if (d.partidas && d.sinAnalisis) d.avisos.push(`${d.sinAnalisis} de ${d.partidas} partidas tienen precio unitario directo, sin análisis de insumos: los formularios B-2, B-3 y B-4 ${d.sinAnalisis === d.partidas ? 'no pueden generarse' : 'quedan incompletos'}. Cargue el análisis de precios unitarios (Importar de IA → «Instrucciones: datos») y vuelva a importar el proyecto referenciando esos ítems.`);
  if (d.partidas && d.sinPlazo) d.avisos.push(`${d.sinPlazo} de ${d.partidas} partidas no tienen plazo (ni días fijados ni mano de obra): el cronograma A-8 les asume 1 día. Escriba los días en Cronograma → columna «Días», o impórtelos con «duracion».`);
  if (d.partidas && d.sinEspecificacion) d.avisos.push(`${d.sinEspecificacion} de ${d.partidas} partidas no tienen especificación técnica.`);
  return d;
}
