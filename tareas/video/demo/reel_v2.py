#!/usr/bin/env python3
"""Reel «Cómo funciona RF Gestiones» v2: animación vectorial según el guion de
tareas/video/guiones/como-funciona-v2.md (1080x1920, 30 fps).

Uso: python3 tareas/video/demo/reel_v2.py <salida.mp4> [--frames carpeta t1,t2,...]
Necesita pycairo y la letra Caveat (tareas/video/marca/Caveat-Bold.woff copiada en ~/.fonts).
"""
import math
import os
import random
import subprocess
import sys

import cairo

W, H, FPS = 1080, 1920, 30
AQUI = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(AQUI, "..", "marca", "logo_full.png")

F_XB, F_SB, F_MD, F_HAND = "Inter Display ExtraBold", "Inter Display SemiBold", "Inter Display Medium", "Caveat"


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


WHITE, CELESTE = (1, 1, 1), hx("6ea8ff")
GREEN, AMBER, RED = hx("2bb673"), hx("f5a623"), hx("e5484d")
PAPER, INK, DARK = hx("fbf5e1"), hx("2a3a7a"), hx("111827")
SCREEN, GREY, GOLD = hx("f3f5fa"), hx("d5dae5"), hx("f7c331")
BLUE, NAVY, BOX = hx("3b7bff"), hx("1c2a5e"), hx("c8935a")
BG_A, BG_B = hx("10349a"), hx("040c24")


# ---------------- utilidades ----------------
def cl(t):
    return max(0.0, min(1.0, t))


def ease(t):
    t = cl(t)
    return 1 - (1 - t) ** 3


def ease_io(t):
    t = cl(t)
    return t * t * (3 - 2 * t)


def back(t):
    t = cl(t)
    c1 = 1.70158
    return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(lerp(a, b, t) for a, b in zip(c1, c2))


def lr(r1, r2, t):
    return tuple(lerp(a, b, t) for a, b in zip(r1, r2))


def money(v):
    return "$ " + f"{round(v):,}".replace(",", ".")


def rrect(c, x, y, w, h, r):
    r = max(0, min(r, w / 2, h / 2))
    c.new_sub_path()
    c.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    c.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    c.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    c.arc(x + r, y + r, r, math.pi, 3 * math.pi / 2)
    c.close_path()


def src(c, col, a=1.0):
    c.set_source_rgba(col[0], col[1], col[2], a)


