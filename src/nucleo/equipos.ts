import type { CostoEquipo } from '../reportes/formularios';

/** Datos para deducir el costo horario de un equipo (formulario B-4). */
export interface DatosEquipo {
  descripcion: string;
  potencia: number; // HP
  valorComercial: number;
  valorLlantas: number;
  valorPiezasEspeciales: number;
  vidaUtilHoras: number;
  vidaUtilLlantasHoras: number;
  vidaUtilPiezasHoras: number;
  factorRescate: number; // % del valor de adquisición, p. ej. 20
  tasaInteresAnual: number; // %
  primaSeguroAnual: number; // %
  horasPorAnio: number;
  coeficienteMantenimiento: number; // % de la depreciación, p. ej. 80
  consumoCombustible: number; // litros/hora
  precioCombustible: number;
  consumoLubricante: number;
  precioLubricante: number;
  costoHorarioOperador: number;
  factorSeguroSocialOperador: number; // % sobre el operador
}

/**
 * Costo horario con el método habitual en Bolivia:
 * - Básico = depreciación + intereses y seguro. Depreciación = (Va − Vr − llantas − piezas)/Vu.
 * - Mantenimiento = K × depreciación (más reposición de llantas y piezas especiales).
 * - Combustibles = combustible + lubricante. Otros = operador con cargas sociales.
 */
export function costoHorarioEquipo(e: DatosEquipo): CostoEquipo {
  const rescate = (e.valorComercial * e.factorRescate) / 100;
  const depreciacion = (e.valorComercial - rescate - e.valorLlantas - e.valorPiezasEspeciales) / e.vidaUtilHoras;
  const inversionMedia = (e.valorComercial + rescate) / 2;
  const intereses = (inversionMedia * (e.tasaInteresAnual + e.primaSeguroAnual)) / 100 / e.horasPorAnio;
  const llantas = e.vidaUtilLlantasHoras ? e.valorLlantas / e.vidaUtilLlantasHoras : 0;
  const piezas = e.vidaUtilPiezasHoras ? e.valorPiezasEspeciales / e.vidaUtilPiezasHoras : 0;
  return {
    descripcion: e.descripcion,
    potencia: e.potencia,
    basico: depreciacion + intereses,
    mantenimiento: (depreciacion * e.coeficienteMantenimiento) / 100 + llantas + piezas,
    combustibles: e.consumoCombustible * e.precioCombustible + e.consumoLubricante * e.precioLubricante,
    otros: e.costoHorarioOperador * (1 + e.factorSeguroSocialOperador / 100),
  };
}

/** Valores por defecto razonables para empezar a llenar el costo horario de un equipo. */
export const equipoPorDefecto = (descripcion: string, valorComercial = 0): DatosEquipo => ({
  descripcion, potencia: 0, valorComercial, valorLlantas: 0, valorPiezasEspeciales: 0, vidaUtilHoras: 10000,
  vidaUtilLlantasHoras: 0, vidaUtilPiezasHoras: 0, factorRescate: 20, tasaInteresAnual: 10, primaSeguroAnual: 2,
  horasPorAnio: 2000, coeficienteMantenimiento: 80, consumoCombustible: 0, precioCombustible: 3.72,
  consumoLubricante: 0, precioLubricante: 20, costoHorarioOperador: 0, factorSeguroSocialOperador: 55,
});
