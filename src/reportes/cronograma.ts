import { programar, type Programa } from '../nucleo/cronograma';
import type { Proyecto } from '../datos/modelo';
import { calcularProyecto, diagnosticar } from '../nucleo/presupuesto';
import { documento, esc, fechaBo, num } from './formato';

const DIA = 86_400_000;
const ms = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y!, m! - 1, d!); };
export const diasEntre = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DIA);

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** Meses que cubre el programa: { etiqueta, desde (día desde el inicio), dias }. */
export function mesesDelPrograma(g: Programa): { etiqueta: string; desde: number; dias: number }[] {
  const out: { etiqueta: string; desde: number; dias: number }[] = [];
  if (!g.inicio) return out;
  const total = g.diasCalendario;
  let d = new Date(ms(g.inicio));
  let pos = 0;
  while (pos < total) {
    const finMes = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const dias = Math.min(total - pos, Math.round((finMes - d.getTime()) / DIA));
    out.push({ etiqueta: `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, desde: pos, dias });
    pos += dias;
    d = new Date(finMes);
  }
  return out;
}

/** Posición y ancho (en %) de una barra del diagrama dentro del plazo total. */
export function barra(g: Programa, inicio: string, fin: string): { izq: number; ancho: number } {
  const total = Math.max(1, g.diasCalendario);
  return { izq: (diasEntre(g.inicio, inicio) / total) * 100, ancho: ((diasEntre(inicio, fin) + 1) / total) * 100 };
}

/** Formulario A-8: cronograma de ejecución de la obra (diagrama de barras con ruta crítica). */
export function formularioA8(p: Proyecto): string {
  const g = programar(p);
  const meses = mesesDelPrograma(g);
  const total = Math.max(1, g.diasCalendario);
  // los meses muy cortos (inicio o fin parcial) no llevan nombre para que no se encimen
  const cabMeses = meses.map((m) => `<div class="a8-mes" style="left:${(m.desde / total) * 100}%;width:${(m.dias / total) * 100}%">${m.dias / total < 0.03 ? '' : m.etiqueta}</div>`).join('');
  const filas = g.modulos.flatMap((m) => [
    `<tr class="sub"><td colspan="5">${esc(m.nombre)}</td><td class="a8-barras"></td></tr>`,
    ...m.actividades.map((a) => {
      const b = barra(g, a.inicio, a.fin);
      return `<tr><td class="c">${a.modulo}.${a.posicion}</td><td>${esc(a.partida.descripcion)}</td><td class="n">${num(a.duracion, 2)}</td><td class="c">${fechaBo(a.inicio)}</td><td class="c">${fechaBo(a.fin)}</td>
<td class="a8-barras">${meses.map((x) => `<i class="a8-linea" style="left:${(x.desde / total) * 100}%"></i>`).join('')}<div class="a8-barra${a.critica ? ' critica' : ''}" style="left:${b.izq}%;width:${b.ancho}%"></div></td></tr>`;
    }),
  ]).join('');
  const diag = diagnosticar(calcularProyecto(p));
  const aviso = diag.sinPlazo ? `<div class="aviso"><b>Plazos incompletos:</b> ${diag.sinPlazo} de ${diag.partidas} actividades no tienen plazo (ni días fijados ni mano de obra en su análisis) y se muestran con 1 día. Defina los días en Cronograma, o impórtelos con «duracion»${diag.sinAnalisis === diag.partidas ? '; este proyecto tiene solo precios directos, sin análisis de mano de obra' : ''}.</div>` : '';
  const css = `<style>@page{size:letter landscape;margin:10mm}.a8-barras{position:relative;width:48%;padding:0!important}.a8-mes{position:absolute;top:0;bottom:0;text-align:center;border-left:.2mm solid #666;font-size:6.5pt;line-height:6mm}
.a8-cab{position:relative;height:6mm}.a8-linea{position:absolute;top:0;bottom:0;border-left:.15mm solid #ccc}.a8-barra{position:absolute;top:1.2mm;bottom:1.2mm;background:#3b6ea8;min-width:.6mm}.a8-barra.critica{background:#c0392b}
table.t td{font-size:7pt;padding:.4mm 1mm;height:4.2mm}.leyenda{font-size:8pt;margin-top:3mm}.leyenda b{display:inline-block;width:8mm;height:3mm;vertical-align:middle;margin:0 1mm 0 4mm;background:#3b6ea8}.leyenda b.c{background:#c0392b}</style>`;
  const html = `${css}<h1>FORMULARIO A-8</h1><h2>CRONOGRAMA DE EJECUCIÓN DE LA OBRA</h2>${aviso}
<table class="meta"><tr><td><b>Proyecto:</b> ${esc(p.nombre)}</td><td><b>Inicio:</b> ${fechaBo(g.inicio)}</td><td><b>Conclusión:</b> ${fechaBo(g.fin)}</td><td><b>Plazo:</b> ${g.diasCalendario} días calendario</td></tr></table>
<table class="t"><thead><tr><th style="width:5%">N°</th><th>Actividad</th><th style="width:4%">Días</th><th style="width:7%">Inicio</th><th style="width:7%">Fin</th><th class="a8-barras"><div class="a8-cab">${cabMeses}</div></th></tr></thead><tbody>${filas}</tbody></table>
<p class="leyenda"><b></b>Actividad<b class="c"></b>Ruta crítica · ${g.config.horasDia} h/día · ${g.config.diasLaborables} días laborables por semana</p>
<div class="firma"><div>Firma del representante legal del proponente</div></div>`;
  return documento('Formulario A-8', html);
}