def font(c, fam, size, bold=False):
    c.select_font_face(fam, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    c.set_font_size(size)


def tw(c, s):
    return c.text_extents(s).x_advance


def text(c, s, x, y, size, fam=F_XB, col=WHITE, a=1.0, align="c", bold=False):
    if a <= 0:
        return
    font(c, fam, size, bold)
    w = tw(c, s)
    dx = {"c": -w / 2, "l": 0, "r": -w}[align]
    src(c, col, a)
    c.move_to(x + dx, y)
    c.show_text(s)


def shadow(c, x, y, w, h, r, a=0.3, dy=10):
    for i in range(6):
        e = i * 4
        rrect(c, x - e, y - e + dy, w + 2 * e, h + 2 * e, r + e)
        src(c, (0, 0, 0), a / 7)
        c.fill()


def group(c, a, fn, *args):
    if a <= 0.001:
        return
    c.push_group()
    fn(c, *args)
    c.pop_group_to_source()
    c.paint_with_alpha(min(1.0, a))


def check(c, x, y, s, col, p=1.0, lw=None):
    if p <= 0:
        return
    pts = [(x - s * 0.5, y), (x - s * 0.15, y + s * 0.35), (x + s * 0.55, y - s * 0.4)]
    c.set_line_width(lw or s * 0.18)
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    c.set_line_join(cairo.LINE_JOIN_ROUND)
    src(c, col)
    c.move_to(*pts[0])
    seg1 = math.dist(pts[0], pts[1])
    seg2 = math.dist(pts[1], pts[2])
    d = p * (seg1 + seg2)
    if d <= seg1:
        t = d / seg1
        c.line_to(lerp(pts[0][0], pts[1][0], t), lerp(pts[0][1], pts[1][1], t))
    else:
        c.line_to(*pts[1])
        t = (d - seg1) / seg2
        c.line_to(lerp(pts[1][0], pts[2][0], t), lerp(pts[1][1], pts[2][1], t))
    c.stroke()


# ---------------- fondo ----------------
def background(c, t):
    g = cairo.LinearGradient(0, 0, 0, H)
    g.add_color_stop_rgb(0, *BG_A)
    g.add_color_stop_rgb(1, *BG_B)
    c.set_source(g)
    c.paint()
    for i, (x0, w, a) in enumerate([(-200, 260, 0.06), (420, 140, 0.05), (900, 320, 0.04)]):
        x = x0 + (t * 22 * (1 + i * 0.4)) % 1600 - 300
        c.move_to(x, H)
        c.line_to(x + w, H)
        c.line_to(x + w + 900, 0)
        c.line_to(x + 900, 0)
        c.close_path()
        src(c, hx("8cb4ff"), a)
        c.fill()


# ---------------- celular ----------------
PW, PHH = 520, 860


def phone(c, cx, top, screen_fn=None, scale=1.0, a=1.0, badge=0, badge_p=0.0):
    def draw(c):
        c.save()
        c.translate(cx, top + PHH / 2)
        c.scale(scale, scale)
        c.translate(-PW / 2, -PHH / 2)
        shadow(c, 0, 0, PW, PHH, 78, 0.45, 24)
        rrect(c, 0, 0, PW, PHH, 78)
        src(c, hx("0e121e"))
        c.fill()
        rrect(c, 20, 20, PW - 40, PHH - 40, 60)
        src(c, SCREEN)
        c.fill_preserve()
        c.save()
        c.clip()
        if screen_fn:
            # el contenido usa coordenadas absolutas de pantalla (escala 1)
            c.translate(-(cx - PW / 2), -top)
            screen_fn(c)
        c.restore()
        rrect(c, PW / 2 - 64, 36, 128, 30, 15)
        src(c, hx("0a0c12"))
        c.fill()
        if badge > 0:
            r = 34 * back(badge_p)
            c.arc(PW - 30, 30, r, 0, 2 * math.pi)
            src(c, RED)
            c.fill()
            text(c, str(badge), PW - 30, 30 + 13 * back(badge_p), 36 * back(badge_p))
        c.restore()

    group(c, a, draw)


def screen_rect(cx, top):
    return cx - PW / 2 + 20, top + 20, PW - 40, PHH - 40


# ---------------- objetos ----------------
def scribble(c, x, y, w, seed, p=1.0, col=INK, lw=5):
    """Garabato que imita un nombre escrito a mano."""
    rnd = random.Random(seed)
    c.save()
    c.rectangle(x - 10, y - 50, (w + 20) * cl(p), 100)
    c.clip()
    c.set_line_width(lw)
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    src(c, col)
    c.move_to(x, y)
    n = 26
    amp = [rnd.uniform(6, 14) for _ in range(n)]
    for i in range(1, n + 1):
        xx = x + w * i / n
        c.line_to(xx, y - amp[i - 1] * math.sin(i * 1.9))
    c.stroke()
    c.restore()


def hand_amount(c, s, x, y, size, p=1.0, col=INK, a=1.0):
    font(c, F_HAND, size, True)
    w = tw(c, s)
    c.save()
    c.rectangle(x - 5, y - size, (w + 10) * cl(p), size * 1.4)
    c.clip()
    src(c, col, a)
    c.move_to(x, y)
    c.show_text(s)
    c.restore()


ENTRIES = [  # (monto, color de vencimiento, lo que muestra la etiqueta)
    ("$ 22.300", AMBER, 22300),
    ("$ 48.500", GREEN, 48500),
    ("$ 31.800", RED, 31800),
]


def sheet_card(c, rect, rot, m, i, tag_p=0.0, a=1.0, hand_p=1.0):
    """Hoja de cuaderno (m=0) que se transforma en tarjeta de boleta (m=1)."""
    x, y, w, h = rect
    amount, col, _ = ENTRIES[i]

    def draw(c):
        c.save()
        c.translate(x + w / 2, y + h / 2)
        c.rotate(math.radians(rot))
        c.translate(-w / 2, -h / 2)
        shadow(c, 0, 0, w, h, lerp(6, 22, m), 0.35)
        rrect(c, 0, 0, w, h, lerp(6, 22, m))
        src(c, mix(PAPER, WHITE, m))
        c.fill()
        # hoja: renglón, garabato y monto a mano
        ha = cl(1 - m * 2.2)
        if ha > 0:
            c.set_line_width(2)
            src(c, hx("9db4e0"), 0.6 * ha)
            c.move_to(14, h * 0.72)
            c.line_to(w - 14, h * 0.72)
            c.stroke()
            group(c, ha, lambda c: scribble(c, 22, h * 0.62, w * 0.36, 10 + i, hand_p))
            group(c, ha, lambda c: hand_amount(c, amount, w * 0.48, h * 0.66, 52, cl(hand_p * 1.4 - 0.2)))
        # tarjeta: franja de color, líneas grises (sin palabras) y monto
        ca = cl(m * 2.2 - 1.2)
        if ca > 0:
            rrect(c, 0, 0, 12, h, 6)
            src(c, col, ca * cl(tag_p * 3))
            c.fill()
            rrect(c, 32, 30, w * 0.45, 18, 9)
            src(c, GREY, ca)
            c.fill()
            rrect(c, 32, 60, w * 0.28, 14, 7)
            src(c, GREY, ca * 0.7)
            c.fill()
            text(c, amount, 32, h - 28, 46, F_XB, DARK, ca, "l")
            if tag_p > 0:
                s = back(tag_p)
                cx, cy = w - 64, h / 2
                c.save()
                c.translate(cx, cy)
                c.scale(s, s)
                c.arc(0, 0, 40, 0, 2 * math.pi)
                src(c, col)
                c.fill()
                # reloj de vencimiento (rojo: signo de alerta)
                if col == RED:
                    text(c, "!", 0, 17, 50, F_XB, WHITE)
                else:
                    c.set_line_width(5)
                    src(c, WHITE)
                    c.arc(0, 0, 22, 0, 2 * math.pi)
                    c.stroke()
                    c.move_to(0, 0)
                    c.line_to(0, -14)
                    c.move_to(0, 0)
                    c.line_to(10, 6)
                    c.stroke()
                c.restore()
        c.restore()

    group(c, a, draw)


def notebook(c, cx, cy, open_p, a=1.0, write_p=(0, 0, 0), torn=(0, 0, 0)):
    pw, ph = 380, 520

    def draw(c):
        c.save()
        c.translate(cx, cy)
        shadow(c, -pw * open_p - 14, -ph / 2 - 14, pw * (1 + open_p) + 28, ph + 28, 26, 0.45, 20)
        # tapa
        rrect(c, -pw * open_p - 14, -ph / 2 - 14, pw * (1 + open_p) + 28, ph + 28, 26)
        src(c, NAVY)
        c.fill()
        # página derecha
        rrect(c, 4, -ph / 2, pw - 4, ph, 10)
        src(c, PAPER)
        c.fill()
        for k in range(1, 9):
            yy = -ph / 2 + k * ph / 9
            c.set_line_width(2)
            src(c, hx("9db4e0"), 0.55)
            c.move_to(20, yy)
            c.line_to(pw - 20, yy)
            c.stroke()
        for i in range(3):
            if torn[i] >= 1:
                continue
            yy = -ph / 2 + (2 + i * 2) * ph / 9 - 10
            scribble(c, 28, yy, 120, 10 + i, write_p[i])
            hand_amount(c, ENTRIES[i][0], 172, yy + 6, 52, cl(write_p[i] * 1.4 - 0.25))
        # página izquierda (se abre)
        if open_p > 0:
            rrect(c, -pw * open_p, -ph / 2, pw * open_p - 4, ph, 10)
            src(c, mix(hx("e9e1c6"), PAPER, open_p))
            c.fill()
            for k in range(1, 9):
                yy = -ph / 2 + k * ph / 9
                c.set_line_width(2)
                src(c, hx("9db4e0"), 0.55 * open_p)
                c.move_to(-pw * open_p + 20, yy)
                c.line_to(-20, yy)
                c.stroke()
        else:
            # tapa cerrada con etiqueta
            rrect(c, 40, -60, pw - 80, 120, 14)
            src(c, PAPER, 0.9)
            c.fill()
        # espiral
        for k in range(10):
            yy = -ph / 2 + 30 + k * (ph - 60) / 9
            c.set_line_width(6)
            src(c, hx("c9cfdc"))
            c.arc(0, yy, 11, 0, 2 * math.pi)
            c.stroke()
        c.restore()

    group(c, a, draw)


def nb_line_rect(i, cx=540, cy=900):
    """Lugar de la anotación i en la página derecha (para arrancar la hoja)."""
    ph = 520
    yy = cy - ph / 2 + (2 + i * 2) * ph / 9 - 10
    return (cx + 12, yy - 62, 360, 104)


SHEET_END = [((70, 500, 320, 104), -14), ((380, 470, 320, 104), 5), ((690, 515, 320, 104), 13)]
CARD_SLOT = [(330, 600, 420, 150), (330, 775, 420, 150), (330, 950, 420, 150)]

# barras (escala: 0,0022 px por peso → $ 343.450 = 756 px)
K = 0.0022
BASE = 1300
TOTAL, VENC, COBR = 343450, 31800, 178600


def bar(c, x, w, top, bottom, col, a=1.0, r=14):
    if bottom - top <= 0.5:
        return
    rrect(c, x, top, w, bottom - top, r)
    src(c, col, a)
    c.fill()


def axis(c, a):
    if a <= 0:
        return
    c.set_line_width(3)
    src(c, WHITE, 0.35 * a)
    c.move_to(250, BASE)
    c.line_to(860, BASE)
    c.stroke()
    for v in (100000, 200000, 300000):
        y = BASE - v * K
        c.set_line_width(2)
        c.set_dash([8, 10])
        src(c, WHITE, 0.18 * a)
        c.move_to(250, y)
        c.line_to(860, y)
        c.stroke()
        c.set_dash([])
        text(c, f"{v // 1000}.000", 236, y + 9, 26, F_SB, WHITE, 0.55 * a, "r")


def store_icon(c, cx, cy, r, a=1.0):
    c.arc(cx, cy, r, 0, 2 * math.pi)
    src(c, WHITE, a)
    c.fill()
    s = r / 68
    # toldo a rayas
    for k in range(4):
        c.rectangle(cx - 40 * s + k * 20 * s, cy - 30 * s, 20 * s, 18 * s)
        src(c, RED if k % 2 == 0 else WHITE, a)
        c.fill()
    c.rectangle(cx - 40 * s, cy - 30 * s, 80 * s, 18 * s)
    c.set_line_width(2 * s)
    src(c, RED, a)
    c.stroke()
    c.rectangle(cx - 34 * s, cy - 12 * s, 68 * s, 44 * s)
    src(c, NAVY, a)
    c.fill()
    c.rectangle(cx - 10 * s, cy + 6 * s, 20 * s, 26 * s)
    src(c, CELESTE, a)
    c.fill()


def bubble(c, rect, col, a=1.0, tail=True):
    x, y, w, h = rect
    rrect(c, x, y, w, h, min(28, h / 2))
    src(c, col, a)
    c.fill()
    if tail and h > 40:
        c.move_to(x + w - 30, y + h - 4)
        c.line_to(x + w + 14, y + h + 16)
        c.line_to(x + w - 4, y + h - 30)
        c.close_path()
        c.fill()


def coin(c, x, y, r, a=1.0):
    c.arc(x, y, r, 0, 2 * math.pi)
    src(c, GOLD, a)
    c.fill()
    c.arc(x, y, r * 0.75, 0, 2 * math.pi)
    c.set_line_width(4)
    src(c, hx("d99a10"), a)
    c.stroke()
    text(c, "$", x, y + r * 0.38, r * 1.05, F_XB, hx("9a6a00"), a)


BARS = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1]


