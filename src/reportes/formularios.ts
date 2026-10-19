import type { Proyecto } from '../datos/modelo';
import { montoALiteral } from '../nucleo/literal';
import { ordenLogico } from '../nucleo/calculo';
import { desgloseInsumos, resumenPorGrupo, resumenPorRubro, type ProyectoCalculado } from '../nucleo/presupuesto';
import type { Rubro } from '../nucleo/tipos';
import { documento, esc, fechaBo, num } from './formato';

const NOTA_B1 = 'NOTA. La empresa proponente declara de forma expresa que el presente Formulario contiene los mismos precios unitarios que los señalados en el Formulario B-2.';
const NOTA_B2 = 'Nota.- El Proponente declara que el presente Formulario ha sido llenado de acuerdo con las especificaciones técnicas, aplicando las leyes sociales y tributarias vigentes, y es consistente con el Formulario B-3.';
const NOTA_B3 = 'Nota.- El presente Formulario es una declaración jurada que asegura que lo señalado en cada rubro como Costo Directo (Sin que este afectado por alguna incidencia), corresponde a los Análisis de Precios Unitarios desarrollados en los Formularios B-2.';
const NOTA_B4 = 'Nota.- El TOTAL refleja el costo total por hora de cada equipo y corresponden a los incluidos en los FORMULARIOS B-2';

const MONEDA = (p: Proyecto) => (p.moneda === 1 ? 'Dólares americanos' : 'Bolivianos');

function cabecera(p: Proyecto): string {
  return `<table class="meta"><tr><td><b>Proyecto:</b> ${esc(p.nombre)}</td><td><b>Fecha:</b> ${fechaBo(p.fecha)}</td></tr>
<tr><td><b>Cliente:</b> ${esc(p.cliente)}</td><td><b>Lugar:</b> ${esc(p.lugar)}</td></tr></table>`;
}

const firma = (t: string) => `<div class="firma"><div>${t}</div></div>`;

/** Formulario B-1: presupuesto por ítems y general de la obra. */
export function formularioB1(c: ProyectoCalculado): string {
  const p = c.proyecto;
  const d = c.decimales;
  let n = 0;
  const filas = c.modulos.map((m) => {
    const encabezado = c.modulos.length > 1 ? `<tr class="sub"><td colspan="7">${esc(m.nombre)}</td></tr>` : '';
    const cuerpo = m.partidas.map((x) => `<tr><td class="c">${++n}</td><td>${esc(x.partida.descripcion)}</td><td class="c">${esc(x.partida.unidad)}</td>
<td class="n">${num(x.partida.cantidad, 2)}</td><td class="n">${num(x.precioUnitario, d)}</td><td>${esc(montoALiteral(x.precioUnitario, '').replace(/^Son: /, '').trim())}</td><td class="n">${num(x.parcial, d)}</td></tr>`).join('');
    const sub = c.modulos.length > 1 ? `<tr class="sub"><td colspan="6" class="n">TOTAL ${esc(m.nombre)}</td><td class="n">${num(m.total, d)}</td></tr>` : '';
    return encabezado + cuerpo + sub;
  }).join('');
  return documento('Formulario B-1', `<h1>FORMULARIO B-1</h1><h2>PRESUPUESTO POR ÍTEMES Y GENERAL DE LA OBRA<br>(en ${MONEDA(p)})</h2>${cabecera(p)}
<table class="t"><thead><tr><th>Ítem</th><th>Descripción</th><th>Unidad</th><th>Cantidad</th><th>Prec.Unit. (numeral)</th><th>Prec.Unit. (literal)</th><th>Prec. Total</th></tr></thead>
<tbody>${filas}<tr class="tot"><td colspan="6" class="n">TOTAL PRESUPUESTO</td><td class="n">${num(c.total, d)}</td></tr></tbody></table>
<p><b>${esc(montoALiteral(c.total, MONEDA(p)))}</b></p><p class="nota">${NOTA_B1}</p>${firma('Firma del representante legal del proponente')}`);
}

