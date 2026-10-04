---
name: Bolsillo
description: Una app de finanzas personales cálida que habla como una persona; un solo color saturado, mora, marca todo lo que se puede tocar.
colors:
  mora: "#b0124f"
  mora-ink: "#ffffff"
  mora-soft: "#fbe3ec"
  maize-ground: "#fbf1df"
  surface: "#ffffff"
  surface-2: "#f6e8d2"
  line: "#ead9c0"
  ink: "#2a1e14"
  ink-2: "#6b5545"
  tint: "#fde5b4"
  bar: "#c99a5b"
  pos: "#1c6b3e"
  pos-soft: "#dff2e5"
  warn: "#b0500a"
  warn-soft: "#fdebcf"
  bad: "#a1261c"
  bad-soft: "#fbe0dc"
  dark-mora: "#ff7aa8"
  dark-mora-ink: "#2a0a16"
  dark-mora-soft: "#3d2029"
  cacao-ground: "#19130e"
  dark-surface: "#271e17"
  dark-surface-2: "#34291f"
  dark-line: "#42352a"
  dark-ink: "#f7eee4"
  dark-ink-2: "#cdbba8"
  dark-tint: "#3b2b17"
  dark-bar: "#b9a07a"
  dark-pos: "#86d9a6"
  dark-pos-soft: "#1f3327"
  dark-warn: "#ff9f4a"
  dark-warn-soft: "#3b2b15"
  dark-bad: "#ff9a8f"
  dark-bad-soft: "#3f1e1a"
typography:
  display:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 800
    lineHeight: 1.25
  title:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 700
    lineHeight: 1.5
  caption:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 700
    lineHeight: 1.5
rounded:
  field: "14px"
  card: "22px"
  pill: "999px"
  nav-item: "16px"
spacing:
  xs: "0.35rem"
  sm: "0.5rem"
  md: "0.9rem"
  lg: "1.25rem"
  xl: "1.5rem"
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
  card-tint:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
  button-filled:
    backgroundColor: "{colors.mora}"
    textColor: "{colors.mora-ink}"
    rounded: "{rounded.pill}"
    padding: "0.6rem 1.15rem"
    height: "2.9rem"
  button-soft:
    backgroundColor: "{colors.mora-soft}"
    textColor: "{colors.mora}"
    rounded: "{rounded.pill}"
    padding: "0.6rem 1.15rem"
    height: "2.9rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.mora}"
    rounded: "{rounded.pill}"
    padding: "0.6rem 1.15rem"
    height: "2.9rem"
  button-ghost-hover:
    backgroundColor: "{colors.mora-soft}"
  button-disabled:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
  field:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0.7rem 0.95rem"
    height: "3.1rem"
  field-focus:
    backgroundColor: "{colors.surface}"
  field-invalid:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
  segment:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "2.9rem"
  segment-selected:
    backgroundColor: "{colors.mora-soft}"
    textColor: "{colors.mora}"
  bar-track:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.pill}"
    height: "0.6rem"
  bar-fill:
    backgroundColor: "{colors.bar}"
  bar-fill-warning:
    backgroundColor: "{colors.warn}"
  bar-fill-exceeded:
    backgroundColor: "{colors.bad}"
  chip:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "2.25rem"
  nav-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
  nav-item-active:
    textColor: "{colors.mora}"
  nav-register:
    backgroundColor: "{colors.mora}"
    textColor: "{colors.mora-ink}"
    rounded: "{rounded.pill}"
    size: "3.75rem"
  message-alert:
    backgroundColor: "{colors.bad-soft}"
    textColor: "{colors.bad}"
    rounded: "{rounded.field}"
    padding: "0.75rem 1rem"
  message-status:
    backgroundColor: "{colors.pos-soft}"
    textColor: "{colors.pos}"
    rounded: "{rounded.field}"
    padding: "0.75rem 1rem"
  message-note:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    rounded: "{rounded.field}"
    padding: "0.75rem 1rem"
---

# Design System: Bolsillo

## Overview

**Creative North Star: "El bolsillo de la casa"**

Bolsillo se siente como la libreta de cuentas de alguien de confianza: cálida, redonda, escrita en voz de tú. El mes se cuenta en una frase con las cifras en negrilla ("entró / gastaste / ahorraste"), no en una métrica heroica. El fondo es maíz tostado de día y cacao oscuro de noche; las tarjetas son blancas (o cacao claro) y blandas, con esquinas de 22px y sombras cálidas y difusas. Es una app de bolsillo hecha para una mano, a la calle, con letra grande.

