# PRESCOM 2013 → nueva app de escritorio: análisis y plan

Este documento recoge lo que se averiguó al analizar `PRESCOM_2013.rar` y cómo se construirá la nueva aplicación.
Sirve de referencia para la implementación. El análisis se hizo sobre una copia extraída del RAR. El RAR **no** está en el repositorio porque contiene ejecutables comerciales de terceros.

---

## 1. Qué es PRESCOM 2013

- Software boliviano de **análisis de precios unitarios (APU), presupuestos de obra, cómputos métricos y cronogramas**, de ROMSOFT (Arq. Ronald A. Romero M., Oruro). Versión 2013-19.
- Escrito en **Visual Basic 6** (MSVBVM60, MSFLXGRD, RMChart, Codejock, TABCTL32…). Es de 32 bits y, según su propio manual, necesita desactivar UAC y usar modo de compatibilidad para funcionar en Windows 8/10.
- Tiene dos programas:
  - **PRESCOM** (`PRESCOM_13.exe`): bases de datos de precios, APU, presupuestos, cómputos, cronograma y reportes.
  - **SECON** (`secon_13.exe`): control y seguimiento de la obra en ejecución (avance físico, planillas, almacén, kardex, pagos y flujo de fondos).
- También trae `conversor.exe`, que migra formatos de 2008 a 2011.

### Contenido del RAR

| Ruta | Contenido |
|---|---|
| `datos/`, `3. BASE DE DATOS/` | 19 bases de datos de precios (`.DAT .nbd .OBS .GRP .CFG` y carpeta `_et` con especificaciones técnicas en RTF) |
| `proyectos/*.DDP` | 3 proyectos de ejemplo (ZIP) |
| `cfg/` | Configuración: plantillas de cálculo `.cft`, monedas, unidades, membrete, logo, tabla de fierros, textos de los formularios B-1 a B-4 y gastos generales |
| `nove_2013.pdf` | Manual de novedades (23 págs.), la mejor fuente funcional |
| `curso_prescom.pps` | Curso multimedia (30 diapositivas) con capturas de la interfaz |
| `sabs.pdf` | Guía para imprimir los formularios B-1, B-2, B-3, B-4 y A-8 según las normas del SABS |
| `Tabla_de_unidades_fisicas.pdf`, `version.rtf` | Unidades y su historial de versiones |

### Bases de datos incluidas (total: 8.079 ítems y 10.690 insumos)

| Base de datos | Ítems | Materiales | M. obra | Equipo | Esp. téc. |
|---|---:|---:|---:|---:|---:|
| BASE DE DATOS 2021 SEP G.A.M.S. | 852 | 1098 | 51 | 88 | 14 |
| BD GAMS 2017 | 780 | 953 | 46 | 82 | – |
| BD INST. ELECTRICA | 106 | 142 | 8 | 0 | – |
| BD SC 2019 | 599 | 893 | 41 | 26 | – |
| BD UPRE | 149 | 238 | 15 | 11 | 149 |
| BDA 2020.1 seller | 263 | 151 | 30 | 11 | – |
| Ex Fondo de Inversión Social | 1152 | 721 | 18 | 15 | – |
| Instalaciones de gas natural | 11 | 32 | 5 | 0 | – |
| Instalaciones eléctricas | 177 | 216 | 13 | 8 | – |
| Itemes revista | 44 | 96 | 15 | 0 | – |
| Obras Civiles (básico) | 322 | 249 | 11 | 8 | 139 |
| Obras civiles (Chuquisaca) | 1380 | 1344 | 53 | 48 | – |
| Obras civiles (Cochabamba) | 111 | 136 | 12 | 9 | – |
| Obras civiles (La Paz) | 463 | 1803 | 17 | 15 | – |
| Obras civiles (Oruro) | 508 | 384 | 25 | 5 | – |
| Obras civiles (Sta. Cruz) | 675 | 787 | 37 | 20 | – |
| Obras viales | 68 | 53 | 19 | 27 | – |
| RMF 2020 | 380 | 481 | 26 | 12 | – |
| Riegos | 39 | 73 | 10 | 3 | – |

---

## 2. Formatos de archivo descifrados (para importar los datos existentes)

