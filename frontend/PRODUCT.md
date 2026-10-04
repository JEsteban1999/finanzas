# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Un solo usuario principal hoy: el dueño de la app, desarrollador en Colombia. Usa la app sobre todo en su celular Android (PWA instalada) para registrar gastos e ingresos en el momento en que ocurren — muchas veces por voz, en la calle, con poco tiempo y una mano — y luego revisa el mes con calma, también desde el PC. El sistema ya es multiusuario por invitación para abrirlo a otras personas más adelante.

## Product Purpose

Registrar y entender las finanzas personales mes a mes: cuánto entra, en qué se gasta, cuánto se ahorra y si se cumplen los presupuestos. Éxito: registrar un gasto por voz en menos de 10 segundos desde el celular, y saber en cualquier momento cuánto se lleva gastado en el mes frente al presupuesto.

## Positioning

Registro por voz o texto libre en español colombiano ("almorcé 35 mil con la débito", "dos palos de prima") que la IA convierte en un borrador que el usuario siempre confirma antes de guardar; más el hábito "págate primero": al recibir el salario la app propone apartar el ahorro en ese mismo momento.

## Operating Context

- Captura rápida en movimiento: caja de texto + micrófono del navegador, borrador prellenado, confirmar.
- Revisión tranquila: dashboard mensual, comparativo entre meses, presupuestos por categoría, lista de movimientos con filtros.
- Movimientos recurrentes (arriendo, servicios, suscripciones) que llegan como "por confirmar".
- Cuentas y medios de pago: efectivo, débito, ahorro, tarjeta de crédito (la deuda de la tarjeta se ve como saldo negativo).

## Capabilities and Constraints

- Moneda única COP, sin decimales, formato `$1.250.000`; negativos `-$50.000`.
- Fechas y "este mes" en zona horaria America/Bogota.
- Next.js 16 (App Router), React 19, Tailwind CSS 4, TanStack Query; la API FastAPI se consume vía `/api/*` (mismo origen).
- PWA instalable; sin modo offline en v1.
- Los formularios nunca pierden lo escrito ante un error; las etiquetas de los campos son parte de los tests (cambiar textos de labels implica actualizar tests).
- La IA nunca guarda sola: siempre hay confirmación.
## Brand Commitments

- Nombre: **Bolsillo** (elegido por el usuario; reemplaza el provisional "Finanzas" en la interfaz).
- No debe sentirse como app de banco (fría, corporativa) ni quedarse en un minimalismo vacío sin personalidad.
- Idioma: español de Colombia.
- Voz: cercana, de tú, directa, sin jerga forzada. Ejemplos vigentes: "Llevas 85% del presupuesto de Comida", "Págate primero: ¿apartas $300.000 para tu ahorro?", "No pude interpretarlo, complétalo a mano."
- Sin logo ni identidad visual previa; el ícono actual es provisional.

## Evidence on Hand

No hay testimonios, clientes, métricas ni capturas reales. No inventar ninguno.

## Product Principles

1. Capturar primero, ordenar después: el registro rápido nunca debe esperar ni estorbar.
2. El usuario confirma: la app propone (borradores, sugerencias de ahorro), nunca decide sola.
3. La verdad del mes a la vista: lo gastado frente al presupuesto y el ahorro, sin cavar.
4. Nunca perder lo que el usuario escribió o dictó.
5. Números exactos y legibles: pesos enteros, sin redondeos engañosos.

## Accessibility & Inclusion

- Modo oscuro de primera clase (el usuario lo usa mucho), no un añadido.
- Letra grande y alto contraste como requisito explícito: tamaños base generosos, contraste WCAG AA como mínimo (AAA en cifras clave), soporte para escalado de fuente del sistema.
- Objetivos táctiles amplios para uso con una mano en el celular; también debe funcionar bien en escritorio.
