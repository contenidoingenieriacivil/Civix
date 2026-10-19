import { useState } from 'react';

/** Campo numérico que acepta coma o punto y confirma al salir o con Enter. */
export function Numero({ valor, alCambiar, decimales = 2, ancho = 90, id }: { valor: number; alCambiar: (n: number) => void; decimales?: number; ancho?: number; id?: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  const confirmar = () => {
    if (texto === null) return;
    const n = Number(texto.replace(/\./g, (m, o, s) => (s.includes(',') ? '' : m)).replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) alCambiar(n);
    setTexto(null);
  };
  return (
    <input className="celda-num" data-testid={id} style={{ width: ancho }} value={texto ?? valor.toFixed(decimales).replace('.', ',')}
      onFocus={(e) => { setTexto(valor.toFixed(decimales).replace('.', ',')); e.currentTarget.select(); }}
      onChange={(e) => setTexto(e.target.value)} onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTexto(null); e.currentTarget.blur(); } }} />
  );
}