Todos los textos están en **cp1252**, con relleno de espacios a la derecha y en little-endian. Las fechas son `double` en formato OLE de VB (días desde 1899-12-30).

### 2.1 Base de datos de precios

**`<nombre>.nbd`: catálogo de insumos e ítems.** Registros de **92 bytes**, sin cabecera.

| Offset | Tipo | Campo |
|---|---|---|
| 0 | int16 | Grupo (índice en `.GRP`, 0 = sin grupo) |
| 2 | char | Tipo: `M` material, `O` mano de obra (obrero), `E` equipo, `I` ítem/actividad |
| 3 | char[70] | Descripción |
| 73 | int16 | Indicador (0/1). En ítems parece marcar opciones del ítem; falta confirmarlo |
| 75 | char[5] | Unidad |
| 80 | double | Fecha de cotización |
| 88 | int32 | **Id** = posición (base 1) de su primera casilla en `.DAT` |

**`<nombre>.DAT`: arreglo plano de casillas de 8 bytes** `(int32 id, float32 valor)`.

- Un **insumo** ocupa 1 casilla con `(id, precio unitario)`.
- Un **ítem** ocupa **60 casillas**: 30 de materiales, 10 de mano de obra y 20 de equipo. Cada casilla es `(id_insumo, rendimiento)` y `id = 0` significa que está vacía.
- El offset de un registro es `(id − 1) × 8`. Ejemplo (Riegos): los insumos tienen los ids 1–86, el primer ítem el 87, el siguiente el 147 (87+60) y así sucesivamente.

**`<nombre>.OBS`:** registros de **258 bytes** con `int16 id` + `char[256]` de notas o apuntes del ítem.
**`<nombre>.GRP`:** registros de **31 bytes** con `char tipo` (`I` ítems, `M`/`O`/`E` insumos) + `char[30]` de descripción del grupo (o capítulo).
**`<nombre>.CFG`:** `int16` con el índice de la moneda en `cfg/monedas.cfg` (1 = $US, 2 = Bs…).
**`<nombre>_et/NNNNN.rtf`:** especificación técnica del ítem cuyo id es NNNNN.

### 2.2 Plantilla de cálculo del precio unitario (`.cft`, `parametros.cfg`, `<proyecto>.CFG`)

Son 17 registros de **73 bytes**, uno por cada parámetro de la **A** a la **Q** (1.241 bytes en total).

| Offset | Tipo | Campo |
|---|---|---|
| 0 | char[50] | Descripción |
| 50 | float32 | Porcentaje (−1 = sin porcentaje) |
| 54 | char[15] | Fórmula: `*` = suma del rubro, o letras con `+`/`-` (p. ej. `E+F+O`, `N-A`). Si hay porcentaje, se aplica a la fórmula |
| 69 | int16 | Orden de impresión en el APU |
| 71 | int16 | −1 = resaltar/imprimir en negrita (total) |

**Plantilla "Normas básicas del SABS"** (la que usan los 3 proyectos de ejemplo):

| | Parámetro | % | Fórmula |
|---|---|---:|---|
| A | Materiales | | Σ materiales |
| B | Mano de obra | | Σ mano de obra |
| C | Equipo, maquinaria y herramientas | | Σ equipo |
| D | Total materiales | | A |
| E | Subtotal mano de obra | | B |
| F | Cargas sociales | 55 | E |
| G | Total mano de obra | | E+F+O |
| H | Herramientas | 5 | G |
| I | Total equipo, maquinaria y herramientas | | C+H |
| J | Sub total | | D+G+I |
| L | Gastos generales y administrativos | 10 | J |
| M | Utilidad | 10 | J+L |
| N | Parcial | | J+L+M |
| O | Impuestos IVA | 14,94 | E+F |
| P | Impuestos IT | 3,09 | N |
| Q | **Total precio unitario** | | N+P |

Hay otras plantillas: "Formato completo más IVA", "Formato completo SIN IVA", "Formato muy básico", "Formato Prescom 2000" y "Formato MEJORAMIENTO DE BARRIOS". Las fórmulas dependen unas de otras (G usa O), así que el cálculo debe resolverlas en orden topológico.