/** Formulario B-2: análisis de precios unitarios de cada ítem (una hoja por ítem). */
export function formularioB2(c: ProyectoCalculado): string {
  const p = c.proyecto;
  const d = c.decimales;
  let n = 0;
  const hojas = c.modulos.flatMap((m) => m.partidas).map((x) => {
    n++;
    const v = x.apu.valores;
    const lineas = (titulo: string, ls: typeof x.partida.item.materiales, total: number) => {
      const filas = ls.map((l) => {
        const i = c.insumos.get(l.insumo);
        if (!i) return '';
        return `<tr><td>${esc(i.descripcion)}</td><td class="c">${esc(i.unidad)}</td><td class="n">${num(l.rendimiento, 4)}</td><td class="n">${num(i.precio, 3)}</td><td class="n">${num(l.rendimiento * i.precio, d)}</td></tr>`;
      }).join('');
      return `<tr class="sub"><td colspan="5">${titulo}</td></tr>${filas}<tr class="sub"><td colspan="4" class="n">Total ${titulo.toLowerCase()}</td><td class="n">${num(total, d)}</td></tr>`;
    };
    const incid = ordenLogico(p.plantilla)
      .filter((q) => !['A', 'B', 'C', 'Q'].includes(q.letra) && q.formula.trim() !== '')
      .map((q) => {
        const pct = q.porcentaje === null ? '' : ` (${num(q.porcentaje, 2)}%)`;
        return `<tr class="${q.resaltar ? 'sub' : ''}"><td colspan="4">${esc(q.descripcion)}${pct}</td><td class="n">${num(v[q.letra] ?? 0, d)}</td></tr>`;
      }).join('');
    return `<div class="pagina"><h1>FORMULARIO B-2</h1><h2>ANÁLISIS DE PRECIOS UNITARIOS</h2>${cabecera(p)}
<table class="meta"><tr><td><b>Ítem N°:</b> ${n}</td><td><b>Actividad:</b> ${esc(x.partida.descripcion)}</td><td><b>Unidad:</b> ${esc(x.partida.unidad)}</td><td><b>Moneda:</b> ${MONEDA(p)}</td></tr></table>
<table class="t"><thead><tr><th>Descripción</th><th>Unid.</th><th>Cantidad</th><th>Precio Productivo</th><th>Costo Total</th></tr></thead><tbody>
${lineas('1. MATERIALES', x.partida.item.materiales, v.A ?? 0)}${lineas('2. MANO DE OBRA', x.partida.item.manoObra, v.B ?? 0)}${lineas('3. EQUIPO, MAQUINARIA Y HERRAMIENTAS', x.partida.item.equipo, v.C ?? 0)}
${incid}<tr class="tot"><td colspan="4">TOTAL PRECIO UNITARIO ADOPTADO</td><td class="n">${num(x.precioUnitario, d)}</td></tr></tbody></table>
<p class="nota">${NOTA_B2}</p>${firma('Firma del representante legal del proponente')}</div>`;
  }).join('');
  return documento('Formulario B-2', hojas);
}

const RUBROS: [Rubro, string][] = [['M', 'MATERIALES'], ['O', 'MANO DE OBRA'], ['E', 'EQUIPO, MAQUINARIA Y HERRAMIENTAS']];

/** Formulario B-3: precios unitarios elementales (materiales, mano de obra y equipo del proyecto). */
export function formularioB3(c: ProyectoCalculado): string {
  const p = c.proyecto;
  const des = desgloseInsumos(c);
  const secciones = RUBROS.map(([r, nombre]) => {
    const filas = des[r].map((f, k) => `<tr><td class="c">${k + 1}</td><td>${esc(f.insumo.descripcion)}</td><td class="c">${esc(f.insumo.unidad)}</td><td class="n">${num(f.insumo.precio, 3)}</td></tr>`).join('');
    return des[r].length ? `<h2><b>${nombre}</b></h2><table class="t"><thead><tr><th>N°</th><th>DESCRIPCIÓN</th><th>UNIDAD</th><th>PRECIO UNITARIO</th></tr></thead><tbody>${filas}</tbody></table>` : '';
  }).join('<br>');
  return documento('Formulario B-3', `<h1>FORMULARIO B-3</h1><h2>(Precios Unitarios Elementales)</h2>${cabecera(p)}${secciones}<p class="nota">${NOTA_B3}</p>${firma('Firma del representante legal del proponente')}`);
}

