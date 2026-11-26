#!/usr/bin/env python3
"""Reel «Tu comercio en un solo lugar» (1080x1920, 28 s, sin voz ni música).

Guion: rama claude/pensive-bardeen-5jdxj7, tareas/instagram/videos/GUION-tu-comercio-en-un-solo-lugar.md
(pedido de Federico vía la oficina, 2026-11-26).

1) node tareas/video/demo/capturar.mjs <capturas>          (pantallas reales con datos ficticios)
2) python3 tareas/video/demo/tu_comercio.py <capturas> <salida.mp4> [--frames carpeta t1,t2,...]
"""
import math
import os
import subprocess
import sys

import cairo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reel_v2 as R  # noqa: E402  (fondo, celular, cuaderno, QR, logo, utilidades)

W, H, FPS, TOTAL = 1080, 1920, 30, 28.0
AZUL_CLARO = R.hx("6f9bf0")  # palabras clave (pedido del guion)
CAP = sys.argv[1] if len(sys.argv) > 1 else "capturas"
ease, ease_io, back, cl, lerp = R.ease, R.ease_io, R.back, R.cl, R.lerp

# Zona segura: texto entre 250 px desde arriba y 400 px desde abajo (y <= 1520).
PH_TOP, PH_CX, PH_SC = 660, 540, 1.14

# (inicio, fin, líneas del titular [(texto, resaltado)], texto secundario, tiempo del secundario)
ESCENAS = [
    (0.0, 3.0, [[("¿Tu comercio vive en", 0)], [("cuadernos y planillas?", 1)]], None, None),
    (3.0, 8.0, [[("Sabé ", 0), ("cuánto te deben,", 1)], [("al instante", 0)]], "Cada boleta con su vencimiento", 5.5),
    (8.0, 12.0, [[("Avisos amables", 0)], [("por WhatsApp", 1)]], None, None),
    (12.0, 16.0, [[("Cobrá en el mostrador,", 0)], [("con lector de código", 1)], [("de barras", 1)]], None, None),
    (16.0, 21.0, [[("Tu tienda online,", 0)], [("con link y QR propio", 1)]], None, None),
    (21.0, 28.0, None, None, None),
]

_imgs = {}


def captura(nombre):
    if nombre not in _imgs:
        _imgs[nombre] = cairo.ImageSurface.create_from_png(os.path.join(CAP, nombre + ".png"))
    return _imgs[nombre]


def pintar_captura(c, nombre, y_px, a=1.0):
    """Dibuja la captura (1080 px de ancho) dentro de la pantalla del celular, desplazada y_px."""
    sx, sy, sw, sh = R.screen_rect(PH_CX, PH_TOP)
    img = captura(nombre)
    s = sw / img.get_width()
    c.save()
    c.translate(sx, sy - y_px * s)
    c.scale(s, s)
    c.set_source_surface(img, 0, 0)
    c.paint_with_alpha(a)
    c.restore()


def chat(c, p, a=1.0):
    """Mensaje de aviso (texto real de la app, datos ficticios)."""
    sx, sy, sw, sh = R.screen_rect(PH_CX, PH_TOP)
    c.save()
    c.push_group()
    c.rectangle(sx, sy, sw, sh)
    R.src(c, R.hx("ece5dd"))
    c.fill()
    c.rectangle(sx, sy, sw, 130)
    R.src(c, R.hx("185e54"))
    c.fill()
    c.arc(sx + 60, sy + 82, 30, 0, 2 * math.pi)
    R.src(c, R.hx("c8d2dc"))
    c.fill()
    R.text(c, "A", sx + 60, sy + 94, 32, R.F_XB, R.hx("185e54"))
    R.text(c, "Ana · Despensa Mary", sx + 104, sy + 80, 28, R.F_SB, R.WHITE, 1, "l")
    R.text(c, "en línea", sx + 104, sy + 108, 20, R.F_MD, R.hx("c8e6dc"), 1, "l")
    lineas = [("DETALLE DE SALDO PENDIENTE", R.F_XB), ("Distribuidora Uno", R.F_XB), ("", None),
              ("Hola Ana, te compartimos", R.F_MD), ("el detalle de tu comprobante:", R.F_MD), ("", None),
              ("Comprobante: #B-0013", R.F_SB), ("Vence: 29/11/2026", R.F_SB), ("Importe: $ 67.900", R.F_XB),
              ("", None), ("¡Gracias por elegirnos!", R.F_MD)]
    e = ease(p * 2.5)
    bx, by, bw = sx + 60, sy + 180 + (1 - e) * 120, sw - 90
    bh = 40 + sum(34 if t else 16 for t, _ in lineas) + 40
    R.rrect(c, bx, by, bw, bh, 22)
    R.src(c, R.hx("d9fdd3"), e)
    c.fill()
    y = by + 50
    for t, f in lineas:
        if t:
            R.text(c, t, bx + 24, y, 24, f, R.hx("14201c"), e, "l")
            y += 34
        else:
            y += 16
    R.text(c, "12:20 ✓✓", bx + bw - 24, by + bh - 16, 18, R.F_MD, R.hx("4f8cc8"), e, "r")
    c.pop_group_to_source()
    c.paint_with_alpha(a)
    c.restore()