### 2.3 Proyecto (`.DDP` = archivo **ZIP**)

| Archivo interno | Contenido |
|---|---|
| `.IND` / `.DAT` / `.GRP` | Copia propia de insumos, ítems y grupos usados en el proyecto (mismo formato que una base de datos) |
| `.CFG` | Plantilla de cálculo del proyecto (73 × 17) |
| `.MOD` | Módulos: registros de 50 caracteres (p. ej. OBRA GRUESA, OBRA FINA, INSTALACIONES, «Orden de cambio 01») |
| `.PRE` | Partidas del presupuesto: registros de **454 bytes** con módulo, n.º, descripción, grupo, unidad, id del ítem, precio unitario, código de licitante, cantidad, parciales por rubro, cuadrilla, apuntes (256 caracteres), fechas de inicio y fin y predecesor. **Falta descifrar por completo**: se hará comparándolo con los totales ya calculados |
| `.TIE` | Fechas de inicio y fin de cada módulo (cronograma) |
| `.STT` | Datos generales: nombre, lugar, cliente, responsable… |
| `.IMP` | Títulos y encabezados de los reportes |
| `.ADI`, `.CEQ`, `.CMM` | Datos adicionales, costos de equipo y cómputos métricos |
| `NNNNN.RTF`, `logo.jpg` | Especificaciones técnicas y logotipo del proyecto |

Los `.PRE` guardan el precio unitario que calculó PRESCOM. Eso permite **verificar que el nuevo motor de cálculo da exactamente los mismos números** que el original.

### 2.4 Configuración (`cfg/`)

- `monedas.cfg`: 17 monedas (registros con símbolo, nombre y tipo de cambio).
- `undMAT.txt`, `undOBR.txt`, `undEQU.txt`, `undact.txt`: unidades permitidas por rubro.
- `fierros.txt`: tabla de fierros de construcción (diámetro en mm y pulgadas, peso en kg/m) para la calculadora de acero.
- `gg.txt`: desglose sugerido de gastos generales (compra de pliegos, boletas, oficina central, etc.).
- `form_1..4.txt` y `form_N_nota.txt`: títulos, columnas y notas de declaración jurada de los formularios **B-1 a B-4**.
- `membrete.cfg`, `logo.jpg`, `sello.jpg`: membrete, logotipo y sello de los reportes.

---

## 3. Inventario de funciones del original (que hay que replicar)

### Bases de datos de precios
- Crear, duplicar, renombrar, eliminar, copiar desde otra carpeta, empaquetar e instalar (`.ZBD`) y registrar varias carpetas.
- Insumos (materiales, mano de obra y equipo) con descripción, unidad, precio, fecha de cotización y grupo. Se pueden filtrar por grupo, texto o fecha de cotización, eliminar los repetidos y recuperar los borrados.
- Insumos **no productivos** (donaciones, aporte a fondo perdido…), que aparecen en el ítem pero no afectan al costo.
- Ítems o actividades: hasta 30 materiales, 10 de mano de obra y 20 equipos con sus rendimientos; descripción de 70 caracteres; unidad; grupo o capítulo; apuntes; especificaciones técnicas (editor RTF o Word).
- Copiar y pegar ítems desde y hacia Excel por el portapapeles (uno o varios). Crear un insumo desde el ítem.
- **Costo horario del equipo** (formulario B-4): valor comercial, vida útil, factor de rescate, tasa de interés, prima del seguro, coeficiente de mantenimiento, combustible, lubricante, llantas, piezas especiales y operador.
- Ajustar precios: por porcentaje, por tipo de cambio, intercambiándolos con otra base de datos, uniformándolos con un ítem idéntico o con la herramienta **igualar precio unitario** (cálculo inverso, opcionalmente solo con los rendimientos de mano de obra y equipo).
- Reemplazar un insumo en todos los ítems, cambiar unidades de forma global y cambiar la moneda.
- Gestionar grupos (F4): crear, asignar, reemplazar, añadir o quitar todos.

