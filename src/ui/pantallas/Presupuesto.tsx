import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Input, Tab, TabList, Tooltip } from '@fluentui/react-components';
import { Copy16Regular, Merge16Regular, Add16Regular, ArrowLeft16Regular, ArrowRight16Regular, Delete16Regular, Edit16Regular, Search16Regular } from '@fluentui/react-icons';
import { useMemo, useState } from 'react';
import { montoALiteral } from '../../nucleo/literal';
import { agregarModulo, eliminarModulo, moverModulo } from '../../nucleo/operaciones';
import { duplicarModulo } from '../../nucleo/herramientas';
import { calcularProyecto } from '../../nucleo/presupuesto';
import { num } from '../../reportes/formato';
import { abrirDialogo, cambiar, elegirPartida, irAModulo, irAPestana, solicitarImportacion, useEstado } from '../almacen';
import { Numero, Texto } from '../campos';

export function Presupuesto() {
  const proyecto = useEstado((e) => e.proyecto);
  const modulo = useEstado((e) => e.modulo);
  const seleccion = useEstado((e) => e.seleccion);
  const [renombrando, setRenombrando] = useState(false);
  const calc = useMemo(() => calcularProyecto(proyecto), [proyecto]);
  const actual = calc.modulos[modulo - 1] ?? calc.modulos[0]!;
  const moneda = proyecto.moneda === 1 ? '$US' : 'Bs';
  const ir = (m: number) => { irAModulo(m); elegirPartida(-1); };

  const borrarModulo = () => {
    const n = actual.partidas.length;
    if (calc.modulos.length === 1 && !n) return;
    if (n && !window.confirm(`¿Eliminar el módulo «${actual.nombre}» con sus ${n} partidas? (Puede deshacerlo con Ctrl+Z)`)) return;
    cambiar((p) => eliminarModulo(p, actual.indice), `Módulo «${actual.nombre}» eliminado`);
    ir(Math.max(1, actual.indice - 1));
  };

  return (
    <div className="pantalla presupuesto">
      <div className="modulos">
        <TabList selectedValue={String(actual.indice)} onTabSelect={(_, d) => ir(Number(d.value))} size="small" className="pestanas-modulos">
          {calc.modulos.map((m) => <Tab key={m.indice} value={String(m.indice)} data-testid={`modulo-${m.indice}`} title={`${m.nombre} · ${moneda} ${num(m.total)}`}>{`M${String(m.indice).padStart(2, '0')}`}{calc.modulos.length <= 6 ? ` ${m.nombre}` : ''}</Tab>)}
        </TabList>
      </div>
      <div className="barra-filtros barra-modulo">
        <b className="nombre-modulo" data-testid="nombre-modulo-actual">{actual.nombre}</b>
        <Tooltip content="Cambiar el nombre del módulo" relationship="label"><Button size="small" appearance="subtle" icon={<Edit16Regular />} onClick={() => setRenombrando(true)} data-testid="renombrar-modulo">Renombrar</Button></Tooltip>
        <Button size="small" appearance="subtle" icon={<Add16Regular />} data-testid="nuevo-modulo"
          onClick={() => { cambiar((p) => { agregarModulo(p, `MÓDULO ${p.modulos.length + 1}`); }, 'Módulo añadido'); ir(calc.modulos.length + 1); }}>Módulo</Button>
        <Tooltip content="Mover el módulo a la izquierda" relationship="label"><Button size="small" appearance="subtle" icon={<ArrowLeft16Regular />} disabled={actual.indice === 1} data-testid="modulo-izquierda" onClick={() => { cambiar((p) => { moverModulo(p, actual.indice, -1); }, 'Módulo movido'); ir(actual.indice - 1); }} /></Tooltip>
        <Tooltip content="Mover el módulo a la derecha" relationship="label"><Button size="small" appearance="subtle" icon={<ArrowRight16Regular />} disabled={actual.indice === calc.modulos.length} data-testid="modulo-derecha" onClick={() => { cambiar((p) => { moverModulo(p, actual.indice, 1); }, 'Módulo movido'); ir(actual.indice + 1); }} /></Tooltip>
        <Button size="small" appearance="subtle" icon={<Copy16Regular />} data-testid="duplicar-modulo" onClick={() => { let n = actual.indice; cambiar((p) => { n = duplicarModulo(p, actual.indice); }, `Módulo «${actual.nombre}» duplicado`); ir(n); }}>Duplicar</Button>
        <Button size="small" appearance="subtle" icon={<Merge16Regular />} disabled={calc.modulos.length < 2} data-testid="unir-modulo" onClick={() => abrirDialogo({ tipo: 'unir-modulo' })}>Unir con…</Button>
        <Button size="small" appearance="subtle" icon={<Delete16Regular />} disabled={calc.modulos.length === 1 && !actual.partidas.length} data-testid="eliminar-modulo" onClick={borrarModulo}>Eliminar módulo</Button>
        <span style={{ flex: 1 }} />
        <Button size="small" icon={<Add16Regular />} onClick={() => abrirDialogo({ tipo: 'nueva-partida' })} data-testid="boton-nueva-partida">Nueva partida</Button>
        <Button size="small" icon={<Search16Regular />} onClick={() => abrirDialogo({ tipo: 'buscar' })} data-testid="boton-buscar">Buscar (Ctrl+F)</Button>
      </div>

      {calc.modulos.every((m) => m.partidas.length === 0) && (
        <div className="bienvenida" data-testid="bienvenida">
          <h3>Este proyecto aún no tiene partidas</h3>
          <p>Formas de empezar: <b>Nueva partida</b> (precio directo, luego puede armar su análisis), añadir ítems de una base de datos, <b>importar de una IA</b> un archivo JSON (proyecto, datos o precios), o abrir un proyecto de PRESCOM (menú Archivo).</p>
          <div className="acciones">
            <Button appearance="primary" onClick={() => solicitarImportacion('')} data-testid="bienvenida-importar">Importar de IA (elegir archivo .json)</Button>
            <Button onClick={() => abrirDialogo({ tipo: 'nueva-partida' })}>Nueva partida</Button>
            <Button onClick={() => irAPestana('base')}>Ir a las bases de datos</Button>
          </div>
        </div>
      )}
      <div className="tabla-contenedor">
        <table className="grilla" data-testid="grilla-presupuesto">
          <thead><tr><th style={{ width: 54 }}>N°</th><th>Descripción</th><th style={{ width: 70 }}>Unidad</th><th style={{ width: 120 }}>Cantidad</th><th style={{ width: 120 }}>P. unitario</th><th style={{ width: 130 }} className="n">Parcial ({moneda})</th></tr></thead>
          <tbody>
            {actual.partidas.length === 0 && <tr><td colSpan={6} className="vacio">Este módulo no tiene partidas. Use «Nueva partida», o vaya a «Base de datos», elija un ítem y pulse «Añadir al presupuesto».</td></tr>}
            {actual.partidas.map((x) => {
              const pos = proyecto.partidas.indexOf(x.partida);
              const directo = x.partida.item.precioFijo !== undefined;
              const sinAnalisis = !directo && !x.partida.sinDetalle && !x.partida.item.materiales.length && !x.partida.item.manoObra.length && !x.partida.item.equipo.length;
              return (
                <tr key={pos} className={pos === seleccion ? 'sel' : ''} onClick={() => elegirPartida(pos)} data-testid="fila-partida" title="Doble clic: análisis de precio unitario"
                  onDoubleClick={(ev) => { if (!(ev.target instanceof HTMLInputElement) && !(ev.target instanceof HTMLButtonElement)) abrirDialogo({ tipo: 'apu', pos }); }}>
                  <td className="c">{actual.indice}.{x.numero}</td>
                  <td><Texto id="descripcion" valor={x.partida.descripcion} alCambiar={(t) => cambiar((p) => { p.partidas[pos]!.descripcion = t; }, 'Descripción cambiada')} /></td>
                  <td className="c"><Texto id="unidad" valor={x.partida.unidad} max={5} requerido={false} alCambiar={(t) => cambiar((p) => { p.partidas[pos]!.unidad = t; }, 'Unidad cambiada')} /></td>
                  <td className="n">
                    {x.partida.computo?.length
                      ? <button className="celda-boton" title="La cantidad sale del cómputo métrico: clic para editarlo" data-testid="cantidad-computo" onClick={() => abrirDialogo({ tipo: 'computo', pos })}>Σ {num(x.partida.cantidad)}</button>
                      : <Numero id="cantidad" valor={x.partida.cantidad} alCambiar={(n) => cambiar((p) => { p.partidas[pos]!.cantidad = n; }, 'Cantidad cambiada')} />}
                  </td>
                  <td className="n">
                    {directo
                      ? <Numero id="precio-unitario" valor={x.partida.item.precioFijo} titulo="Precio directo (sin análisis): escriba el nuevo valor" alCambiar={(n) => cambiar((p) => { p.partidas[pos]!.item.precioFijo = n; }, 'Precio unitario cambiado')} />
                      : <button className={`celda-boton${sinAnalisis ? ' alerta' : ''}`} title={sinAnalisis ? 'Sin insumos: abra el análisis para completarlo' : 'Precio calculado con el análisis: clic para verlo o editarlo'} data-testid="ver-apu" onClick={() => abrirDialogo({ tipo: 'apu', pos })}>{num(x.precioUnitario)}</button>}
                  </td>
                  <td className="n">{num(x.parcial)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="totales">
        <span>Total módulo: <b data-testid="total-modulo">{moneda} {num(actual.total)}</b> ({actual.partidas.length} partidas)</span>
        <span>TOTAL PRESUPUESTO: <b data-testid="total-general">{moneda} {num(calc.total)}</b></span>
        <span className="literal">{montoALiteral(calc.total, proyecto.moneda === 1 ? 'Dólares americanos' : 'Bolivianos')}</span>
      </div>

      {renombrando && <Renombrar indice={actual.indice} nombre={actual.nombre} alCerrar={() => setRenombrando(false)} />}
    </div>
  );
}

function Renombrar({ indice, nombre, alCerrar }: { indice: number; nombre: string; alCerrar: () => void }) {
  const [t, setT] = useState(nombre);
  const ok = () => { cambiar((p) => { p.modulos[indice - 1]!.nombre = t.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 50) || nombre; }, 'Módulo renombrado'); alCerrar(); };
  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) alCerrar(); }}>
      <DialogSurface><DialogBody><DialogTitle>Nombre del módulo</DialogTitle>
        <DialogContent><Input value={t} maxLength={50} onChange={(_, d) => setT(d.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} data-testid="nombre-modulo" autoFocus style={{ width: '100%' }} /></DialogContent>
        <DialogActions><Button appearance="primary" onClick={ok} data-testid="aceptar-nombre">Aceptar</Button><Button onClick={alCerrar}>Cancelar</Button></DialogActions>
      </DialogBody></DialogSurface>
    </Dialog>
  );
}
