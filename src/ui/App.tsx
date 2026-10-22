import { useEffect, useState } from 'react';
import { Calculator24Regular, ClipboardPaste24Regular, Database24Regular, DocumentAdd24Regular, DocumentPdf24Regular, FolderOpen24Regular, ArrowExport24Regular, ArrowImport24Regular,
  ArrowRedo24Regular, ArrowUndo24Regular, Delete24Regular, Print24Regular, Save24Regular, Sparkle24Regular, Table24Regular, Copy24Regular, DocumentTable24Regular,
  Add24Regular, ArrowUp24Regular, ArrowDown24Regular, CopyAdd24Regular, Ruler24Regular, TextBulletListSquare24Regular, DataBarVertical24Regular, Search24Regular, SaveCopy24Regular, ArrowMove24Regular } from '@fluentui/react-icons';
import { REPORTES } from '../reportes/indice';
import { abrirBase, abrirProyecto, abrirProyectoPrescom, descargarReporteHtml, guardarReportePdf, exportarBase, exportarExcel, guardarProyecto, imprimirReporte, importarBasesPrescom } from './acciones';
import { alternarAsistente, solicitarImportacion, avisar, cambiar, deshacer, elegirPartida, elegirReporte, irAPestana, obtener, rehacer, useEstado, iniciar, abrirDialogo, baseActual, quitarBase } from './almacen';
import { Protector } from './campos';
import { Dialogos } from './pantallas/Dialogos';
import { duplicarPartida, eliminarPartida, moverPartida } from '../nucleo/operaciones';
import { Asistente } from './pantallas/Asistente';
import { BaseDatosPantalla, crearBaseVacia } from './pantallas/BaseDatos';
import { ImportarIA } from './pantallas/ImportarIA';
import { NuevoProyecto } from './pantallas/NuevoProyecto';
import { VERSION } from './version';
import { CronogramaPantalla } from './pantallas/Cronograma';
import { ConfiguracionPantalla } from './pantallas/Configuracion';
import { Presupuesto } from './pantallas/Presupuesto';
import { ReportesPantalla } from './pantallas/Reportes';
import { Ribbon, type Grupo } from './ribbon';
import { calcularProyecto } from '../nucleo/presupuesto';
import { num } from '../reportes/formato';

const PESTANAS = [
  { id: 'archivo', titulo: 'Archivo' }, { id: 'inicio', titulo: 'Inicio' }, { id: 'base', titulo: 'Base de datos' }, { id: 'cronograma', titulo: 'Cronograma' },
  { id: 'reportes', titulo: 'Reportes' }, { id: 'config', titulo: 'Configuración' },
];

function borrarSeleccion() {
  const s = obtener().seleccion, x = obtener().proyecto.partidas[s];
  if (!x) return;
  cambiar((p) => eliminarPartida(p, s), `Partida «${x.descripcion}» eliminada (Ctrl+Z para deshacer)`);
  const quedan = obtener().proyecto.partidas;
  elegirPartida(quedan[s]?.modulo === x.modulo ? s : quedan[s - 1]?.modulo === x.modulo ? s - 1 : -1);
}
function duplicarSeleccion() {
  const s = obtener().seleccion;
  if (!obtener().proyecto.partidas[s]) return;
  let n = s;
  cambiar((p) => { n = duplicarPartida(p, s); }, 'Partida duplicada');
  elegirPartida(n);
}
function moverSeleccion(dir: -1 | 1) {
  const s = obtener().seleccion;
  if (!obtener().proyecto.partidas[s]) return;
  let n = s;
  cambiar((p) => { n = moverPartida(p, s, dir); }, dir < 0 ? 'Partida subida' : 'Partida bajada');
  elegirPartida(n);
}
function moverDeModulo() {
  const s = obtener().seleccion;
  if (obtener().proyecto.partidas[s]) abrirDialogo({ tipo: 'mover-modulo', pos: s });
}

