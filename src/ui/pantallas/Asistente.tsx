import { Button, Textarea } from '@fluentui/react-components';
import { useState } from 'react';
import { INSTRUCCIONES_IA } from '../../ia/intercambio';
import { INSTRUCCIONES_ORDENES, ejecutarOrdenes, interpretarFrase, type Orden, type ResultadoOrdenes } from '../../ia/ordenes';
import { avisar, elegirReporte, irAPestana, reemplazarProyecto, useEstado } from '../almacen';

/** Convierte lo escrito (frases o JSON de una IA) en órdenes; devuelve también lo que no entendió. */
export function leerOrdenes(texto: string): { ordenes: Orden[]; noEntendidas: string[] } {
  const t = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (/^[[{]/.test(t)) {
    try {
      const d = JSON.parse(t) as Orden[] | { ordenes: Orden[] };
      const ordenes = Array.isArray(d) ? d : d.ordenes;
      if (Array.isArray(ordenes)) return { ordenes, noEntendidas: [] };
    } catch (e) { return { ordenes: [], noEntendidas: [`JSON no válido: ${e instanceof Error ? e.message : e}`] }; }
  }
  const ordenes: Orden[] = [];
  const noEntendidas: string[] = [];
  for (const linea of t.split(/\n|;/).map((x) => x.trim()).filter(Boolean)) {
    const o = interpretarFrase(linea);
    if (o) ordenes.push(o); else noEntendidas.push(linea);
  }
  return { ordenes, noEntendidas };
}

export function Asistente({ alCerrar }: { alCerrar: () => void }) {
  const proyecto = useEstado((e) => e.proyecto);
  const bases = useEstado((e) => e.bases);
  const [texto, setTexto] = useState('');
  const [res, setRes] = useState<(ResultadoOrdenes & { noEntendidas: string[] }) | null>(null);

  const interpretar = () => {
    const { ordenes, noEntendidas } = leerOrdenes(texto);
    setRes({ ...ejecutarOrdenes(proyecto, ordenes, bases), noEntendidas });
  };
  const aplicar = () => {
    if (!res) return;
    reemplazarProyecto(res.proyecto, `Órdenes aplicadas (${res.registro.length})`);
    if (res.reportes[0]) { elegirReporte(res.reportes[0]); irAPestana('reportes'); }
    setRes(null); setTexto('');
  };
  const copiar = (t: string, msg: string) => { void navigator.clipboard?.writeText(t); avisar(msg); };

  return (
    <aside className="asistente" aria-label="Asistente de órdenes" data-testid="panel-asistente">
      <div className="asistente-cab"><b>Asistente</b><Button size="small" appearance="subtle" onClick={alCerrar} aria-label="Cerrar asistente">✕</Button></div>
      <p className="nota-ui">Escriba lo que necesita (una orden por línea) o pegue el JSON que le redactó una IA. Funciona sin internet.</p>
      <Textarea value={texto} onChange={(_, d) => setTexto(d.value)} rows={7} placeholder={'sube 5% el cemento\ncambia las cargas sociales a 71,18%\ngenera el B-1'} data-testid="orden-texto" style={{ width: '100%' }} />
      <div className="acciones"><Button appearance="primary" onClick={interpretar} data-testid="interpretar">Ver qué haría</Button>
        <Button onClick={aplicar} disabled={!res || (res.registro.length === 0)} data-testid="aplicar-ordenes">Aplicar</Button></div>
      {res && (
        <div data-testid="vista-previa-ordenes">
          {res.registro.length > 0 && <><h4>Vista previa</h4><ul className="ok">{res.registro.map((r, k) => <li key={k}>{r}</li>)}</ul></>}
          {(res.errores.length > 0 || res.noEntendidas.length > 0) && <><h4>Problemas</h4><ul className="errores">
            {res.errores.map((r, k) => <li key={`e${k}`}>{r}</li>)}{res.noEntendidas.map((r, k) => <li key={`n${k}`}>No entendí: «{r}»</li>)}</ul></>}
        </div>
      )}
      <hr />
      <h4>Trabajar con otra IA</h4>
      <p className="nota-ui">Copie estas instrucciones, péguelas en Gemini, ChatGPT o Claude junto con sus documentos, y traiga el resultado aquí.</p>
      <div className="acciones">
        <Button size="small" onClick={() => copiar(INSTRUCCIONES_ORDENES, 'Instrucciones de órdenes copiadas')} data-testid="copiar-ordenes">Copiar instrucciones de órdenes</Button>
        <Button size="small" onClick={() => copiar(INSTRUCCIONES_IA, 'Instrucciones de datos copiadas')} data-testid="copiar-datos">Copiar instrucciones de datos</Button>
      </div>
    </aside>
  );
}
