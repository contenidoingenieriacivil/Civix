import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Input, Tab, TabList } from '@fluentui/react-components';
import { Add16Regular } from '@fluentui/react-icons';
import { useMemo, useState } from 'react';
import { montoALiteral } from '../../nucleo/literal';
import { calcularItem, redondear } from '../../nucleo/calculo';
import { agregarModulo } from '../../nucleo/operaciones';
import { calcularProyecto } from '../../nucleo/presupuesto';
import type { Linea } from '../../nucleo/tipos';
import { num } from '../../reportes/formato';
import { cambiar, elegirPartida, irAModulo, useEstado } from '../almacen';
import { Numero } from '../campos';

export function Presupuesto() {
  const proyecto = useEstado((e) => e.proyecto);
  const modulo = useEstado((e) => e.modulo);
  const seleccion = useEstado((e) => e.seleccion);
  const [detalle, setDetalle] = useState<number | null>(null);
  const [renombrando, setRenombrando] = useState(false);
  const calc = useMemo(() => calcularProyecto(proyecto), [proyecto]);
  const actual = calc.modulos[modulo - 1] ?? calc.modulos[0]!;
  const moneda = proyecto.moneda === 1 ? '$US' : 'Bs';

  return (
    <div className="pantalla presupuesto">
      <div className="modulos">
        <TabList selectedValue={String(actual.indice)} onTabSelect={(_, d) => { irAModulo(Number(d.value)); elegirPartida(-1); }} size="small">
          {calc.modulos.map((m) => <Tab key={m.indice} value={String(m.indice)} data-testid={`modulo-${m.indice}`}>{m.nombre}</Tab>)}
        </TabList>
        <Button size="small" appearance="subtle" icon={<Add16Regular />} data-testid="nuevo-modulo"
          onClick={() => { cambiar((p) => { agregarModulo(p, `MÓDULO ${p.modulos.length + 1}`); }); irAModulo(calc.modulos.length + 1); }}>Módulo</Button>
        <Button size="small" appearance="subtle" onClick={() => setRenombrando(true)} data-testid="renombrar-modulo">Renombrar</Button>
      </div>

      <div className="tabla-contenedor">
        <table className="grilla" data-testid="grilla-presupuesto">
          <thead><tr><th style={{ width: 54 }}>N°</th><th>Descripción</th><th style={{ width: 70 }}>Unidad</th><th style={{ width: 110 }}>Cantidad</th><th style={{ width: 110 }}>P. unitario</th><th style={{ width: 130 }}>Parcial ({moneda})</th></tr></thead>
          <tbody>
            {actual.partidas.length === 0 && <tr><td colSpan={6} className="vacio">Este módulo no tiene partidas. Vaya a «Base de datos», elija un ítem y pulse «Añadir al presupuesto».</td></tr>}
            {actual.partidas.map((x) => {
              const pos = proyecto.partidas.indexOf(x.partida);
              return (
                <tr key={pos} className={pos === seleccion ? 'sel' : ''} onClick={() => elegirPartida(pos)} onDoubleClick={() => setDetalle(pos)} data-testid="fila-partida">
                  <td className="c">{actual.indice}.{x.numero}</td>
                  <td>{x.partida.descripcion}</td>
                  <td className="c">{x.partida.unidad}</td>
                  <td className="n"><Numero id="cantidad" valor={x.partida.cantidad} alCambiar={(n) => cambiar((p) => { p.partidas[pos]!.cantidad = n; delete p.partidas[pos]!.computo; })} /></td>
                  <td className="n" title="Doble clic en la fila para ver el análisis">{num(x.precioUnitario)}</td>
                  <td className="n">{num(x.parcial)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="totales">
        <span>Total módulo «{actual.nombre}»: <b data-testid="total-modulo">{moneda} {num(actual.total)}</b></span>
        <span>TOTAL PRESUPUESTO: <b data-testid="total-general">{moneda} {num(calc.total)}</b></span>
        <span className="literal">{montoALiteral(calc.total, proyecto.moneda === 1 ? 'Dólares americanos' : 'Bolivianos')}</span>
      </div>

      {detalle !== null && proyecto.partidas[detalle] && <DetalleApu pos={detalle} alCerrar={() => setDetalle(null)} />}
      {renombrando && <Renombrar indice={actual.indice} nombre={actual.nombre} alCerrar={() => setRenombrando(false)} />}
    </div>
  );
}

function Renombrar({ indice, nombre, alCerrar }: { indice: number; nombre: string; alCerrar: () => void }) {
  const [t, setT] = useState(nombre);
  const ok = () => { cambiar((p) => { p.modulos[indice - 1]!.nombre = t.trim().toUpperCase() || nombre; }); alCerrar(); };
  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) alCerrar(); }}>
      <DialogSurface><DialogBody><DialogTitle>Nombre del módulo</DialogTitle>
        <DialogContent><Input value={t} onChange={(_, d) => setT(d.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} data-testid="nombre-modulo" autoFocus style={{ width: '100%' }} /></DialogContent>
        <DialogActions><Button appearance="primary" onClick={ok} data-testid="aceptar-nombre">Aceptar</Button><Button onClick={alCerrar}>Cancelar</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}

/** Análisis de precio unitario de una partida: rendimientos y precios editables, con el cálculo A–Q. */
function DetalleApu({ pos, alCerrar }: { pos: number; alCerrar: () => void }) {
  const proyecto = useEstado((e) => e.proyecto);
  const partida = proyecto.partidas[pos]!;
  const mapa = useMemo(() => new Map(proyecto.insumos.map((i) => [i.id, i])), [proyecto]);
  const apu = calcularItem(partida.item, mapa, proyecto.plantilla);
  const secciones: [string, 'materiales' | 'manoObra' | 'equipo'][] = [['Materiales', 'materiales'], ['Mano de obra', 'manoObra'], ['Equipo y maquinaria', 'equipo']];
  const lineas = (clave: 'materiales' | 'manoObra' | 'equipo', ls: Linea[]) => ls.map((l, k) => {
    const i = mapa.get(l.insumo);
    if (!i) return null;
    return (
      <tr key={`${clave}${k}`}>
        <td>{i.descripcion}</td><td className="c">{i.unidad}</td>
        <td className="n"><Numero valor={l.rendimiento} decimales={4} alCambiar={(n) => cambiar((p) => { p.partidas[pos]!.item[clave][k]!.rendimiento = n; })} /></td>
        <td className="n"><Numero valor={i.precio} decimales={3} alCambiar={(n) => cambiar((p) => { p.insumos.find((x) => x.id === i.id)!.precio = n; })} /></td>
        <td className="n">{num(redondear(l.rendimiento * i.precio, 4))}</td>
      </tr>
    );
  });
  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) alCerrar(); }}>
      <DialogSurface style={{ maxWidth: 860, width: '92vw' }}><DialogBody>
        <DialogTitle>Análisis de precio unitario · {partida.descripcion} ({partida.unidad})</DialogTitle>
        <DialogContent>
          <div className="tabla-contenedor" style={{ maxHeight: '48vh' }}>
            <table className="grilla" data-testid="tabla-apu">
              <thead><tr><th>Descripción</th><th style={{ width: 60 }}>Unid.</th><th style={{ width: 110 }}>Rendimiento</th><th style={{ width: 110 }}>Precio</th><th style={{ width: 100 }}>Costo</th></tr></thead>
              <tbody>{secciones.map(([t, c]) => partida.item[c].length ? [<tr key={t} className="sub"><td colSpan={5}>{t}</td></tr>, ...lineas(c, partida.item[c])] : null)}</tbody>
            </table>
          </div>
          <table className="grilla compacta" style={{ marginTop: 8 }}>
            <tbody>
              {proyecto.plantilla.parametros.filter((q) => q.formula.trim() && !['A', 'B', 'C'].includes(q.letra)).map((q) => (
                <tr key={q.letra} className={q.resaltar ? 'sub' : ''}><td>{q.letra}</td><td>{q.descripcion}{q.porcentaje !== null ? ` (${num(q.porcentaje)}%)` : ''}</td><td className="n">{num(apu.valores[q.letra] ?? 0)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="literal">Precio unitario adoptado: <b data-testid="pu-adoptado">{num(apu.precioUnitario)}</b></p>
        </DialogContent>
        <DialogActions><Button appearance="primary" onClick={alCerrar} data-testid="cerrar-apu">Cerrar</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}