def contenido(c, t):
    """Pantalla del celular según el momento (con fundidos entre pantallas)."""
    capas = [  # (desde, hasta, función)
        (2.6, 5.6, lambda a: pintar_captura(c, "a-panel", 0, a)),
        (5.4, 8.15, lambda a: pintar_captura(c, "b-boleta", lerp(0, 220, ease_io((t - 5.5) / 2.0)), a)),
        (7.95, 12.15, lambda a: chat(c, (t - 8.0) / 1.2, a)),
        (11.95, 16.15, lambda a: pintar_captura(c, "e-cobrar-items", lerp(650, 900, ease_io((t - 12.0) / 3.5)), a)),
        (15.95, 18.9, lambda a: pintar_captura(c, "f-tienda", 0, a)),
        (18.7, 28.0, lambda a: pintar_captura(c, "f-tienda-carrito", 492, a)),
    ]
    for desde, hasta, fn in capas:
        if desde <= t < hasta:
            a = min(cl((t - desde) / 0.2), cl((hasta - t) / 0.2)) if desde > 3.0 else cl((hasta - t) / 0.2)
            fn(a)


def titular(c, lineas, p, size=84):
    for i, linea in enumerate(lineas):
        e = ease((p - i * 0.07) * 3.2)
        if e <= 0:
            continue
        R.font(c, R.F_XB, size)
        ancho = sum(R.tw(c, t) for t, _ in linea)
        x = (W - ancho) / 2
        y = 340 + i * 98 + (1 - e) * 50
        for t, res in linea:
            R.text(c, t, x, y, size, R.F_XB, AZUL_CLARO if res else R.WHITE, e, "l")
            R.font(c, R.F_XB, size)
            x += R.tw(c, t)


def chip(c, texto, p, y):
    e = ease(p * 3)
    if e <= 0:
        return
    R.font(c, R.F_SB, 40)
    w = R.tw(c, texto) + 70
    x = (W - w) / 2
    y = y + (1 - e) * 30
    R.rrect(c, x, y, w, 76, 38)
    R.src(c, R.WHITE, 0.16 * e)
    c.fill_preserve()
    c.set_line_width(2)
    R.src(c, R.WHITE, 0.45 * e)
    c.stroke()
    R.text(c, texto, W / 2, y + 51, 40, R.F_SB, R.hx("e1ebff"), e)


def planilla(c, cx, cy, a):
    w, h = 300, 360
    R.shadow(c, cx - w / 2, cy - h / 2, w, h, 18, 0.4 * a, 16)
    R.rrect(c, cx - w / 2, cy - h / 2, w, h, 18)
    R.src(c, R.WHITE, a)
    c.fill()
    R.rrect(c, cx - w / 2, cy - h / 2, w, 56, 18)
    R.src(c, R.hx("1e8e5a"), a)
    c.fill()
    c.set_line_width(2)
    R.src(c, R.GREY, a)
    for k in range(1, 8):
        y = cy - h / 2 + 56 + k * 38
        c.move_to(cx - w / 2 + 14, y)
        c.line_to(cx + w / 2 - 14, y)
    for k in (1, 2):
        x = cx - w / 2 + k * w / 3
        c.move_to(x, cy - h / 2 + 64)
        c.line_to(x, cy + h / 2 - 14)
    c.stroke()


