# CLAUDE.md

RF-gestion: sistema de cobranzas para distribuidoras (boletas fiadas, vencimientos, alertas por WhatsApp y email). Express + React/Vite + Supabase, desplegado en Vercel.

## Memoria persistente

Tienes una memoria en `memory/`, versionada en git. Las sesiones corren en contenedores efímeros: lo que no se commitea y pushea se pierde.

### Al inicio de cada sesión
Antes de cualquier otra cosa, lee los cuatro archivos:
- `memory/decision.md` — decisiones técnicas y de producto ya tomadas.
- `memory/people.md` — personas relevantes y su rol.
- `memory/preference.md` — cómo prefiere trabajar el usuario.
- `memory/users.md` — quiénes usan el producto y qué necesitan.

Respeta lo que dicen. Si algo choca con lo que pide el usuario, gana el usuario: avísale y actualiza la memoria.

### Al final de cada sesión (o al cerrar una tarea importante)
1. Anota en el archivo que corresponda lo nuevo que aprendiste: decisiones tomadas, preferencias expresadas, personas o tipos de usuario mencionados.
2. Edita o reemplaza entradas existentes en vez de duplicarlas; borra lo obsoleto.
3. Pon fecha a las entradas nuevas (`AAAA-MM-DD`).
4. Haz commit (`Memoria: ...`) junto con el resto del trabajo y push a la rama de la sesión.

### Qué NO guardar
- Secretos, claves, tokens, contraseñas.
- Datos personales sensibles (teléfonos, direcciones de email, documentos, domicilios).
- Detalles pasajeros de una tarea que no sirven en la próxima sesión.

## Registro de decisiones

Cuando el usuario describa una decisión tomada, regístrala de inmediato en `decisiones.csv` (no esperes al final de la sesión):

```bash
python3 scripts/decisiones.py add "decisión" "razonamiento" "resultado esperado"
```

Se guarda con la fecha de hoy y una fecha de revisión a 30 días. Si falta el razonamiento o el resultado esperado, pregúntaselo antes de registrar. Un workflow diario (`.github/workflows/revision-decisiones.yml`) marca como `revision pendiente` las que vencen; `./review.sh` muestra solo esas. Cuando el usuario revise una, ejecuta `python3 scripts/decisiones.py done "texto de la decisión"`. Las decisiones importantes también van resumidas en `memory/decision.md`.

## Dashboard de tareas (`tareas/`)

- Interfaz local: `node tareas/server.mjs` → http://localhost:3939. Datos en `tareas/tasks.json`, actividad en `tareas/tasks.log` (sin dependencias).
- Trabajo autónomo (tarea programada cada hora): la rama de estado es `claude/festive-franklin-9q3qsl`. Cada ejecución hace `git fetch origin claude/festive-franklin-9q3qsl` y trabaja sobre esa rama. Si `node tareas/cli.mjs count` da 0, no hace nada. Si no, toma la pendiente de mayor prioridad con `node tareas/cli.mjs next`, la hace y la cierra con `done <id> "qué hice"` (o `block <id> "motivo"` si no puede hacerla sola). Repite hasta vaciar la lista y hace commit y push de `tareas/` y del trabajo.
- **Oficina virtual en la nube (fuente de verdad):** el Presidente la usa en la app de la distribuidora, pestaña **Oficina** del panel superadmin (`src/components/OficinaVirtual.tsx`). Los datos viven en Supabase (proyecto «RF Gestion», tablas `oficina_tareas`, `oficina_log`, `oficina_redes`; SQL en `supabase/oficina.sql`; acceso solo `is_superadmin()`). Las órdenes del chat se cargan ahí con las herramientas MCP de Supabase (`execute_sql` sobre esas tablas, mismo formato que `tareas/cli.mjs`: estados `pendiente|en_curso|completada|bloqueada`, registrar en `oficina_log`). Reglamento y rutinas: `tareas/departamentos.json` y `tareas/rutinas.json` (los lee también la app). El dashboard local `tareas/` queda como alternativa sin base de datos; no mezclar los dos datos.
- **Oficina virtual (modo local):** el mismo dashboard es la oficina de RF Gestiones (presidente: Federico Roa). Cada tarea pertenece a un departamento (`marketing`, `ventas`, `diseno`, `gestion`, `actualizacion`, `evolucion`, `soporte`, `legal`) o está `sin_asignar`. Reglamento y funciones de cada uno en `tareas/departamentos.json`; se leen con `node tareas/cli.mjs rules [depto]`. Antes de hacer una tarea: leer `rules <depto>`, tomarla con `start <id>` (queda «En curso» y se ve en la oficina) y cerrarla con `done`/`block`. Las sin asignar se derivan con `assign <id> <depto>`. Si el usuario da una orden en el chat, crearla con `add "título" <depto> <prio> "detalle" [entregaA]`. Con `entregaA` (ej. Diseño → Marketing) al cerrar se crea sola la tarea en el otro departamento.
- **Sin esperar órdenes:** al empezar cada ejecución autónoma correr primero `node tareas/cli.mjs routines`, que genera las tareas periódicas de cada departamento (`tareas/rutinas.json`: Diseño prepara piezas → Marketing las recibe; Evolución rastrea ideas; Gestión informa; etc.). Para trabajo en conjunto: `entregaA` (el resultado pasa al siguiente departamento) y `apoyo` (crea una tarea compañera en otro departamento).
- **Redes sociales (excepción autorizada por Federico Roa, 2026-11-25):** Marketing puede publicar y responder en las redes de la empresa sin pedir aprobación por posteo, dentro de las barreras del reglamento (`rules marketing`) y solo si `node tareas/cli.mjs redes` muestra `"pausada":false` y no se superó `limitePorDia`. Hoy no hay cuentas conectadas: nunca tocar ni pedir credenciales de forma autónoma; conectarlas es un paso del Presidente con el usuario presente.
- **Asistencia al Cliente (WhatsApp):** es el primer filtro. Resuelve sola lo de su protocolo (`rules soporte`), pasa lo técnico a Actualización y al Presidente solo le escala lo que necesita su decisión con `node tareas/cli.mjs escalar "persona" "motivo" "resumen" "a quién contactar y para qué"` (queda en «esperan al Presidente»; nunca guardar teléfonos en el repo). Autorizado por el Presidente (2026-11-25) a responder clientes por WhatsApp una vez conectado.
- **Principio rector (Federico Roa, 2026-11-25):** crecimiento sostenible en el tiempo, rentable y colaborativo con el usuario; el usuario es alguien a quien se busca ayudar y su aporte ayuda al dueño, ni más ni menos. Cada fin de mes (rutina `gestion-devolucion-mensual`) hay que entregarle una devolución de la evolución de la empresa con datos reales y una lectura honesta (ver `rules gestion`). Primero ayudar, después vender; sin presión ni promesas infladas.
- **Nombres:** las personas de cada departamento llevan nombres de los discípulos de Jesús; si faltan, usar en orden `nombresReservados` de `tareas/departamentos.json`.
- Nunca ejecutar de forma autónoma acciones destructivas o con efecto externo (borrar datos, force-push, merge a `main`, deploys, enviar mensajes a clientes, gastar dinero, tocar credenciales; las únicas excepciones son las redes sociales y el WhatsApp de asistencia descritos arriba): se marcan `block` con el motivo.