def barcode(c, x, y, w, h, col=DARK, a=1.0):
    tot = sum(BARS) + len(BARS)
    u = w / tot
    xx = x
    for i, b in enumerate(BARS):
        if i % 2 == 0:
            c.rectangle(xx, y, b * u, h)
            src(c, col, a)
            c.fill()
        xx += (b + 1) * u if i % 2 else b * u


def product_box(c, cx, cy, a=1.0, flash=0.0, laser=-1.0):
    w, h = 260, 300
    x, y = cx - w / 2, cy - h / 2
    shadow(c, x, y, w, h, 18, 0.4 * a)
    rrect(c, x, y, w, h, 18)
    src(c, BOX, a)
    c.fill()
    c.rectangle(x, y + 40, w, 16)
    src(c, hx("a8743e"), a)
    c.fill()
    rrect(c, x + 30, y + 150, w - 60, 120, 12)
    src(c, WHITE, a)
    c.fill()
    barcode(c, x + 50, y + 168, w - 100, 84, DARK, a)
    if flash > 0:
        rrect(c, x + 22, y + 142, w - 44, 136, 16)
        c.set_line_width(8)
        src(c, GREEN, flash * a)
        c.stroke()
    if 0 <= laser <= 1:
        ly = y + 160 + laser * 100
        c.rectangle(x + 10, ly - 3, w - 20, 6)
        src(c, RED, 0.95 * a)
        c.fill()
        c.rectangle(x + 10, ly - 12, w - 20, 24)
        src(c, RED, 0.2 * a)
        c.fill()


ITEMS = [2100, 1400, 1100]


def chain(c, cx, cy, s, p, a=1.0):
    """Eslabón de cadena dibujado con el trazo que avanza."""
    c.save()
    c.translate(cx, cy)
    c.rotate(-math.pi / 4)
    c.set_line_width(22 * s)
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    per = 2 * (110 + 60) * s + 2 * math.pi * 30 * s
    for k, dx in enumerate((-48, 48)):
        pp = cl(p * 2 - k * 0.6)
        if pp <= 0:
            continue
        rrect(c, (dx - 70) * s, -32 * s, 140 * s, 64 * s, 32 * s)
        c.set_dash([per * pp, per])
        src(c, WHITE, a)
        c.stroke()
    c.set_dash([])
    c.restore()


_rq = random.Random(7)
QR_N = 21
QR_MOD = []
for _y in range(QR_N):
    for _x in range(QR_N):
        finder = any(fx <= _x < fx + 7 and fy <= _y < fy + 7 for fx, fy in ((0, 0), (14, 0), (0, 14)))
        if finder:
            on = (_x % 14 in (0, 6) or _y % 14 in (0, 6) or (2 <= _x % 14 <= 4 and 2 <= _y % 14 <= 4))
        else:
            on = _rq.random() < 0.5
        if on:
            QR_MOD.append((_x, _y, _rq.random()))


def qr(c, cx, cy, size, p, a=1.0):
    pad = size * 0.08
    rrect(c, cx - size / 2 - pad, cy - size / 2 - pad, size + 2 * pad, size + 2 * pad, 18)
    src(c, WHITE, a * cl(p * 3))
    c.fill()
    m = size / QR_N
    for x, y, r in QR_MOD:
        if r <= p:
            c.rectangle(cx - size / 2 + x * m, cy - size / 2 + y * m, m + 0.5, m + 0.5)
            src(c, DARK, a)
            c.fill()


def order_card(c, x, y, w, h, amount, a=1.0):
    shadow(c, x, y, w, h, 20, 0.25 * a)
    rrect(c, x, y, w, h, 20)
    src(c, WHITE, a)
    c.fill()
    c.arc(x + 58, y + h / 2, 34, 0, 2 * math.pi)
    src(c, BLUE, a)
    c.fill()
    # bolsa
    rrect(c, x + 40, y + h / 2 - 10, 36, 30, 5)
    src(c, WHITE, a)
    c.fill()
    c.set_line_width(4)
    c.arc(x + 58, y + h / 2 - 10, 10, math.pi, 2 * math.pi)
    c.stroke()
    rrect(c, x + 112, y + 26, w * 0.32, 16, 8)
    src(c, GREY, a)
    c.fill()
    text(c, amount, x + 112, y + h - 24, 40, F_XB, DARK, a, "l")


