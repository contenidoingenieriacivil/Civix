import { describe, expect, it } from 'vitest';
import type { BaseDatos, Partida, Proyecto } from '../src/datos/modelo';
import { agregarLineaApu, duplicarPartida, eliminarModulo, eliminarPartida, insumoEnUso, moverAModulo, moverModulo, moverPartida, nuevaPartidaDirecta, nuevoInsumo, nuevoProyecto, partidaABase, quitarLineaApu } from '../src/nucleo/operaciones';
import { PLANTILLA_SABS } from '../src/nucleo/plantillas';
import { calcularProyecto } from '../src/nucleo/presupuesto';
import { programar } from '../src/nucleo/cronograma';

const proyecto = (): Proyecto => {
  const p = nuevoProyecto('t', PLANTILLA_SABS);
  p.modulos = [{ nombre: 'A', inicio: null, fin: null }, { nombre: 'B', inicio: null, fin: null }, { nombre: 'C', inicio: null, fin: null, despuesDe: 2 }];
  for (const [m, d] of [[1, 'a1'], [2, 'b1'], [1, 'a2'], [2, 'b2'], [1, 'a3'], [3, 'c1']] as const) nuevaPartidaDirecta(p, m, { descripcion: d, unidad: 'm', cantidad: 1, precio: 10 });
  return p;
};
const nombres = (p: Proyecto, m: number) => p.partidas.filter((x) => x.modulo === m).map((x) => `${x.numero}${x.descripcion}${x.predecesor !== undefined ? `<${x.predecesor}` : ''}`);

describe('edición del presupuesto', () => {
  it('las partidas nuevas quedan en su módulo y numeradas', () => {
    const p = proyecto();
    expect(nombres(p, 1)).toEqual(['1a1', '2a2', '3a3']);
    expect(nombres(p, 2)).toEqual(['1b1', '2b2']);
    expect(calcularProyecto(p).total).toBe(60);
  });
  it('eliminar renumera y corrige las predecesoras', () => {
    const p = proyecto();
    const a = p.partidas.filter((x) => x.modulo === 1);
    a[2]!.predecesor = 1; // a3 depende de a1
    a[1]!.predecesor = 1;
    eliminarPartida(p, p.partidas.indexOf(a[0]!)); // se borra a1
    expect(nombres(p, 1)).toEqual(['1a2', '2a3']); // a ambas se les quita la predecesora borrada
  });
  it('subir y bajar intercambia y conserva las dependencias', () => {
    const p = proyecto();
    const a = p.partidas.filter((x) => x.modulo === 1);
    a[2]!.predecesor = 1;
    const nueva = moverPartida(p, p.partidas.indexOf(a[0]!), 1);
    expect(nombres(p, 1)).toEqual(['1a2', '2a1', '3a3<2']);
    expect(p.partidas[nueva]!.descripcion).toBe('a1');
    expect(moverPartida(p, p.partidas.indexOf(a[2]!), 1)).toBe(p.partidas.indexOf(a[2]!)); // la última no baja más
  });
  it('duplicar copia debajo con un ítem propio', () => {
    const p = proyecto();
    const i = p.partidas.findIndex((x) => x.descripcion === 'a2');
    const c = duplicarPartida(p, i);
    expect(nombres(p, 1)).toEqual(['1a1', '2a2', '3a2', '4a3']);
    expect(p.partidas[c]!.item.id).not.toBe(p.partidas[i]!.item.id);
  });
  it('mover a otro módulo y quitar un módulo mantienen las referencias', () => {
    const p = proyecto();
    moverAModulo(p, p.partidas.findIndex((x) => x.descripcion === 'a1'), 2);
    expect(nombres(p, 2)).toEqual(['1b1', '2b2', '3a1']);
    eliminarModulo(p, 1);
    expect(p.modulos.map((m) => m.nombre)).toEqual(['B', 'C']);
    expect(p.modulos[1]!.despuesDe).toBe(1); // C seguía a B, que ahora es el 1
    expect(nombres(p, 2)).toEqual(['1c1']);
    expect(() => programar(p)).not.toThrow();
  });
  it('mover un módulo lleva sus partidas y su orden de ejecución', () => {
    const p = proyecto();
    expect(moverModulo(p, 3, -1)).toBe(2);
    expect(p.modulos.map((m) => m.nombre)).toEqual(['A', 'C', 'B']);
    expect(p.modulos[1]!.despuesDe).toBe(3);
    expect(nombres(p, 2)).toEqual(['1c1']);
    expect(calcularProyecto(p).modulos.map((m) => m.total)).toEqual([30, 10, 20]);
  });
  it('arma un análisis desde cero y lo guarda en una base', () => {
    const p = proyecto();
    const pos = nuevaPartidaDirecta(p, 1, { descripcion: 'Muro', unidad: 'm2', cantidad: 2, precio: 0 });
    delete (p.partidas[pos] as Partida).item.precioFijo;
    const cem = nuevoInsumo(p, { descripcion: 'Cemento', unidad: 'kg', rubro: 'M', precio: 1.2 });
    agregarLineaApu(p, pos, cem, 10);
    agregarLineaApu(p, pos, cem, 5);
    expect(p.partidas[pos]!.item.materiales).toEqual([{ insumo: cem, rendimiento: 15 }]);
    const base: BaseDatos = { nombre: 'b', moneda: 2, grupos: [], insumos: [], items: [] };
    expect(partidaABase(p, pos, base)).toEqual({ id: 1, reemplazado: false });
    expect(base.insumos.map((i) => i.descripcion)).toEqual(['Cemento']);
    expect(partidaABase(p, pos, base).reemplazado).toBe(true);
    expect(insumoEnUso(base, base.insumos[0]!.id)).toBe(true);
    quitarLineaApu(p, pos, 'M', 0);
    expect(insumoEnUso(p, cem)).toBe(false);
  });
});
