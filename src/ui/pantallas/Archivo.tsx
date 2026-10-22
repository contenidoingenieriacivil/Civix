import { Button } from '@fluentui/react-components';
import { DocumentAdd24Regular, FolderOpen24Regular, Save24Regular, SaveEdit24Regular } from '@fluentui/react-icons';
import { useEffect, useState } from 'react';
import { calcularProyecto } from '../../nucleo/presupuesto';
import { num } from '../../reportes/formato';
import { abrirProyecto, guardarProyecto } from '../acciones';
import { useEstado } from '../almacen';
import { nativo } from '../persistencia';

/** Vista «Archivo» (como el Backstage de Office): estado del archivo, nuevo/abrir/guardar y proyectos recientes. */
export function ArchivoPantalla({ alNuevo }: { alNuevo: () => void }) {
  const proyecto = useEstado((e) => e.proyecto);
  const archivo = useEstado((e) => e.archivo);
  const [recientes, setRecientes] = useState<{ ruta: string; existe: boolean; fecha: string | null }[] | null>(null);
  const n = nativo();
  useEffect(() => { void n?.recientes().then(setRecientes); }, [n, archivo.ruta, archivo.modificado]);
  const total = (() => { try { return calcularProyecto(proyecto).total; } catch { return NaN; } })();

  return (
    <div className="pantalla archivo-vista">
      <section className="tarjeta" data-testid="estado-archivo">
        <h3>{proyecto.nombre}</h3>
        <p>{proyecto.partidas.length} partidas en {proyecto.modulos.length} módulos · Total {proyecto.moneda === 1 ? '$US' : 'Bs'} {num(total)}</p>
        <p>{archivo.ruta
          ? <>Archivo: <code data-testid="ruta-archivo">{archivo.ruta}</code> {n && <Button size="small" appearance="subtle" onClick={() => void n.mostrarEnCarpeta(archivo.ruta!)}>Mostrar en la carpeta</Button>}</>
          : <b>Este proyecto todavía no tiene archivo.</b>}</p>
        <p className={archivo.modificado ? 'estado-pendiente' : 'estado-ok'} data-testid="estado-guardado">
          {archivo.modificado ? '● Hay cambios sin guardar en el archivo (Civix igual los recuerda si cierra la ventana).' : archivo.ruta ? '✓ Todo guardado.' : 'Sin cambios.'}
        </p>
        <div className="acciones">
          <Button appearance="primary" icon={<Save24Regular />} onClick={() => void guardarProyecto()} data-testid="archivo-guardar">Guardar (Ctrl+S)</Button>
          <Button icon={<SaveEdit24Regular />} onClick={() => void guardarProyecto(true)} data-testid="archivo-guardar-como">Guardar como… (Ctrl+Mayús+S)</Button>
          <Button icon={<FolderOpen24Regular />} onClick={() => void abrirProyecto()} data-testid="archivo-abrir">Abrir… (Ctrl+O)</Button>
          <Button icon={<DocumentAdd24Regular />} onClick={alNuevo} data-testid="archivo-nuevo">Nuevo proyecto</Button>
        </div>
      </section>
      <section className="tarjeta">
        <h3>Proyectos recientes</h3>
        {!n && <p className="nota-ui">En el navegador los proyectos se descargan como archivo .civix; ábralos con «Abrir». En el programa de escritorio aparecen aquí los últimos que guardó o abrió.</p>}
        {n && recientes && !recientes.length && <p className="nota-ui">Aún no hay proyectos guardados. Use «Guardar» y elija una carpeta (por ejemplo Documentos).</p>}
        {n && recientes && recientes.length > 0 && (
          <table className="grilla" data-testid="lista-recientes"><thead><tr><th>Proyecto</th><th>Carpeta</th><th style={{ width: 150 }}>Modificado</th><th style={{ width: 90 }}></th></tr></thead><tbody>
            {recientes.map((r) => {
              const partes = r.ruta.split(/[\\/]/);
              return (
                <tr key={r.ruta} data-testid="reciente" className={r.existe ? '' : 'inexistente'}>
                  <td>{r.existe ? <button className="celda-boton izq" onClick={() => void abrirProyecto(r.ruta)}>{partes.pop()}</button> : <span title="El archivo se movió o se borró">{partes.pop()} (no encontrado)</span>}</td>
                  <td className="nota-ui">{partes.join('\\')}</td>
                  <td>{r.fecha ? new Date(r.fecha).toLocaleString('es-BO') : ''}</td>
                  <td><Button size="small" appearance="subtle" onClick={() => void n.quitarReciente(r.ruta).then(() => n.recientes().then(setRecientes))}>Quitar</Button></td>
                </tr>
              );
            })}
          </tbody></table>
        )}
      </section>
      <section className="tarjeta nota-ui">
        <h3>Cómo se guarda su trabajo</h3>
        <ul>
          <li><b>Archivo .civix</b>: es su proyecto completo (módulos, partidas, análisis, insumos y precios, cómputos, especificaciones, cronograma y configuración). Guárdelo donde quiera, cópielo a un USB o envíelo por correo; se abre con doble clic.</li>
          <li><b>Al guardar de nuevo</b>, Civix deja una copia del anterior como <code>.civix.bak</code> por si necesita volver atrás.</li>
          <li><b>Recuperación automática</b>: aunque no guarde, Civix recuerda el último proyecto abierto y lo muestra al volver a entrar. Al cerrar con cambios sin guardar, le pregunta si desea guardarlos.</li>
          <li><b>Bases de datos</b>: se guardan dentro de Civix automáticamente; para llevarlas a otra computadora use «Guardar base» (archivo .civbd).</li>
        </ul>
      </section>
    </div>
  );
}