### Proyectos y presupuestos
- Asistente de nuevo proyecto. Datos generales: nombre (70 caracteres), lugar, cliente, fecha, moneda, tipo de cambio, responsables (elaborado, revisado y aprobado por) y memo.
- **Módulos**: añadir, renombrar, mover y eliminar; integrar dos módulos o todos en uno; generar módulos a partir de grupos; copiar el cronograma entre módulos.
- Planilla del presupuesto: añadir ítems de la base de datos activa, cantidades, cómputo métrico por celda (doble clic), mover, copiar, cortar y pegar, reemplazar, uniformar el detalle, globalizar, códigos de licitante, apuntes, especificaciones técnicas y numeración correlativa.
- **Cómputos métricos** por ítem (partes × veces × largo/área/volumen, formas especiales). Importación desde texto o CSV y desde **Revit**; exportación a Excel.
- Plantilla de cálculo del proyecto (F9): 17 parámetros editables, plantillas predefinidas (SABS, etc.) y asistente de gastos generales.
- Decimales configurables (0 a 4) para datos y cálculos; multimoneda (17 monedas) con equivalencia en $US.
- Recalcular el proyecto, sincronizar el proyecto con la base de datos (en ambos sentidos), copia de respaldo y proyectos recientes.
- Calculadoras: peso del fierro (H°A°) y superficie de madera (pie²).

### Cronograma
- Gantt por módulo y general: cuadrilla, horas por día, días laborables, rendimiento promedio o máximo, predecesores, fecha de inicio, **ruta crítica** y calendario real.
- Flujo de personal, flujo de inversiones y plan de desembolsos, requerimiento de insumos por fechas y cronograma de movilización de equipo.
- Exportación a **MS Project** e impresión del Gantt (formulario **A-8**).

### Reportes (vista previa, configuración, impresión, Excel, portapapeles, TXT/CSV e impresión por lotes)
1. Presupuesto general (**Formulario B-1**, con el monto en literal: «Son: … 00/100 Bolivianos»).
2. Presupuesto por módulo y presupuesto globalizado (resumen por módulos).
3. Análisis de precios unitarios (**Formulario B-2**): un ítem, el módulo o todo el proyecto.
4. Desglose general de insumos (materiales, mano de obra y equipo) → precios unitarios elementales (**Formulario B-3**).
5. Costo horario de equipo y maquinaria (**Formulario B-4**).
6. Desglose de insumos por ítem y requerimiento de materiales por ítem.
7. Resumen general, por rubros, por incidencia (con los parciales A–Q que se elijan y suma horizontal) y por grupo; presupuesto por grupos.
8. Cómputos métricos, especificaciones técnicas y lista de ítems e insumos de la base de datos.
9. Cronograma Gantt (**A-8**), ruta crítica, flujo de personal, flujo de inversiones y plan de desembolsos.
10. Gráficos: costos por grupos, costos de insumos por grupos y resultados.
- Configuración de los reportes: logotipo, membrete, marca de agua, márgenes, tipos de letra, líneas, pie de página con firmas, numeración, montos en literal, exclusión de precios o de la columna en $US, y formato ISO o de Normas Básicas.

### SECON: control y seguimiento de obra
- Avance físico: planillas de avance, certificados de avance, resumen por ítem, por tiempo y por volumen, cronograma ejecutado frente al previsto y actividades desfasadas.
- Contratos modificatorios, anticipos y multas, y planillas cobradas.
- Almacén central: inventario, kardex, pedidos y despachos, devoluciones y transferencias entre obras, y requerimientos frente a existencias.
- Adquisiciones y proveedores (cuentas, amortizaciones y recibos).
- Subcontratos de mano de obra: contratistas, planillas de pago y descuentos.
- Inversiones y egresos directos, flujo de fondos, balance económico general y por módulos.
- Movilización de equipo y herramientas entre obras.

---

## 4. Normativa boliviana que se debe cumplir

