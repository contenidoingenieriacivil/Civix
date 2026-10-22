import { Button, Dropdown, Input, Option } from '@fluentui/react-components';
import { useState } from 'react';
import { PLANTILLAS_PREDEFINIDAS } from '../../nucleo/plantillas';
import { nuevoProyectoConfirmado } from '../acciones';

export function NuevoProyecto({ alCerrar }: { alCerrar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [lugar, setLugar] = useState('');
  const [cliente, setCliente] = useState('');
  const [moneda, setMoneda] = useState(2);
  const [plantilla, setPlantilla] = useState('Normas básicas del SABS');
  const crear = () => {
    void nuevoProyectoConfirmado({ nombre, lugar, cliente, moneda, plantilla: PLANTILLAS_PREDEFINIDAS.find((x) => x.nombre === plantilla) });
    alCerrar();
  };
  return (
    <div className="modal-fondo" onKeyDown={(e) => { if (e.key === 'Escape') alCerrar(); }}><div className="modal" role="dialog" aria-label="Nuevo proyecto" style={{ width: 'min(560px, 94vw)' }}>
      <h3>Nuevo proyecto</h3>
      <div className="rejilla-campos" style={{ gridTemplateColumns: '1fr' }}>
        <label className="campo">Nombre del proyecto<Input value={nombre} onChange={(_, d) => setNombre(d.value)} data-testid="nuevo-nombre" autoFocus onKeyDown={(e) => e.key === 'Enter' && crear()} /></label>
        <label className="campo">Lugar<Input value={lugar} onChange={(_, d) => setLugar(d.value)} data-testid="nuevo-lugar" /></label>
        <label className="campo">Cliente<Input value={cliente} onChange={(_, d) => setCliente(d.value)} data-testid="nuevo-cliente" /></label>
        <label className="campo">Moneda<Dropdown value={moneda === 1 ? 'Dólares americanos' : 'Bolivianos'} selectedOptions={[String(moneda)]} onOptionSelect={(_, d) => setMoneda(Number(d.optionValue))}><Option value="2">Bolivianos</Option><Option value="1">Dólares americanos</Option></Dropdown></label>
        <label className="campo">Plantilla de cálculo<Dropdown value={plantilla} selectedOptions={[plantilla]} onOptionSelect={(_, d) => setPlantilla(d.optionValue ?? plantilla)}>{PLANTILLAS_PREDEFINIDAS.map((x) => <Option key={x.nombre} value={x.nombre}>{x.nombre}</Option>)}</Dropdown></label>
      </div>
      <div className="acciones"><Button appearance="primary" onClick={crear} data-testid="crear-proyecto">Crear proyecto</Button><Button onClick={alCerrar}>Cancelar</Button></div>
    </div></div>
  );
}
