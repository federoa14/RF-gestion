# Videos para Instagram y TikTok

Producción de video al servicio de **Marketing (Pedro)** y **Diseño (Juan)** de la Oficina RF Gestiones.

## Cuándo se trabaja
**Solo cuando Marketing lo pide** (decisión de Federico, 2026-11-26). No hay rutinas ni videos por iniciativa propia.
El pedido llega como tarea de Marketing en la pizarra de la oficina (artefacto «Oficina RF Gestiones», colección `tareas`)
con título que empieza con «Video:», o lo trae Federico al chat de la sesión «Videos para Instagram y TikTok».
Al terminar, el video se entrega a Marketing (tarea «Recibido de Video: …») y Marketing decide si y cuándo publicarlo.

## Criterios
- Que **atraiga**: gancho en los primeros 2 segundos, ritmo (una idea cada 2-3 s), pantallas reales de la app, cierre con llamado a la acción.
- Vertical 1080x1920, 30 fps, H.264 + AAC. Titulares arriba y nada importante en los 350 px de abajo ni en el borde derecho (los tapan los botones de Instagram/TikTok).
- Identidad de Diseño: azul con franjas diagonales, letra Inter, logo RF.
- Veraz: solo funciones que la app tiene. Datos siempre ficticios (nunca clientes reales). Sin precios ni promos nuevas sin Federico.
- **Sin música con derechos**: el video sale sin música y el audio se elige dentro de Instagram/TikTok.
- No se publica desde acá: publicar es de Marketing.

## Herramientas
- `demo/capturar.mjs <carpeta>`: graba pantallas de la app real a tamaño celular con el Supabase simulado de `tests/e2e` y un comercio ficticio.
- `demo/reel_funcionamiento.py <capturas> <salida.mp4>`: reel «Cómo funciona» (celular animado, titulares, cierre).
- `armar_reel.py <pedido.json>`: reel simple a partir de imágenes de Diseño (ver el encabezado del archivo).
- Entregados: `salida/`.
