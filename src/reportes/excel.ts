import type { ProyectoCalculado } from '../nucleo/presupuesto';
import { desgloseInsumos } from '../nucleo/presupuesto';
import { montoALiteral } from '../nucleo/literal';
import { redondear } from '../nucleo/calculo';
import { nombreInsumo } from './formato';

/** Exporta el presupuesto (B-1) y el desglose de insumos a un libro de Excel (.xlsx). */
export async function presupuestoAExcel(c: ProyectoCalculado): Promise<Uint8Array> {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  wb.creator = 'Civix';
  const p = c.proyecto;
  const fmt = `#,##0.${'0'.repeat(c.decimales)}`;
  const hoja = wb.addWorksheet('Presupuesto (B-1)');
  hoja.addRow(['FORMULARIO B-1 · PRESUPUESTO POR ÍTEMES Y GENERAL DE LA OBRA']).font = { bold: true, size: 13 };
  hoja.addRow([`Proyecto: ${p.nombre}`]);
  hoja.addRow([`Cliente: ${p.cliente}   Lugar: ${p.lugar}`]);
  hoja.addRow([]);
  const enc = hoja.addRow(['Ítem', 'Descripción', 'Unidad', 'Cantidad', 'Prec. Unit.', 'Prec. Total']);
  enc.font = { bold: true };
  enc.eachCell((x) => { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } }; x.border = { bottom: { style: 'thin' } }; });
  let n = 0;
  for (const m of c.modulos) {
    if (c.modulos.length > 1) hoja.addRow(['', m.nombre]).font = { bold: true };
    for (const x of m.partidas) {
      const fila = hoja.addRow([++n, x.partida.descripcion, x.partida.unidad, redondear(x.partida.cantidad, 2), x.precioUnitario, null]);
      fila.getCell(6).value = { formula: `ROUND(D${fila.number}*E${fila.number},${c.decimales})`, result: x.parcial };
      fila.getCell(4).numFmt = '#,##0.00'; fila.getCell(5).numFmt = fmt; fila.getCell(6).numFmt = fmt;
    }
  }
  const ini = 6, fin = hoja.rowCount;
  const tot = hoja.addRow(['', 'TOTAL PRESUPUESTO', '', '', '', null]);
  tot.getCell(6).value = { formula: `SUM(F${ini}:F${fin})`, result: c.total };
  tot.font = { bold: true }; tot.getCell(6).numFmt = fmt;
  hoja.addRow([]);
  hoja.addRow([montoALiteral(c.total, p.moneda === 1 ? 'Dólares americanos' : 'Bolivianos')]).font = { bold: true };
  hoja.columns = [{ width: 7 }, { width: 58 }, { width: 9 }, { width: 12 }, { width: 13 }, { width: 15 }];

  const des = desgloseInsumos(c);
  const h2 = wb.addWorksheet('Insumos (B-3)');
  h2.addRow(['Rubro', 'Descripción', 'Unidad', 'Precio unitario', 'Cantidad total', 'Monto']).font = { bold: true };
  for (const [r, nombre] of [['M', 'Materiales'], ['O', 'Mano de obra'], ['E', 'Equipo']] as const) {
    for (const f of des[r]) h2.addRow([nombre, nombreInsumo(f.insumo.descripcion), f.insumo.unidad, f.insumo.precio, f.cantidad, f.monto]);
  }
  h2.columns = [{ width: 14 }, { width: 58 }, { width: 9 }, { width: 15 }, { width: 15 }, { width: 15 }];
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