def logo(c, cx, cy, size, a=1.0):
    if a <= 0 or size <= 1:
        return
    img = _logo()
    s = size / img.get_width()
    c.save()
    c.translate(cx - size / 2, cy - size / 2)
    c.scale(s, s)
    c.set_source_surface(img, 0, 0)
    c.paint_with_alpha(a)
    c.restore()


_LOGO = []


def _logo():
    if not _LOGO:
        _LOGO.append(cairo.ImageSurface.create_from_png(LOGO))
    return _LOGO[0]


# ---------------- escenas ----------------
STEP = 0.27
SCENES = [
    dict(head=[("¿Todavía anotás ", 0), ("lo que te deben?", 1)], sub="¿Todavía anotás lo que te deben en un cuaderno? Las hojas se pierden.",
         pause={"deben": 0.2, "cuaderno": 0.3}, hold=1.1, lead=0.25, vpause={"cuaderno": 0.25}),
    dict(head=[("Cada hoja, ", 0), ("una boleta", 1)], sub="Con RF, cada anotación es una boleta con vencimiento.",
         pause={"boleta": 0.4}, hold=1.0, vpause={"boleta": 0.2}),
    dict(head=[("Cuánto tenés ", 0), ("afuera", 1)], sub="Ves cuánto tenés en la calle y cuánto venció.",
         pause={"calle": 0.5}, hold=1.1, lead=0.85, vpause={"calle": 0.45}),
    dict(head=[("Avisa por ", 0), ("WhatsApp", 1)], sub="RF avisa a tu cliente por WhatsApp y vos cobrás.",
         pause={"avisa": 0.3, "whatsapp": 0.2}, hold=1.7, lead=0.6, vpause={"whatsapp": 0.4}),
    dict(head=[("Escaneá y ", 0), ("cobrá", 1)], sub="Escaneás el código y el total se suma solo.",
         pause={"suma": 0.9}, hold=1.6, lead=0.8, vpause={}),
    dict(head=[("Tu tienda, ", 0), ("un link", 1)], sub="Compartís un link y los pedidos llegan solos.",
         pause={"link": 0.8, "pedidos": 0.4}, hold=1.0, lead=0.5, vpause={"link": 0.7}),
    dict(head=[("Todo en ", 0), ("un lugar", 1)], sub="Cobranzas, mostrador y tienda en un solo lugar.",
         pause={"cobranzas": 0.15, "mostrador": 0.15, "tienda": 0.2}, hold=1.3, lead=0.8, vpause={"tienda": 0.15}),
    dict(head=[("Probalo ", 0), ("30 días gratis", 1)], sub="Probalo treinta días gratis. Link en la bio.",
         pause={"treinta": 0.6, "gratis": 0.3}, hold=1.8, lead=0.6, vpause={"gratis": 0.3}),
]
KEYS = [["anotás", "deben", "cuaderno", "pierden"], ["boleta", "vencimiento"], ["calle", "venció"], ["avisa", "whatsapp", "cobrás"],
        ["código", "suma", "solo"], ["link", "pedidos"], ["cobranzas", "mostrador", "tienda", "solo"], ["treinta", "gratis"]]


def norm(w):
    return w.strip("¿?.,:¡!").lower()


# ---------------- voz en off (Piper, voz es_AR) ----------------
VOZ = {}
PRON = {"RF": "Erre Efe", "WhatsApp": "guasap"}  # cómo se lee en voz alta; el subtítulo no cambia


def pron(w):
    core = w.strip("¿?.,:¡!")
    return w.replace(core, PRON[core]) if core in PRON else w


def synth(text):
    import numpy as np
    return np.concatenate([ch.audio_int16_array for ch in VOZ["voice"].synthesize(text, syn_config=VOZ["cfg"])])


def speech_bounds(a, sr):
    import numpy as np
    win = int(sr * 0.01)
    n = len(a) // win
    e = np.abs(a[:n * win].reshape(n, win).astype(np.int32)).max(axis=1)
    idx = np.where(e > 700)[0]
    if len(idx) == 0:
        return 0.0, len(a) / sr
    return idx[0] * win / sr, (idx[-1] + 1) * win / sr


def voice_scene(s):
    """Sintetiza la escena por tramos (cortando en comas, puntos y pausas) y estima cuándo
    empieza cada palabra: la duración hablada del comienzo de la frase hasta la palabra anterior."""
    import numpy as np
    sr = VOZ["sr"]
    words = s["words"]
    pauses = s.get("vpause", {})
    chunks, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        gap = pauses.get(norm(w))
        if gap is None and w[-1] in ".?!":
            gap = 0.3
        if gap is None and w[-1] in ",:":
            gap = 0.12
        if gap is not None:
            chunks.append((cur, gap))
            cur = []
    if cur:
        chunks.append((cur, 0.0))
    parts, wt, t = [], [0.0] * len(words), 0.0
    for idx, gap in chunks:
        a = synth(" ".join(pron(words[i]) for i in idx))
        st, en = speech_bounds(a, sr)
        a = a[int(st * sr):int(en * sr)]
        dur = len(a) / sr
        for j, i in enumerate(idx):
            if j == 0:
                wt[i] = t
            else:
                pa = synth(" ".join(pron(words[k]) for k in idx[:j]))
                ps, pe = speech_bounds(pa, sr)
                wt[i] = t + min(pe - ps + 0.03, dur - 0.1)
        parts.append(a)
        t += dur
        if idx[-1] != len(words) - 1:
            sil = np.zeros(int(gap * sr), dtype=np.int16)
            parts.append(sil)
            t += gap
    return np.concatenate(parts), wt, t


def build():
    t0 = 0.0
    for s, keys in zip(SCENES, KEYS):
        words = s["sub"].split()
        t = s.get("lead", 0.35)
        s["wt"] = []
        if VOZ:
            s["words"] = words
            audio, wt, dur = voice_scene(s)
            s["audio"] = audio
            s["wt"] = [t + x for x in wt]
            t += dur
            words = []
        for w in words:
            s["wt"].append(t)
            t += STEP
            if w[-1] in ",:":
                t += 0.18
            if w[-1] in ".?":
                t += 0.35
            t += s.get("pause", {}).get(norm(w), 0)
        if not VOZ:
            s["words"] = words
        s["dur"] = t + s.get("hold", 1.2)
        s["K"] = {}
        for k in keys:
            s["K"][k] = next(s["wt"][i] for i, w in enumerate(s["words"]) if norm(w) == k)
        s["t0"] = t0
        t0 += s["dur"]
    return t0


