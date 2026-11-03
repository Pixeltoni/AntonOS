#!/usr/bin/env python3
"""Erzeugt die Schrift „AntonLaeufer“ für das Sperrbildschirm-Widget „Läufer“.

Trick: Widgets können nicht animieren, ein Sekunden-Zähler (Text(.., style: .timer)) tickt aber
live weiter. Diese Schrift macht aus dem Zähler ein laufendes Strichmännchen:
  - Doppelpunkte und alle Ziffern vor den Sekunden werden unsichtbar (Breite 0),
  - die beiden Sekunden-Ziffern „00“ bis „59“ werden zu einem von 60 Bildern.
In 60 Sekunden läuft das Männchen einmal nach rechts und wieder zurück.

Aufruf: pip install fonttools && python3 scripts/laeufer-font.py
Schreibt ios/App/AntonOSWidgets/AntonLaeufer.otf
"""
import math
import os

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen

UPM = 1000
WIDTH = 2200          # Bildbreite (passt zum rechteckigen Sperrbildschirm-Widget, ca. 2,2 : 1)
ASC = 1000
GROUND = 40           # Höhe der Bodenlinie
STROKE = 56           # Strichstärke
FIG_HALF = 260        # halbe Breite des Männchens (Rand links/rechts)

DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
OUT = os.path.join(os.path.dirname(__file__), "..", "ios", "App", "AntonOSWidgets", "AntonLaeufer.otf")

# Laufzyklus: 4 Posen, Winkel in Grad gegen die Senkrechte (positiv = nach vorn).
# (Oberschenkel, Unterschenkel) je Bein, jeweils absolut; über 90° zeigt nach oben., (Oberarm, Unterarm) je Arm.
POSES = [
    # Aufsetzen: vorderes Bein streckt sich, hinteres Bein angewinkelt
    dict(legs=[(32, 12), (-28, -75)], arms=[(-40, 20), (45, 115)]),
    # Durchgang: Standbein senkrecht, Knie kommt nach vorn
    dict(legs=[(2, -6), (35, -50)], arms=[(-5, 70), (10, 70)]),
    # Abdruck: Standbein schiebt nach hinten, Knie hoch
    dict(legs=[(-30, -25), (65, 5)], arms=[(45, 115), (-40, 20)]),
    # Flug: beide Beine in der Luft
    dict(lift=35, legs=[(-15, -80), (50, 25)], arms=[(30, 100), (-30, 30)]),
]
THIGH, SHIN, UPPER, LOWER = 215, 215, 150, 145
TORSO, LEAN, HEAD_R = 270, 14, 80


def polar(origin, angle, length, up=False):
    """Punkt von origin aus, Winkel gegen die Senkrechte (nach unten bzw. oben)."""
    a = math.radians(angle)
    dy = length * math.cos(a)
    return (origin[0] + length * math.sin(a), origin[1] + (dy if up else -dy))


def circle(cx, cy, r, n=20):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def segment(p, q, w):
    """Rechteck um die Strecke p→q, gegen den Uhrzeigersinn."""
    dx, dy = q[0] - p[0], q[1] - p[1]
    d = math.hypot(dx, dy) or 1
    nx, ny = -dy / d * w / 2, dx / d * w / 2
    pts = [(p[0] - nx, p[1] - ny), (q[0] - nx, q[1] - ny), (q[0] + nx, q[1] + ny), (p[0] + nx, p[1] + ny)]
    return ccw(pts)


def ccw(pts):
    area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    return pts if area > 0 else pts[::-1]


def figure(x, pose, facing):
    """Konturen eines Männchens, Hüfte bei x; facing = 1 (rechts) oder -1 (links)."""
    f = lambda a: a * facing
    # Hüfthöhe so wählen, dass der tiefste Fuß den Boden berührt
    def legs_at(hip):
        out = []
        for thigh, shin in pose["legs"]:
            knee = polar(hip, f(thigh), THIGH)
            out.append((hip, knee, polar(knee, f(shin), SHIN)))
        return out
    probe = legs_at((x, 0))
    hip_y = GROUND + STROKE / 2 - min(foot[1] for _, _, foot in probe) + pose.get("lift", 0)
    hip = (x, hip_y)
    neck = polar(hip, f(LEAN), TORSO, up=True)
    head = polar(neck, f(LEAN), HEAD_R + 30, up=True)
    shoulder = polar(hip, f(LEAN), TORSO - 30, up=True)

    lines = [(hip, neck)]
    for h, knee, foot in legs_at(hip):
        lines += [(h, knee), (knee, foot)]
        # kurzer Fuß nach vorn
        lines.append((foot, (foot[0] + 45 * facing, foot[1] + 5)))
    for upper, lower in pose["arms"]:
        elbow = polar(shoulder, f(upper), UPPER)
        lines += [(shoulder, elbow), (elbow, polar(elbow, f(lower), LOWER))]

    contours = [ccw(circle(head[0], head[1], HEAD_R))]
    joints = set()
    for p, q in lines:
        contours.append(segment(p, q, STROKE))
        joints.update([p, q])
    contours += [ccw(circle(px, py, STROKE / 2, 12)) for px, py in joints]
    return contours