/** Costo horario de un equipo: datos para el formulario B-4. */
export interface CostoEquipo {
  descripcion: string;
  potencia: number;
  basico: number;
  mantenimiento: number;
  combustibles: number;
  otros: number;
}

export const totalEquipo = (e: CostoEquipo) => e.basico + e.mantenimiento + e.combustibles + e.otros;

/** Formulario B-4: costo de trabajo de los equipos. */
export function formularioB4(c: ProyectoCalculado, equipos: CostoEquipo[]): string {
  const p = c.proyecto;
  const d = c.decimales;
  const filas = equipos.map((e) => `<tr><td>${esc(e.descripcion)}</td><td class="n">${num(e.potencia, 1)}</td><td class="n">${num(e.basico, d)}</td><td class="n">${num(e.mantenimiento, d)}</td><td class="n">${num(e.combustibles, d)}</td><td class="n">${num(e.otros, d)}</td><td class="n"><b>${num(totalEquipo(e), d)}</b></td></tr>`).join('');
  return documento('Formulario B-4', `<h1>FORMULARIO B-4</h1><h2>Costo de trabajo de los equipos</h2>${cabecera(p)}
<table class="t"><thead><tr><th>Descripción</th><th>Potencia</th><th>Básico</th><th>Mantenimiento</th><th>Combustibles</th><th>Otros</th><th>TOTAL</th></tr></thead><tbody>${filas}</tbody></table><p class="nota">${NOTA_B4}</p>${firma('Firma del representante legal del proponente')}`);
}

/** Resumen general: por módulos, por rubros (costo directo) y por grupos. */
export function reporteResumen(c: ProyectoCalculado): string {
  const p = c.proyecto;
  const d = c.decimales;
  const rubros = resumenPorRubro(c);
  const grupos = resumenPorGrupo(c);
  const modulos = c.modulos.map((m) => `<tr><td>${esc(m.nombre)}</td><td class="n">${num(m.total, d)}</td><td class="n">${num(c.total ? (m.total / c.total) * 100 : 0, 2)} %</td></tr>`).join('');
  return documento('Resumen general', `<h1>RESUMEN GENERAL DEL PRESUPUESTO</h1><h2>(en ${MONEDA(p)})</h2>${cabecera(p)}
<h2><b>Por módulos</b></h2><table class="t"><thead><tr><th>Módulo</th><th>Total</th><th>%</th></tr></thead><tbody>${modulos}<tr class="tot"><td>TOTAL PRESUPUESTO</td><td class="n">${num(c.total, d)}</td><td class="n">100,00 %</td></tr></tbody></table><br>
<h2><b>Por rubros (costo directo de insumos)</b></h2><table class="t"><thead><tr><th>Rubro</th><th>Monto</th><th>%</th></tr></thead><tbody>${rubros.map((r) => `<tr><td>${r.nombre}</td><td class="n">${num(r.monto, d)}</td><td class="n">${num(r.porcentaje, 2)} %</td></tr>`).join('')}</tbody></table><br>
<h2><b>Por grupos</b></h2><table class="t"><thead><tr><th>Grupo</th><th>Monto</th></tr></thead><tbody>${grupos.map((g) => `<tr><td>${esc(g.grupo)}</td><td class="n">${num(g.monto, d)}</td></tr>`).join('')}</tbody></table>
<p><b>${esc(montoALiteral(c.total, MONEDA(p)))}</b></p>`);
}

/** Desglose general de insumos con cantidades requeridas y montos. */
export function reporteDesgloseInsumos(c: ProyectoCalculado): string {
  const p = c.proyecto;
  const d = c.decimales;
  const des = desgloseInsumos(c);
  const secciones = RUBROS.map(([r, nombre]) => {
    const total = des[r].reduce((a, f) => a + f.monto, 0);
    const filas = des[r].map((f, k) => `<tr><td class="c">${k + 1}</td><td>${esc(f.insumo.descripcion)}</td><td class="c">${esc(f.insumo.unidad)}</td><td class="n">${num(f.cantidad, 2)}</td><td class="n">${num(f.insumo.precio, 3)}</td><td class="n">${num(f.monto, d)}</td></tr>`).join('');
    return des[r].length ? `<h2><b>${nombre}</b></h2><table class="t"><thead><tr><th>N°</th><th>Descripción</th><th>Unidad</th><th>Cantidad</th><th>P. unitario</th><th>Monto</th></tr></thead><tbody>${filas}<tr class="sub"><td colspan="5" class="n">Total ${nombre.toLowerCase()}</td><td class="n">${num(total, d)}</td></tr></tbody></table>` : '';
  }).join('<br>');
  return documento('Desglose de insumos', `<h1>DESGLOSE GENERAL DE INSUMOS</h1><h2>(requerimiento total del proyecto)</h2>${cabecera(p)}${secciones}`);
}