def headline(c, parts, a, dy=0):
    if a <= 0:
        return
    size = 96
    font(c, F_XB, size)
    total = sum(tw(c, p) for p, _ in parts)
    lines = [parts] if total <= 960 else [[p] for p in parts]
    for li, line in enumerate(lines):
        font(c, F_XB, size)
        w = sum(tw(c, p.strip() if len(lines) > 1 else p) for p, _ in line)
        x = (W - w) / 2
        y = 300 + li * 108 + dy
        for p, hl in line:
            p = p.strip() if len(lines) > 1 else p
            text(c, p, x, y, size, F_XB, CELESTE if hl else WHITE, a, "l")
            font(c, F_XB, size)
            x += tw(c, p)


def subtitles(c, s, lt):
    size, lh, maxw = (40, 54, 900) if VOZ else (50, 66, 940)
    font(c, F_SB, size)
    keys = KEYS[SCENES.index(s)]
    lines, cur, cw = [], [], 0
    space = tw(c, " ")
    for i, w in enumerate(s["words"]):
        ww = tw(c, w)
        if cur and cw + space + ww > maxw:
            lines.append((cur, cw))
            cur, cw = [], 0
        cur.append(i)
        cw += (space if len(cur) > 1 else 0) + ww
    lines.append((cur, cw))
    y0 = 1480 if VOZ else 1450
    for li, (idx, lw_) in enumerate(lines):
        x = (W - lw_) / 2
        y = y0 + li * lh
        for i in idx:
            w = s["words"][i]
            a = cl((lt - s["wt"][i]) / 0.12)
            key = norm(w) in keys
            font(c, F_SB, size)
            ww = tw(c, w)
            if a > 0:
                src(c, (0, 0, 0), 0.35 * a)
                c.move_to(x + 2, y + 3)
                c.show_text(w)
                src(c, CELESTE if key else WHITE, a)
                c.move_to(x, y)
                c.show_text(w)
            x += ww + space


# Escena 1 -------------------------------------------------------------
def s1(c, lt, K, d):
    kc, kd, kp = K["anotás"], K["deben"], K["pierden"]
    drop = back((lt - kc) / 0.55)
    cy = lerp(-400, 900, drop) if lt >= kc else -400
    open_p = ease((lt - kc - 0.5) / 0.4)
    wp = tuple(cl((lt - kd - i * 0.32) / 0.32) for i in range(3))
    torn = tuple(ease((lt - kp - i * 0.1) / 0.65) for i in range(3))
    if lt >= kc:
        notebook(c, 540, cy, open_p, 1.0 - 0.2 * torn[2], wp, tuple(1 if tt > 0 else 0 for tt in torn))
    for i in range(3):
        if torn[i] <= 0:
            continue
        r0 = nb_line_rect(i)
        r1, rot1 = SHEET_END[i]
        p = torn[i]
        rect = lr(r0, r1, p)
        rect = (rect[0], rect[1] - math.sin(p * math.pi) * 120, rect[2], rect[3])
        bob = math.sin(lt * 2.2 + i) * 6 * p
        sheet_card(c, (rect[0], rect[1] + bob, rect[2], rect[3]), rot1 * p + math.sin(p * math.pi) * 25 * (1 if i % 2 else -1), 0, i)


# Escena 2 -------------------------------------------------------------
PH_TOP = 470


def s2(c, lt, K, d):
    kb, kv = K["boleta"], K["vencimiento"]
    out = ease(lt / 0.7)
    notebook(c, 540, 900 + out * 1000, 1.0, 0.65 * (1 - out))
    top = lerp(H + 50, PH_TOP, ease((lt - 0.15) / 0.8))
    phone(c, 540, top)
    for i in range(3):
        m = ease_io((lt - kb - i * 0.15) / 0.7)
        r1, rot1 = SHEET_END[i]
        bob = math.sin((lt + d) * 2.2 + i) * 6 * (1 - m)
        rect = lr(r1, CARD_SLOT[i], m)
        rect = (rect[0], rect[1] + bob - math.sin(m * math.pi) * 60, rect[2], rect[3])
        tag = cl((lt - kv - i * 0.18) / 0.45)
        sheet_card(c, rect, rot1 * (1 - m), m, i, tag)


# Escena 3 -------------------------------------------------------------
BAR_X, BAR_W = 430, 220
STACK = [(1, GREEN), (0, AMBER), (2, RED)]  # de abajo hacia arriba


def stack_rects():
    rects, y = {}, BASE
    for i, _col in STACK:
        h = ENTRIES[i][2] * K
        rects[i] = (BAR_X, y - h, BAR_W, h)
        y -= h
    return rects


def s3_state(lt, K_):
    kc, kv = K_["calle"], K_["venció"]
    g = ease_io((lt - kc) / 0.9)
    focus = ease((lt - kv) / 0.5)
    return g, focus


def draw_bars3(c, lt, K_, focus_override=None):
    g, focus = s3_state(lt, K_)
    if focus_override is not None:
        focus = focus_override
    blue_full = (TOTAL - VENC) * K
    blue_small = (ENTRIES[1][2] + ENTRIES[0][2]) * K
    blue_h = lerp(blue_small, blue_full, g)
    dim = 1 - 0.6 * focus
    # los bloques verde y amarillo se tiñen de azul y recién entonces crece la barra
    tint = ease((lt - K_["calle"] + 0.35) / 0.35)
    if tint >= 1:
        bar(c, BAR_X, BAR_W, BASE - blue_h, BASE, BLUE, dim, 10)
    else:
        rects = stack_rects()
        for i, col in STACK[:2]:
            x, y, w, h = rects[i]
            bar(c, x, w, y, y + h, mix(col, BLUE, tint), 1.0, 6)
    red_h = VENC * K
    red_top = BASE - blue_h - red_h
    bar(c, BAR_X, BAR_W, red_top, red_top + red_h, RED, 1.0, 8)
    if focus > 0:
        rrect(c, BAR_X - 6, red_top - 6, BAR_W + 12, red_h + 12, 14)
        c.set_line_width(6)
        src(c, WHITE, focus * (0.75 + 0.25 * math.sin(lt * 8)))
        c.stroke()
    total_v = lerp(sum(e[2] for e in ENTRIES), TOTAL, g)
    text(c, money(total_v), BAR_X + BAR_W / 2, red_top - 28, 54, F_XB, WHITE, cl(g * 3) * dim)
    return red_top, red_h, focus


