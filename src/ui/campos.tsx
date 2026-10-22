import { Component, useState, type ReactNode } from 'react';
import { avisar, deshacer } from './almacen';
import { num } from '../reportes/formato';

/** Convierte lo escrito («1.234,56», «1234.5», «12,5») a número; null si no es un número. */
export function leerNumero(t: string): number | null {
  const s = t.trim().replace(/\s+/g, '');
  if (!s) return null;
  const limpio = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  if (!/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(limpio) && !/^-?\d+\.$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Campo numérico que acepta coma o punto y confirma al salir o con Enter; rechaza (y avisa) lo que no es válido. */
export function Numero({ valor, alCambiar, alVaciar, decimales = 2, ancho = 90, id, min = 0, max = 1e10, titulo }: {
  valor: number | undefined; alCambiar: (n: number) => void; /** Si se da, borrar el campo deja el valor sin definir. */ alVaciar?: () => void;
  decimales?: number; ancho?: number; id?: string; min?: number; max?: number; titulo?: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrar = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v.toFixed(decimales).replace('.', ',') : '');
  const confirmar = () => {
    if (texto === null) return;
    const n = leerNumero(texto);
    setTexto(null);
    if (texto.trim() === mostrar(valor)) return;
    if (n === null && !texto.trim() && alVaciar) { if (valor !== undefined) alVaciar(); return; }
    if (n === null) { if (texto.trim()) avisar(`«${texto.trim().slice(0, 20)}» no es un número: se conserva ${mostrar(valor)}`); return; }
    if (n < min || n > max) { avisar(`El valor debe estar entre ${min.toLocaleString('es-BO')} y ${max.toLocaleString('es-BO')}: se conserva ${mostrar(valor)}`); return; }
    if (n !== valor) alCambiar(n);
  };
  return (
    <input className="celda-num" data-testid={id} style={{ width: ancho }} value={texto ?? (valor !== undefined && Number.isFinite(valor) ? num(valor, decimales) : '')} title={titulo} inputMode="decimal"
      onFocus={(e) => { setTexto(mostrar(valor)); e.currentTarget.select(); }}
      onChange={(e) => setTexto(e.target.value)} onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTexto(null); e.currentTarget.blur(); } }} />
  );
}

/** Celda de texto editable: confirma al salir o con Enter, Esc cancela; no acepta un texto vacío si `requerido`. */
export function Texto({ valor, alCambiar, max = 70, id, requerido = true, placeholder, mayusculas = false }: {
  valor: string; alCambiar: (t: string) => void; max?: number; id?: string; requerido?: boolean; placeholder?: string; mayusculas?: boolean;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const confirmar = () => {
    if (texto === null) return;
    let t = texto.replace(/\s+/g, ' ').trim().slice(0, max);
    if (mayusculas) t = t.toUpperCase();
    setTexto(null);
    if (!t && requerido) { avisar('El texto no puede quedar vacío: se conserva el anterior'); return; }
    if (t !== valor) alCambiar(t);
  };
  return (
    <input className="celda-txt" data-testid={id} value={texto ?? valor} maxLength={max + 20} placeholder={placeholder}
      onFocus={() => setTexto(valor)} onChange={(e) => setTexto(e.target.value)} onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTexto(null); e.currentTarget.blur(); } }} />
  );
}

/** Si una pantalla falla, muestra el error y ofrece deshacer el último cambio en vez de dejar la ventana en blanco. */
export class Protector extends Component<{ children: ReactNode; zona: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { zona: string }) { if (prev.zona !== this.props.zona && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="pantalla vacio-grande" data-testid="error-pantalla" role="alert">
        <h2>Algo salió mal en esta pantalla</h2>
        <p>{this.state.error.message}</p>
        <div className="acciones" style={{ justifyContent: 'center' }}>
          <button className="boton-simple" onClick={() => { deshacer(); this.setState({ error: null }); }} data-testid="error-deshacer">Deshacer el último cambio</button>
          <button className="boton-simple" onClick={() => this.setState({ error: null })}>Reintentar</button>
        </div>
        <p className="nota-ui">Sus datos no se perdieron: el proyecto se guarda automáticamente.</p>
      </div>
    );
  }
}