/** Especificaciones técnicas: una por ítem distinto del proyecto, con las que aún faltan marcadas. */
export function reporteEspecificaciones(c: ProyectoCalculado): string {
  const p = c.proyecto;
  const vistos = new Set<string>();
  let n = 0, faltan = 0;
  const bloques = c.modulos.flatMap((m) => m.partidas).filter((x) => { const k = `${x.partida.descripcion}|${x.partida.unidad}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map((x) => {
      const t = x.partida.item.especificacion?.trim();
      if (!t) faltan++;
      const cuerpo = t ? t.split(/\n{2,}/).map((par) => `<p>${esc(par).replace(/\n/g, '<br>')}</p>`).join('') : '<p class="falta"><i>(Especificación pendiente de redactar)</i></p>';
      return `<div class="et"><h3>ÍTEM ${++n}. ${esc(x.partida.descripcion.toUpperCase())}</h3><p><b>Unidad de medida:</b> ${esc(x.partida.unidad)}</p>${cuerpo}</div>`;
    }).join('');
  const css = '<style>.et{margin-bottom:5mm;page-break-inside:avoid}.et h3{font-size:10pt;margin:0 0 1.5mm;border-bottom:.3mm solid #333}.et p{margin:1mm 0;text-align:justify}.falta{color:#b45309}</style>';
  return documento('Especificaciones técnicas', `${css}<h1>ESPECIFICACIONES TÉCNICAS</h1><h2>${esc(p.nombre)}${faltan ? ` · ${faltan} de ${n} pendientes` : ''}</h2>${cabecera(p)}${bloques}`);
}

/** Cómputos métricos: líneas de medición de cada partida y su total. */
export function reporteComputos(c: ProyectoCalculado): string {
  const p = c.proyecto;
  let n = 0;
  const bloques = c.modulos.map((m) => {
    const partidas = m.partidas.map((x) => {
      n++;
      const ls = x.partida.computo;
      const filas = ls?.length
        ? ls.map((l, k) => `<tr><td class="c">${k + 1}</td><td>${esc(l.descripcion)}</td><td class="n">${l.veces !== undefined ? num(l.veces, 2) : ''}</td><td class="n">${l.largo !== undefined ? num(l.largo, 2) : ''}</td><td class="n">${l.ancho !== undefined ? num(l.ancho, 2) : ''}</td><td class="n">${l.alto !== undefined ? num(l.alto, 2) : ''}</td><td class="n">${num((l.veces ?? 1) * (l.largo ?? 1) * (l.ancho ?? 1) * (l.alto ?? 1), 2)}</td></tr>`).join('')
        : `<tr><td class="c">1</td><td colspan="5"><i>Cantidad directa (sin detalle de cómputo)</i></td><td class="n">${num(x.partida.cantidad, 2)}</td></tr>`;
      return `<h3 style="font-size:9.5pt;margin:4mm 0 1mm">${n}. ${esc(x.partida.descripcion)} <small>[${esc(x.partida.unidad)}]</small></h3>
<table class="t"><thead><tr><th>N°</th><th>Parte</th><th>Veces</th><th>Largo</th><th>Ancho</th><th>Alto</th><th>Total</th></tr></thead><tbody>${filas}<tr class="sub"><td colspan="6" class="n">TOTAL</td><td class="n">${num(x.partida.cantidad, 2)}</td></tr></tbody></table>`;
    }).join('');
    return `<h2><b>${esc(m.nombre)}</b></h2>${partidas}`;
  }).join('');
  return documento('Cómputos métricos', `<h1>CÓMPUTOS MÉTRICOS</h1><h2>${esc(p.nombre)}</h2>${cabecera(p)}${bloques}`);
}