def s3(c, lt, K_, d):
    intro = ease_io(lt / 0.8)
    top = lerp(PH_TOP, H + 50, intro)
    phone(c, 540, top, a=1 - intro)
    if lt < 0.8:
        axis(c, ease((lt - 0.3) / 0.5))
        rects = stack_rects()
        for i in range(3):
            col = ENTRIES[i][1]
            r = lr(CARD_SLOT[i], rects[i], intro)
            if intro < 0.5:
                sheet_card(c, r, 0, 1, i, 1.0, 1 - intro * 2)
            rrect(c, *r, lerp(22, 6, intro))
            src(c, col, cl(intro * 2 - 0.2))
            c.fill()
        return
    # cámara: se acerca al tramo vencido
    g, focus = s3_state(lt, K_)
    red_top, red_h = BASE - (TOTAL - VENC) * K * 1 - VENC * K, VENC * K
    z = 1 + 0.16 * focus
    fx, fy = BAR_X + BAR_W / 2 + 60, red_top + red_h / 2 + 40
    c.save()
    c.translate(fx, fy)
    c.scale(z, z)
    c.translate(-fx, -fy)
    axis(c, ease((lt - 0.3) / 0.5))
    red_top, red_h, focus = draw_bars3(c, lt, K_)
    if focus > 0:
        bx = BAR_X + BAR_W + 26
        c.set_line_width(5)
        src(c, hx("ff9a9a"), focus)
        c.move_to(bx, red_top)
        c.line_to(bx + 18, red_top)
        c.line_to(bx + 18, red_top + red_h)
        c.line_to(bx, red_top + red_h)
        c.stroke()
        text(c, money(VENC), bx + 34, red_top + red_h / 2 + 18, 50, F_XB, hx("ff9a9a"), focus, "l")
    c.restore()


# Escena 4 -------------------------------------------------------------
BLUE_X4, COB_X4, W4 = 250, 560, 200
AV = (880, 560)
BUB = (520, 395, 300, 104)


def s4(c, lt, K_, d):
    ka, kw, kc = K_["avisa"], K_["whatsapp"], K_["cobrás"]
    intro = ease_io(lt / 0.6)
    # la cámara vuelve y las barras se acomodan
    red_h = VENC * K
    blue_h = (TOTAL - VENC) * K
    bx = lerp(BAR_X, BLUE_X4, intro)
    bw = lerp(BAR_W, W4, intro)
    zoom_back = 1 - intro
    red_top = BASE - blue_h - red_h
    fx, fy = BAR_X + BAR_W / 2 + 60, red_top + red_h / 2 + 40
    z = 1 + 0.16 * zoom_back
    c.save()
    c.translate(fx, fy)
    c.scale(z, z)
    c.translate(-fx, -fy)
    axis(c, 1)
    coin_p = ease_io((lt - kc) / 0.6)
    grow = ease((lt - kc - 0.55) / 0.45)
    focus_c = ease((lt - kc - 0.5) / 0.4)
    blue_dim = lerp(0.4, 0.75, intro) * (1 - 0.35 * focus_c)
    bar(c, bx, bw, BASE - blue_h, BASE, BLUE, blue_dim, 10)
    # valor en la calle: baja cuando el vencido se va a cobrar
    gone = ease((lt - ka) / 0.5)
    text(c, money(lerp(TOTAL, TOTAL - VENC, gone)), bx + bw / 2, BASE - blue_h - red_h * (1 - gone) - 28, 48, F_XB, WHITE,
         blue_dim + 0.2)
    # barra de cobrado
    cob_h = lerp(0, COBR * K, ease((lt - 0.2) / 0.7)) + VENC * K * grow
    bar(c, COB_X4, W4, BASE - cob_h, BASE, GREEN, 1.0, 10)
    if cob_h > 4:
        text(c, money(COBR + VENC * grow), COB_X4 + W4 / 2, BASE - cob_h - 28, 48, F_XB, WHITE, ease((lt - 0.4) / 0.4))
        # íconos bajo las barras en lugar de rótulos
        check(c, COB_X4 + W4 / 2, BASE + 52, 40, GREEN, ease((lt - 0.5) / 0.4))
    if focus_c > 0:
        rrect(c, COB_X4 - 6, BASE - cob_h - 6, W4 + 12, cob_h + 12, 16)
        c.set_line_width(6)
        src(c, WHITE, focus_c * 0.85)
        c.stroke()
        text(c, "+" + money(VENC), COB_X4 + W4 / 2, BASE - cob_h - 100 - 30 * (1 - focus_c), 44, F_XB, hx("8ff0b8"), focus_c)
    # tramo rojo → globo
    m = ease_io((lt - ka) / 0.7)
    r0 = (bx, red_top, bw, red_h)
    rect = lr(r0, BUB, m)
    rect = (rect[0], rect[1] - math.sin(m * math.pi) * 90, rect[2], rect[3])
    bub_a = 1 - 0.55 * focus_c
    bubble(c, rect, mix(RED, GREEN, m), bub_a, tail=m > 0.6)
    if m >= 1:
        text(c, money(VENC), BUB[0] + 34, BUB[1] + 66, 44, F_XB, WHITE, bub_a, "l")
    ticks = ease((lt - kw) / 0.35)
    if ticks > 0:
        check(c, BUB[0] + BUB[2] - 70, BUB[1] + 62, 26, hx("bfe6ff"), ticks, 5)
        check(c, BUB[0] + BUB[2] - 50, BUB[1] + 62, 26, hx("bfe6ff"), ticks, 5)
    c.restore()
    # cliente
    av = back((lt - 0.3) / 0.45)
    pulse = 1 + 0.12 * math.sin(cl((lt - kw) / 0.4) * math.pi)
    if av > 0:
        store_icon(c, AV[0], AV[1], 68 * av * pulse)
    if 0 < coin_p < 1:
        x = lerp(AV[0], COB_X4 + W4 / 2, coin_p)
        y = lerp(AV[1], BASE - COBR * K - 40, coin_p) - math.sin(coin_p * math.pi) * 160
        coin(c, x, y, 40)


# Escena 5 -------------------------------------------------------------
PX5 = 650


