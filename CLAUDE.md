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
