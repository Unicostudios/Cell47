#!/usr/bin/env python3
"""
Generates the placeholder icon set + app icon + example background.

You do NOT need to run this to build the clock face — the output is committed.
It exists so the placeholder art is reproducible. Replace any file in
resources/ with your own Figma export (same name, same size) at any time.

Metric icons are written as 8-bit GRAYSCALE PNGs (no colour, no alpha).
The Fitbit build converts grayscale PNGs to an alpha mask (A8), so:
    white  = fully opaque, painted with the element's `fill` colour
    black  = fully transparent
That is what lets theme.js recolour icons without new artwork.

Requires: pip install pillow
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..", "resources")
SIZE = 26          # final icon size (px) — matches layout.js NORMAL.slots.icon.size
SS = 8             # supersampling factor for smooth anti-aliased edges


def canvas():
    n = SIZE * SS
    return Image.new("L", (n, n), 0), n


def save(img, name):
    out = img.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(os.path.join(ROOT, "icons", name), optimize=True)


def poly(fn, steps=240):
    return [fn(2 * math.pi * i / steps) for i in range(steps)]


def heart():
    img, n = canvas()
    d = ImageDraw.Draw(img)
    s = n / 36.0

    def pt(t):
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        return (n / 2 + x * s, n / 2 - y * s - s)

    d.polygon(poly(pt), fill=255)
    save(img, "heart.png")


def teardrop(cx, base_y, w, h, m=1.6, lean=0.0):
    """Flame-like teardrop: point at base_y - h, round belly at base_y.
    `lean` bends the tip sideways (fraction of h) so it reads as a flame."""
    def pt(t):
        x = w * math.sin(t) * (abs(math.sin(t / 2)) ** m)
        y = -(1 + math.cos(t)) / 2  # t=0 → -1 (tip), t=pi → 0 (bottom)
        return (cx + x + lean * h * (-y) ** 3, base_y + y * h)
    return poly(pt)


def calories():
    img, n = canvas()
    d = ImageDraw.Draw(img)
    d.polygon(teardrop(n * 0.46, n * 0.98, n * 0.46, n * 0.96, lean=0.16), fill=255)
    d.polygon(teardrop(n * 0.47, n * 0.90, n * 0.19, n * 0.42, lean=-0.10), fill=0)
    save(img, "calories.png")


def steps():
    # Side-view sneaker silhouette, toe to the right.
    img, n = canvas()
    d = ImageDraw.Draw(img)
    upper = [(0.06, 0.40), (0.08, 0.20), (0.30, 0.18), (0.40, 0.34), (0.60, 0.44),
             (0.82, 0.50), (0.94, 0.60), (0.96, 0.70), (0.06, 0.70)]
    d.polygon([(x * n, y * n) for x, y in upper], fill=255)
    d.rounded_rectangle([0.04 * n, 0.74 * n, 0.97 * n, 0.86 * n], radius=0.05 * n, fill=255)
    for i in range(3):  # lace notches
        x = (0.44 + i * 0.10) * n
        d.line([(x, (0.36 + i * 0.05) * n), (x + 0.06 * n, (0.48 + i * 0.05) * n)], fill=0, width=int(0.04 * n))
    save(img, "steps.png")


def azm():
    img, n = canvas()
    d = ImageDraw.Draw(img)
    pts = [(0.58, 0.02), (0.18, 0.56), (0.46, 0.56), (0.38, 0.98), (0.82, 0.40), (0.54, 0.40)]
    d.polygon([(x * n, y * n) for x, y in pts], fill=255)
    save(img, "azm.png")


def distance():
    img, n = canvas()
    d = ImageDraw.Draw(img)
    r = n * 0.3
    cx, cy = n * 0.5, n * 0.36
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    d.polygon([(cx - r * 0.86, cy + r * 0.5), (cx + r * 0.86, cy + r * 0.5), (cx, n * 0.98)], fill=255)
    hr = r * 0.42
    d.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=0)
    save(img, "distance.png")


def floors():
    img, n = canvas()
    d = ImageDraw.Draw(img)
    u = n / 4.0
    pts = [(0, n), (0, 3 * u), (u, 3 * u), (u, 2 * u), (2 * u, 2 * u), (2 * u, u),
           (3 * u, u), (3 * u, 0), (n, 0), (n, n)]
    inset = n * 0.06
    pts = [(min(max(x, inset), n - inset), min(max(y, inset), n - inset)) for x, y in pts]
    d.polygon(pts, fill=255)
    save(img, "floors.png")


def radial_glow(w, h, cx, cy, radius, inner, outer):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = min(1.0, math.hypot(x - cx, y - cy) / radius)
            t = t * t * (3 - 2 * t)  # smoothstep
            px[x, y] = tuple(int(inner[i] + (outer[i] - inner[i]) * t) for i in range(3))
    return img


def app_icon():
    # 80×80 colour icon shown in the Fitbit app's clock-face list.
    n = 80 * SS
    img = radial_glow(80, 80, 52, 34, 70, (43, 95, 100), (2, 4, 5)).resize((n, n), Image.BICUBIC)
    d = ImageDraw.Draw(img)
    # two bold bars = abstract "time" block, one thin bar = metric row
    d.rounded_rectangle([n * 0.18, n * 0.30, n * 0.82, n * 0.52], radius=n * 0.04, fill=(255, 255, 255))
    d.rounded_rectangle([n * 0.18, n * 0.18, n * 0.48, n * 0.24], radius=n * 0.02, fill=(216, 228, 229))
    for i, cx in enumerate((0.26, 0.5, 0.74)):
        d.rounded_rectangle([n * (cx - 0.08), n * 0.66, n * (cx + 0.08), n * 0.70],
                            radius=n * 0.02, fill=(191, 228, 231) if i != 1 else (90, 110, 112))
    img.resize((80, 80), Image.LANCZOS).save(os.path.join(ROOT, "icon.png"), optimize=True)


def background():
    # Example raster background (only used if theme.BACKGROUND.type = "image").
    img = radial_glow(336, 336, 214, 150, 250, (43, 95, 100), (2, 4, 5))
    img = img.filter(ImageFilter.GaussianBlur(1))
    img.save(os.path.join(ROOT, "bg", "background.jpg"), quality=88, optimize=True)


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "icons"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "bg"), exist_ok=True)
    heart(); calories(); steps(); azm(); distance(); floors()
    app_icon(); background()
    print("icons written to", os.path.abspath(ROOT))
