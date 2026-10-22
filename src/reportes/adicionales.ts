import type { Proyecto } from '../datos/modelo';
import { flujoInversiones, requerimientoMensual, type Flujo } from '../nucleo/herramientas';
import { montoALiteral } from '../nucleo/literal';
import { resumenPorRubro, type ProyectoCalculado } from '../nucleo/presupuesto';
import { CRONOGRAMA_DEFECTO } from '../nucleo/cronograma';
import { documento, esc, num } from './formato';
import { cabecera, firmasProyecto } from './formularios';

const MONEDA = (p: Proyecto) => (p.moneda === 1 ? 'Dólares americanos' : 'Bolivianos');
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const mes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const COLORES = ['#1d4e89', '#c0392b', '#2e7d32', '#b45309', '#6b21a8', '#0e7490', '#9d174d', '#4d7c0f'];
const vacio = (t: string) => `<div class="aviso"><b>Sin datos:</b> ${t}</div>`;

/** Presupuesto por incidencia: partidas de mayor a menor costo, con su porcentaje y el acumulado (análisis ABC). */
export function reporteIncidencia(c: ProyectoCalculado): string {
  const p = c.proyecto;
  const todas = c.modulos.flatMap((m) => m.partidas.map((x) => ({ m, x }))).sort((a, b) => b.x.parcial - a.x.parcial);
  let acum = 0;
  const filas = todas.map(({ m, x }, k) => {
    const pct = c.total ? (x.parcial / c.total) * 100 : 0;
    acum += pct;
    const clase = acum <= 80.0001 ? 'A' : acum <= 95.0001 ? 'B' : 'C';
    return `<tr><td class="c">${k + 1}</td><td class="c">${m.indice}.${x.numero}</td><td>${esc(x.partida.descripcion)}</td><td class="c">${esc(x.partida.unidad)}</td><td class="n">${num(x.parcial, c.decimales)}</td><td class="n">${num(pct, 2)} %</td><td class="n">${num(Math.min(acum, 100), 2)} %</td><td class="c">${clase}</td></tr>`;
  }).join('');
  return documento('Presupuesto por incidencia', `<h1>PRESUPUESTO POR INCIDENCIA</h1><h2>(partidas ordenadas por su costo · en ${MONEDA(p)})</h2>${cabecera(p)}
${todas.length ? `<table class="t"><thead><tr><th>N°</th><th>Ítem</th><th>Descripción</th><th>Unid.</th><th>Parcial</th><th>Incidencia</th><th>Acumulado</th><th>Clase</th></tr></thead><tbody>${filas}
<tr class="tot"><td colspan="4" class="n">TOTAL</td><td class="n">${num(c.total, c.decimales)}</td><td class="n">100,00 %</td><td colspan="2"></td></tr></tbody></table>
<p class="nota">Clase A: partidas que suman el 80 % del costo (controlarlas con más cuidado); B: hasta el 95 %; C: el resto.</p>` : vacio('el proyecto no tiene partidas.')}${firmasProyecto(p)}`);
}

/** Desglose de insumos por ítem (requerimiento de materiales, mano de obra y equipo de cada partida). */
export function reporteInsumosPorItem(c: ProyectoCalculado): string {
  const p = c.proyecto;
  const ins = c.insumos;
  const bloques = c.modulos.flatMap((m) => m.partidas.map((x) => {
    const ls = ([['Materiales', x.partida.item.materiales], ['Mano de obra', x.partida.item.manoObra], ['Equipo', x.partida.item.equipo]] as const).flatMap(([r, l]) => l.map((y) => ({ r, y, i: ins.get(y.insumo) })).filter((z) => z.i));
    if (!ls.length) return '';
    return `<tr class="sub"><td colspan="6">${m.indice}.${x.numero} ${esc(x.partida.descripcion)} — ${num(x.partida.cantidad, 2)} ${esc(x.partida.unidad)}</td></tr>` +
      ls.map(({ r, y, i }) => `<tr><td>${r}</td><td>${esc(i!.descripcion)}</td><td class="c">${esc(i!.unidad)}</td><td class="n">${num(y.rendimiento, 4)}</td><td class="n">${num(y.rendimiento * x.partida.cantidad, 2)}</td><td class="n">${num(y.rendimiento * x.partida.cantidad * i!.precio, 2)}</td></tr>`).join('');
  })).join('');
  return documento('Insumos por ítem', `<h1>DESGLOSE DE INSUMOS POR ÍTEM</h1><h2>(requerimiento de cada partida: rendimiento × cantidad)</h2>${cabecera(p)}
${bloques ? `<table class="t"><thead><tr><th>Rubro</th><th>Insumo</th><th>Unid.</th><th>Rendimiento</th><th>Cantidad requerida</th><th>Costo directo</th></tr></thead><tbody>${bloques}</tbody></table>` : vacio('ninguna partida tiene análisis de insumos (todas tienen precio directo).')}${firmasProyecto(p)}`);
}

