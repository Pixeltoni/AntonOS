#!/usr/bin/env python3
"""Erzeugt die Schrift „AntonLaeufer“ für das Sperrbildschirm-Widget „Läufer“.

Trick: Widgets können nicht animieren, ein Sekunden-Zähler (Text(.., style: .timer)) tickt aber
live weiter. Diese Schrift macht aus dem Zähler ein laufendes Strichmännchen:
  - Doppelpunkte und alle Ziffern vor den Sekunden werden unsichtbar (Breite 0),
  - die beiden Sekunden-Ziffern „00“ bis „59“ werden zu einem von 60 Bildern.
In 60 Sekunden läuft das Männchen einmal nach rechts und wieder zurück.

Aufruf: pip install fonttools && python3 scripts/laeufer-font.py (Baukasten: scripts/sekundenschrift.py)
Schreibt ios/App/AntonOSWidgets/AntonLaeufer.otf
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sekundenschrift import build_font, ccw, circle, segment  # noqa: E402

WIDTH = 2200          # Bildbreite (passt zum rechteckigen Sperrbildschirm-Widget, ca. 2,2 : 1)
GROUND = 40           # Höhe der Bodenlinie
STROKE = 56           # Strichstärke
FIG_HALF = 260        # halbe Breite des Männchens (Rand links/rechts)

OUT = os.path.join(os.path.dirname(__file__), "..", "ios", "App", "AntonOSWidgets", "AntonLaeufer.otf")

# Laufzyklus: 4 Posen, Winkel in Grad gegen die Senkrechte (positiv = nach vorn).
# (Oberschenkel, Unterschenkel) je Bein, (Oberarm, Unterarm) je Arm; jeweils absolut, über 90° zeigt nach oben.
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


def build():
    build_font("AntonLaeufer", frame_contours, os.path.normpath(OUT), WIDTH)


if __name__ == "__main__":
    build()
