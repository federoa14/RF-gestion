#!/usr/bin/env python3
"""Arma un reel vertical (1080x1920) para Instagram y TikTok a partir de imágenes.

Uso:
    python3 tareas/video/armar_reel.py tareas/video/pedidos/<pedido>.json

El pedido (JSON) tiene esta forma:
{
  "salida": "tareas/video/salida/que-ofrecemos.mp4",
  "escenas": [
    {"imagen": "ruta/a/imagen.jpg", "dur": 3.5, "zoom": "in"},   # zoom: in | out | none
    ...
  ],
  "cierre": {"titulo": "Probalo 30 días gratis", "subtitulo": "Link en la bio · @rfgestion"},
  "transicion": 0.5,
  "fps": 30
}

Las imágenes pueden ser 9:16 (1080x1920) o 4:5 (1080x1350); las 4:5 se centran
sobre un fondo desenfocado de la misma imagen. El video sale sin música: el audio
se elige dentro de Instagram/TikTok (biblioteca con licencia), nunca se agrega
música con derechos acá. Lleva una pista de audio en silencio por compatibilidad.
"""
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
AQUI = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(AQUI, "marca", "logo_full.png")
FUENTE_TITULO = "/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf"
FUENTE_TEXTO = "/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf"
AZUL_ARRIBA = (14, 46, 130)
AZUL_ABAJO = (5, 14, 40)


def a_vertical(ruta, destino):
    """Lleva cualquier imagen a 1080x1920 sin deformarla."""
    img = Image.open(ruta).convert("RGB")
    if img.size == (W, H):
        img.save(destino, quality=95)
        return
    fondo = img.resize((W, H)).filter(ImageFilter.GaussianBlur(40))
    fondo = Image.blend(fondo, Image.new("RGB", (W, H), AZUL_ABAJO), 0.45)
    escala = min(W / img.width, H / img.height)
    chica = img.resize((round(img.width * escala), round(img.height * escala)), Image.LANCZOS)
    fondo.paste(chica, ((W - chica.width) // 2, (H - chica.height) // 2))
    fondo.save(destino, quality=95)


def degradado():
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(AZUL_ARRIBA, AZUL_ABAJO)))
    return img


def centrado(d, y, texto, fuente, color):
    ancho = d.textlength(texto, font=fuente)
    d.text(((W - ancho) / 2, y), texto, font=fuente, fill=color)


def placa_cierre(titulo, subtitulo, destino):
    img = degradado()
    if os.path.exists(LOGO):
        logo = Image.open(LOGO).convert("RGBA")
        logo.thumbnail((440, 440), Image.LANCZOS)
        img.paste(logo, ((W - logo.width) // 2, 560), logo)
    d = ImageDraw.Draw(img)
    f_tit = ImageFont.truetype(FUENTE_TITULO, 84)
    f_sub = ImageFont.truetype(FUENTE_TEXTO, 46)
    # El título puede ir en dos líneas si es largo.
    palabras, lineas, actual = titulo.split(), [], ""
    for p in palabras:
        prueba = (actual + " " + p).strip()
        if d.textlength(prueba, font=f_tit) > W - 160 and actual:
            lineas.append(actual)
            actual = p
        else:
            actual = prueba
    lineas.append(actual)
    y = 1080
    for linea in lineas:
        centrado(d, y, linea, f_tit, (255, 255, 255))
        y += 100
    d.rounded_rectangle([(W / 2 - 60, y + 30), (W / 2 + 60, y + 38)], 4, fill=(96, 150, 255))
    centrado(d, y + 80, subtitulo, f_sub, (205, 220, 255))
    img.save(destino, quality=95)


def armar(pedido_ruta):
    with open(pedido_ruta, encoding="utf-8") as f:
        pedido = json.load(f)
    raiz = os.path.abspath(os.path.join(AQUI, "..", ".."))
    fps = pedido.get("fps", 30)
    tr = pedido.get("transicion", 0.5)
    escenas = list(pedido["escenas"])
    tmp = tempfile.mkdtemp(prefix="reel-")

    imagenes = []
    for i, e in enumerate(escenas):
        destino = os.path.join(tmp, f"esc{i:02d}.jpg")
        a_vertical(os.path.join(raiz, e["imagen"]), destino)
        imagenes.append((destino, e.get("dur", 3.0), e.get("zoom", "in")))
    if pedido.get("cierre"):
        destino = os.path.join(tmp, "cierre.jpg")
        c = pedido["cierre"]
        placa_cierre(c["titulo"], c.get("subtitulo", ""), destino)
        imagenes.append((destino, c.get("dur", 3.0), "none"))

    entradas, filtros = [], []
    for i, (ruta, dur, zoom) in enumerate(imagenes):
        frames = round(dur * fps)
        entradas += ["-loop", "1", "-t", str(dur), "-i", ruta]
        if zoom == "none":
            z = "1"
        elif zoom == "out":
            z = f"1.06-0.06*on/{frames}"
        else:
            z = f"1+0.06*on/{frames}"
        filtros.append(
            f"[{i}:v]scale={W*2}:{H*2},zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d={frames}:s={W}x{H}:fps={fps},setsar=1,format=yuv420p[v{i}]"
        )

    previo, acumulado = "v0", imagenes[0][1]
    for i in range(1, len(imagenes)):
        salida = f"x{i}"
        filtros.append(f"[{previo}][v{i}]xfade=transition=fade:duration={tr}:offset={acumulado - tr:.3f}[{salida}]")
        acumulado += imagenes[i][1] - tr
        previo = salida

    salida = os.path.join(raiz, pedido["salida"])
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", *entradas,
           "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
           "-filter_complex", ";".join(filtros),
           "-map", f"[{previo}]", "-map", f"{len(imagenes)}:a", "-shortest",
           "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "20",
           "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-r", str(fps), salida]
    subprocess.run(cmd, check=True)
    print(f"Listo: {pedido['salida']} ({acumulado:.1f} s)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    armar(sys.argv[1])
