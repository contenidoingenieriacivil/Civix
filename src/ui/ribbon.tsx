import { Button, Tab, TabList, Tooltip } from '@fluentui/react-components';
import type { ReactNode } from 'react';

export interface Cmd { id: string; etiqueta: string; icono: ReactNode; ayuda?: string; deshabilitado?: boolean; accion: () => void }
export interface Grupo { titulo: string; comandos: Cmd[] }

/** Cinta de opciones al estilo de Office: pestañas arriba, grupos de comandos con icono grande debajo. */
export function Ribbon({ pestanas, activa, alElegir, grupos }: {
  pestanas: { id: string; titulo: string }[]; activa: string; alElegir: (id: string) => void; grupos: Grupo[];
}) {
  return (
    <div className="ribbon" role="region" aria-label="Cinta de opciones">
      <TabList selectedValue={activa} onTabSelect={(_, d) => alElegir(String(d.value))} size="small" className="ribbon-tabs">
        {pestanas.map((p) => <Tab key={p.id} value={p.id} data-testid={`pestana-${p.id}`}>{p.titulo}</Tab>)}
      </TabList>
      <div className="ribbon-cuerpo">
        {grupos.map((g) => (
          <div className="ribbon-grupo" key={g.titulo}>
            <div className="ribbon-comandos">
              {g.comandos.map((c) => (
                <Tooltip key={c.id} content={c.ayuda ?? c.etiqueta} relationship="description">
                  <Button appearance="subtle" className="ribbon-boton" disabled={c.deshabilitado} onClick={c.accion} data-testid={`cmd-${c.id}`}>
                    <span className="ribbon-icono">{c.icono}</span>
                    <span className="ribbon-etiqueta">{c.etiqueta}</span>
                  </Button>
                </Tooltip>
              ))}
            </div>
            <div className="ribbon-titulo">{g.titulo}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