- **DS 0181, Normas Básicas del SABS** y el **Documento Base de Contratación (DBC) de obras** del SICOES: formularios B-1 (presupuesto por ítems), B-2 (APU), B-3 (precios unitarios elementales, que deben ser idénticos a los del B-2), B-4 (equipo) y A-8 (cronograma). Durante la implementación hay que contrastar los formularios con el **modelo de DBC vigente** publicado por el MEFP/SICOES, porque el original es de 2013.
- Tributos: **IVA 13 %**, que se aplica como 14,94 % (13/87) sobre mano de obra más cargas sociales, e **IT 3 %**, que se aplica como 3,09 % (3/97) sobre el parcial. Las cargas sociales son configurables (55 % por defecto; según el régimen pueden variar).
- Moneda: Bs con equivalencia en $US (tipo de cambio configurable, 6,96 por defecto). Monto total en literal en español.
- Sistema métrico (tabla de unidades físicas), fechas DD/MM/AAAA y separadores numéricos bolivianos.

---

## 5. Arquitectura de la nueva app

**Tecnología propuesta:** Electron + React + TypeScript, con **Fluent UI v9 de Microsoft** (la librería de diseño de Office y Windows 11) y **SQLite**.

Se elige por estos motivos:
- Se puede ofrecer una cinta de opciones (*ribbon*) al estilo de Word y Excel y el aspecto de Windows 11 con componentes oficiales.
- Los reportes se maquetan en HTML y se imprimen o exportan a PDF con el motor de Chromium, con control milimétrico. Además se exportan a Excel (ExcelJS) y Word (docx).
- Toda la lógica y la interfaz se pueden **probar de forma automática** (Vitest y Playwright) antes de entregar.
- El instalador `.exe` para Windows 11 (NSIS, 64 bits) se genera en GitHub Actions y la app funciona **sin internet**.

```
app/
├── electron/            # Proceso principal: ventanas, archivos, SQLite, impresión, IA local
├── src/
│   ├── nucleo/          # Motor de cálculo puro (APU, fórmulas A–Q, presupuesto, Gantt, ruta crítica, literales)
│   ├── datos/           # Esquema SQLite, repositorios, importadores (PRESCOM .DAT/.nbd/.DDP, Excel, CSV, JSON)
│   ├── ia/              # Intérprete de órdenes, catálogo de acciones, conectores LLM
│   ├── reportes/        # Plantillas de los formularios B-1..B-4, A-8 y el resto de reportes
│   ├── ui/              # Cinta de opciones, backstage "Archivo", planillas, editores, panel de IA
│   └── secon/           # Control y seguimiento
└── pruebas/             # Unitarias, de regresión contra PRESCOM y E2E
```

**Datos:**
- Cada proyecto se guarda en un único archivo `.pcp` (SQLite) que incluye sus propios insumos, ítems, plantilla de cálculo, módulos, cómputos, cronograma y especificaciones. Igual que el original, el proyecto queda autocontenido.
- Las bases de datos de precios se guardan como archivos `.pcbd` (SQLite) en una carpeta configurable.
- **Importador nativo** de los formatos de PRESCOM (sección 2): las 19 bases de datos y los proyectos `.DDP` se importan con un clic.

**Interfaz:** cinta con las pestañas *Archivo* (backstage: nuevo, abrir, recientes, guardar, exportar, imprimir), *Inicio*, *Presupuesto*, *Base de datos*, *Insumos*, *Cronograma*, *Reportes*, *Seguimiento (SECON)*, *Herramientas* y *Configuración*. Además:
- Panel lateral del **Asistente IA**, al estilo de Copilot en Office.
- Planillas tipo Excel: edición en celda, copiar y pegar con Excel, deshacer y rehacer, y atajos (F9, F4, INS, Ctrl+…).
- Temas claro y oscuro.

## 6. Inteligencia artificial

1. **Datos preparados con una IA externa.** La app genera para cada tipo de dato (insumos, ítems con APU, cómputos, proyecto completo o avance de obra) una **plantilla Excel/CSV** y un **esquema JSON documentado**, además de un *prompt* listo para pegar en ChatGPT o Claude. Lo que devuelva la IA se importa con **validación y vista previa**: detecta columnas por su nombre, corrige unidades y decimales con coma, avisa de duplicados e insumos inexistentes y no guarda nada sin confirmación.
2. **Órdenes en lenguaje natural dentro de la app**, por ejemplo: «sube 5 % el cemento», «añade 120 m² de revoque interior al módulo obra fina», «cambia las cargas sociales a 71,18 %» o «genera el B-1 y el B-2 en PDF». El texto se traduce a **acciones tipadas** de un catálogo. Antes de ejecutarlas se muestra lo que se va a hacer y todo se puede deshacer.
   - **Sin internet:** un modelo local (llama.cpp con un modelo pequeño en español, de unos 2–5 GB, descarga opcional), más un intérprete de reglas para las órdenes frecuentes, que funciona incluso sin el modelo.
   - **Con internet (opcional):** la API de Claude con la clave del usuario, para órdenes complejas o para leer documentos (por ejemplo, un PDF de especificaciones).

