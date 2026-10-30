"""The built-in stencil library: original line art drawn in code (SVG), so it is crisp at any size and free to use.

Each STENCILS entry: key (stable id, never change it), title, category, level, cm (suggested real width),
blurb, and draw() -> SVG text. Stencils.ensure_builtin() stores them in the stencils table; bump VERSION
after changing any drawing so live apps pick up the new art.
"""
import math
import random

VERSION = 3
INK = "#1f1c1a"


def svg(w, h, body, sw=None):
    sw = sw or round(max(w, h) / 360.0, 2)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">'
            '<rect width="%d" height="%d" fill="#ffffff"/>'
            '<g fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round">%s</g></svg>'
            % (w, h, w, h, w, h, INK, sw, body))


def f(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


def poly(pts, close=True):
    d = "M" + " L".join("%s,%s" % (f(x), f(y)) for x, y in pts)
    return '<path d="%s%s"/>' % (d, " Z" if close else "")


def line(x1, y1, x2, y2):
    return '<path d="M%s,%s L%s,%s"/>' % (f(x1), f(y1), f(x2), f(y2))


def circle(cx, cy, r, extra=""):
    return '<circle cx="%s" cy="%s" r="%s"%s/>' % (f(cx), f(cy), f(r), extra)


def text(x, y, s, size, anchor="middle", weight=600):
    return ('<text x="%s" y="%s" font-family="Arial, Helvetica, sans-serif" font-size="%s" font-weight="%d" text-anchor="%s" '
            'fill="%s" stroke="none">%s</text>' % (f(x), f(y), f(size), weight, anchor, INK, s))


# ------------------------------------------------------------------------------------------------ botanical
def monstera():
    b = []
    b.append('<path d="M400,770 C215,752 70,590 86,402 C100,236 238,104 400,112 C562,104 700,236 714,402 C730,590 585,752 400,770 Z"/>')
    b.append('<path d="M400,770 C392,560 392,350 402,120"/>')
    b.append('<path d="M400,770 C404,830 420,875 452,905"/>')
    # slits from the edge towards the midrib (each a thin wedge), and the small holes near the rib
    for side in (-1, 1):
        for (ey, iy, w) in ((300, 360, 34), (420, 470, 38), (540, 572, 40), (650, 664, 36)):
            ex = 400 + side * (322 - abs(ey - 430) * 0.42)
            ix = 400 + side * 64
            b.append('<path d="M%s,%s L%s,%s L%s,%s"/>' % (f(ex), f(ey - w / 2), f(ix), f(iy), f(ex), f(ey + w / 2)))
        for (hy, hx) in ((250, 120), (370, 150), (500, 160)):
            b.append('<ellipse cx="%s" cy="%s" rx="17" ry="40" transform="rotate(%d %s %s)"/>'
                     % (f(400 + side * hx), hy, side * 28, f(400 + side * hx), hy))
    # veins between the slits
    for side in (-1, 1):
        for vy in (240, 360, 480, 600, 700):
            x2 = 400 + side * (300 - abs(vy - 430) * 0.5)
            b.append('<path d="M%s,%s Q%s,%s %s,%s"/>' % (f(400 + side * 6), vy + 18, f(400 + side * 150), vy - 12, f(x2), vy - 40))
    return svg(800, 920, "".join(b))


def wildflowers():
    rnd = random.Random(7)
    b = []
    stems = [(250, 1000, 230, 420, "daisy"), (420, 1000, 440, 300, "tulip"), (600, 1000, 640, 470, "daisy"),
             (330, 1000, 300, 640, "bud"), (520, 1000, 520, 650, "bells")]
    for (x0, y0, x1, y1, kind) in stems:
        cx = (x0 + x1) / 2 + rnd.uniform(-40, 40)
        b.append('<path d="M%s,%s Q%s,%s %s,%s"/>' % (x0, y0, f(cx), f((y0 + y1) / 2), x1, y1))
        ly = y0 - (y0 - y1) * 0.45
        lx = x0 + (x1 - x0) * 0.45
        s = rnd.choice((-1, 1))
        b.append('<path d="M%s,%s C%s,%s %s,%s %s,%s C%s,%s %s,%s %s,%s"/>' % (
            f(lx), f(ly), f(lx + s * 40), f(ly - 70), f(lx + s * 110), f(ly - 80), f(lx + s * 140), f(ly - 110),
            f(lx + s * 90), f(ly - 20), f(lx + s * 50), f(ly + 10), f(lx), f(ly)))
        b.append('<path d="M%s,%s Q%s,%s %s,%s"/>' % (f(lx), f(ly), f(lx + s * 70), f(ly - 60), f(lx + s * 130), f(ly - 104)))
        if kind == "daisy":
            for i in range(14):
                a = i * math.tau / 14
                px, py = x1 + math.cos(a) * 62, y1 + math.sin(a) * 62
                b.append('<ellipse cx="%s" cy="%s" rx="40" ry="13" transform="rotate(%s %s %s)"/>'
                         % (f(px), f(py), f(math.degrees(a)), f(px), f(py)))
            b.append(circle(x1, y1, 24))
            for i in range(7):
                a = i * math.tau / 7
                b.append(circle(x1 + math.cos(a) * 11, y1 + math.sin(a) * 11, 2.5))
        elif kind == "tulip":
            b.append('<path d="M%d,%d C%d,%d %d,%d %d,%d C%d,%d %d,%d %d,%d C%d,%d %d,%d %d,%d C%d,%d %d,%d %d,%d Z"/>' % (
                x1, y1, x1 - 70, y1 - 10, x1 - 80, y1 - 120, x1 - 50, y1 - 170, x1 - 30, y1 - 120, x1 - 10, y1 - 110, x1, y1 - 160,
                x1 + 10, y1 - 110, x1 + 30, y1 - 120, x1 + 50, y1 - 170, x1 + 80, y1 - 120, x1 + 70, y1 - 10, x1, y1))
            b.append('<path d="M%d,%d C%d,%d %d,%d %d,%d"/>' % (x1 - 30, y1 - 120, x1 - 20, y1 - 60, x1 + 20, y1 - 60, x1 + 30, y1 - 120))
        elif kind == "bud":
            b.append('<path d="M%d,%d C%d,%d %d,%d %d,%d C%d,%d %d,%d %d,%d Z"/>' % (
                x1, y1, x1 - 40, y1 - 30, x1 - 20, y1 - 90, x1, y1 - 110, x1 + 20, y1 - 90, x1 + 40, y1 - 30, x1, y1))
        else:
            for i in range(4):
                bx, by = x1 + (i % 2) * 60 - 20, y1 + i * 70
                b.append('<path d="M%s,%s Q%s,%s %s,%s"/>' % (x1, by - 20, f((x1 + bx) / 2), by - 40, bx, by))
                b.append('<path d="M%d,%d C%d,%d %d,%d %d,%d L%d,%d L%d,%d L%d,%d L%d,%d C%d,%d %d,%d %d,%d"/>' % (
                    bx - 24, by + 46, bx - 30, by, bx - 18, by - 6, bx, by - 6, bx + 18, by - 6, bx + 30, by, bx + 24, by + 46,
                    bx + 12, by + 36, bx, by + 50, bx - 12, by + 36, bx - 24, by + 46))
    b.append('<path d="M120,1000 L780,1000"/>')
    return svg(900, 1040, "".join(b))


def tree_of_life():
    rnd = random.Random(11)
    b = []

    def branch(x, y, ang, length, width, depth):
        x2, y2 = x + math.cos(ang) * length, y - math.sin(ang) * length
        bend = rnd.uniform(-0.18, 0.18) * length
        mx, my = (x + x2) / 2 + math.sin(ang) * bend, (y + y2) / 2 + math.cos(ang) * bend
        b.append('<path d="M%s,%s Q%s,%s %s,%s" stroke-width="%s"/>' % (f(x), f(y), f(mx), f(my), f(x2), f(y2), f(max(2.4, width))))
        if depth == 0:
            la = math.degrees(-ang) + rnd.uniform(-30, 30)
            b.append('<ellipse cx="%s" cy="%s" rx="22" ry="10" transform="rotate(%s %s %s)" stroke-width="3"/>' % (f(x2), f(y2), f(la), f(x2), f(y2)))
            return
        n = 2
        for i in range(n):
            spread = 0.42 + rnd.uniform(-0.08, 0.1)
            a2 = ang + spread * (i - (n - 1) / 2) * (1.5 if n == 2 else 1) + rnd.uniform(-0.1, 0.1)
            branch(x2, y2, a2, length * rnd.uniform(0.68, 0.8), width * 0.68, depth - 1)

    branch(600, 1080, math.pi / 2, 250, 22, 6)
    # roots
    for i in range(7):
        a = math.pi * (1.1 + i * 0.13)
        x2, y2 = 600 + math.cos(a) * rnd.uniform(160, 300), 1080 - math.sin(a) * rnd.uniform(40, 120)
        b.append('<path d="M600,1080 Q%s,%s %s,%s" stroke-width="6"/>' % (f((600 + x2) / 2), f(1110), f(x2), f(y2)))
    b.append(circle(600, 640, 560, ' stroke-width="4"'))
    return svg(1200, 1220, "".join(b))


# ------------------------------------------------------------------------------------------------ animals
def fox():
    o = [(150, 70), (262, 262), (400, 226), (538, 262), (650, 70), (622, 330), (704, 424), (522, 566), (400, 704),
         (278, 566), (96, 424), (178, 330)]
    b = [poly(o)]
    b.append(poly([(172, 130), (240, 262), (190, 312)]))
    b.append(poly([(628, 130), (560, 262), (610, 312)]))
    for pair in (((96, 424), (400, 560)), ((704, 424), (400, 560)), ((278, 566), (522, 566)), ((262, 262), (330, 400)),
                 ((538, 262), (470, 400)), ((400, 226), (400, 340)), ((330, 400), (400, 340)), ((470, 400), (400, 340)),
                 ((178, 330), (330, 400)), ((622, 330), (470, 400))):
        b.append(line(pair[0][0], pair[0][1], pair[1][0], pair[1][1]))
    for ex in (310, 490):
        s = -1 if ex < 400 else 1
        b.append('<path d="M%d,452 Q%d,420 %d,446 Q%d,470 %d,452 Z"/>' % (ex - 38 * s, ex, ex + 34 * s, ex, ex - 38 * s))
        b.append(circle(ex, 448, 7))
    b.append(poly([(370, 668), (430, 668), (400, 704)]))
    b.append(line(400, 560, 400, 668))
    return svg(800, 760, "".join(b))


def cat():
    b = []
    b.append('<path d="M190,560 C120,520 110,400 190,330 C260,268 400,250 520,280 C640,312 720,400 700,500 C684,580 600,620 480,622 '
             'L250,620 C215,618 196,600 190,560 Z"/>')
    # tail wrapping round the front
    b.append('<path d="M690,520 C720,620 600,680 420,676 C300,674 200,664 170,640 C150,620 170,600 200,610 C260,630 360,640 450,636 '
             'C580,630 650,600 660,540"/>')
    # head resting at the left
    b.append('<path d="M150,540 C110,520 96,470 112,430 C122,404 140,388 160,380 L150,300 L210,352 C240,344 270,346 296,356 '
             'L350,300 L350,388 C372,412 380,450 368,486 C352,532 300,556 240,560 C200,562 172,556 150,540 Z"/>')
    b.append('<path d="M168,330 L196,362 M328,330 L326,376"/>')
    for ex in (190, 290):
        b.append('<path d="M%d,452 Q%d,470 %d,452"/>' % (ex - 24, ex, ex + 24))
    b.append('<path d="M232,490 L248,490 L240,502 Z"/>')
    b.append('<path d="M240,502 Q232,520 216,516 M240,502 Q248,520 264,516"/>')
    for dy in (-12, 4):
        b.append('<path d="M206,%d Q160,%d 116,%d M274,%d Q320,%d 362,%d"/>' % (500 + dy, 494 + dy * 1.6, 500 + dy * 2.4, 500 + dy, 494 + dy * 1.6, 500 + dy * 2.4))
    # stripes along the back
    for i, x in enumerate((420, 480, 540, 600)):
        b.append('<path d="M%d,%d Q%d,%d %d,%d"/>' % (x, 290 + i * 8, x + 14, 330 + i * 6, x - 6, 362 + i * 8))
    b.append('<path d="M120,690 C260,708 560,712 760,690"/>')
    return svg(840, 740, "".join(b))


def dino():
    b = []
    b.append('<path d="M240,560 C210,470 260,380 380,360 C470,345 560,360 620,410 C660,380 690,300 700,220 C706,170 730,130 780,120 '
             'C830,112 870,140 868,180 C866,214 836,226 806,222 C790,270 776,360 740,450 C780,520 900,560 1060,560 '
             'C930,610 760,600 680,580 L670,700 L620,700 L610,600 C560,610 460,612 420,606 L410,700 L360,700 L350,600 '
             'C300,598 260,590 240,560 Z"/>')
    b.append(circle(815, 150, 8))
    b.append('<path d="M840,192 Q852,198 862,190"/>')
    for i in range(6):
        x = 420 + i * 46
        b.append('<path d="M%d,%d q20,-30 40,0"/>' % (x, 366 - (i % 3) * 4))
    for (x, y, r) in ((470, 470, 26), (560, 450, 18), (400, 500, 16), (620, 500, 22)):
        b.append(circle(x, y, r))
    b.append('<path d="M200,700 L1100,700"/>')
    b.append('<path d="M150,700 C160,640 200,600 260,640 M1040,700 C1060,660 1090,650 1120,680"/>')
    return svg(1200, 760, "".join(b))


# ------------------------------------------------------------------------------------------------ patterns
def mandala():
    c = 500
    b = [circle(c, c, r) for r in (60, 110, 300, 450, 470)]
    for i in range(12):
        a = i * 30
        b.append('<g transform="rotate(%d %d %d)">' % (a, c, c) +
                 '<path d="M500,390 C540,330 540,260 500,200 C460,260 460,330 500,390 Z"/>'
                 '<path d="M500,360 C516,320 516,280 500,240"/>' + circle(500, 175, 14) + '</g>')
        b.append('<g transform="rotate(%d %d %d)">' % (a + 15, c, c) +
                 '<path d="M500,300 C580,240 600,120 500,52 C400,120 420,240 500,300 Z"/>' + circle(500, 92, 10) + '</g>')
    for i in range(36):
        a = math.radians(i * 10)
        b.append(circle(c + math.cos(a) * 460, c + math.sin(a) * 460, 4))
    for i in range(8):
        a = i * 45
        b.append('<g transform="rotate(%d %d %d)"><path d="M500,440 L520,500 L500,560 L480,500 Z"/></g>' % (a, c, c))
    for i in range(24):
        a = math.radians(i * 15)
        b.append(line(c + math.cos(a) * 60, c + math.sin(a) * 60, c + math.cos(a) * 110, c + math.sin(a) * 110))
    return svg(1000, 1000, "".join(b))


def waves():
    b = []
    r = 110
    for row in range(0, 12):
        y = row * r / 2 + 40
        off = (row % 2) * r
        for col in range(-1, 7):
            x = col * 2 * r + off
            b.append('<circle cx="%s" cy="%s" r="%s" fill="#ffffff" stroke="none"/>' % (f(x), f(y), f(r)))
            for k in (1.0, 0.75, 0.5, 0.25):
                b.append(circle(x, y, r * k))
    return svg(1200, 560, '<clipPath id="c"><rect width="1200" height="560"/></clipPath><g clip-path="url(#c)">' + "".join(b) + "</g>")


def hexagons():
    b = []
    s = 70
    h = math.sqrt(3) * s
    rnd = random.Random(3)
    for col in range(0, 11):
        for row in range(0, 7):
            cx = 60 + col * 1.5 * s
            cy = 60 + row * h + (h / 2 if col % 2 else 0)
            pts = [(cx + s * math.cos(math.radians(60 * k)), cy + s * math.sin(math.radians(60 * k))) for k in range(6)]
            b.append(poly(pts))
            pick = rnd.random()
            if pick < 0.28:
                b.append(poly([(cx + s * .55 * math.cos(math.radians(60 * k)), cy + s * .55 * math.sin(math.radians(60 * k))) for k in range(6)]))
            elif pick < 0.4:
                b.append(circle(cx, cy, s * 0.35))
    return svg(1260, 1100, '<clipPath id="c"><rect width="1260" height="1100"/></clipPath><g clip-path="url(#c)">' + "".join(b) + "</g>")


def compass():
    c = 500
    b = [circle(c, c, 440), circle(c, c, 420), circle(c, c, 130)]
    for i in range(72):
        a = math.radians(i * 5)
        r2 = 400 if i % 2 else 380
        b.append(line(c + math.cos(a) * 420, c + math.sin(a) * 420, c + math.cos(a) * r2, c + math.sin(a) * r2))
    for i in range(8):
        a = math.radians(i * 45 - 90)
        L = 360 if i % 2 == 0 else 230
        tip = (c + math.cos(a) * L, c + math.sin(a) * L)
        left = (c + math.cos(a - math.pi / 2) * 40, c + math.sin(a - math.pi / 2) * 40)
        right = (c + math.cos(a + math.pi / 2) * 40, c + math.sin(a + math.pi / 2) * 40)
        b.append(poly([left, tip, right, (c, c)]))
        b.append(line(c, c, tip[0], tip[1]))
    for lbl, (x, y) in (("N", (500, 60)), ("E", (948, 512)), ("S", (500, 972)), ("W", (52, 512))):
        b.append(text(x, y + 10, lbl, 54, weight=700))
    return svg(1000, 1040, "".join(b))


# ------------------------------------------------------------------------------------------------ landscapes
def mountains():
    b = []
    b.append(circle(1150, 230, 110))
    for i in range(16):
        a = math.radians(i * 22.5)
        b.append(line(1150 + math.cos(a) * 140, 230 + math.sin(a) * 140, 1150 + math.cos(a) * 185, 230 + math.sin(a) * 185))
    b.append(poly([(0, 560), (180, 380), (300, 470), (520, 220), (700, 430), (820, 340), (1000, 520), (1180, 400), (1400, 600), (1600, 450)], close=False))
    b.append(poly([(470, 280), (520, 220), (580, 300), (548, 290), (520, 320), (500, 296)], close=False))
    b.append(poly([(0, 650), (240, 520), (420, 610), (640, 470), (900, 640), (1130, 540), (1360, 660), (1600, 580)], close=False))
    for x in range(60, 1600, 95):
        hgt = 90 + (x * 37 % 60)
        base = 760
        b.append(poly([(x, base - hgt), (x - 32, base - hgt * 0.45), (x - 14, base - hgt * 0.45), (x - 44, base), (x + 44, base),
                       (x + 14, base - hgt * 0.45), (x + 32, base - hgt * 0.45)]))
    b.append(line(0, 760, 1600, 760))
    for (x, y, w) in ((260, 200, 26), (330, 170, 20), (380, 230, 16)):
        b.append('<path d="M%d,%d q%d,-%d %d,0 q%d,-%d %d,0"/>' % (x - w, y, w / 2, w / 2, w, w / 2, w / 2, w))
    return svg(1600, 800, "".join(b))


def balloons():
    b = []
    for (cx, cy, r, gores) in ((300, 330, 200, 5), (720, 240, 130, 4), (650, 760, 110, 4)):
        top = cy - r
        bot = cy + r * 1.25
        nx = r * 0.35
        b.append('<path d="M%s,%s C%s,%s %s,%s %s,%s C%s,%s %s,%s %s,%s L%s,%s C%s,%s %s,%s %s,%s Z"/>' % (
            f(cx - nx), f(bot), f(cx - r * 1.25), f(cy + r * 0.4), f(cx - r * 1.1), f(top), f(cx), f(top),
            f(cx + r * 1.1), f(top), f(cx + r * 1.25), f(cy + r * 0.4), f(cx + nx), f(bot), f(cx + nx), f(bot),
            f(cx + nx * .5), f(bot + 4), f(cx - nx * .5), f(bot + 4), f(cx - nx), f(bot)))
        for g in range(1, gores):
            t = g / gores
            x = cx - nx + 2 * nx * t
            ctrl = cx - r * 1.05 + 2 * r * 1.05 * t
            b.append('<path d="M%s,%s C%s,%s %s,%s %s,%s"/>' % (f(x), f(bot), f(ctrl), f(cy + r * 0.3), f(ctrl), f(top + 4), f(cx), f(top)))
        b.append('<path d="M%s,%s Q%s,%s %s,%s"/>' % (f(cx - r * 1.1), f(cy - r * 0.05), f(cx), f(cy + r * 0.25), f(cx + r * 1.1), f(cy - r * 0.05)))
        bw, bh = r * 0.42, r * 0.3
        by = bot + r * 0.38
        b.append('<rect x="%s" y="%s" width="%s" height="%s" rx="%s"/>' % (f(cx - bw / 2), f(by), f(bw), f(bh), f(r * 0.04)))
        b.append(line(cx - nx, bot, cx - bw / 2, by))
        b.append(line(cx + nx, bot, cx + bw / 2, by))
        b.append(line(cx - bw / 2, by + bh * .4, cx + bw / 2, by + bh * .4))
    for (x, y, s) in ((120, 820, 1), (900, 520, .7), (420, 1000, .8)):
        b.append('<path d="M%s,%s c%s,-%s %s,-%s %s,0 c%s,-%s %s,0 %s,%s c%s,0 %s,%s %s,%s z"/>' % (
            f(x), f(y), f(10 * s), f(40 * s), f(60 * s), f(40 * s), f(70 * s), f(10 * s), f(50 * s), f(60 * s), f(20 * s), f(20 * s),
            f(-40 * s), f(-80 * s), f(20 * s), f(-140 * s), f(20 * s)))
    return svg(1000, 1120, "".join(b))


def rainbow():
    b = []
    cx, cy = 700, 700
    for r in (520, 450, 380, 310, 240):
        b.append('<path d="M%d,%d A%d,%d 0 0 1 %d,%d"/>' % (cx - r, cy, r, r, cx + r, cy))
    for x in (180, 1220):
        y = 700
        b.append('<path d="M%d,%d L%d,%d A55,55 0 0 0 %d,%d A80,80 0 0 0 %d,%d A60,60 0 0 0 %d,%d A50,50 0 0 0 %d,%d Z"/>' % (
            x - 160, y, x + 160, y, x + 140, y - 80, x + 10, y - 140, x - 100, y - 90, x - 160, y))
    for (x, y) in ((260, 220), (1150, 160), (980, 330), (420, 120)):
        pts = []
        for k in range(10):
            rr = 34 if k % 2 == 0 else 14
            a = math.radians(-90 + k * 36)
            pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
        b.append(poly(pts))
    b.append(line(60, 760, 1340, 760))
    return svg(1400, 800, "".join(b))


# ------------------------------------------------------------------------------------------------ objects
def bicycle():
    b = []
    for cx in (260, 840):
        b.append(circle(cx, 520, 200))
        b.append(circle(cx, 520, 186))
        b.append(circle(cx, 520, 18))
        for i in range(18):
            a = math.radians(i * 20)
            b.append(line(cx, 520, cx + math.cos(a) * 186, 520 + math.sin(a) * 186))
    bb = (500, 540)
    seat = (440, 300)
    head = (760, 280)
    b.append(poly([(260, 520), bb, seat], close=True))
    b.append(poly([bb, (720, 330), seat], close=False))
    b.append(line(720, 330, 840, 520))
    b.append(line(720, 330, head[0], head[1]))
    b.append('<path d="M760,280 C780,240 840,240 860,270"/>')
    b.append('<path d="M392,282 C410,268 480,268 492,282 C470,296 410,296 392,282 Z"/>')
    b.append(line(seat[0], seat[1], 446, 282))
    b.append(circle(bb[0], bb[1], 40))
    b.append(line(bb[0], bb[1], 560, 600))
    b.append('<path d="M536,600 L590,600"/>')
    b.append('<path d="M790,250 L930,250 L910,330 L810,330 Z"/>')
    b.append(line(800, 290, 920, 290))
    for (fx, fy) in ((815, 190), (865, 160), (912, 200)):
        b.append(line(fx, fy + 22, 860, 250))
        b.append(circle(fx, fy, 9))
        for k in range(6):
            a = math.radians(k * 60)
            b.append(circle(fx + math.cos(a) * 20, fy + math.sin(a) * 20, 11))
    b.append(line(40, 722, 1060, 722))
    return svg(1100, 760, "".join(b))


# ------------------------------------------------------------------------------------------------ handy templates
def gallery_wall():
    # real centimetres x10 (1 unit = 1 mm): 240 x 140 cm
    W, H = 2400, 1400
    frames = [(140, 260, 500, 700, "50 x 70"), (700, 200, 400, 500, "40 x 50"), (700, 760, 400, 300, "40 x 30"),
              (1160, 340, 600, 800, "60 x 80"), (1820, 200, 300, 400, "30 x 40"), (1820, 660, 300, 400, "30 x 40")]
    b = []
    for (x, y, w, h, lbl) in frames:
        b.append('<rect x="%d" y="%d" width="%d" height="%d" stroke-dasharray="26 16"/>' % (x, y, w, h))
        nx, ny = x + w / 2, y + 90
        b.append(circle(nx, ny, 16))
        b.append(line(nx - 34, ny, nx + 34, ny))
        b.append(line(nx, ny - 34, nx, ny + 34))
        b.append(text(nx, y + h / 2 + 20, lbl + " cm", 56))
        b.append(text(nx, ny + 74, "nail", 38, weight=400))
    b.append(line(80, 1300, 2320, 1300))
    b.append(text(1200, 1370, "Centre line 145 cm above the floor sits about here", 44, weight=400))
    return svg(W, H, "".join(b), sw=5)


def lettering_guides():
    W, H = 1600, 900
    b = []
    for row in range(4):
        y0 = 60 + row * 210
        for (dy, dash) in ((0, ""), (50, ' stroke-dasharray="14 12"'), (100, ""), (150, ""), (190, ' stroke-dasharray="4 14"')):
            b.append('<path d="M40,%d L1560,%d"%s/>' % (y0 + dy, y0 + dy, dash))
    for x in range(-200, 1700, 90):
        b.append('<path d="M%s,%d L%s,%d" stroke-width="1.6" stroke-dasharray="6 10"/>' % (f(x), 880, f(x + 820 / math.tan(math.radians(55))), 60))
    b.append(text(20, 76, "cap", 18, anchor="start", weight=400))
    return svg(W, H, '<clipPath id="c"><rect x="40" y="40" width="1520" height="840"/></clipPath><g clip-path="url(#c)">' + "".join(b) + "</g>" + text(36, 166, "x", 22, anchor="end"), sw=3)


def growth_chart():
    W, H = 300, 2000  # mm: 30 x 200 cm
    b = ['<rect x="4" y="4" width="292" height="1992" rx="20"/>']
    for cm in range(0, 201):
        y = 2000 - cm * 10
        if cm in (0, 200):
            continue
        w = 120 if cm % 10 == 0 else (70 if cm % 5 == 0 else 40)
        b.append('<path d="M4,%d L%d,%d" stroke-width="%s"/>' % (y, 4 + w, y, 3 if cm % 10 == 0 else 1.6))
        if cm % 10 == 0:
            b.append(text(200, y + 12, str(cm), 38, weight=700))
    return svg(W, H, "".join(b), sw=3)


STENCILS = [
    {"key": "monstera", "title": "Monstera leaf", "category": "Botanical", "level": "Easy", "cm": 70, "draw": monstera,
     "blurb": "One bold leaf with its famous slits. A perfect first trace above a desk or a plant shelf."},
    {"key": "wildflowers", "title": "Wildflower bunch", "category": "Botanical", "level": "Medium", "cm": 80, "draw": wildflowers,
     "blurb": "Daisies, a tulip, a bud and bellflowers on long stems. Lovely along a hallway."},
    {"key": "tree-of-life", "title": "Tree of life", "category": "Botanical", "level": "Detailed", "cm": 150, "draw": tree_of_life,
     "blurb": "A branching tree in a circle, roots and all. A statement mural for a living room."},
    {"key": "fox", "title": "Geometric fox", "category": "Animals", "level": "Easy", "cm": 60, "draw": fox,
     "blurb": "Straight lines only: trace it with a ruler for a crisp low-poly look."},
    {"key": "sleepy-cat", "title": "Sleepy cat", "category": "Animals", "level": "Medium", "cm": 80, "draw": cat,
     "blurb": "A curled-up cat with its tail wrapped round. Cosy above a bed or a reading nook."},
    {"key": "dino", "title": "Friendly dino", "category": "Kids", "level": "Easy", "cm": 140, "draw": dino,
     "blurb": "A long-necked dinosaur for a kid's room. Big shapes, easy to paint in afterwards."},
    {"key": "rainbow", "title": "Rainbow and clouds", "category": "Kids", "level": "Easy", "cm": 140, "draw": rainbow,
     "blurb": "Five arcs, two puffy clouds and some stars. Paint it in with the kids."},
    {"key": "balloons", "title": "Hot-air balloons", "category": "Kids", "level": "Medium", "cm": 90, "draw": balloons,
     "blurb": "Three balloons drifting past little clouds. Works tall, by a window."},
    {"key": "mandala", "title": "Mandala", "category": "Patterns", "level": "Detailed", "cm": 100, "draw": mandala,
     "blurb": "Twelve-fold petals and rings. Great on a wall, a floor or a tabletop."},
    {"key": "waves", "title": "Wave scallops", "category": "Patterns", "level": "Medium", "cm": 160, "draw": waves,
     "blurb": "Rows of overlapping scallops. Repeat it along a whole wall, panel by panel."},
    {"key": "honeycomb", "title": "Honeycomb", "category": "Patterns", "level": "Easy", "cm": 150, "draw": hexagons,
     "blurb": "A hexagon grid with a few accents. Paint some cells in two colours."},
    {"key": "compass", "title": "Compass rose", "category": "Patterns", "level": "Medium", "cm": 90, "draw": compass,
     "blurb": "Eight points and a ring of ticks. Try it on a floor or a garden table."},
    {"key": "mountains", "title": "Mountain range", "category": "Landscapes", "level": "Medium", "cm": 240, "draw": mountains,
     "blurb": "Two ridges, a pine forest and a rising sun. A classic wide mural for a bedroom wall."},
    {"key": "bicycle", "title": "Bicycle with flowers", "category": "Objects", "level": "Medium", "cm": 110, "draw": bicycle,
     "blurb": "A city bike with a basket of blooms. Lovely in an entrance or a café."},
    {"key": "gallery-wall", "title": "Gallery wall planner", "category": "Templates", "level": "Easy", "cm": 240, "draw": gallery_wall,
     "blurb": "Six frames at real size with the nail spots marked. Trace the crosses and hang your frames without guessing."},
    {"key": "lettering-guides", "title": "Lettering guidelines", "category": "Templates", "level": "Easy", "cm": 160, "draw": lettering_guides,
     "blurb": "Cap, x-height, baseline and 55 degree slant lines for hand-painted signs and quotes."},
    {"key": "growth-chart", "title": "Growth chart", "category": "Templates", "level": "Easy", "cm": 30, "draw": growth_chart,
     "blurb": "A true-size 2 m ruler. Place the bottom edge on the floor and trace the ticks on a door frame."},
]
