#!/usr/bin/env python3
"""Reel «Cómo funciona RF Gestiones» (1080x1920, ~22 s) con pantallas reales de la app.

1) node tareas/video/demo/capturar.mjs <capturas>     (datos ficticios, Supabase simulado)
2) python3 tareas/video/demo/reel_funcionamiento.py <capturas> <salida.mp4>

Sale sin música: el audio se elige en Instagram/TikTok (biblioteca con licencia).
"""
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
AQUI = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(AQUI, "..", "marca", "logo_full.png")
F_BOLD = "/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf"
F_MED = "/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf"
F_SEMI = "/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf"
BLANCO = (255, 255, 255)
CELESTE = (110, 168, 255)
AZUL_A, AZUL_B = (16, 52, 150), (4, 12, 36)

CAP = sys.argv[1] if len(sys.argv) > 1 else "capturas"
SALIDA = sys.argv[2] if len(sys.argv) > 2 else "reel.mp4"


def ease(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def ease_io(t):
    t = max(0.0, min(1.0, t))
    return 3 * t * t - 2 * t * t * t


def fuente(ruta, tam):
    return ImageFont.truetype(ruta if os.path.exists(ruta) else F_BOLD, tam)


# ---------- fondo con franjas diagonales (identidad de Diseño) ----------
def fondo_base():
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(AZUL_A, AZUL_B)))
    return img


BASE = fondo_base()


def fondo(t):
    img = BASE.copy()
    capa = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    for i, (x0, ancho, alfa) in enumerate([(-200, 260, 16), (420, 140, 12), (900, 320, 10)]):
        dx = (t * 22 * (1 + i * 0.4)) % 1600 - 300
        x = x0 + dx
        d.polygon([(x, H), (x + ancho, H), (x + ancho + 900, 0), (x + 900, 0)], fill=(140, 180, 255, alfa))
    img.paste(capa, (0, 0), capa)
    return img


# ---------- celular ----------
PH_W = 820
SC_W = PH_W - 36
PH_X = (W - PH_W) // 2
PH_TOP = 640  # posición final del celular


def mascara_redondeada(w, h, r):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255)
    return m


PH_H = H - PH_TOP + 120  # sale por abajo de la pantalla
SC_H = PH_H - 36
MASK_PH = mascara_redondeada(PH_W, PH_H, 92)
MASK_SC = mascara_redondeada(SC_W, SC_H, 74)
SOMBRA = Image.new("RGBA", (PH_W + 160, PH_H + 160), (0, 0, 0, 0))
ImageDraw.Draw(SOMBRA).rounded_rectangle([80, 100, PH_W + 80, PH_H + 80], 92, fill=(0, 0, 0, 150))
SOMBRA = SOMBRA.filter(ImageFilter.GaussianBlur(40))

_cache = {}


def captura(nombre):
    if nombre not in _cache:
        im = Image.open(os.path.join(CAP, nombre + ".png")).convert("RGB")
        esc = SC_W / im.width
        _cache[nombre] = im.resize((SC_W, round(im.height * esc)), Image.LANCZOS)
    return _cache[nombre]


def pantalla(nombre, y0, y1, p):
    """Recorte de la captura con desplazamiento de y0 a y1 (en píxeles de la captura original)."""
    if isinstance(nombre, Image.Image):
        im = nombre
    else:
        im = captura(nombre)
    esc = SC_W / 1080
    y = (y0 + (y1 - y0) * ease_io(p)) * esc
    y = max(0, min(im.height - SC_H, y)) if im.height > SC_H else 0
    out = Image.new("RGB", (SC_W, SC_H), (245, 247, 251))
    out.paste(im.crop((0, round(y), SC_W, round(y) + min(SC_H, im.height))), (0, 0))
    return out


def celular(img, contenido, top):
    img.paste(SOMBRA, (PH_X - 80, top - 80), SOMBRA)
    cuerpo = Image.new("RGB", (PH_W, PH_H), (14, 18, 30))
    cuerpo.paste(contenido, (18, 18), MASK_SC)
    d = ImageDraw.Draw(cuerpo)
    d.rounded_rectangle([PH_W / 2 - 70, 34, PH_W / 2 + 70, 66], 16, fill=(8, 10, 16))  # cámara
    img.paste(cuerpo, (PH_X, top), MASK_PH)


