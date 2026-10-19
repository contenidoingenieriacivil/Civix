import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { duracionDias, indiceLaborable, programar, siguienteLaborable, sumarLaborables, CRONOGRAMA_DEFECTO } from '../src/nucleo/cronograma';
import { nuevoProyecto } from '../src/nucleo/operaciones';
import { PLANTILLA_SABS } from '../src/nucleo/plantillas';
import { leerProyecto } from '../src/datos/prescom/leerProyecto';
import type { Partida, Proyecto } from '../src/datos/modelo';

const partida = (modulo: number, cantidad: number, rend: number, extra: Partial<Partida> = {}): Partida => ({
  modulo, numero: 1, descripcion: 'x', unidad: 'm²', grupo: 0, cantidad,
  item: { id: 1, descripcion: 'x', unidad: 'm²', grupo: 0, materiales: [], equipo: [], manoObra: [{ insumo: 1, rendimiento: rend }] }, ...extra,
});
const proy = (ps: Partida[], mods = 1): Proyecto => {
  const p = nuevoProyecto('t', PLANTILLA_SABS);
  p.fecha = '2024-03-04'; // lunes
  p.modulos = Array.from({ length: mods }, (_, i) => ({ nombre: `M${i + 1}`, inicio: null, fin: null }));
  p.partidas = ps;
  return p;
};

describe('calendario laborable (lunes a sábado)', () => {
  it('salta los domingos', () => {
    expect(siguienteLaborable('2024-03-03', 6)).toBe('2024-03-04'); // domingo → lunes
    expect(sumarLaborables('2024-03-04', 6, 6)).toBe('2024-03-11'); // 6 días laborables después de lunes: lunes siguiente
    expect(indiceLaborable('2024-03-05', 6) - indiceLaborable('2024-03-04', 6)).toBe(1);
    expect(indiceLaborable('2024-03-11', 6) - indiceLaborable('2024-03-09', 6)).toBe(1); // sábado → lunes
  });
  it('con 5 días laborables salta también el sábado', () => expect(sumarLaborables('2024-03-08', 1, 5)).toBe('2024-03-11'));
});

