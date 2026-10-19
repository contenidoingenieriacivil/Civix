import { useEffect, useState } from 'react';
import { Calculator24Regular, ClipboardPaste24Regular, Database24Regular, DocumentAdd24Regular, DocumentPdf24Regular, FolderOpen24Regular, ArrowExport24Regular, ArrowImport24Regular,
  ArrowRedo24Regular, ArrowUndo24Regular, Delete24Regular, Print24Regular, Save24Regular, Sparkle24Regular, Table24Regular, Copy24Regular, DocumentTable24Regular } from '@fluentui/react-icons';
import { REPORTES } from '../reportes/indice';
import { abrirBase, abrirProyecto, abrirProyectoPrescom, descargarReporteHtml, guardarReportePdf, exportarBase, exportarExcel, guardarProyecto, imprimirReporte, importarBasesPrescom, nuevo } from './acciones';
import { alternarAsistente, avisar, cambiar, deshacer, elegirPartida, elegirReporte, irAPestana, obtener, ponerBases, rehacer, useEstado, iniciar } from './almacen';
import { Asistente } from './pantallas/Asistente';
import { BaseDatosPantalla } from './pantallas/BaseDatos';
import { ImportarIA } from './pantallas/ImportarIA';
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

export default function App() {
  const e = useEstado((s) => s);
  const [pegar, setPegar] = useState(false);
  useEffect(() => { void iniciar(); }, []);
  useEffect(() => {
    const t = (ev: KeyboardEvent) => {
      if (ev.ctrlKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); deshacer(); }
      if (ev.ctrlKey && ev.key.toLowerCase() === 'y') { ev.preventDefault(); rehacer(); }
      if (ev.ctrlKey && ev.key.toLowerCase() === 's') { ev.preventDefault(); guardarProyecto(); }
    };
    window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t);
  }, []);
  const total = calcularProyecto(e.proyecto).total;
  const baseActiva = e.bases[0];

  const cmd = (id: string, etiqueta: string, icono: React.ReactNode, accion: () => void, extra: { ayuda?: string; deshabilitado?: boolean } = {}) => ({ id, etiqueta, icono, accion, ...extra });
  const grupos: Record<string, Grupo[]> = {
    archivo: [
      { titulo: 'Proyecto', comandos: [cmd('nuevo', 'Nuevo', <DocumentAdd24Regular />, nuevo), cmd('abrir', 'Abrir', <FolderOpen24Regular />, () => void abrirProyecto()), cmd('guardar', 'Guardar', <Save24Regular />, guardarProyecto, { ayuda: 'Guardar (Ctrl+S)' })] },
      { titulo: 'Desde PRESCOM', comandos: [cmd('abrir-prescom', 'Proyecto PRESCOM', <ArrowImport24Regular />, () => void abrirProyectoPrescom(), { ayuda: 'Abrir un proyecto .DDP de PRESCOM 2013' }),
        cmd('bases-prescom', 'Bases PRESCOM', <Database24Regular />, () => void importarBasesPrescom(), { ayuda: 'Elija la carpeta «datos» de PRESCOM' })] },
      { titulo: 'Exportar', comandos: [cmd('excel', 'Excel', <DocumentTable24Regular />, () => void exportarExcel())] },
    ],
    inicio: [
      { titulo: 'Deshacer', comandos: [cmd('deshacer', 'Deshacer', <ArrowUndo24Regular />, deshacer, { deshabilitado: !e.deshacer.length, ayuda: 'Ctrl+Z' }), cmd('rehacer', 'Rehacer', <ArrowRedo24Regular />, rehacer, { deshabilitado: !e.rehacer.length, ayuda: 'Ctrl+Y' })] },
      { titulo: 'Partidas', comandos: [
        cmd('eliminar-partida', 'Eliminar', <Delete24Regular />, () => { const s = obtener().seleccion; if (s >= 0) { cambiar((p) => { p.partidas.splice(s, 1); }, 'Partida eliminada'); elegirPartida(-1); } }, { deshabilitado: e.seleccion < 0 }),
        cmd('ir-base', 'Añadir de la base', <Table24Regular />, () => irAPestana('base')),
      ] },
      { titulo: 'IA', comandos: [cmd('actualizar-precios', 'Actualizar precios', <ArrowImport24Regular />, () => setPegar(true), { ayuda: 'Copie la lista de insumos, pásela a una IA con el documento de costos y pegue su respuesta' }), cmd('importar-ia-inicio', 'Importar de IA', <ClipboardPaste24Regular />, () => setPegar(true))] },
      { titulo: 'Asistente', comandos: [cmd('asistente', 'Asistente', <Sparkle24Regular />, alternarAsistente, { ayuda: 'Escriba órdenes o pegue lo que le preparó una IA' })] },
    ],
    base: [
      { titulo: 'Bases de datos', comandos: [cmd('bases-prescom2', 'Importar de PRESCOM', <ArrowImport24Regular />, () => void importarBasesPrescom()), cmd('abrir-base', 'Abrir .civbd', <FolderOpen24Regular />, () => void abrirBase()),
        cmd('exportar-base', 'Guardar base', <ArrowExport24Regular />, () => baseActiva && exportarBase(baseActiva), { deshabilitado: !baseActiva }),
        cmd('quitar-base', 'Quitar base', <Delete24Regular />, () => { if (baseActiva) { ponerBases(obtener().bases.slice(1)); avisar(`Base "${baseActiva.nombre}" quitada de la lista`); } }, { deshabilitado: !baseActiva, ayuda: 'Quita de la lista la primera base (no borra archivos)' })] },
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
      <header className="titulo"><span className="logo">Civix</span><span className="proyecto" data-testid="titulo-proyecto">{e.proyecto.nombre}</span></header>
      <Ribbon pestanas={PESTANAS} activa={e.pestana} alElegir={irAPestana} grupos={grupos[e.pestana] ?? []} />
      <main className="contenido">
        <div className="principal">
          {e.pestana === 'archivo' || e.pestana === 'inicio' ? <Presupuesto /> : e.pestana === 'base' ? <BaseDatosPantalla /> : e.pestana === 'cronograma' ? <CronogramaPantalla /> : e.pestana === 'reportes' ? <ReportesPantalla /> : <ConfiguracionPantalla />}
        </div>
        {e.asistente && <Asistente alCerrar={alternarAsistente} />}
      </main>
      <footer className="estado"><span data-testid="aviso">{e.aviso || 'Listo'}</span><span>Total: <b>{e.proyecto.moneda === 1 ? '$US' : 'Bs'} {num(total)}</b></span></footer>
      {pegar && <ImportarIA alCerrar={() => setPegar(false)} />}
    </div>
  );
}
