# Civix

Análisis de precios unitarios y presupuestos de obra para Bolivia. App de escritorio para **Windows 11** que funciona **sin internet**. Reemplaza a PRESCOM 2013 con una interfaz tipo Office (cinta de opciones) y con ayuda de IA para cargar datos.

## Qué hace hoy

| Área | Funciones |
|---|---|
| Cálculo | Plantilla de 17 parámetros (A–Q) con fórmulas dependientes y porcentajes editables; plantillas SABS, «completo con/sin IVA»; precio de insumo a 3 decimales y total a 2, igual que PRESCOM |
| Bases de datos | Importa las bases de PRESCOM 2013 (carpeta `datos`: `.nbd/.DAT/.GRP/.CFG`), abre/guarda bases propias `.civbd`, base nueva vacía, renombrar, búsqueda por nombre o código, precio unitario de cada ítem en la lista, doble clic para añadir al presupuesto, eliminar ítems, editar nombre/unidad/precio de insumos, crear insumos, borrar los que no se usan, filtro por rubro y ajuste de precios por % |
| Proyectos | Módulos (añadir, renombrar, mover, eliminar), planilla con descripción, unidad, cantidad y precio directo editables en la misma tabla; partidas nuevas, duplicar, subir/bajar, pasar a otro módulo, eliminar; **análisis de precio unitario** editable (añadir/quitar insumos, crear insumos, rendimientos y precios, pasar a precio directo o armar el análisis); **cómputo métrico** por líneas (veces × largo × ancho × alto o cantidad directa); **especificación técnica**; guardar un análisis en una base para reutilizarlo; búsqueda de partidas en todo el proyecto; deshacer/rehacer, guardado automático y archivos `.civix`; abre proyectos `.DDP` de PRESCOM |
| Cronograma | Diagrama de Gantt por módulo con cuadrilla y predecesora editables, plazo = cantidad × rendimiento de mano de obra ÷ (horas/día × cuadrilla), calendario lunes–sábado configurable y **ruta crítica**; formulario **A-8** (horizontal, con barras y ruta crítica en rojo) |
| Reportes (Bolivia, SABS) | **A-8** cronograma, **B-1** presupuesto con precio en literal y monto total en literal, **B-2** análisis de precios unitarios (una hoja por ítem), **B-3** precios elementales, **B-4** costo horario de equipos, resumen general (módulos, rubros, grupos) y desglose de insumos. Salida a PDF, impresión, HTML y Excel (.xlsx con fórmulas) |
| Cómputos y especificaciones | Se editan en la app o se cargan con el proyecto (JSON de una IA); reportes «Cómputos métricos» y «Especificaciones técnicas» (marca las que faltan por redactar) |
| Configuración | Datos del proyecto, fecha de inicio, moneda con conversión opcional de precios por tipo de cambio, notas; plantilla con porcentajes y fórmulas (solo acepta fórmulas válidas y sin referencias circulares) |
| Robustez | Todos los campos validan lo escrito (texto en un número, negativos, vacíos, valores enormes): se rechaza y se avisa en la barra inferior sin perder datos; si una pantalla fallara, se puede deshacer el último cambio desde el aviso |
| IA sin conexión | *Datos, proyecto y precios*: la IA (Gemini, ChatGPT, Claude…) redacta un JSON; Civix lo valida (todo o nada), muestra qué cambiaría y recién entonces lo guarda. **Actualizar precios**: Civix exporta la lista de insumos del proyecto, la IA devuelve los precios nuevos de un PDF con esos nombres y unidades, y se aplican los que usted confirme. *Órdenes*: frases como «sube 5% el cemento» o JSON de órdenes, con **vista previa** y deshacer |

### Cómo trabajar con una IA
1. En el panel **Asistente**, pulse «Copiar instrucciones de datos» y péguelas en su IA junto con las cotizaciones o planillas.
2. Copie el JSON que devuelva y use **Base de datos → Pegar datos de IA**. Si hay errores, Civix los explica y no guarda nada.
3. Para operar sobre el proyecto, escriba en el Asistente o pegue las órdenes que redactó la IA («Copiar instrucciones de órdenes»); pulse **Ver qué haría** y luego **Aplicar**.

### Atajos de teclado (pestaña Inicio)
| Tecla | Acción |
|---|---|
| Ctrl+Z / Ctrl+Y | Deshacer / rehacer (dentro de un campo, deshace el texto) |
| Ctrl+S | Guardar el proyecto |
| Ctrl+F | Buscar una partida en todo el proyecto |
| Supr | Eliminar la partida seleccionada |
| Ctrl+D | Duplicar la partida seleccionada |
| Alt+↑ / Alt+↓ | Subir / bajar la partida |
| Enter, F2 o doble clic | Abrir el análisis de precio unitario |
| Enter / Esc en un campo | Confirmar / cancelar lo escrito |

## Trabajar con IA
Guía completa (formatos, orden, actualización de precios y calibración): [`docs/GUIA_IA.md`](docs/GUIA_IA.md).

## Lo que todavía no está
- Flujos de personal y de fondos, plan de desembolsos y feriados en el calendario.
- Gráficos, impresión por lotes y exportación a MS Project.
- Los textos RTF de especificaciones de PRESCOM (`_et`) no se leen aún.
- El cronograma reproduce ~78 % de las fechas del proyecto de ejemplo de PRESCOM (el original guarda rendimientos y fechas editados a mano; la regla de redondeo exacta de PRESCOM no pudo confirmarse).
- SECON (seguimiento de obra): descartado por decisión del usuario.
- El costo horario del B-4 usa el método habitual de depreciación + intereses + mantenimiento; no pudo contrastarse con PRESCOM porque los proyectos de ejemplo no traen equipos.

## Desarrollo
```
npm install
npm test             # pruebas unitarias
npm run e2e          # pruebas de interfaz en Chromium (compila antes)
npm run dev          # interfaz en el navegador
npm run electron     # app de escritorio
npm run dist         # instalador de Windows (release/Civix-Instalador-*.exe)
```
La regresión contra PRESCOM se activa con la carpeta extraída del original (no se versiona, es material de terceros):
```
CIVIX_PRESCOM_DIR=/ruta/a/PRESCOM_2013 npm test
CIVIX_PRESCOM_DIR=/ruta/a/PRESCOM_2013 npm run e2e
```
Recalcula cada partida de los proyectos de ejemplo y exige coincidir con el precio unitario que guardó PRESCOM (tolerancia 0,005).

En Windows, `.github/workflows/compilar.yml` ejecuta todo, empaqueta con electron-builder, prueba que el `.exe` arranque y publica el instalador en *Releases*.

## Estructura
```
electron/        contenedor de escritorio (protocolo local, guardado de PDF); sin red
src/nucleo/      cálculo (APU, plantillas, presupuesto, literal, equipos, operaciones)
src/datos/       modelo e importadores de PRESCOM
src/reportes/    formularios B-1…B-4, resúmenes y Excel
src/ia/          formato de intercambio JSON y lenguaje de órdenes
src/ui/          cinta de opciones, planilla, bases, reportes, configuración, asistente
pruebas/         unitarias, regresión contra PRESCOM y e2e
```
