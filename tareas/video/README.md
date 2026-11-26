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

## Criterios de animación (pedido de Federico, 2026-11-26)
- Primero el guion visual (una acción por bloque, ver `guiones/`), después la animación.
- Máximo 4 palabras en pantalla por escena, aparte de los subtítulos (el resto: números e íconos).
- Las ideas se vuelven acciones y las analogías se dibujan literalmente (el cuaderno, las hojas que vuelan, el eslabón del link).
- Magnitudes a escala, foco en lo importante (lo demás se apaga) y objetos que se conservan y se transforman entre escenas.
- Cada acción clave arranca con su palabra del subtítulo; cada escena termina en una imagen clara.

## Herramientas
- `demo/reel_v2.py <salida.mp4>`: animación vectorial del guion `guiones/como-funciona-v2.md` (pycairo + letra Caveat de `marca/`, copiarla a `~/.fonts`). Con `--frames <carpeta> fin` saca la imagen final de cada escena y muestra en qué segundo cae cada palabra clave.
- Voz en off: `python3 demo/reel_v2.py <salida.mp4> --voz <es_AR-daniela-high.onnx>`. Usa Piper (`pip install piper-tts`) con la voz argentina «daniela» (high), que se baja de Hugging Face (`rhasspy/piper-voices`, ruta `es/es_AR/daniela/high/`): el entorno «RF-gestion» tiene habilitados esos hosts. La voz lee el guion; el tiempo de cada palabra sale de sintetizar el comienzo de la frase, y las acciones se disparan con eso. `PRON` define cómo se lee en voz alta («RF» → «Erre Efe», «WhatsApp» → «guasap»). Con voz, los subtítulos salen más chicos.
  - **Crédito obligatorio** (conjunto de datos CC BY-SA 4.0): «Voz: Piper es_AR daniela, entrenada con el corpus de español argentino de Google (OpenSLR 61), CC BY-SA 4.0». Ponerlo en la descripción del posteo.
- `demo/capturar.mjs <carpeta>`: graba pantallas de la app real a tamaño celular con el Supabase simulado de `tests/e2e` y un comercio ficticio.
- `demo/reel_funcionamiento.py <capturas> <salida.mp4>`: reel «Cómo funciona» (celular animado, titulares, cierre).
- `armar_reel.py <pedido.json>`: reel simple a partir de imágenes de Diseño (ver el encabezado del archivo).
- Entregados: `salida/`.
