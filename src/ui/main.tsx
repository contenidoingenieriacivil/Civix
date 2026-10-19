import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './estilos.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode><FluentProvider theme={webLightTheme} style={{ height: '100%' }}><App /></FluentProvider></StrictMode>,
);