def s5(c, lt, K_, d):
    kcod, ks, kso = K_["código"], K_["suma"], K_["solo"]
    out = ease_io(lt / 0.6)
    if out < 1:
        c.save()
        c.translate(0, out * 700)
        group(c, 1 - out, lambda c: (axis(c, 1), bar(c, BLUE_X4, W4, BASE - (TOTAL - VENC) * K, BASE, BLUE, 0.5, 10),
                                     bar(c, COB_X4, W4, BASE - (COBR + VENC) * K, BASE, GREEN, 1, 10),
                                     store_icon(c, AV[0], AV[1], 68)))
        c.restore()
    top = lerp(H + 50, PH_TOP, ease((lt - 0.2) / 0.8))
    arrivals = [ks + j * 0.42 + 0.35 for j in range(3)]
    n_in = [ease((lt - a) / 0.25) for a in arrivals]
    total = sum(v * cl(n) for v, n in zip(ITEMS, n_in))

    def scr(c):
        sx, sy, sw, sh = screen_rect(PX5, top)
        # barra superior con ícono de caja registradora
        c.rectangle(sx, sy, sw, 110)
        src(c, NAVY)
        c.fill()
        barcode(c, sx + sw / 2 - 50, sy + 48, 100, 40, WHITE)
        for j in range(3):
            if n_in[j] <= 0:
                continue
            ry = sy + 140 + j * 104
            group(c, n_in[j], lambda c, ry=ry, j=j: (
                rrect(c, sx + 24, ry, sw - 48, 86, 18), src(c, WHITE), c.fill(),
                rrect(c, sx + 48, ry + 34, 120, 18, 9), src(c, GREY), c.fill(),
                text(c, money(ITEMS[j]), sx + sw - 48, ry + 58, 38, F_XB, DARK, 1, "r")))
        pulse = 1 + 0.08 * math.sin(cl((lt - arrivals[-1]) / 0.35) * math.pi)
        ty = sy + sh - 150
        rrect(c, sx + 20, ty, sw - 40, 130, 26)
        src(c, GREEN)
        c.fill()
        text(c, money(total), sx + sw / 2, ty + 88, 70 * pulse, F_XB, WHITE)

    phone(c, PX5, top, scr)
    # paquete con código
    bx = lerp(-200, 190, ease((lt - 0.35) / 0.55))
    laser = -1
    flash = 0.0
    scans = [kcod] + [a - 0.35 for a in arrivals]
    for s_ in scans:
        if s_ <= lt < s_ + 0.3:
            laser = (lt - s_) / 0.3
        if s_ + 0.3 <= lt < s_ + 0.6:
            flash = 1 - (lt - s_ - 0.3) / 0.3
    product_box(c, bx, 880, 1.0, flash, laser)
    # productos que viajan al ticket
    sx, sy, sw, sh = screen_rect(PX5, top)
    for j, a in enumerate(arrivals):
        p = (lt - (a - 0.35)) / 0.35
        if 0 < p < 1:
            pe = ease_io(p)
            x = lerp(bx, sx + sw / 2, pe)
            y = lerp(880, sy + 183 + j * 104, pe) - math.sin(pe * math.pi) * 120
            rrect(c, x - 70, y - 30, 140, 60, 30)
            src(c, WHITE)
            c.fill()
            text(c, money(ITEMS[j]), x, y + 12, 30, F_XB, DARK)


# Escena 6 -------------------------------------------------------------
ORDERS = ["$ 6.400", "$ 12.900", "$ 3.250"]
QR_POS = (190, 860)