## 7. Cómo se verificará antes de entregar

- **Pruebas de regresión contra PRESCOM:** se recalculan los 3 proyectos de ejemplo y todos los ítems de las 19 bases de datos con el nuevo motor, y se comparan con los precios unitarios y totales que guardó el original en `.PRE` (tolerancia: redondeo a 2 decimales).
- Pruebas unitarias de cada fórmula, del literal, del Gantt y la ruta crítica, de los importadores y de cada acción de la IA.
- Pruebas E2E con Playwright de cada función de la cinta y de cada reporte: se generan los PDF y Excel y se revisan visualmente frente a las capturas y formularios del original.
- Compilación del instalador en GitHub Actions (Windows) con una prueba de arranque.

## 8. Fases

| Fase | Entrega |
|---|---|
| 0 | Estructura del proyecto, CI e instalador vacío para Windows 11 |
| 1 | Motor de cálculo + importador PRESCOM + regresión contra los proyectos de ejemplo |
| 2 | Bases de datos: insumos, ítems, grupos, equipo (B-4), ajustes de precios, especificaciones |
| 3 | Proyectos: módulos, planilla, cómputos métricos, plantilla de cálculo, multimoneda |
| 4 | Reportes B-1..B-4 y el resto, con exportaciones e impresión por lotes |
| 5 | Cronograma: Gantt, ruta crítica, flujos, A-8 y MS Project |
| 6 | Asistente IA (plantillas para IA externa, órdenes, modelo local y Claude opcional) |
| 7 | SECON: seguimiento, almacén, planillas y flujo de fondos |
| 8 | Prueba integral, instalador final y manual de usuario |

---

## 9. Decisiones posteriores (acordadas con el usuario)

- La app se llama **Civix** y vive en su propio repositorio (por ahora en la carpeta `civix/` de este).
- **Sin SECON.** Sin modelo de IA local: las órdenes y los datos los redacta cualquier IA y Civix los valida y ejecuta sin conexión.
- Tope de gasto de unos 50 USD: se prioriza motor, bases, presupuesto, formularios B-1…B-4, IA e instalador. Quedan para después Gantt/A-8, gráficos y lotes.
- Almacenamiento: JSON (`.civix`, `.civbd`) en lugar de SQLite, para evitar módulos nativos, facilitar la preparación de datos con IA y simplificar las pruebas.

## 10. Hallazgos de la importación (formatos confirmados)

- Partida del `.PRE`: registros de **460 bytes**. Módulo en `+2`, descripción `+4` (70), grupo `+74`, unidad `+76` (5), id de ítem `+81`, cantidad `+85` (double), y desde `+108` doubles con el precio unitario total, A (materiales), B (mano de obra) y C (equipo).
- Los bloques de ítems de un proyecto empiezan tras la última casilla de insumos y miden 60 casillas.
- PRESCOM usa el precio del insumo **con 3 decimales** antes de multiplicar por el rendimiento (si no, 2 de 154 partidas del proyecto «Edificio» difieren en 0,02).
- No redondea los parámetros intermedios: redondear A…Q empeora la coincidencia.
- La base «Obras civiles (Chuquisaca)» tiene 1.895 referencias a insumos sin ficha en el catálogo; Civix las importa como «(insumo sin descripción)» con el precio guardado y lo avisa.
- `csubmodulos.DDP` es un archivo temporal sin el detalle de los ítems: solo se conserva el precio.
- Pendiente: las notas `.OBS` están vacías en las bases de ejemplo y su relación con los ítems no está confirmada; las especificaciones técnicas RTF (`_et`) tampoco se importan aún.
