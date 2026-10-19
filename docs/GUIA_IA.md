# Cómo trabajar con una IA y Civix

Civix no necesita internet ni una IA instalada. La IA que usted prefiere (Gemini, ChatGPT, Claude…) **prepara un archivo JSON** a partir de sus documentos; Civix lo **valida, le muestra qué cambiaría y recién entonces lo guarda**. Si hay un error, no guarda nada.

Todo se hace en **Base de datos → Importar de IA** (o **Inicio → Actualizar precios**). La ventana tiene botones para copiar las instrucciones que se le dan a la IA.

## Los tres tipos de archivo

| Quiero… | Le doy a la IA | Ella devuelve | Civix hace |
|---|---|---|---|
| Cargar un catálogo de costos (insumos y análisis) | Mi PDF/planilla de costos + **Instrucciones: datos** | JSON con `insumos` e `items` | Los guarda en la base de datos |
| Armar un proyecto nuevo | Mis cómputos métricos, especificaciones y partidas + **Instrucciones: proyecto** | JSON `"tipo": "proyecto"` | Muestra un resumen y, al confirmar, abre el proyecto calculado |
| Actualizar los precios de un proyecto | El documento de costos nuevo + **la lista de insumos de mi proyecto** + **Instrucciones: actualizar precios** | JSON `"tipo": "precios"` | Muestra una tabla (actual → nuevo, variación) y aplica solo lo que usted marque |

## 1. Actualizar los precios de todo el proyecto (paso a paso)

1. Abra el proyecto. En **Inicio → Actualizar precios** pulse **«Copiar la lista de insumos de mi proyecto»**.
2. En su IA, adjunte el PDF o planilla de costos nuevo, pegue la lista de insumos y pegue las **«Instrucciones: actualizar precios»** (botón de la misma ventana).
3. La IA devuelve un JSON. Cópielo y péguelo en el recuadro de Civix; pulse **Importar**.
4. Civix muestra, insumo por insumo, el precio actual, el nuevo y la variación (en rojo si pasa de 30 %). Desmarque lo que no quiera y pulse **Aplicar**. Puede deshacer con Ctrl+Z.

**Por qué se entrega la lista de insumos de Civix.** Los documentos de costos y los análisis de un proyecto casi nunca usan los mismos nombres ni las mismas unidades (el cemento se vende por bolsa de 50 kg y el análisis lo usa en kg; «Albañil» puede aparecer como «Oficial albañil»). Con la lista delante, la IA devuelve cada precio ya convertido a **la unidad y el nombre de su insumo**, y Civix cruza el 100 %. Sin ella, en una prueba con las listas reales de `costos.md` solo cruzó una parte de los insumos.

Reglas que Civix aplica al cruzar:
- Coincidencia **exacta** (mayúsculas, acentos y artículos no importan): viene marcada.
- Coincidencia **aproximada** (≥ 75 % de palabras iguales y, además, las mismas cifras: 1/2" ≠ 3/4"): viene **sin marcar**, para que usted la confirme.
- Moneda distinta: si la lista dice USD y el proyecto está en Bs, se convierte con el tipo de cambio del proyecto.
- Se actualiza también la fecha de cotización. Los insumos que la lista no trae conservan su precio.

## 2. Armar un proyecto nuevo a partir de sus cómputos y especificaciones

Usted redacta las especificaciones y los cómputos métricos; la IA los ordena en el JSON del proyecto y Civix calcula todo lo demás: precios unitarios (B-2), presupuesto (B-1), precios elementales (B-3), equipos (B-4), cronograma (A-8), resúmenes, cómputos y especificaciones.

Cada partida puede:
- Apuntar a un **ítem de sus bases** (`"item": "R052"` por código, o por descripción exacta): Civix toma su análisis de precios y se actualiza con los precios.
- Traer **precio directo** (`"precioUnitario": 2944.41`), cuando no tiene análisis.
- Traer **cómputo** (`"computo": [{ "descripcion": "…", "veces": 2, "largo": 12.5 }]`; Civix multiplica lo informado y suma las líneas) o `cantidad` directa.
- Traer su **especificación técnica** (`"especificacion": "…"`).

Orden recomendado para un proyecto nuevo: (1) importar su catálogo de costos (datos); (2) importar el proyecto; (3) actualizar precios; (4) revisar B-1…B-4, A-8 y exportar.

## 3. Resultados de la calibración con documentos reales

| Comprobación | Resultado |
|---|---|
| Proyectos de PRESCOM 2013 (236 partidas): precio unitario recalculado | **236 de 236** coinciden (±0,005) |
| Presupuesto de Tolomosa Grande (189 partidas, 21 módulos): parcial de cada partida | **189 de 189** (±0,01) |
| Totales de módulo | **20 de 21** al centavo (±0,06) |
| Total del presupuesto | 4.558.411,45 = 4.555.157,44 del documento **+ 3.254,00** de la partida 184, que el documento imprime pero no suma en su módulo M21 |
| Monto en literal | Idéntico al del documento |
| Catálogo `costos.md` (194 análisis): recálculo con insumos | **todos** los análisis con aritmética coherente (140) coinciden ±0,06 |

Defectos del documento de origen detectados (no de Civix): 54 de los 194 análisis de `costos.md` tienen renglones que no suman su costo total impreso (el propio archivo advierte «alguna cantidad individual puede diferir por legibilidad del escaneo»); en el presupuesto de Tolomosa Grande, 5 filas tienen cantidad × unitario ≠ parcial y hay comas decimales perdidas en 2 filas. Los convertidores de `tools/` los reparan solo cuando se puede comprobar con los totales impresos y dejan el resto en avisos.

## 4. Herramientas de conversión (sin IA)

Para documentos con formato fijo se puede convertir sin IA, desde `tools/`:
```
node tools/convertir-costos.mjs costos.md base.json precios.json
node tools/convertir-presupuesto.mjs presupuesto.md proyecto.json "Nombre del proyecto"
```
Los JSON resultantes se importan igual que los de una IA.
