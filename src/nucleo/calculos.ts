import { redondear } from './calculo';

// Cálculos de obra de la caja de herramientas (sin conexión). Todas las longitudes en metros salvo que se indique.

export const areaRectangulo = (a: number, b: number) => a * b;
export const areaTriangulo = (base: number, altura: number) => (base * altura) / 2;
export const areaTrapecio = (b1: number, b2: number, h: number) => ((b1 + b2) / 2) * h;
export const areaCirculo = (d: number) => (Math.PI * d * d) / 4;
export const volumenPrisma = (largo: number, ancho: number, alto: number) => largo * ancho * alto;
export const volumenCilindro = (d: number, h: number) => areaCirculo(d) * h;
/** Zanja de sección trapecial: ancho de fondo, profundidad, talud z (horizontal por 1 vertical, 0 = paredes verticales). */
export const volumenZanja = (largo: number, anchoFondo: number, profundidad: number, talud = 0) => largo * (anchoFondo + talud * profundidad) * profundidad;

/**
 * Dosificación por volumen (cemento : arena : grava), método volumétrico: el volumen aparente de los materiales
 * secos es `factor` veces el volumen de hormigón (1,55 para hormigón, 1,33 para mortero). Cemento suelto 1.440 kg/m³.
 */
export function dosificacion(volumen: number, c: number, a: number, g: number, opciones: { factor?: number; aguaCemento?: number; kgBolsa?: number; desperdicio?: number } = {}) {
  const factor = opciones.factor ?? (g > 0 ? 1.55 : 1.33);
  const partes = c + a + g;
  if (!(partes > 0) || !(c > 0)) throw new Error('La dosificación debe tener cemento (p. ej. 1:2:3)');
  const k = volumen * factor * (1 + (opciones.desperdicio ?? 0) / 100) / partes;
  const cementoKg = k * c * 1440;
  return {
    cementoKg: redondear(cementoKg, 1),
    bolsas: redondear(cementoKg / (opciones.kgBolsa ?? 50), 2),
    arena: redondear(k * a, 3),
    grava: redondear(k * g, 3),
    agua: redondear(cementoKg * (opciones.aguaCemento ?? 0.5), 0),
  };
}

/** Ladrillos o bloques por m² de muro (dimensiones vistas en cm, junta en cm) y mortero de junta por m² (espesor del muro en cm). */
export function ladrillosPorM2(largoCm: number, altoCm: number, juntaCm: number, espesorMuroCm: number, desperdicio = 0) {
  if (!(largoCm > 0 && altoCm > 0)) throw new Error('Dimensiones del ladrillo no válidas');
  const n = 1 / (((largoCm + juntaCm) / 100) * ((altoCm + juntaCm) / 100));
  const mortero = (1 - n * (largoCm / 100) * (altoCm / 100)) * (espesorMuroCm / 100);
  return { piezas: redondear(n * (1 + desperdicio / 100), 2), mortero: redondear(mortero * (1 + desperdicio / 100), 4) };
}

/** Pendiente (%) entre dos cotas a una distancia horizontal. */
export const pendiente = (cotaInicio: number, cotaFin: number, distancia: number) => (distancia > 0 ? redondear(((cotaInicio - cotaFin) / distancia) * 100, 3) : NaN);

/** Tubería circular a sección llena (Manning): diámetro interior en mm, pendiente en %, rugosidad n. Caudal en l/s y velocidad en m/s. */
export function manningLleno(diametroMm: number, pendientePct: number, n: number) {
  const d = diametroMm / 1000, s = pendientePct / 100;
  if (!(d > 0 && s > 0 && n > 0)) throw new Error('Diámetro, pendiente y n deben ser mayores que cero');
  const v = (1 / n) * (d / 4) ** (2 / 3) * Math.sqrt(s);
  return { velocidad: redondear(v, 3), caudal: redondear(v * areaCirculo(d) * 1000, 2) };
}

/** Conversiones de unidades usuales en obra: factor para pasar de la unidad a la unidad base de su grupo. */
export const UNIDADES: Record<string, Record<string, number>> = {
  Longitud: { m: 1, cm: 0.01, mm: 0.001, km: 1000, pulgada: 0.0254, pie: 0.3048, yarda: 0.9144 },
  Área: { 'm²': 1, 'cm²': 1e-4, ha: 10000, 'km²': 1e6, 'pie²': 0.09290304, 'pulgada²': 0.00064516 },
  Volumen: { 'm³': 1, litro: 0.001, 'pie³': 0.0283168466, 'pulgada³': 1.6387064e-5, galón: 0.00378541 },
  Masa: { kg: 1, t: 1000, lb: 0.45359237, quintal: 46, 'bolsa de cemento (50 kg)': 50 },
  Presión: { 'kg/cm²': 1, MPa: 10.1971621, psi: 0.0703069578, 'kN/m²': 0.0101971621 },
  Caudal: { 'l/s': 1, 'm³/s': 1000, 'm³/h': 1 / 3.6, 'm³/día': 1 / 86.4, gpm: 0.0630901964 },
};
export function convertir(valor: number, grupo: string, de: string, a: string): number {
  const g = UNIDADES[grupo];
  if (!g || g[de] === undefined || g[a] === undefined) throw new Error('Unidades no válidas');
  return (valor * g[de]!) / g[a]!;
}

/** Impuestos bolivianos incluidos en un precio: IVA 13 % y IT 3 % sobre el precio facturado. */
export function impuestosIncluidos(precio: number) {
  return { iva: redondear(precio * 0.13, 2), it: redondear(precio * 0.03, 2), neto: redondear(precio * 0.84, 2) };
}
