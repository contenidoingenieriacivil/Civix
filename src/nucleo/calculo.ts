import type { Item, Insumo, Parametro, Plantilla, ResultadoApu, Rubro, ValoresParametros } from './tipos';

/** PRESCOM usa el precio del insumo con 3 decimales (comprobado contra sus proyectos). */
export const DECIMALES_PRECIOS = 3;

export const LETRAS = 'ABCDEFGHIJKLMNOPQ'.split('');

/** Redondeo comercial (mitad hacia arriba) con corrección de coma flotante. */
export function redondear(x: number, decimales: number): number {
  const f = 10 ** decimales;
  const r = Math.round((Math.abs(x) * f) * (1 + Number.EPSILON * 8)) / f;
  return x < 0 ? -r : r;
}

/** Descompone una fórmula como "E+F-O" en términos con signo. */
export function terminosDeFormula(formula: string): { signo: 1 | -1; letra: string }[] {
  const out: { signo: 1 | -1; letra: string }[] = [];
  let signo: 1 | -1 = 1;
  for (const c of formula.toUpperCase().replace(/\s+/g, '')) {
    if (c === '+') signo = 1;
    else if (c === '-') signo = -1;
    else if (LETRAS.includes(c)) {
      out.push({ signo, letra: c });
      signo = 1;
    } else throw new Error(`Carácter no válido "${c}" en la fórmula "${formula}"`);
  }
  return out;
}

/**
 * Orden de lectura de los parámetros: por letra, pero cada uno después de aquellos de los que depende
 * (p. ej. SABS: D, E, F, O, G, H, I, J, L, M, N, P, Q).
 */
export function ordenLogico(plantilla: Plantilla): Parametro[] {
  const porLetra = new Map(plantilla.parametros.map((p) => [p.letra, p]));
  const hechos = new Set<string>();
  const salida: Parametro[] = [];
  const visitar = (letra: string, pila: string[] = []) => {
    const p = porLetra.get(letra);
    if (!p || hechos.has(letra) || pila.includes(letra)) return;
    const f = p.formula.trim();
    if (f !== '*' && f !== '') for (const t of terminosDeFormula(f)) visitar(t.letra, [...pila, letra]);
    hechos.add(letra);
    salida.push(p);
  };
  for (const p of [...plantilla.parametros].sort((a, b) => a.letra.localeCompare(b.letra))) visitar(p.letra);
  return salida;
}

/** Suma por rubro de un ítem (parámetros A, B, C de la plantilla). */
export function sumaRubros(
  item: Item,
  insumos: ReadonlyMap<number, Insumo>,
  incluirNoProductivos = false,
  decimalesPrecios = DECIMALES_PRECIOS,
  decimalesCalculo?: number,
): Record<Rubro, number> {
  const suma = (lineas: Item['materiales']) =>
    lineas.reduce((acc, l) => {
      const i = insumos.get(l.insumo);
      if (!i || (i.noProductivo && !incluirNoProductivos)) return acc;
      const costo = redondear(i.precio, decimalesPrecios) * l.rendimiento;
      return acc + (decimalesCalculo === undefined ? costo : redondear(costo, decimalesCalculo));
    }, 0);
  return { M: suma(item.materiales), O: suma(item.manoObra), E: suma(item.equipo) };
}

/**
 * Evalúa la plantilla resolviendo dependencias entre parámetros
 * (p. ej. G = E+F+O y O = 14,94 % de E+F) por recursión con detección de ciclos.
 */
export function evaluarPlantilla(
  plantilla: Plantilla,
  rubros: Record<Rubro, number>,
  porcentajes: Record<string, number> = {},
): ValoresParametros {
  const porLetra = new Map<string, Parametro>(plantilla.parametros.map((p) => [p.letra, p]));
  const hechos: ValoresParametros = {};
  const enCurso = new Set<string>();

  const valor = (letra: string): number => {
    if (letra in hechos) return hechos[letra]!;
    const p = porLetra.get(letra);
    if (!p) return 0;
    if (enCurso.has(letra)) throw new Error(`Referencia circular en el parámetro ${letra}`);
    enCurso.add(letra);
    let v = 0;
    const f = p.formula.trim();
    if (f === '*') {
      v = letra === 'A' ? rubros.M : letra === 'B' ? rubros.O : letra === 'C' ? rubros.E : 0;
    } else if (f !== '') {
      const base = terminosDeFormula(f).reduce((a, t) => a + t.signo * valor(t.letra), 0);
      const pct = porcentajes[letra] ?? p.porcentaje;
      v = pct === null ? base : (pct / 100) * base;
    }
    enCurso.delete(letra);
    hechos[letra] = v;
    return v;
  };

  for (const p of plantilla.parametros) valor(p.letra);
  return hechos;
}

/** Calcula el análisis de precio unitario de un ítem. */
export function calcularItem(
  item: Item,
  insumos: ReadonlyMap<number, Insumo>,
  plantilla: Plantilla,
  decimales = 2,
  incluirNoProductivos = false,
  decimalesPrecios = DECIMALES_PRECIOS,
): ResultadoApu {
  if (item.precioFijo !== undefined) return { valores: { Q: item.precioFijo }, precioUnitario: redondear(item.precioFijo, decimales) };
  const valores = evaluarPlantilla(plantilla, sumaRubros(item, insumos, incluirNoProductivos, decimalesPrecios, plantilla.decimalesCalculo), item.porcentajes);
  return { valores, precioUnitario: redondear(valores.Q ?? 0, decimales) };
}

/** Parcial de una partida y total de un presupuesto. */
export function parcial(cantidad: number, precioUnitario: number, decimales = 2): number {
  return redondear(cantidad * precioUnitario, decimales);
}

export function totalPresupuesto(
  partidas: { cantidad: number; precioUnitario: number }[],
  decimales = 2,
): number {
  return redondear(
    partidas.reduce((a, p) => a + parcial(p.cantidad, p.precioUnitario, decimales), 0),
    decimales,
  );
}
