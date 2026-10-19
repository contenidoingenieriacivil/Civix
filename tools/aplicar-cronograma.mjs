// Agrega a un proyecto de Civix (JSON) el cronograma de un diagrama de Gantt transcrito (duraciones, predecesoras y orden de módulos).
// Uso: node tools/aplicar-cronograma.mjs proyecto.json cronograma.txt salida.json [diasLaborables=7]
// El archivo de cronograma tiene líneas «módulo|id|días|actividad|[predecesora]» (ver tools/datos/cronograma-tolomosa.txt).
import { readFileSync, writeFileSync } from 'node:fs';
import { dice } from './convertir-anexos.mjs';

// Orden de ejecución de los módulos de la tesis de Tolomosa Grande: módulo (posición en el presupuesto) → módulo tras cuyo fin empieza.
// Valor [módulo] o [módulo, id de la fila del diagrama tras cuyo fin empieza].
export const DESPUES_DE_TOLOMOSA = { 2: [1, 3], 3: [2, 19], 4: [1, 5], 5: [4], 6: [5], 7: [6], 8: [7], 9: [8], 10: [9], 21: [10], 11: [21], 12: [11], 13: [12], 14: [13], 15: [14], 16: [15], 17: [16], 18: [17], 19: [18], 20: [19] };

export function leerCronograma(txt) {
  return txt.split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
    const [mod, id, dias, nombre, pred] = l.split('|');
    return { mod: Number(mod), id: Number(id), dias: Number(dias), nombre, pred: pred === undefined || pred === '' ? undefined : Number(pred) };
  });
}

export function aplicar(proyecto, filas, despuesDe = DESPUES_DE_TOLOMOSA, diasLaborables = 7) {
  const informe = { conDuracion: 0, sinFila: [], filasSinPartida: [] };
  proyecto.proyecto.diasLaborables = diasLaborables;
  const posPorModulo = new Map();
  proyecto.modulos.forEach((m, k) => {
    const mias = filas.filter((f) => f.mod === k + 1);
    // emparejamiento por similitud de nombre, de mayor a menor
    const pares = [];
    mias.forEach((f, i) => m.partidas.forEach((p, j) => pares.push({ i, j, s: dice(f.nombre, p.descripcion) })));
    pares.sort((a, b) => b.s - a.s || Math.abs(a.i - a.j) - Math.abs(b.i - b.j));
    const deFila = new Map(), dePartida = new Map();
    for (const q of pares) if (q.s >= 0.4 && !deFila.has(q.i) && !dePartida.has(q.j)) { deFila.set(q.i, q.j); dePartida.set(q.j, q.i); }
    const posDeId = new Map();
    mias.forEach((f, i) => { if (deFila.has(i)) posDeId.set(f.id, deFila.get(i) + 1); });
    const dd = despuesDe[k + 1];
    if (dd) {
      m.despuesDe = dd[0];
      const ref = dd[1] !== undefined ? posPorModulo.get(dd[0])?.get(dd[1]) : undefined;
      if (ref) m.despuesDeActividad = ref;
    }
    posPorModulo.set(k + 1, posDeId);
    mias.forEach((f, i) => {
      const j = deFila.get(i);
      if (j === undefined) { informe.filasSinPartida.push(`M${k + 1} ${f.id} ${f.nombre}`); return; }
      const p = m.partidas[j];
      p.duracion = f.dias;
      informe.conDuracion++;
      // predecesora: la indicada o la fila anterior del diagrama que tenga partida
      let pred;
      if (f.pred !== undefined) pred = f.pred === 0 ? 0 : (posDeId.get(f.pred) ?? 0);
      else { let t = i - 1; while (t >= 0 && !deFila.has(t)) t--; pred = t >= 0 ? deFila.get(t) + 1 : 0; }
      p.predecesor = pred;
    });
    m.partidas.forEach((p, j) => { if (!dePartida.has(j)) { informe.sinFila.push(`M${k + 1} ${p.descripcion}`); } });
  });
  return informe;
}

if (process.argv[1]?.endsWith('aplicar-cronograma.mjs')) {
  const [,, entrada, cron, salida, dl] = process.argv;
  const proyecto = JSON.parse(readFileSync(entrada, 'utf8'));
  const informe = aplicar(proyecto, leerCronograma(readFileSync(cron, 'utf8')), DESPUES_DE_TOLOMOSA, Number(dl ?? 7));
  writeFileSync(salida, JSON.stringify(proyecto));
  console.log(`partidas con duración ${informe.conDuracion}; partidas sin fila del diagrama ${informe.sinFila.length}; filas del diagrama sin partida ${informe.filasSinPartida.length}`);
  for (const x of informe.sinFila) console.log('  sin fila:', x);
  for (const x of informe.filasSinPartida) console.log('  fila sin partida:', x);
}
