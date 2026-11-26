# Instagram de RF Gestiones: cómo se opera

Cuenta: **@rfgestion** (Business, id `29824663867138347`), conectada por **Composio** (herramientas `INSTAGRAM_*`).

## Qué se puede hacer por herramientas
- Publicar historias, posteos de feed (1 imagen) y carruseles: `INSTAGRAM_POST_IG_USER_MEDIA` (crea el contenedor; `media_type: STORIES` para historias, `CAROUSEL` + `children` para carruseles) y `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH`.
- Las imágenes tienen que estar en una URL pública directa en JPEG. El repositorio es público, así que se sirven desde `https://raw.githubusercontent.com/federoa14/RF-gestion/<rama>/tareas/instagram/...`.
- Leer perfil, medios e insights (`INSTAGRAM_GET_USER_INFO`, `INSTAGRAM_GET_IG_MEDIA`, `INSTAGRAM_GET_USER_INSIGHTS`). Con menos de 100 seguidores no hay datos de horarios óptimos.

## Qué NO se puede (lo hace Federico en la app)
Foto de perfil, biografía, sitio web, categoría y destacados. La API de Instagram no lo permite. Textos listos en la tarea `c0a1b2d8` de la oficina.

## Cola y límites
- Colección `publicaciones` del artefacto de la oficina (https://claude.ai/artifact/KPfhDZ5GsYEhj8ttFBo6nc): `{id, fecha, tipo: historia|feed|carrusel, ventana: mediodia|noche, url|urls, caption, estado: programada|publicada|revision}`.
- Respetar `config/redes` (pausa y límite): máximo 2 posteos de feed por día (un carrusel cuenta 1) y 3 historias. Nada de anuncios pagos.
- Horarios fuertes (hipótesis para Argentina, a recalibrar con datos reales cuando haya 100+ seguidores): 12:20 y 20:20, hora de Buenos Aires.

## Publicación automática en horarios fuertes
- Las tareas programadas de Claude de esta organización NO pueden recibir conectores (Composio/Canva): publican vacío. Las tres rutinas creadas (`RF Marketing: ...`) quedaron **desactivadas** por eso.
- Camino que sí funciona: conectar @rfgestion a **Metricool** (https://app.metricool.com/brands/connections?blogId=8371683) y programar con `createScheduledPost` a las 12:20 y 20:20 (America/Argentina/Buenos_Aires). Plan gratuito: 1 marca y 20 publicaciones por mes (verificar si incluye historias).

## Canva
Carpeta «RF Gestiones» (`FAHb-vAR-tc`): «Diarios (los 3 del día)» (`FAHb-uLcUCc`) y «Corporativos (permanentes)» (`FAHb-h5WfAs`). No hay herramienta para borrar en Canva: lo reemplazado se mueve a una subcarpeta «Archivo (se puede borrar)».