def frame_contours(sec):
    # 0–29: nach rechts, 30–59: zurück nach links
    span = WIDTH - 2 * FIG_HALF
    if sec < 30:
        x, facing = FIG_HALF + span * sec / 29, 1
    else:
        x, facing = WIDTH - FIG_HALF - span * (sec - 30) / 29, -1
    contours = figure(x, POSES[sec % 4], facing)
    contours.append(ccw([(0, GROUND - 14), (WIDTH, GROUND - 14), (WIDTH, GROUND + 0), (0, GROUND + 0)]))
    return contours


def charstring(contours, width):
    pen = T2CharStringPen(width, None)
    for c in contours:
        pen.moveTo(tuple(round(v) for v in c[0]))
        for p in c[1:]:
            pen.lineTo(tuple(round(v) for v in p))
        pen.closePath()
    return pen.getCharString()


def build():
    frames = [f"s{t}{u}" for t in range(6) for u in range(10)]
    hidden = [f"{d}.h" for d in DIGITS]
    order = [".notdef", "space", "colon", "period"] + DIGITS + hidden + frames

    empty = charstring([], 0)
    chars = {".notdef": charstring([], 0), "space": empty, "colon": empty, "period": empty}
    widths = {g: 0 for g in order}
    for d in DIGITS + hidden:
        chars[d] = empty
    for name in frames:
        chars[name] = charstring(frame_contours(int(name[1:])), WIDTH)
        widths[name] = WIDTH

    fb = FontBuilder(UPM, isTTF=False)
    fb.setupGlyphOrder(order)
    cmap = {0x20: "space", 0x3A: "colon", 0x2E: "period", 0x2236: "colon", 0xA0: "space", 0x202F: "space"}
    cmap.update({0x30 + i: d for i, d in enumerate(DIGITS)})
    fb.setupCharacterMap(cmap)
    fb.setupCFF("AntonLaeufer-Regular", {"FullName": "AntonLaeufer"}, chars, {})
    fb.setupHorizontalMetrics({g: (widths[g], 0) for g in order})
    fb.setupHorizontalHeader(ascent=ASC, descent=0)
    fb.setupNameTable({"familyName": "AntonLaeufer", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=ASC, sTypoDescender=0, sTypoLineGap=0, usWinAscent=ASC, usWinDescent=0)
    fb.setupPost()

    digits = " ".join(DIGITS)
    hid = " ".join(hidden)
    tens = "\n".join(f"    sub {DIGITS[t]} @D' by @F{t};" for t in range(6))
    classes = "\n".join(f"@F{t} = [{' '.join(f's{t}{u}' for u in range(10))}];" for t in range(6))
    fea = f"""
@D = [{digits}];
@H = [{hid}];
{classes}
@F = [@F0 @F1 @F2 @F3 @F4 @F5];
# 1. Ziffern vor einem Doppelpunkt verstecken (Stunden, Minuten)
lookup verstecken {{
    sub @D' [colon period] by @H;
    sub @D' @D [colon period] by @H;
}} verstecken;
# 2. Einer der Sekunden wird zum Bild (je nach Zehner davor)
lookup bild {{
{tens}
}} bild;
# 3. Zehner der Sekunden verstecken
lookup zehner {{
    sub @D' @F by @H;
}} zehner;
feature ccmp {{ lookup verstecken; lookup bild; lookup zehner; }} ccmp;
feature rlig {{ lookup verstecken; lookup bild; lookup zehner; }} rlig;
feature calt {{ lookup verstecken; lookup bild; lookup zehner; }} calt;
feature liga {{ lookup verstecken; lookup bild; lookup zehner; }} liga;
"""
    addOpenTypeFeaturesFromString(fb.font, fea)
    fb.save(OUT)
    print("geschrieben:", os.path.normpath(OUT))


if __name__ == "__main__":
    build()