/** Curva S (avance acumulado) en SVG. */
function curvaS(f: Flujo): string {
  if (f.meses.length < 1) return '';
  const W = 700, H = 230, x0 = 46, y0 = 200, an = W - x0 - 12, al = 180;
  const max = Math.max(...f.total, 1);
  const paso = an / f.meses.length;
  const barras = f.total.map((v, k) => `<rect x="${x0 + k * paso + paso * 0.15}" y="${y0 - (v / max) * al * 0.6}" width="${paso * 0.7}" height="${(v / max) * al * 0.6}" fill="#9db9dc"/>`).join('');
  const puntos = f.porcentajeAcumulado.map((v, k) => `${x0 + (k + 1) * paso},${y0 - (v / 100) * al}`).join(' ');
  const ejes = [0, 25, 50, 75, 100].map((v) => `<line x1="${x0}" x2="${W - 12}" y1="${y0 - (v / 100) * al}" y2="${y0 - (v / 100) * al}" stroke="#ddd"/><text x="${x0 - 4}" y="${y0 - (v / 100) * al + 3}" font-size="9" text-anchor="end">${v}%</text>`).join('');
  const etiquetas = f.meses.map((m, k) => (f.meses.length <= 24 || k % Math.ceil(f.meses.length / 24) === 0 ? `<text x="${x0 + k * paso + paso / 2}" y="${y0 + 12}" font-size="8" text-anchor="middle">${mes(m)}</text>` : '')).join('');
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${ejes}${barras}<polyline points="${x0},${y0} ${puntos}" fill="none" stroke="#c0392b" stroke-width="2"/>${etiquetas}
<text x="${W - 14}" y="14" font-size="9" text-anchor="end"><tspan fill="#c0392b">━ avance acumulado</tspan>  <tspan fill="#5b85bd">■ inversión del mes</tspan></text></svg>`;
}

/** Tabla de un flujo (filas × meses), partida en bloques de 8 meses para que entre en la hoja. */
function tablaFlujo(f: Flujo, decimales: number, etiqueta: string, conAcumulado: boolean): string {
  const bloques: string[] = [];
  for (let i = 0; i < f.meses.length; i += 8) {
    const ms = f.meses.slice(i, i + 8);
    const idx = ms.map((_, k) => i + k);
    const ultimo = i + 8 >= f.meses.length;
    bloques.push(`<table class="t" style="margin-bottom:3mm"><thead><tr><th>${etiqueta}</th>${ms.map((m) => `<th>${mes(m)}</th>`).join('')}${ultimo ? '<th>Total</th>' : ''}</tr></thead><tbody>
${f.filas.map((r) => `<tr><td>${esc(r.nombre)}</td>${idx.map((k) => `<td class="n">${r.valores[k] ? num(r.valores[k]!, decimales) : ''}</td>`).join('')}${ultimo ? `<td class="n"><b>${num(r.total, decimales)}</b></td>` : ''}</tr>`).join('')}
<tr class="tot"><td>Total del mes</td>${idx.map((k) => `<td class="n">${num(f.total[k]!, decimales)}</td>`).join('')}${ultimo ? `<td class="n">${num(f.acumulado.at(-1) ?? 0, decimales)}</td>` : ''}</tr>
${conAcumulado ? `<tr class="sub"><td>Acumulado</td>${idx.map((k) => `<td class="n">${num(f.acumulado[k]!, decimales)}</td>`).join('')}${ultimo ? '<td></td>' : ''}</tr><tr class="sub"><td>% acumulado</td>${idx.map((k) => `<td class="n">${num(f.porcentajeAcumulado[k]!, 2)} %</td>`).join('')}${ultimo ? '<td></td>' : ''}</tr>` : ''}
</tbody></table>`);
  }
  return bloques.join('');
}

/** Flujo de inversiones y plan de desembolsos mensual (según el cronograma). */
export function reporteFlujoInversiones(c: ProyectoCalculado): string {
  const p = c.proyecto;
  const f = flujoInversiones(p);
  return documento('Flujo de inversiones', `<style>@page{size:letter landscape;margin:10mm} table.t td,table.t th{font-size:7.5pt}</style><h1>FLUJO DE INVERSIONES Y PLAN DE DESEMBOLSOS</h1><h2>(montos mensuales según el cronograma · en ${MONEDA(p)})</h2>${cabecera(p)}
${f.meses.length ? `${curvaS(f)}${tablaFlujo(f, c.decimales, 'Módulo', true)}<p class="nota">El parcial de cada partida se reparte por igual entre sus días de trabajo (cronograma A-8). Los plazos y el orden de los módulos se ajustan en la pestaña Cronograma.</p>` : vacio('el proyecto no tiene partidas.')}${firmasProyecto(p)}`);
}

/** Flujo de personal (mano de obra) o requerimiento mensual de materiales/equipo. */
export function reporteRequerimiento(c: ProyectoCalculado, rubro: 'O' | 'M' | 'E'): string {
  const p = c.proyecto;
  const f = requerimientoMensual(p, rubro);
  const h = (p.cronograma ?? CRONOGRAMA_DEFECTO).horasDia;
  const titulo = rubro === 'O' ? 'FLUJO DE PERSONAL' : rubro === 'M' ? 'REQUERIMIENTO MENSUAL DE MATERIALES' : 'REQUERIMIENTO MENSUAL DE EQUIPO';
  const sub = rubro === 'O' ? `(horas-hombre por mes; jornales = horas ÷ ${num(h, 1)})` : rubro === 'M' ? '(cantidades por mes según el cronograma, para compras y acopio)' : '(horas de equipo por mes, para la movilización)';
  let extra = '';
  if (rubro === 'O' && f.meses.length) {
    const jornales = f.total.map((v) => v / h);
    // personas promedio por mes: jornales del mes ÷ días laborables aprox. del mes
    const dl = (p.cronograma ?? CRONOGRAMA_DEFECTO).diasLaborables;
    extra = `<table class="t"><thead><tr><th>Mes</th>${f.meses.map((m) => `<th>${mes(m)}</th>`).join('')}</tr></thead><tbody>
<tr><td>Jornales</td>${jornales.map((j) => `<td class="n">${num(j, 1)}</td>`).join('')}</tr>
<tr><td>Personas (promedio)</td>${jornales.map((j) => `<td class="n">${num(j / (dl * 4.33), 1)}</td>`).join('')}</tr></tbody></table>`;
  }
  return documento(titulo, `<style>@page{size:letter landscape;margin:10mm} table.t td,table.t th{font-size:7.5pt}</style><h1>${titulo}</h1><h2>${sub}</h2>${cabecera(p)}
${f.meses.length ? tablaFlujo(f, 2, rubro === 'O' ? 'Mano de obra' : rubro === 'M' ? 'Material' : 'Equipo', false) + extra : vacio(`ninguna partida tiene ${rubro === 'O' ? 'mano de obra' : rubro === 'M' ? 'materiales' : 'equipo'} en su análisis.`)}${firmasProyecto(p)}`);
}

function barrasHorizontales(datos: { nombre: string; valor: number }[], moneda: string): string {
  if (!datos.length) return '';
  const max = Math.max(...datos.map((d) => d.valor), 1);
  const H = 22 * datos.length + 10, W = 700;
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${datos.map((d, k) => `<text x="250" y="${18 + k * 22}" font-size="9" text-anchor="end">${esc(d.nombre.slice(0, 45))}</text>
<rect x="256" y="${7 + k * 22}" width="${Math.max(1, (d.valor / max) * 330)}" height="14" fill="${COLORES[k % COLORES.length]}"/><text x="${262 + (d.valor / max) * 330}" y="${18 + k * 22}" font-size="9">${moneda} ${num(d.valor, 0)}</text>`).join('')}</svg>`;
}

/** Gráficos: costo por módulo, por rubro y curva de inversión. */
export function reporteGraficos(c: ProyectoCalculado): string {
  const p = c.proyecto;
  const mon = p.moneda === 1 ? '$US' : 'Bs';
  const rub = resumenPorRubro(c);
  const f = flujoInversiones(p);
  return documento('Gráficos', `<h1>GRÁFICOS DEL PRESUPUESTO</h1>${cabecera(p)}
${c.total ? `<h2><b>Costo por módulo</b></h2>${barrasHorizontales(c.modulos.map((m) => ({ nombre: m.nombre, valor: m.total })), mon)}
<h2><b>Costo directo por rubro</b></h2>${barrasHorizontales(rub.map((r) => ({ nombre: `${r.nombre} (${num(r.porcentaje, 1)} %)`, valor: r.monto })), mon)}
<h2 class="salto"><b>Inversión mensual y avance acumulado (curva S)</b></h2>${curvaS(f)}
<p><b>${esc(montoALiteral(c.total, MONEDA(p)))}</b></p>` : vacio('el presupuesto está en cero.')}`);
}
