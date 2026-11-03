"""Gemeinsamer Baukasten für Sekunden-Schriften (Läufer, Haustier).

Ein Widget-Zähler Text(.., style: .timer) tickt live. Eine solche Schrift
  - versteckt Doppelpunkte und alle Ziffern vor den Sekunden (Breite 0),
  - macht aus den beiden Sekunden-Ziffern „00“ bis „59“ eines von 60 Bildern.
frame_fn(sekunde) liefert die Konturen (Listen von Punkten, gegen den Uhrzeigersinn = gefüllt,
im Uhrzeigersinn = Loch).
"""
import math

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen

UPM = 1000
ASC = 1000
DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]


def area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))


def ccw(pts):
    """Gefüllte Fläche"""
    return pts if area(pts) > 0 else pts[::-1]


def cw(pts):
    """Loch"""
    return pts[::-1] if area(pts) > 0 else pts


def circle(cx, cy, r, n=20):
    return ellipse(cx, cy, r, r, n)


def ellipse(cx, cy, rx, ry, n=28, rot=0.0):
    c, s = math.cos(rot), math.sin(rot)
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n
        x, y = rx * math.cos(a), ry * math.sin(a)
        out.append((cx + x * c - y * s, cy + x * s + y * c))
    return out


def segment(p, q, w):
    """Rechteck um die Strecke p→q"""
    dx, dy = q[0] - p[0], q[1] - p[1]
    d = math.hypot(dx, dy) or 1
    nx, ny = -dy / d * w / 2, dx / d * w / 2
    return ccw([(p[0] - nx, p[1] - ny), (q[0] - nx, q[1] - ny), (q[0] + nx, q[1] + ny), (p[0] + nx, p[1] + ny)])


def stroke(points, w, round_joints=True):
    """Linienzug mit runden Gelenken"""
    out = [segment(points[i], points[i + 1], w) for i in range(len(points) - 1)]
    if round_joints:
        out += [ccw(circle(x, y, w / 2, 12)) for x, y in points]
    return out


def charstring(contours, width):
    pen = T2CharStringPen(width, None)
    for c in contours:
        pen.moveTo(tuple(round(v) for v in c[0]))
        for p in c[1:]:
            pen.lineTo(tuple(round(v) for v in p))
        pen.closePath()
    return pen.getCharString()


def build_font(family, frame_fn, out, width):
    frames = [f"s{t}{u}" for t in range(6) for u in range(10)]
    hidden = [f"{d}.h" for d in DIGITS]
    order = [".notdef", "space", "colon", "period"] + DIGITS + hidden + frames

    empty = charstring([], 0)
    chars = {".notdef": empty, "space": empty, "colon": empty, "period": empty}
    widths = {g: 0 for g in order}
    for d in DIGITS + hidden:
        chars[d] = empty
    for name in frames:
        chars[name] = charstring(frame_fn(int(name[1:])), width)
        widths[name] = width

    fb = FontBuilder(UPM, isTTF=False)
    fb.setupGlyphOrder(order)
    cmap = {0x20: "space", 0x3A: "colon", 0x2E: "period", 0x2236: "colon", 0xA0: "space", 0x202F: "space"}
    cmap.update({0x30 + i: d for i, d in enumerate(DIGITS)})
    fb.setupCharacterMap(cmap)
    fb.setupCFF(f"{family}-Regular", {"FullName": family}, chars, {})
    fb.setupHorizontalMetrics({g: (widths[g], 0) for g in order})
    fb.setupHorizontalHeader(ascent=ASC, descent=0)
    fb.setupNameTable({"familyName": family, "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=ASC, sTypoDescender=0, sTypoLineGap=0, usWinAscent=ASC, usWinDescent=0)
    fb.setupPost()

    tens = "\n".join(f"    sub {DIGITS[t]} @D' by @F{t};" for t in range(6))
    classes = "\n".join(f"@F{t} = [{' '.join(f's{t}{u}' for u in range(10))}];" for t in range(6))
    fea = f"""
@D = [{' '.join(DIGITS)}];
@H = [{' '.join(hidden)}];
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
    fb.save(out)
    print("geschrieben:", out)