describe('duración y programación', () => {
  it('plazo = cantidad × rendimiento ÷ (horas × cuadrilla), mínimo 1 día', () => {
    expect(duracionDias(partida(1, 100, 0.8), CRONOGRAMA_DEFECTO)).toBe(10);
    expect(duracionDias(partida(1, 100, 0.8, { cuadrilla: 2 }), CRONOGRAMA_DEFECTO)).toBe(5);
    expect(duracionDias(partida(1, 1, 0.1), CRONOGRAMA_DEFECTO)).toBe(1);
    expect(duracionDias(partida(1, 100, 0.8), { ...CRONOGRAMA_DEFECTO, horasDia: 10 })).toBe(8);
  });
  it('encadena por defecto y respeta predecesoras explícitas', () => {
    const p = proy([partida(1, 80, 0.8) /*8d*/, partida(1, 40, 0.8) /*4d*/, partida(1, 40, 0.8, { predecesor: 1 }) /*4d en paralelo*/]);
    const g = programar(p).modulos[0]!.actividades;
    expect(g[0]).toMatchObject({ inicio: '2024-03-04', fin: '2024-03-12', duracion: 8 }); // lun..lun (6 por semana)
    expect(g[1]!.inicio).toBe('2024-03-13');
    expect(g[2]!.inicio).toBe('2024-03-13'); // misma predecesora
  });
  it('marca la ruta crítica y las holguras', () => {
    const p = proy([partida(1, 80, 0.8), partida(1, 40, 0.8, { predecesor: 1 }) /*4d*/, partida(1, 160, 0.8, { predecesor: 1 }) /*16d*/]);
    const [a, b, c] = programar(p).modulos[0]!.actividades;
    expect(c!.critica).toBe(true);
    expect(a!.critica).toBe(true);
    expect(b!.critica).toBe(false);
    expect(b!.holgura).toBe(12);
  });
  it('un módulo empieza cuando termina el anterior si no tiene fecha', () => {
    const g = programar(proy([partida(1, 80, 0.8), partida(2, 40, 0.8)], 2));
    expect(g.modulos[1]!.inicio >= g.modulos[0]!.fin).toBe(true);
    expect(g.fin).toBe(g.modulos[1]!.fin);
  });
  it('admite duraciones fraccionarias: la siguiente empieza donde termina la anterior', () => {
    const p = proy([partida(1, 1, 0, { duracion: 0.5 }), partida(1, 1, 0, { duracion: 2.25 }), partida(1, 1, 0, { duracion: 0.25 })]);
    p.cronograma = { ...CRONOGRAMA_DEFECTO, diasLaborables: 7 };
    const g = programar(p).modulos[0]!.actividades;
    expect(g.map((x) => x.duracion)).toEqual([0.5, 2.25, 0.25]);
    expect(g[0]).toMatchObject({ inicio: '2024-03-04', fin: '2024-03-04' });
    expect(g[1]).toMatchObject({ inicio: '2024-03-04', fin: '2024-03-06' }); // 0,5 → 2,75
    expect(g[2]).toMatchObject({ inicio: '2024-03-06', fin: '2024-03-06' }); // 2,75 → 3,0
    expect(programar(p).diasCalendario).toBe(3);
  });
  it('un módulo puede empezar al terminar otro módulo o una actividad concreta de él', () => {
    const p = proy([partida(1, 1, 0, { duracion: 4 }), partida(1, 1, 0, { duracion: 10 }), partida(2, 1, 0, { duracion: 3 }), partida(3, 1, 0, { duracion: 3 })], 3);
    p.cronograma = { ...CRONOGRAMA_DEFECTO, diasLaborables: 7 };
    p.modulos[1]!.despuesDe = 1; p.modulos[1]!.despuesDeActividad = 1; // tras la actividad de 4 días
    p.modulos[2]!.despuesDe = 1; // tras todo el módulo 1 (14 días)
    const g = programar(p).modulos;
    expect(g[1]!.inicio).toBe('2024-03-08'); // día 4
    expect(g[2]!.inicio).toBe('2024-03-18'); // día 14
  });
  it('ignora ciclos de predecesoras sin colgarse', () => {
    const p = proy([partida(1, 8, 0.8, { predecesor: 2 }), partida(1, 8, 0.8, { predecesor: 1 })]);
    expect(() => programar(p)).not.toThrow();
  });
});

const RAIZ = process.env.CIVIX_PRESCOM_DIR;
(RAIZ && existsSync(join(RAIZ, 'proyectos')) ? describe : describe.skip)('contra el cronograma guardado por PRESCOM', () => {
  it('VIVIENDA SANCHEZ: la mayoría de actividades coinciden en inicio y fin', () => {
    const p = leerProyecto(readFileSync(join(RAIZ!, 'proyectos', 'VIVIENDA SANCHEZ.DDP')));
    expect(p.modulos[0]!.inicio).toBe('2007-03-26');
    const prog = programar(p);
    const total = prog.modulos.reduce((a, m) => a + m.actividades.length, 0);
    expect(total).toBe(82);
    // Primera actividad: Instalación de faenas, 26/03/2007 → 21/04/2007 (24 días laborables, cuadrilla 6)
    expect(prog.modulos[0]!.actividades[0]).toMatchObject({ inicio: '2007-03-26', fin: '2007-04-21', duracion: 24 });
    expect(prog.modulos[0]!.inicio).toBe('2007-03-26');
    for (const m of prog.modulos) {
      const crit = m.actividades.filter((a) => a.critica);
      if (!m.actividades.length) continue;
      expect(crit.some((a) => a.fin === m.fin)).toBe(true); // la cadena llega al fin del módulo
      for (const a of crit) if (a.predecesor) expect(m.actividades[a.predecesor - 1]!.critica).toBe(true); // y es continua
    }
    const todas = prog.modulos.flatMap((m) => m.actividades);
    const iguales = todas.filter((a) => a.inicio === a.partida.referenciaPrescom!.inicio && a.fin === a.partida.referenciaPrescom!.fin).length;
    // Con las fechas ajustadas a mano por el usuario en el original (arrastrar barras), unas 64 de 82 coinciden exactamente.
    expect(iguales / total).toBeGreaterThanOrEqual(0.75); // hoy 78 %: el original guarda rendimientos y fechas editados a mano
  });
});