# ---------- chat de aviso (texto real de la app, datos ficticios) ----------
def chat_aviso(p):
    im = Image.new("RGB", (SC_W, 2400), (236, 229, 221))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, SC_W, 230], fill=(24, 94, 84))
    d.ellipse([40, 120, 130, 210], fill=(200, 210, 220))
    d.text((70, 140), "A", font=fuente(F_BOLD, 50), fill=(24, 94, 84))
    d.text((160, 122), "Ana · Despensa Mary", font=fuente(F_SEMI, 44), fill=BLANCO)
    d.text((160, 176), "en línea", font=fuente(F_MED, 30), fill=(200, 230, 220))
    lineas = [
        ("DETALLE DE SALDO PENDIENTE", F_BOLD),
        ("Distribuidora Uno", F_BOLD),
        ("", None),
        ("Hola Ana, esperamos que estés", F_MED),
        ("muy bien. Te compartimos el", F_MED),
        ("detalle de tu comprobante:", F_MED),
        ("", None),
        ("Comprobante: #B-0013", F_SEMI),
        ("Vencimiento: 29/11/2026", F_SEMI),
        ("Importe: $ 67.900,00", F_BOLD),
        ("", None),
        ("¡Muchas gracias por elegirnos!", F_MED),
    ]
    alto = 60 + sum(52 if l else 26 for l, _ in lineas) + 60
    bx0, by0 = 120, 300
    burbuja = Image.new("RGBA", (SC_W - bx0 - 40, alto), (0, 0, 0, 0))
    bd = ImageDraw.Draw(burbuja)
    bd.rounded_rectangle([0, 0, burbuja.width - 1, alto - 1], 34, fill=(217, 253, 211))
    y = 40
    for texto, f in lineas:
        if texto:
            bd.text((40, y), texto, font=fuente(f, 38), fill=(20, 30, 28))
            y += 52
        else:
            y += 26
    bd.text((burbuja.width - 150, alto - 52), "12:20 ✓✓", font=fuente(F_MED, 28), fill=(80, 140, 200))
    # entra deslizando desde abajo
    e = ease(p * 2.2)
    dy = round((1 - e) * 200)
    alfa = burbuja.split()[3].point(lambda a: round(a * e))
    burbuja.putalpha(alfa)
    im.paste(burbuja, (bx0, by0 + dy), burbuja)
    return im


# ---------- titulares ----------
def titular(img, lineas, p, y=200, tam=96):
    """lineas: lista de listas de (texto, resaltado). Entran línea por línea."""
    d = ImageDraw.Draw(img)
    f = fuente(F_BOLD, tam)
    for i, linea in enumerate(lineas):
        e = ease((p - i * 0.08) * 3.2)
        if e <= 0:
            continue
        ancho = sum(d.textlength(t, font=f) for t, _ in linea)
        x = (W - ancho) / 2
        yy = y + i * (tam + 14) + (1 - e) * 60
        capa = Image.new("RGBA", (W, tam + 40), (0, 0, 0, 0))
        cd = ImageDraw.Draw(capa)
        for texto, res in linea:
            cd.text((x, 0), texto, font=f, fill=(CELESTE if res else BLANCO) + (round(255 * e),))
            x += cd.textlength(texto, font=f)
        img.paste(capa, (0, round(yy)), capa)


def chip(img, texto, p, y):
    e = ease(p * 3)
    if e <= 0:
        return
    f = fuente(F_SEMI, 40)
    d = ImageDraw.Draw(img)
    w = d.textlength(texto, font=f) + 70
    capa = Image.new("RGBA", (round(w), 78), (0, 0, 0, 0))
    cd = ImageDraw.Draw(capa)
    cd.rounded_rectangle([0, 0, w - 1, 77], 39, fill=(255, 255, 255, round(40 * e)), outline=(255, 255, 255, round(110 * e)), width=2)
    cd.text((35, 16), texto, font=f, fill=(225, 235, 255, round(255 * e)))
    img.paste(capa, (round((W - w) / 2), round(y + (1 - e) * 30)), capa)