def store_screen(c, sx, sy, sw, sh, a=1.0):
    c.rectangle(sx, sy, sw, 150)
    src(c, NAVY, a)
    c.fill()
    store_icon(c, sx + sw / 2, sy + 92, 44, a)
    cols = [hx("ffd6a5"), hx("bde0fe"), hx("caffbf"), hx("ffc8dd")]
    for k in range(4):
        x = sx + 28 + (k % 2) * (sw - 56 + 20) / 2
        y = sy + 180 + (k // 2) * 250
        w_ = (sw - 56 - 20) / 2
        rrect(c, x, y, w_, 220, 22)
        src(c, WHITE, a)
        c.fill()
        rrect(c, x + 20, y + 20, w_ - 40, 120, 16)
        src(c, cols[k], a)
        c.fill()
        rrect(c, x + 20, y + 160, w_ * 0.5, 16, 8)
        src(c, GREY, a)
        c.fill()


def s6(c, lt, K_, d):
    kl, kp = K_["link"], K_["pedidos"]
    out = ease_io(lt / 0.5)
    product_box(c, lerp(190, -250, out), 880)
    drops = [kp + j * 0.38 for j in range(3)]
    arrived = sum(1 for t_ in drops if lt >= t_ + 0.3)

    def scr(c):
        sx, sy, sw, sh = screen_rect(PX5, PH_TOP)
        sw_ = cl(lt / 0.5)
        store_screen(c, sx, sy, sw, sh, sw_)
        for j, t_ in enumerate(drops):
            p = (lt - t_) / 0.35
            if p <= 0:
                continue
            y_end = sy + 200 + j * 150
            y = lerp(sy - 150, y_end, back(p))
            order_card(c, sx + 24, y, sw - 48, 126, ORDERS[j])

    badge_p = 0
    if arrived:
        badge_p = cl((lt - drops[arrived - 1] - 0.3) / 0.3)
    phone(c, PX5, PH_TOP, scr, badge=arrived, badge_p=badge_p)
    # eslabón que se vuelve QR
    ch = cl((lt - kl) / 0.6)
    to_qr = ease((lt - kl - 0.8) / 0.5)
    if ch > 0 and to_qr < 1:
        chain(c, QR_POS[0], QR_POS[1], 1.0 - 0.3 * to_qr, ch, 1 - to_qr)
    if to_qr > 0:
        qr(c, QR_POS[0], QR_POS[1], 230, to_qr)


# Escena 7 -------------------------------------------------------------
CENTER7 = (540, 900)
ORBIT = [  # (ángulo inicial, tipo, palabra que lo enciende)
    (-90, "card", "cobranzas"), (-25, "bars", "cobranzas"), (35, "barcode", "mostrador"),
    (145, "bubble", "cobranzas"), (205, "qr", "tienda"),
]


def mini(c, kind, x, y, s, lit):
    c.save()
    c.translate(x, y)
    c.scale(s, s)
    glow = 0.25 + 0.75 * lit
    c.arc(0, 0, 92, 0, 2 * math.pi)
    src(c, WHITE, 0.10 + 0.12 * lit)
    c.fill()
    if kind == "card":
        rrect(c, -70, -45, 140, 90, 14)
        src(c, WHITE, glow)
        c.fill()
        rrect(c, -70, -45, 10, 90, 5)
        src(c, RED, glow)
        c.fill()
        rrect(c, -45, -22, 70, 12, 6)
        src(c, GREY, glow)
        c.fill()
        rrect(c, -45, 6, 50, 16, 6)
        src(c, DARK, glow)
        c.fill()
    elif kind == "bars":
        for k, (h, col) in enumerate([(60, BLUE), (100, BLUE), (80, GREEN)]):
            rrect(c, -60 + k * 44, 50 - h, 32, h, 6)
            src(c, col, glow)
            c.fill()
    elif kind == "barcode":
        rrect(c, -70, -45, 140, 90, 12)
        src(c, WHITE, glow)
        c.fill()
        barcode(c, -55, -32, 110, 64, DARK, glow)
    elif kind == "bubble":
        bubble(c, (-70, -40, 130, 70), GREEN, glow)
        check(c, -12, -6, 26, WHITE, 1, 5)
        check(c, 12, -6, 26, WHITE, 1, 5)
    elif kind == "qr":
        qr(c, 0, 0, 120, 1, glow)
    c.restore()


def s7(c, lt, K_, d):
    ks = K_["solo"]
    intro = ease_io(lt / 0.8)
    suck = ease_io((lt - ks) / 0.6)
    sc = lerp(1.0, 0.55, intro) * (1 - 0.15 * suck)
    px = lerp(PX5, CENTER7[0], intro)
    ptop = lerp(PH_TOP, CENTER7[1] - PHH / 2, intro)

    def scr(c):
        sx, sy, sw, sh = screen_rect(px, ptop)
        store_screen(c, sx, sy, sw, sh)
        for j in range(3):
            order_card(c, sx + 24, sy + 200 + j * 150, sw - 48, 126, ORDERS[j])

    to_logo = ease((lt - ks - 0.35) / 0.45)
    phone(c, px, ptop, scr, scale=sc, a=1 - to_logo, badge=3, badge_p=1)
    rot = lt * 12
    for k, (ang, kind, word) in enumerate(ORBIT):
        a0 = math.radians(ang + rot)
        R = 360 * (1 - suck)
        x = CENTER7[0] + math.cos(a0) * R
        y = CENTER7[1] + math.sin(a0) * R
        if kind == "qr":
            # el QR de la escena anterior viaja a su lugar en la órbita
            x = lerp(QR_POS[0], x, intro)
            y = lerp(QR_POS[1], y, intro)
            appear = 1
        else:
            appear = back((lt - 0.2 - k * 0.1) / 0.45)
        lit = ease((lt - K_[word]) / 0.3)
        pop = 1 + 0.18 * math.sin(cl((lt - K_[word]) / 0.4) * math.pi)
        s_ = appear * pop * (1 - suck) * (1.0 if kind != "qr" else lerp(1.9, 1.0, intro))
        if s_ > 0.01:
            mini(c, kind, x, y, s_, lit)
    if to_logo > 0:
        logo(c, CENTER7[0], CENTER7[1], 440 * back(to_logo), 1)


# Escena 8 -------------------------------------------------------------
def s8(c, lt, K_, d):
    kt, kg = K_["treinta"], K_["gratis"]
    m = ease_io(lt / 0.7)
    logo(c, 540, lerp(CENTER7[1], 590, m), lerp(440, 240, m), 1)
    cell, gap, cols = 86, 12, 6
    gw = cols * cell + (cols - 1) * gap
    gx, gy = (W - gw) / 2, 880
    appear = ease((lt - 0.4) / 0.4)
    if appear <= 0:
        return
    c.save()
    c.translate(0, (1 - appear) * 60)
    # cabecera del calendario con anillos
    rrect(c, gx - 18, gy - 92, gw + 36, 560, 30)
    src(c, WHITE, 0.10 * appear)
    c.fill()
    rrect(c, gx - 18, gy - 92, gw + 36, 70, 30)
    src(c, BLUE, appear)
    c.fill()
    for rx in (gx + 90, gx + gw - 90):
        rrect(c, rx - 10, gy - 112, 20, 50, 10)
        src(c, WHITE, appear)
        c.fill()
    for n in range(30):
        r_, k_ = divmod(n, cols)
        x = gx + k_ * (cell + gap)
        y = gy + r_ * (cell + gap)
        fill = cl((lt - kt - n * 0.032) / 0.12)
        green = cl((lt - kg - n * 0.012) / 0.15)
        rrect(c, x, y, cell, cell, 16)
        if fill <= 0:
            c.set_line_width(3)
            src(c, WHITE, 0.25 * appear)
            c.stroke()
            continue
        src(c, mix(CELESTE, GREEN, green), fill)
        c.fill()
        if green > 0:
            check(c, x + cell / 2, y + cell / 2, 40, WHITE, green, 7)
        else:
            text(c, str(n + 1), x + cell / 2, y + cell / 2 + 12, 34, F_SB, WHITE, fill)
    c.restore()


DRAW = [s1, s2, s3, s4, s5, s6, s7, s8]


def render(t, total, surf):
    c = cairo.Context(surf)
    background(c, t)
    i = max(j for j, s in enumerate(SCENES) if s["t0"] <= t)
    s = SCENES[i]
    lt = t - s["t0"]
    DRAW[i](c, lt, s["K"], s["dur"])
    # titular: el anterior se va, el nuevo entra
    hin = ease(lt / 0.4)
    if i > 0 and lt < 0.25:
        headline(c, SCENES[i - 1]["head"], 1 - lt / 0.25)
    headline(c, s["head"], hin, (1 - hin) * 40)
    subtitles(c, s, lt)


def main():
    args = sys.argv[1:]
    if "--voz" in args:
        from piper import PiperVoice, SynthesisConfig
        modelo = args[args.index("--voz") + 1]
        VOZ["voice"] = PiperVoice.load(modelo)
        # sin ruido en la duración: tiempos estables entre la frase y sus comienzos
        VOZ["cfg"] = SynthesisConfig(length_scale=0.95, noise_scale=0.5, noise_w_scale=0.0)
        VOZ["sr"] = VOZ["voice"].config.sample_rate
        del args[args.index("--voz"):args.index("--voz") + 2]
    total = build()
    salida = args[0] if args else "reel_v2.mp4"
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    if "--frames" in args:
        carpeta = args[args.index("--frames") + 1]
        os.makedirs(carpeta, exist_ok=True)
        tiempos = args[args.index("--frames") + 2].split(",") if len(args) > args.index("--frames") + 2 else []
        if not tiempos or tiempos == ["fin"]:
            # imagen final de cada escena
            tiempos = [f"{s['t0'] + s['dur'] - 0.05:.2f}" for s in SCENES]
        for tt in tiempos:
            render(float(tt), total, surf)
            surf.write_to_png(os.path.join(carpeta, f"{float(tt):06.2f}.png"))
        for k, s in enumerate(SCENES):
            print(k + 1, f"{s['t0']:.2f}-{s['t0'] + s['dur']:.2f}", {kk: round(float(s['t0'] + v), 2) for kk, v in s["K"].items()})
        return
    audio_in = ["-f", "lavfi", "-t", f"{total:.2f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
    afilt = []
    if VOZ:
        import numpy as np
        import tempfile
        import wave
        sr = VOZ["sr"]
        pista = np.zeros(int((total + 1) * sr), dtype=np.int16)
        for s in SCENES:
            ini = int((s["t0"] + s.get("lead", 0.35)) * sr)
            pista[ini:ini + len(s["audio"])] = s["audio"]
        wav = os.path.join(tempfile.mkdtemp(), "voz.wav")
        with wave.open(wav, "wb") as w_:
            w_.setnchannels(1)
            w_.setsampwidth(2)
            w_.setframerate(sr)
            w_.writeframes(pista.tobytes())
        audio_in = ["-i", wav]
        afilt = ["-af", "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100", "-ac", "2"]
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", *audio_in, *afilt,
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "18",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", salida]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = round(total * FPS)
    for k in range(n):
        render(k / FPS, total, surf)
        surf.flush()
        proc.stdin.write(bytes(surf.get_data()))
    proc.stdin.close()
    proc.wait()
    print(f"Listo: {salida} ({total:.1f} s, {n} cuadros)")


if __name__ == "__main__":
    main()