Un solo color saturado, la mora, marca todo lo que se puede tocar. Todo lo demás es neutro cálido o un tinte semántico callado (ingreso, advertencia, excedido). El sistema rechaza la app de banco fría y corporativa y también el minimalismo gris vacío: la calidez es el material, no un adorno.

El modo oscuro es de primera clase: cada token tiene su par oscuro, y el sistema sigue `prefers-color-scheme` sin interruptor propio.

**Key Characteristics:**
- Fondo cálido teñido (maíz / cacao), nunca gris ni blanco puro de página.
- Mora es el único color saturado y solo sobre elementos accionables.
- Nunito redondeada, base de 18px, cifras tabulares, pesos 600 a 900.
- Tarjetas blandas con sombra cálida en dos capas; sin bordes de tarjeta.
- Todo lo tocable cede con un resorte suave (escala 0.97, 160ms).
- Objetivos táctiles grandes (mínimo 2.9rem) y contraste alto.

## Colors

Una paleta de maíz y cacao con una sola nota de mora. Los valores claros están en el frontmatter; los pares oscuros llevan prefijo `dark-`.

### Primary
- **Mora** (#b0124f claro; #ff7aa8 oscuro): el único color saturado. Botón lleno, texto de enlaces y botones fantasma/suaves, borde y texto del segmento elegido, anillo de foco, cursor y selección, icono de las filas de enlace, botón central Registrar, ítem activo de la navegación y la bolsa de la marca. Tinta sobre mora: blanco (#ffffff) en claro, #2a0a16 en oscuro.
- **Mora suave** (#fbe3ec claro; #3d2029 oscuro): fondo del hover de botones fantasma, de los botones suaves, del segmento elegido y del ítem activo del rail lateral.

### Neutral
- **Maíz** (#fbf1df) / **Cacao** (#19130e): el fondo de página y el color de tema de la PWA.
- **Superficie** (#ffffff / #271e17): tarjetas y barra de navegación.
- **Superficie 2** (#f6e8d2 / #34291f): campos, pista de barras, segmentos sin elegir, botón deshabilitado, hover del rail.
- **Línea** (#ead9c0 / #42352a): separadores de filas y tablas de 1px; nunca el contorno de una tarjeta.
- **Tinta** (#2a1e14 / #f7eee4): texto principal. **Tinta 2** (#6b5545 / #cdbba8): texto secundario, marcadores, iconos inactivos.
- **Tinte miel** (#fde5b4 / #3b2b17): fondo de la tarjeta destacada (`card-tint`) y de los chips de categoría.
- **Barra ámbar** (#c99a5b / #b9a07a): relleno de las barras de gasto en nivel normal, y la moneda de la marca. Es un neutro cálido, no un segundo acento.

### Semantic (tintes callados)
- **Ingreso / ok** (#1c6b3e sobre #dff2e5; oscuro #86d9a6 sobre #1f3327): dinero que entra, mensajes de estado.
- **Advertencia** (#b0500a sobre #fdebcf; oscuro #ff9f4a sobre #3b2b15): campos faltantes o inválidos, notas, barra al acercarse al límite.
- **Excedido / error** (#a1261c sobre #fbe0dc; oscuro #ff9a8f sobre #3f1e1a): alertas y barra pasada del presupuesto.

### Named Rules
**The One Saturated Color Rule.** Mora es el único color saturado y significa "puedes tocar esto". Ningún dato, categoría ni decoración la usa. Si algo en pantalla es mora y no responde al toque, está mal. (La bolsa de la marca es la única excepción: es el sello, no la interfaz.)
**The Warm Ground Rule.** Ningún fondo es gris frío ni blanco puro de página; el blanco solo aparece como tarjeta sobre maíz. En oscuro, el negro puro tampoco: cacao.
**The Semantic Is Quiet Rule.** Ingreso, advertencia y excedido son pares tinta-sobre-tinte, nunca rellenos saturados; el rojo no compite con la mora.

## Typography

**Display Font:** Nunito (con ui-rounded, system-ui, sans-serif), cargada con `next/font`, pesos 500 a 900.
**Body Font:** la misma Nunito.
**Label/Mono Font:** la misma; las cifras usan `font-variant-numeric: tabular-nums` en todo el documento.

**Character:** una sans humanista de terminales redondeadas, amable pero firme por los pesos 700 a 900. Una sola familia; la jerarquía sale del peso y el tamaño, no de contraste de familias.

### Hierarchy
- **Display** (800, 1.75rem, 1.15, tracking -0.02em): título de página (`h1`), con `text-wrap: balance`. Marca en la barra lateral: 900, 1.5rem. Marca en login: 900, 1.875rem.
- **Headline** (800, 1.1rem, 1.25): títulos de tarjeta (`h2`).
- **Title** (700, 1rem, 1.5): filas de lista, filas de enlace, enlaces (700, subrayado de 2px con desfase 0.2em).
- **Body** (600, 1rem, 1.5): texto, campos de formulario. Base de documento 18px (`html` 112.5%) para respetar el escalado del sistema.
- **Label** (700, 0.95rem): etiquetas de campo, leyendas, botones (800, 0.95rem).
- **Caption** (700, 0.85rem): mensajes de campo faltante, cabeceras de tabla (800, color tinta 2), segmentos, etiquetas de navegación (`text-xs` en móvil).
- **Money** (800, tabular, sin saltos de línea): toda cifra en pesos; ingresos en color de ingreso.

### Named Rules
**The Tabular Figures Rule.** Todo número va en cifras tabulares y en pesos enteros (`$1.250.000`); las columnas se alinean a la derecha.
**The Sentence First Rule.** La cifra clave del mes se lee dentro de una frase, con las cantidades en negrilla (800), no como un número gigante aislado.

## Layout

Una columna en el móvil (`max-w-xl`, gutter de 1rem), con espacio inferior de 9rem para la barra de navegación y el botón elevado. En escritorio (`lg`) el contenido pasa a `max-w-5xl` con 18rem de margen izquierdo para el rail lateral fijo de 15rem, y la página respira más arriba (2.5rem).

Ritmo de espacio observado: 0.35rem (huecos mínimos y segmentos), 0.5rem (acciones), 0.9rem (pila de formulario y padding vertical de filas), 1.25rem (padding de tarjeta y separación entre bloques de página). Las filas de lista se separan con una línea de 1px, no con tarjetas anidadas; las acciones fantasma se alinean con la columna del título, no con el borde del botón. Los objetivos táctiles miden al menos 2.9rem (botones, segmentos), 3.1rem (campos) y 3.5rem (filas de enlace). La barra inferior respeta `safe-area-inset-bottom`.

## Elevation & Depth

Híbrido de capas tonales y sombras cálidas. La profundidad principal es tonal: tarjeta blanca sobre maíz, campo en superficie 2 dentro de la tarjeta. La sombra suma una elevación suave, siempre teñida de marrón cálido (nunca negro neutro en claro).

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px rgb(92 58 24 / 0.06), 0 10px 28px -12px rgb(92 58 24 / 0.22)`; oscuro: `0 1px 2px rgb(0 0 0 / 0.35), 0 12px 28px -14px rgb(0 0 0 / 0.7)`): toda tarjeta en reposo.
- **Press** (`0 1px 2px rgb(92 58 24 / 0.08), 0 4px 12px -6px rgb(92 58 24 / 0.2)`): definida como token para estados de presión; la presión real se resuelve con escala.
- **Mora glow** (`0 8px 20px -10px var(--mora)`): solo el botón lleno; el botón elevado de Registrar usa `0 12px 24px -10px var(--mora)`.
- **Nav bar** (`0 -10px 30px -18px rgb(60 36 14 / 0.35)`; rail: `10px 0 30px -20px`): sombra de la navegación hacia el contenido.

### Named Rules
**The Warm Shadow Rule.** Las sombras son difusas, de dos capas y con tinte marrón; ninguna es dura ni con desplazamiento sin desenfoque.
**The Press Spring Rule.** Lo tocable responde con `transform: scale(0.97)` en 160ms con `cubic-bezier(0.2, 0.8, 0.2, 1)` (0.98 en tarjetas y filas de enlace, 0.95 en ítems de navegación). `prefers-reduced-motion` reduce transiciones y animaciones a 0. La tarjeta de borrador entra con la animación `rise` (de 12px abajo y opacidad 0.4).

## Shapes

Formas blandas y redondas en tres escalas: tarjetas de 22px, campos y mensajes de 14px, y píldora completa (999px) para botones, segmentos, chips y barras. Los ítems de navegación usan 16px. No hay contornos de tarjeta; los campos llevan un borde de 2px transparente que se vuelve mora al enfocar. La marca es una bolsa de bordes suaves con una moneda ámbar asomando y una costura punteada.

## Components

### Buttons
Tres niveles, todos píldora (999px), mínimo 2.9rem de alto, peso 800, mora en todos.
- **Filled:** fondo mora, texto mora-ink, resplandor mora. Es el `type="submit"`; una sola acción principal por vista.
- **Soft:** fondo mora suave, texto mora, sin sombra. Es la acción de fila (`.row`) y la clase `btn-soft`: el lleno queda para la acción principal.
- **Ghost:** transparente con texto mora; en hover toma el fondo mora suave. Es el botón por defecto.
- **Press / Disabled:** escala 0.97; deshabilitado en superficie 2 con texto tinta 2, sin sombra.

### Cards / Containers
Tarjeta (`.card`): superficie, 22px, 1.25rem de padding, sombra Card, sin borde; una tarjeta vacía se oculta. **Card-tint** cambia el fondo al tinte miel para la tarjeta destacada ("Tu mes"). Las tarjetas-enlace ceden con escala 0.98.

### Inputs / Fields
Fondo superficie 2, 14px, 2px de borde transparente, 3.1rem de alto, texto 600 de 1rem. En foco: fondo pasa a superficie y el borde a mora (sin halo). Inválido: borde, fondo y texto de advertencia. Los select llevan un chevron SVG propio que cambia de color en oscuro. Casillas y radios con `accent-color` mora.

### Segmented type control
Un `fieldset` con radios en cuadrícula 1fr 1fr 1.4fr y 0.35rem de separación. Cada opción es una píldora de superficie 2 de 2.9rem; la elegida pasa a mora suave con borde y texto mora. El radio real queda oculto. Es el control del tipo de movimiento.

### Bars with levels
Pista de 0.6rem en superficie 2 y relleno píldora. `data-level="ok"` (por defecto): barra ámbar. `warning`: advertencia. `exceeded`: excedido. El texto acompañante cambia de color con el mismo nivel, de modo que el estado nunca se comunica solo por color.

### Chips
Círculo de 2.25rem en tinte miel con el icono de la categoría en tinta (`CategoryIcon`). Es un marcador de categoría, no un control: no es mora porque no se toca.

### Navigation
Móvil: barra inferior fija en superficie con cinco destinos (Inicio, Movimientos, Registrar, Presupuestos, Más), iconos de 24px y etiquetas pequeñas. Inactivo: tinta 2, peso 700, trazo 2.25; activo: mora, peso 800, trazo 2.75. El destino central, Registrar, es un círculo mora de 3.75rem que sobresale (-1.75rem) de la barra, con icono más de 30px. Escritorio: rail lateral fijo de 15rem con la marca arriba; Registrar pasa a ser una píldora mora llena al inicio de la lista, y el ítem activo toma mora suave.

### Messages by role
Una sola forma (14px, 0.75rem 1rem, peso 700) cambia de par de color por rol ARIA: `role="alert"` excedido/error, `role="status"` ingreso/éxito, `role="note"` advertencia. Se ocultan si están vacíos. El campo faltante (`-missing`) es texto de advertencia de 0.85rem.

### Data table
Cifras tabulares alineadas a la derecha, primera columna a la izquierda y en 800, cabeceras de 0.85rem en tinta 2, líneas de 1px.

## Do's and Don'ts

### Do:
- **Do** reservar la mora (#b0124f / #ff7aa8) para lo que se puede tocar, y usar los pares `*-soft` para fondos y estados suaves.
- **Do** usar el tinte miel (#fde5b4) para la tarjeta destacada y los chips de categoría.
- **Do** contar el mes en una frase con las cifras en negrilla y en cifras tabulares, pesos enteros (`$1.250.000`).
- **Do** definir cada color nuevo con su par oscuro; el modo oscuro es de primera clase.
- **Do** mantener tarjetas sin borde, de 22px, con la sombra Card; separar filas con una línea de 1px.
- **Do** dar a todo lo tocable el resorte de presión (escala 0.97, 160ms) y objetivos de al menos 2.9rem.
- **Do** escribir en español de Colombia, de tú, cercano y directo ("Llevas 85% del presupuesto de Comida"); la app propone, el usuario confirma.

### Don't:
- **Don't** introducir un segundo color saturado ni usar mora en datos, categorías o decoración.
- **Don't** usar grises fríos, blanco puro de página ni negro puro; el sistema es maíz y cacao.
- **Don't** darle a la interfaz tono de app de banco (frío, corporativo, números heroicos aislados) ni dejarla en un minimalismo gris sin personalidad.
- **Don't** comunicar estados solo por color: acompáñalos de texto o icono.
- **Don't** usar sombras duras, sin desenfoque o de color neutro en claro.
- **Don't** apilar tarjetas dentro de tarjetas; usa filas con separador.

## Observed drift (not canonized)
- El contrato de dirección dice tarjetas de 20px; la construcción usa 22px y ese es el valor registrado.
- Los tamaños de texto de navegación móvil (`text-xs`, 12px a escala 18px base) quedan por debajo del piso de legibilidad del resto del sistema; es una deuda de la construcción, no una regla.
- El token `--shadow-press` está definido pero no se usa en el CSS revisado.