# ---------- guion ----------
# (duración, titular, chip, contenido de pantalla)
ESCENAS = [
    (2.4, [[("¿Todavía anotás", False)], [("el fiado en un", False)], [("cuaderno?", True)]], None, None),
    (2.6, [[("Mirá cuánto tenés", False)], [("en la calle", True)]], "Al instante, desde el celular", ("a-panel", 0, 0)),
    (2.8, [[("Cada boleta con", False)], [("su vencimiento", True)]], "Te avisa cuáles cobrar hoy", ("b-boleta", 0, 260)),
    (2.8, [[("Avisos amables", False)], [("por WhatsApp", True)]], "Tu cliente recibe el detalle", ("chat", 0, 0)),
    (2.6, [[("Cobrá en el", False)], [("mostrador", True)]], "Con lector de código de barras", ("e-cobrar-items", 700, 900)),
    (2.6, [[("Tu tienda online,", False)], [("con link y QR", True)]], "Pedidos con efectivo, transferencia o MP", ("f-tienda", 0, 0)),
    (2.6, [[("Todo tu comercio", False)], [("en un solo lugar", True)]], "Cobranzas · ventas · pedidos · clientes", ("d-menu", 0, 300)),
    (3.4, None, None, "cierre"),
]
TR = 0.35  # fundido entre pantallas


def cierre(img, p):
    e = ease(p * 2.5)
    if os.path.exists(LOGO):
        logo = Image.open(LOGO).convert("RGBA")
        tam = round(380 + 40 * e)
        logo = logo.resize((tam, tam), Image.LANCZOS)
        logo.putalpha(logo.split()[3].point(lambda a: round(a * e)))
        img.paste(logo, ((W - tam) // 2, 360 + round((1 - e) * 40)), logo)
    titular(img, [[("Probalo", False)], [("30 días gratis", True)]], p, y=880, tam=110)
    d = ImageDraw.Draw(img)
    e2 = ease((p - 0.25) * 3)
    if e2 > 0:
        f = fuente(F_SEMI, 48)
        t = "Link en la bio · @rfgestion"
        capa = Image.new("RGBA", (W, 80), (0, 0, 0, 0))
        ImageDraw.Draw(capa).text(((W - d.textlength(t, font=f)) / 2, 0), t, font=f, fill=(205, 222, 255, round(255 * e2)))
        img.paste(capa, (0, 1170), capa)


def contenido_de(esc, p):
    tipo = esc[3]
    if tipo == "cierre" or tipo is None:
        return None
    nombre, y0, y1 = tipo
    if nombre == "chat":
        return pantalla(chat_aviso(p), 0, 0, 0)
    return pantalla(nombre, y0, y1, p)


def frames():
    total = sum(e[0] for e in ESCENAS)
    n = round(total * FPS)
    inicios, acc = [], 0.0
    for e in ESCENAS:
        inicios.append(acc)
        acc += e[0]
    primera_con_cel = 1
    salida_cel = inicios[-1]
    for k in range(n):
        t = k / FPS
        i = max(j for j, s in enumerate(inicios) if s <= t)
        esc = ESCENAS[i]
        p = (t - inicios[i]) / esc[0]
        img = fondo(t)

        # celular: sube en la escena 2 y baja al cierre
        if inicios[primera_con_cel] - 0.3 <= t < salida_cel + 0.6:
            sube = ease((t - (inicios[primera_con_cel] - 0.3)) / 0.8)
            baja = ease((t - salida_cel) / 0.6)
            top = PH_TOP + round((1 - sube) * (H - PH_TOP + 200)) + round(baja * (H - PH_TOP + 200))
            j = max(i if esc[3] not in (None, "cierre") else i - 1, primera_con_cel)
            pj = (t - inicios[j]) / ESCENAS[j][0]
            cont = contenido_de(ESCENAS[j], min(pj, 1.0))
            # fundido con la pantalla anterior
            if j > primera_con_cel and t - inicios[j] < TR:
                prev = contenido_de(ESCENAS[j - 1], 1.0)
                cont = Image.blend(prev, cont, ease((t - inicios[j]) / TR))
            if cont is None:
                cont = contenido_de(ESCENAS[primera_con_cel], 0)
            celular(img, cont, top)

        if esc[3] == "cierre":
            cierre(img, p)
        elif esc[1]:
            y = 680 if esc[3] is None else 190
            tam = 118 if esc[3] is None else 96
            titular(img, esc[1], p, y=y, tam=tam)
            if esc[2]:
                chip(img, esc[2], p - 0.15, 190 + len(esc[1]) * 110 + 30)
        yield img


def main():
    os.makedirs(os.path.dirname(os.path.abspath(SALIDA)), exist_ok=True)
    total = sum(e[0] for e in ESCENAS)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-f", "lavfi", "-t", f"{total}", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "19",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", SALIDA]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for img in frames():
        proc.stdin.write(img.tobytes())
    proc.stdin.close()
    proc.wait()
    print(f"Listo: {SALIDA} ({total:.1f} s)")


if __name__ == "__main__":
    main()
