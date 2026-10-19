import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calcularItem } from '../src/nucleo/calculo';
import { leerBaseDatos } from '../src/datos/prescom/leerBd';
import { leerProyecto } from '../src/datos/prescom/leerProyecto';

/**
 * Regresión contra el material original. No se versiona (es de terceros):
 * apuntar CIVIX_PRESCOM_DIR a la carpeta extraída de PRESCOM_2013.
 */
const RAIZ = process.env.CIVIX_PRESCOM_DIR;
const hay = !!RAIZ && existsSync(join(RAIZ, 'proyectos'));
const d = hay ? describe : describe.skip;

d('regresión contra PRESCOM 2013', () => {
  const proyectos = hay ? readdirSync(join(RAIZ!, 'proyectos')).filter((f) => /\.ddp$/i.test(f)) : [];

  it.each(proyectos)('proyecto %s: cada precio unitario coincide con el de PRESCOM', (f) => {
    const p = leerProyecto(readFileSync(join(RAIZ!, 'proyectos', f)));
    const mapa = new Map(p.insumos.map((i) => [i.id, i]));
    expect(p.partidas.length).toBeGreaterThan(0);
    const malos: string[] = [];
    const verificables = p.partidas.filter((x) => !x.sinDetalle);
    if (/^csubmodulos/i.test(f)) expect(verificables.length).toBe(0); // archivo temporal sin detalle
    else expect(verificables.length).toBe(p.partidas.length);
    for (const x of verificables) {
      const r = calcularItem(x.item, mapa, p.plantilla, 2);
      const ref = x.referenciaPrescom!.precioUnitario;
      if (Math.abs(r.precioUnitario - ref) > 0.0051) malos.push(`${x.descripcion}: civix=${r.precioUnitario} prescom=${ref}`);
    }
    expect(malos).toEqual([]);
  });

  it('lee todas las bases de datos sin errores', () => {
    const dir = join(RAIZ!, 'datos');
    const bases = readdirSync(dir).filter((f) => /\.nbd$/i.test(f)).map((f) => f.replace(/\.nbd$/i, ''));
    expect(bases.length).toBeGreaterThanOrEqual(10);
    for (const b of bases) {
      const leer = (ext: string) => {
        const f = readdirSync(dir).find((x) => x.toLowerCase() === `${b}.${ext}`.toLowerCase());
        return f ? new Uint8Array(readFileSync(join(dir, f))) : undefined;
      };
      const bd = leerBaseDatos({ nombre: b, nbd: leer('nbd')!, dat: leer('dat')!, grp: leer('grp'), cfg: leer('cfg') });
      expect(bd.items.length + bd.insumos.length).toBeGreaterThan(0);
      const ids = new Set(bd.insumos.map((i) => i.id));
      for (const it of bd.items) for (const l of [...it.materiales, ...it.manoObra, ...it.equipo])
        expect(ids.has(l.insumo), `${b}: ${it.descripcion}`).toBe(true);
    }
  });
});