export default function App() {
  const e = useEstado((s) => s);
  const [pegar, setPegar] = useState(false);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  useEffect(() => { void iniciar(); }, []);
  useEffect(() => {
    const t = (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      const enCampo = ev.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
      const s = obtener();
      if (ev.ctrlKey && k === 's') { ev.preventDefault(); guardarProyecto(); return; }
      if (ev.ctrlKey && k === 'f' && (s.pestana === 'inicio' || s.pestana === 'archivo')) { ev.preventDefault(); abrirDialogo({ tipo: 'buscar' }); return; }
      if (enCampo || s.dialogo) return; // dentro de un campo, Ctrl+Z y Supr actúan sobre el texto
      if (ev.ctrlKey && k === 'z') { ev.preventDefault(); deshacer(); }
      if (ev.ctrlKey && k === 'y') { ev.preventDefault(); rehacer(); }
      if (s.seleccion < 0 || !(s.pestana === 'inicio' || s.pestana === 'archivo')) return;
      if (k === 'delete') { ev.preventDefault(); borrarSeleccion(); }
      if (ev.ctrlKey && k === 'd') { ev.preventDefault(); duplicarSeleccion(); }
      if (ev.altKey && (k === 'arrowup' || k === 'arrowdown')) { ev.preventDefault(); moverSeleccion(k === 'arrowup' ? -1 : 1); }
      if (k === 'enter' || k === 'f2') { ev.preventDefault(); abrirDialogo({ tipo: 'apu', pos: s.seleccion }); }
    };
    window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t);
  }, []);
  const total = (() => { try { return calcularProyecto(e.proyecto).total; } catch { return NaN; } })();
  const baseActiva = baseActual(e);
  const sel = e.seleccion >= 0 && e.proyecto.partidas[e.seleccion] ? e.seleccion : -1;
  const sinSel = { deshabilitado: sel < 0 };

  const cmd = (id: string, etiqueta: string, icono: React.ReactNode, accion: () => void, extra: { ayuda?: string; deshabilitado?: boolean } = {}) => ({ id, etiqueta, icono, accion, ...extra });
  const grupos: Record<string, Grupo[]> = {
    archivo: [
      { titulo: 'Proyecto', comandos: [cmd('nuevo', 'Nuevo', <DocumentAdd24Regular />, () => setNuevoAbierto(true)), cmd('abrir', 'Abrir', <FolderOpen24Regular />, () => void abrirProyecto()), cmd('guardar', 'Guardar', <Save24Regular />, guardarProyecto, { ayuda: 'Guardar (Ctrl+S)' })] },
      { titulo: 'Desde PRESCOM', comandos: [cmd('abrir-prescom', 'Proyecto PRESCOM', <ArrowImport24Regular />, () => void abrirProyectoPrescom(), { ayuda: 'Abrir un proyecto .DDP de PRESCOM 2013' }),
        cmd('bases-prescom', 'Bases PRESCOM', <Database24Regular />, () => void importarBasesPrescom(), { ayuda: 'Elija la carpeta «datos» de PRESCOM' })] },
      { titulo: 'Exportar', comandos: [cmd('excel', 'Excel', <DocumentTable24Regular />, () => void exportarExcel())] },
    ],
    inicio: [
      { titulo: 'Deshacer', comandos: [cmd('deshacer', 'Deshacer', <ArrowUndo24Regular />, deshacer, { deshabilitado: !e.deshacer.length, ayuda: 'Ctrl+Z' }), cmd('rehacer', 'Rehacer', <ArrowRedo24Regular />, rehacer, { deshabilitado: !e.rehacer.length, ayuda: 'Ctrl+Y' })] },
      { titulo: 'Partidas', comandos: [
        cmd('nueva-partida', 'Nueva', <Add24Regular />, () => abrirDialogo({ tipo: 'nueva-partida' }), { ayuda: 'Partida con precio directo en el módulo actual' }),
        cmd('ir-base', 'De la base', <Table24Regular />, () => irAPestana('base'), { ayuda: 'Añadir ítems con análisis desde una base de datos' }),
        cmd('duplicar-partida', 'Duplicar', <CopyAdd24Regular />, duplicarSeleccion, { ...sinSel, ayuda: 'Copiar la partida debajo (Ctrl+D)' }),
        cmd('subir-partida', 'Subir', <ArrowUp24Regular />, () => moverSeleccion(-1), { ...sinSel, ayuda: 'Alt+↑' }),
        cmd('bajar-partida', 'Bajar', <ArrowDown24Regular />, () => moverSeleccion(1), { ...sinSel, ayuda: 'Alt+↓' }),
        cmd('mover-partida', 'A otro módulo', <ArrowMove24Regular />, moverDeModulo, { ...sinSel, ayuda: 'Pasar la partida a otro módulo' }),
        cmd('eliminar-partida', 'Eliminar', <Delete24Regular />, borrarSeleccion, { ...sinSel, ayuda: 'Supr' }),
      ] },
      { titulo: 'Partida seleccionada', comandos: [
        cmd('ver-analisis', 'Análisis', <DataBarVertical24Regular />, () => abrirDialogo({ tipo: 'apu', pos: sel }), { ...sinSel, ayuda: 'Análisis de precio unitario: insumos, rendimientos, precios (Enter)' }),
        cmd('ver-computo', 'Cómputo', <Ruler24Regular />, () => abrirDialogo({ tipo: 'computo', pos: sel }), { ...sinSel, ayuda: 'Cómputo métrico: la cantidad sale de sus líneas' }),
        cmd('ver-especificacion', 'Especificación', <TextBulletListSquare24Regular />, () => abrirDialogo({ tipo: 'especificacion', pos: sel }), { ...sinSel, ayuda: 'Especificación técnica de la partida' }),
        cmd('guardar-en-base', 'A la base', <SaveCopy24Regular />, () => abrirDialogo({ tipo: 'guardar-en-base', pos: sel }), { ...sinSel, ayuda: 'Guardar este análisis en una base de datos para reutilizarlo' }),
        cmd('buscar-partida', 'Buscar', <Search24Regular />, () => abrirDialogo({ tipo: 'buscar' }), { ayuda: 'Buscar partida en todo el proyecto (Ctrl+F)' }),
      ] },
      { titulo: 'IA', comandos: [cmd('actualizar-precios', 'Actualizar precios', <ArrowImport24Regular />, () => setPegar(true), { ayuda: 'Copie la lista de insumos, pásela a una IA con el documento de costos y pegue su respuesta' }), cmd('importar-ia-inicio', 'Importar de IA', <ClipboardPaste24Regular />, () => setPegar(true))] },
      { titulo: 'Asistente', comandos: [cmd('asistente', 'Asistente', <Sparkle24Regular />, alternarAsistente, { ayuda: 'Escriba órdenes o pegue lo que le preparó una IA' })] },
    ],
    base: [
      { titulo: 'Bases de datos', comandos: [cmd('nueva-base', 'Nueva base', <Add24Regular />, crearBaseVacia, { ayuda: 'Crear una base de datos vacía' }), cmd('bases-prescom2', 'Importar de PRESCOM', <ArrowImport24Regular />, () => void importarBasesPrescom()), cmd('abrir-base', 'Abrir .civbd', <FolderOpen24Regular />, () => void abrirBase()),
        cmd('exportar-base', 'Guardar base', <ArrowExport24Regular />, () => baseActiva && exportarBase(baseActiva), { deshabilitado: !baseActiva }),
        cmd('quitar-base', 'Quitar base', <Delete24Regular />, () => { if (baseActiva && window.confirm(`¿Quitar la base «${baseActiva.nombre}» de Civix? (Guárdela antes si la necesita: no se puede deshacer)`)) { quitarBase(baseActiva.nombre); avisar(`Base "${baseActiva.nombre}" quitada de la lista`); } }, { deshabilitado: !baseActiva, ayuda: 'Quita de Civix la base elegida (no borra archivos guardados)' })] },
      { titulo: 'IA', comandos: [cmd('pegar-ia', 'Importar de IA', <ClipboardPaste24Regular />, () => setPegar(true), { ayuda: 'Datos, proyecto o lista de precios preparados por una IA' }), cmd('asistente2', 'Asistente', <Sparkle24Regular />, alternarAsistente)] },
    ],
    reportes: [
      { titulo: 'Formularios SABS', comandos: REPORTES.slice(0, 5).map((r) => cmd(`rep-${r.id}`, r.id, <DocumentPdf24Regular />, () => elegirReporte(r.id), { ayuda: r.titulo })) },
      { titulo: 'Resúmenes', comandos: REPORTES.slice(5).map((r) => cmd(`rep-${r.id}`, r.corto ?? r.id, <Calculator24Regular />, () => elegirReporte(r.id), { ayuda: r.titulo })) },
      { titulo: 'Salida', comandos: [cmd('pdf', 'Guardar PDF', <DocumentPdf24Regular />, () => void guardarReportePdf(), { ayuda: 'Guardar el reporte como PDF' }), cmd('imprimir', 'Imprimir', <Print24Regular />, imprimirReporte), cmd('html', 'HTML', <Copy24Regular />, descargarReporteHtml), cmd('excel2', 'Excel', <DocumentTable24Regular />, () => void exportarExcel())] },
    ],
    cronograma: [{ titulo: 'Cronograma', comandos: [cmd('ver-a8', 'Formulario A-8', <DocumentPdf24Regular />, () => { elegirReporte('A-8'); irAPestana('reportes'); }, { ayuda: 'Ver e imprimir el cronograma de ejecución (A-8)' }), cmd('asistente4', 'Asistente', <Sparkle24Regular />, alternarAsistente)] }],
    config: [{ titulo: 'Proyecto', comandos: [cmd('asistente3', 'Asistente', <Sparkle24Regular />, alternarAsistente)] }],
  };

  return (
    <div className="app">
      <header className="titulo"><span className="logo">Civix</span><span className="version" data-testid="version">v{VERSION}</span><span className="proyecto" data-testid="titulo-proyecto">{e.proyecto.nombre}</span></header>
      <Ribbon pestanas={PESTANAS} activa={e.pestana} alElegir={irAPestana} grupos={grupos[e.pestana] ?? []} />
      <main className="contenido">
        <div className="principal">
          <Protector zona={e.pestana}>
            {e.pestana === 'archivo' || e.pestana === 'inicio' ? <Presupuesto /> : e.pestana === 'base' ? <BaseDatosPantalla /> : e.pestana === 'cronograma' ? <CronogramaPantalla /> : e.pestana === 'reportes' ? <ReportesPantalla /> : <ConfiguracionPantalla />}
          </Protector>
        </div>
        {e.asistente && <Asistente alCerrar={alternarAsistente} />}
      </main>
      <footer className="estado"><span data-testid="aviso" key={e.aviso} className={e.aviso ? 'aviso-flash' : ''}>{e.aviso || 'Listo'}</span><span>Total: <b>{e.proyecto.moneda === 1 ? '$US' : 'Bs'} {num(total)}</b></span></footer>
      {(pegar || e.importarTexto !== null) && <ImportarIA textoInicial={e.importarTexto ?? ''} alCerrar={() => { setPegar(false); solicitarImportacion(null); }} />}
      {nuevoAbierto && <NuevoProyecto alCerrar={() => setNuevoAbierto(false)} />}
      <Protector zona={JSON.stringify(e.dialogo)}><Dialogos /></Protector>
    </div>
  );
}
