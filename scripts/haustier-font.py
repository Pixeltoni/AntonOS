#!/usr/bin/env python3
"""Erzeugt die Schriften für das Widget „Haustier“ (Knubbel).

Je Laune eine Schrift mit 60 Bildern (eins pro Sekunde, siehe sekundenschrift.py):
  AntonTierNormal  – bummelt hin und her, blinzelt
  AntonTierFroh    – hüpft hin und her, strahlt
  AntonTierParty   – tanzt, Noten fliegen, Sterne funkeln (Ringe zu / alles erledigt)
  AntonTierTraurig – sitzt unter einer Regenwolke, eine Träne kullert
  AntonTierSchlaf  – liegt und schnarcht, Zs steigen auf, Mond
Aufruf: pip install fonttools && python3 scripts/haustier-font.py
Schreibt ios/App/AntonOSWidgets/AntonTier*.otf
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sekundenschrift import build_font, ccw, circle, cw, ellipse  # noqa: E402

WIDTH = 2200
GROUND = 40
OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "ios", "App", "AntonOSWidgets"))

RX, RY = 260, 220     # Körper
FOOT = 70             # Höhe der Füße
MARGIN = 330          # Abstand der Körpermitte zum Rand


def band(points, w):
    """Ein einziges Vieleck um einen Linienzug (für Löcher, die sich nicht überlappen dürfen)."""
    left, right = [], []
    n = len(points)
    for i, (x, y) in enumerate(points):
        a = points[max(i - 1, 0)]
        b = points[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1
        nx, ny = -dy / d * w / 2, dx / d * w / 2
        left.append((x + nx, y + ny))
        right.append((x - nx, y - ny))
    return left + right[::-1]


def arc(cx, cy, rx, ry, a0, a1, n=10):
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def walk_x(sec):
    """0–29 nach rechts, 30–59 zurück; liefert (x, Blickrichtung)"""
    span = WIDTH - 2 * MARGIN
    if sec < 30:
        return MARGIN + span * sec / 29, 1
    return WIDTH - MARGIN - span * (sec - 30) / 29, -1


def knubbel(x, lift=0, sx=1.0, sy=1.0, rot=0.0, look=0, eyes="open", mouth="smile",
            feet="stand", step=0, arms=None, tear=None, ears=True):
    """Konturen des Haustiers. Körpermitte bei x, Füße auf dem Boden (+ lift)."""
    rx, ry = RX * sx, RY * sy
    cy = GROUND + FOOT * 0.6 + ry + lift
    out = []
    # Füße
    if feet == "stand":
        off = [(-1, 12 * step), (1, -12 * step)]
        for side, dy in off:
            out.append(ccw(ellipse(x + side * rx * 0.45, GROUND + FOOT / 2 + lift + max(dy, 0), 70, FOOT / 2, 16)))
    elif feet == "lie":
        for side in (-1, 1):
            out.append(ccw(ellipse(x + side * rx * 0.85, GROUND + 30, 60, 30, 14)))
    # Körper
    c, s = math.cos(rot), math.sin(rot)

    def P(px, py):
        """Punkt relativ zur Körpermitte, mitgedreht"""
        return (x + px * c - py * s, cy + px * s + py * c)

    out.append(ccw(ellipse(x, cy, rx, ry, 40, rot)))
    # Ohren
    if ears:
        for side in (-1, 1):
            base = [P(side * rx * 0.28, ry * 0.80), P(side * rx * 0.68, ry * 0.55), P(side * rx * 0.62, ry * 1.25)]
            out.append(ccw(base))
    # Arme
    if arms:
        for side, ang in zip((-1, 1), arms):
            sh = P(side * rx * 0.92, ry * 0.05)
            tip = (sh[0] + side * 150 * math.cos(math.radians(ang)), sh[1] + 150 * math.sin(math.radians(ang)))
            out.append(ccw(band([sh, tip], 56)))
            out.append(ccw(circle(tip[0], tip[1], 34, 14)))
    # Gesicht (Löcher)
    ex, ey = rx * 0.34, ry * 0.22
    for side in (-1, 1):
        cx_, cy_ = P(side * ex + look * 22, ey)
        if eyes == "open":
            out.append(cw(ellipse(cx_, cy_, 40, 52, 18)))
            out.append(ccw(circle(cx_ + look * 12, cy_ - 8, 20, 12)))  # Pupille
        elif eyes == "closed":   # schlafend: Bogen nach unten
            out.append(cw(band(arc(cx_, cy_ + 10, 38, 22, 200, 340), 18)))
        elif eyes == "happy":    # ^ ^
            out.append(cw(band(arc(cx_, cy_ - 14, 38, 34, 20, 160), 20)))
        elif eyes == "sad":      # halb geschlossen, hängend
            out.append(cw(ellipse(cx_, cy_ - 12, 36, 26, 16)))
            out.append(ccw(circle(cx_, cy_ - 18, 15, 10)))
            brow = [(cx_ - side * 50, cy_ + 48), (cx_ + side * 40, cy_ + 72)]
            out.append(ccw(band(brow, 18)))
    mx, my = P(look * 18, -ry * 0.22)
    if mouth == "smile":
        out.append(cw(band(arc(mx, my + 30, 70, 50, 205, 335), 20)))
    elif mouth == "big":         # offenes Lachen
        pts = arc(mx, my + 20, 80, 75, 180, 360, 14)
        out.append(cw(pts))
    elif mouth == "frown":
        out.append(cw(band(arc(mx, my - 50, 60, 40, 30, 150), 20)))
    elif mouth == "o":
        out.append(cw(ellipse(mx, my, 22, 26, 12)))
    elif mouth == "snore":
        out.append(cw(ellipse(mx, my + 10, 30, 18, 12)))
    if tear is not None:         # Träne rutscht von 0 (Auge) bis 1 (Kinn)
        tx, ty = P(-ex - 10, ey - 70 - tear * (ry * 0.75))
        out.append(cw(drop(tx, ty, 22)))
    return out


def drop(x, y, r):
    """Tropfen mit Spitze nach oben"""
    bottom = [(x + r * math.cos(math.radians(a)), y + r * math.sin(math.radians(a))) for a in range(-180, 1, 20)]
    return bottom + [(x + r * 0.7, y + r * 0.9), (x, y + r * 2.5), (x - r * 0.7, y + r * 0.9)]


def ground():
    return [ccw([(0, GROUND - 16), (WIDTH, GROUND - 16), (WIDTH, GROUND), (0, GROUND)])]


def note(x, y, s=1.0):
    head = ccw(ellipse(x, y, 44 * s, 32 * s, 16, 0.4))
    stem = ccw([(x + 34 * s, y + 8 * s), (x + 52 * s, y + 8 * s), (x + 52 * s, y + 170 * s), (x + 34 * s, y + 170 * s)])
    flag = ccw([(x + 52 * s, y + 170 * s), (x + 52 * s, y + 130 * s), (x + 110 * s, y + 90 * s), (x + 100 * s, y + 130 * s)])
    return [head, stem, flag]


def star(x, y, r):
    pts = []
    for i in range(8):
        a = math.pi / 2 + i * math.pi / 4
        rr = r if i % 2 == 0 else r * 0.3
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    return [ccw(pts)]


def zed(x, y, s):
    w, h, t = 90 * s, 100 * s, 22 * s
    return [ccw([(x, y + h), (x + w, y + h), (x + w, y + h - t), (x + t * 1.4, y + t), (x + w, y + t), (x + w, y), (x, y), (x, y + t), (x + w - t * 1.4, y + h - t), (x, y + h - t)])]


def moon(x, y, r):
    outer = [(x + r * math.cos(math.radians(a)), y + r * math.sin(math.radians(a))) for a in range(60, 301, 12)]
    inner = [(x + r * 0.45 + r * 0.8 * math.cos(math.radians(a)), y + r * 0.8 * math.sin(math.radians(a))) for a in range(235, 124, -12)]
    return [ccw(outer + inner)]


def cloud(x, y):
    return [ccw(circle(x + dx, y + dy, r, 20)) for dx, dy, r in [(-130, 0, 85), (0, 40, 115), (130, 0, 90), (0, -20, 95)]]


# ---------- Launen ----------

def normal(t):
    x, d = walk_x(t)
    blink = t % 10 == 7
    look = 0 if t % 15 in (5, 6) else d
    return ground() + knubbel(x, lift=15 if t % 2 else 0, look=look, eyes="closed" if blink else "open",
                              mouth="o" if t % 15 == 6 else "smile", step=1 if t % 2 else -1)


def froh(t):
    x, d = walk_x(t)
    air = t % 2 == 1
    return ground() + knubbel(x, lift=170 if air else 0, sx=0.94 if air else 1.08, sy=1.08 if air else 0.9,
                              look=d, eyes="happy" if t % 6 < 3 else "open", mouth="big",
                              arms=(60, 60) if air else (-20, -20), feet="stand")


def party(t):
    x = WIDTH / 2
    phase = t % 4
    rot = {0: 0.0, 1: 0.2, 2: 0.0, 3: -0.2}[phase]
    lift = 120 if phase in (0, 2) and t % 8 < 4 else 0
    arms = [(70, 20), (40, 70), (20, 80), (70, 40)][phase]
    out = ground() + knubbel(x + {0: 0, 1: 60, 2: 0, 3: -60}[phase], lift=lift, rot=rot,
                             eyes="happy", mouth="big", arms=arms, step=1 if phase % 2 else -1)
    # Noten steigen links und rechts auf
    for k, side in enumerate((-1, 1, -1, 1)):
        p = ((t + k * 3) % 6) / 6
        nx = x + side * (480 + 160 * p) + (k // 2) * side * 220
        out += note(nx, 260 + 580 * p, 0.9 - 0.3 * p)
    # Sterne funkeln
    spots = [(160, 820), (520, 900), (1680, 880), (2050, 760), (1150, 950), (330, 560), (1900, 520)]
    for i, (sx_, sy_) in enumerate(spots):
        if (t + i) % 3 != 0:
            out += star(sx_, sy_, 46 if (t + i) % 3 == 1 else 30)
    return out


def traurig(t):
    sway = math.sin(2 * math.pi * t / 20) * 40
    x = WIDTH * 0.42 + sway
    tear = (t % 6) / 5
    out = ground() + knubbel(x, sx=1.04, sy=0.92, eyes="sad", mouth="frown", tear=tear if t % 6 != 5 else None)
    # Regenwolke über dem Kopf, Tropfen fallen
    cxl, cyl = x + 30, 860
    out += cloud(cxl, cyl)
    for k in range(5):
        dx = -180 + k * 90
        fall = ((t * 2 + k * 3) % 6) / 6
        y = cyl - 140 - fall * 230
        if y > GROUND + FOOT + RY * 2.0 + 30:
            out.append(ccw(drop(cxl + dx, y, 16)))
    return out


def schlaf(t):
    x = WIDTH * 0.40
    breath = 1.0 if t % 4 < 2 else 1.07
    out = ground() + knubbel(x, sx=1.15, sy=0.72 * breath, eyes="closed", mouth="snore" if t % 4 < 2 else "o",
                             feet="lie", ears=True)
    for k in range(3):
        p = ((t + k * 2) % 6) / 6
        out += zed(x + 260 + p * 420 + k * 20, 430 + p * 400, 0.6 + p * 0.8)
    out += moon(2020, 800, 120)
    if t % 3 == 0:
        out += star(1700, 930, 30)
    if t % 5 == 2:
        out += star(2100, 520, 26)
    return out


MOODS = {"AntonTierNormal": normal, "AntonTierFroh": froh, "AntonTierParty": party,
         "AntonTierTraurig": traurig, "AntonTierSchlaf": schlaf}

if __name__ == "__main__":
    for family, fn in MOODS.items():
        build_font(family, fn, os.path.join(OUT_DIR, f"{family}.otf"), WIDTH)
