import type { Parametro, Plantilla } from '../../nucleo/tipos';
import { LETRAS } from '../../nucleo/calculo';
import { limpiar32, texto, vista } from './binario';

const REG = 73;

/** Plantilla de cálculo de PRESCOM (.cft, parametros.cfg o el .CFG de un proyecto): 17 × 73 bytes. */
export function leerPlantilla(nombre: string, buf: Uint8Array): Plantilla {
  if (buf.length < REG * LETRAS.length) throw new Error(`Plantilla "${nombre}" incompleta`);
  const dv = vista(buf);
  const parametros: Parametro[] = LETRAS.map((letra, k) => {
    const o = k * REG;
    const pct = limpiar32(dv.getFloat32(o + 50, true));
    return {
      letra,
      descripcion: texto(buf, o, 50),
      porcentaje: pct === -1 ? null : pct,
      formula: texto(buf, o + 54, 15),
      orden: dv.getInt16(o + 69, true),
      resaltar: dv.getInt16(o + 71, true) !== 0,
    };
  });
  return { nombre, parametros };
}
