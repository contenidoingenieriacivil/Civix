/** Formato numérico boliviano: miles con punto y decimales con coma (1.234,56). */
export function num(x: number, decimales = 2): string {
  const [e, d = ''] = Math.abs(x).toFixed(decimales).split('.');
  const miles = e!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${x < 0 ? '-' : ''}${miles}${decimales ? ',' + d : ''}`;
}

/** Nombre del insumo para imprimir: sin la marca «[Bs 95,00]» que distingue variantes de precio de un mismo insumo. */
export const nombreInsumo = (s: string) => s.replace(/\s*\[Bs [\d.,]+\]$/, '');

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function fechaBo(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export const ESTILO_REPORTE = `
@page { size: letter; margin: 15mm 12mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; margin: 0; }
h1 { font-size: 12pt; text-align: center; margin: 0 0 2mm; }
h2 { font-size: 10pt; text-align: center; margin: 4mm 0 3mm; font-weight: normal; }
.meta { width: 100%; margin: 2mm 0 4mm; border-collapse: collapse; }
.meta td { padding: 0.5mm 1mm; vertical-align: top; }
table.t { width: 100%; border-collapse: collapse; }
table.t th, table.t td { border: 0.3mm solid #333; padding: 0.8mm 1.5mm; }
table.t th { background: #e6e6e6; font-weight: bold; text-align: center; }
td.n, th.n { text-align: right; white-space: nowrap; }
td.c { text-align: center; }
tr.sub td { font-weight: bold; background: #f3f3f3; }
tr.tot td { font-weight: bold; background: #dcdcdc; }
.nota { margin-top: 4mm; font-size: 8pt; }
.firma { margin-top: 18mm; text-align: center; font-size: 8pt; }
.firma div { display: inline-block; border-top: 0.3mm solid #000; padding-top: 1mm; min-width: 70mm; }
.aviso { border: 0.4mm solid #b45309; background: #fffbeb; padding: 2.5mm 3mm; margin: 3mm 0; font-size: 8.5pt; }
.aviso b { color: #92400e; }
.pagina { page-break-after: always; }
.membrete { text-align: center; font-weight: bold; font-size: 10pt; margin: 0 0 2mm; border-bottom: 0.4mm solid #333; padding-bottom: 1mm; }
.firmas { display: flex; justify-content: space-around; margin-top: 18mm; font-size: 8pt; text-align: center; }
.firmas .linea { border-top: 0.3mm solid #000; min-width: 50mm; padding-top: 1mm; font-weight: bold; }
.grafico { width: 100%; height: auto; margin: 3mm 0; }
.salto { page-break-before: always; }
@media screen { html { background: #d1d5db; } body { background: #fff; max-width: 205mm; margin: 10px auto; padding: 12mm; box-shadow: 0 1px 6px rgba(0,0,0,.25); } .pagina { border-bottom: 1px dashed #bbb; margin-bottom: 8mm; padding-bottom: 6mm; } }
.pagina:last-child { page-break-after: auto; }
`;

export function documento(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${ESTILO_REPORTE}</style></head><body>${cuerpo}</body></html>`;
}