def escena1(c, t):
    e = back((t - 0.5) / 0.6)
    if e > 0:
        c.save()
        c.translate(0, (1 - e) * 600)
        R.notebook(c, 250, 1060, 0.0, 1.0)  # cuaderno cerrado
        c.restore()
    planilla(c, 800, 1060, cl((t - 0.8) / 0.4))
    # tachado
    p = ease((t - 1.9) / 0.45)
    if p > 0:
        c.set_line_width(26)
        c.set_line_cap(cairo.LINE_CAP_ROUND)
        R.src(c, R.RED)
        x0, y0, x1, y1 = 120, 1340, 980, 780
        c.move_to(x0, y0)
        c.line_to(lerp(x0, x1, p), lerp(y0, y1, p))
        c.stroke()


def escena6(c, t):
    lt = t - 21.0
    e = back((lt - 0.5) / 0.6)
    R.logo(c, 540, 690, 360 * e if e > 0 else 0, 1)
    titular_lineas = [[("Todo en un ", 0), ("solo lugar.", 1)]]
    R.font(c, R.F_XB, 84)
    e2 = ease((lt - 1.0) / 0.4)
    if e2 > 0:
        ancho = sum(R.tw(c, s) for s, _ in titular_lineas[0])
        x = (W - ancho) / 2
        for s, res in titular_lineas[0]:
            R.text(c, s, x, 1010 + (1 - e2) * 40, 84, R.F_XB, AZUL_CLARO if res else R.WHITE, e2, "l")
            R.font(c, R.F_XB, 84)
            x += R.tw(c, s)
    # botón «Probalo 30 días gratis»
    e3 = back((lt - 1.6) / 0.5)
    if e3 > 0:
        R.font(c, R.F_XB, 56)
        s = "Probalo 30 días gratis"
        w = R.tw(c, s) + 110
        c.save()
        c.translate(W / 2, 1150)
        c.scale(e3, e3)
        R.rrect(c, -w / 2, -58, w, 116, 58)
        R.src(c, R.hx("2f6fe8"))
        c.fill()
        R.text(c, s, 0, 20, 56, R.F_XB, R.WHITE)
        c.restore()
    e4 = ease((lt - 2.4) / 0.5)
    R.text(c, "Link en la bio · @rfgestion", W / 2, 1320 + (1 - e4) * 30, 48, R.F_SB, R.hx("cddcff"), e4)


def render(t, surf):
    c = cairo.Context(surf)
    R.background(c, t)
    i = max(k for k, e in enumerate(ESCENAS) if e[0] <= t)
    ini, fin, lineas, sec, t_sec = ESCENAS[i]
    if i == 0:
        escena1(c, t)
    # celular: sube al empezar la escena 2 y baja al cierre
    if 2.7 <= t < 21.8:
        sube = ease((t - 2.7) / 0.7)
        baja = ease((t - 21.0) / 0.7)
        top = PH_TOP + (1 - sube) * 1400 + baja * 1400

        def scr(c):
            # la pantalla se dibuja en coordenadas de reposo; el celular la mueve con él
            c.translate(0, top - PH_TOP)
            contenido(c, t)

        R.phone(c, PH_CX, top, scr, scale=PH_SC)
        # QR propio en la escena de la tienda
        q = back((t - 17.4) / 0.5)
        if q > 0 and t < 21.6:
            c.save()
            c.translate(860, 1300 + (top - PH_TOP))
            c.scale(q, q)
            R.qr(c, 0, 0, 200, 1)
            c.restore()
    if i == 5:
        escena6(c, t)
    elif lineas:
        titular(c, lineas, t - ini)
        if sec:
            chip(c, sec, t - t_sec, 340 + (len(lineas) - 1) * 98 + 36)


def main():
    salida = sys.argv[2] if len(sys.argv) > 2 else "tu-comercio.mp4"
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    if "--frames" in sys.argv:
        k = sys.argv.index("--frames")
        carpeta = sys.argv[k + 1]
        os.makedirs(carpeta, exist_ok=True)
        for tt in sys.argv[k + 2].split(","):
            render(float(tt), surf)
            surf.write_to_png(os.path.join(carpeta, f"{float(tt):05.2f}.png"))
        return
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-f", "lavfi", "-t", f"{TOTAL}", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "18",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", salida]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for n in range(round(TOTAL * FPS)):
        render(n / FPS, surf)
        surf.flush()
        proc.stdin.write(bytes(surf.get_data()))
    proc.stdin.close()
    proc.wait()
    print(f"Listo: {salida} ({TOTAL:.0f} s)")


if __name__ == "__main__":
    main()
