#!/usr/bin/env python3
"""Build the נשארים launcher icons from one SVG design.

"any" art: the clock ring is about 78% of the icon, with a check about 40%
wide overlapping the bottom-right.

Maskable art: the same idea, scaled so the ring reaches the edge of the
center 80% safe circle and the check stays inside that circle. The teal
gradient is always full bleed, so a circle or squircle crop has no dark rim.
"""

import math
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons" / "v3"
PREVIEW = Path("/opt/cursor/artifacts")

CANVAS = 512
SAFE_R = 0.80 * (CANVAS / 2)  # center circle Android promises not to crop


def hand_tip(cx: float, cy: float, length: float, deg: float) -> tuple[float, float]:
    rad = math.radians(deg)
    return cx + length * math.sin(rad), cy - length * math.cos(rad)


def clock(cx: float, cy: float, outer: float, stroke: float, hand: float, hour_deg: float) -> str:
    """White ring and hands. outer is the outside radius of the ring.

    The long hand points at 12. The short hand is hour_deg clockwise from 12,
    chosen so it stays visible beside the check.
    """
    inner = outer - stroke
    gap = max(12.0, stroke * 0.22)
    minute_visual = inner - gap
    hour_visual = minute_visual * 0.56
    minute_len = minute_visual - hand / 2
    hour_len = hour_visual - hand / 2
    mx, my = hand_tip(cx, cy, minute_len, 0)
    hx, hy = hand_tip(cx, cy, hour_len, hour_deg)
    hub = hand * 0.55
    return f"""
  <g fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="{cx:.2f}" cy="{cy:.2f}" r="{outer - stroke / 2:.2f}" stroke-width="{stroke:.2f}"/>
    <path d="M{cx:.2f} {cy:.2f} L{mx:.2f} {my:.2f}" stroke-width="{hand:.2f}"/>
    <path d="M{cx:.2f} {cy:.2f} L{hx:.2f} {hy:.2f}" stroke-width="{hand:.2f}"/>
  </g>
  <circle cx="{cx:.2f}" cy="{cy:.2f}" r="{hub:.2f}" fill="#FFFFFF"/>
"""


def badge(cx: float, cy: float, radius: float) -> str:
    arm = radius * 0.58
    return f"""
  <circle cx="{cx:.2f}" cy="{cy:.2f}" r="{radius:.2f}" fill="#00C853"/>
  <path d="M{cx - arm * 0.55:.2f} {cy + arm * 0.02:.2f} L{cx - arm * 0.08:.2f} {cy + arm * 0.46:.2f} L{cx + arm * 0.70:.2f} {cy - arm * 0.46:.2f}"
        fill="none" stroke="#FFFFFF" stroke-width="{radius * 0.28:.2f}"
        stroke-linecap="round" stroke-linejoin="round"/>
"""


def svg(art: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00A3B4"/>
      <stop offset="100%" stop-color="#007285"/>
    </linearGradient>
  </defs>
  <rect width="{CANVAS}" height="{CANVAS}" fill="url(#bg)"/>
  {art}
</svg>
"""


# Any: ring outer diameter is 400/512 ≈ 78%. Check diameter is 204/512 ≈ 40%.
ANY_CLOCK = (244, 238, 200, 56, 44, 122)
ANY_BADGE = (388, 394, 102)
# Maskable: ring outer radius 198 vs the safe radius 204.8. The check's far
# edge sits about 5px inside that circle, over the lower right of the ring.
# The short hand points down-left so the badge does not cover it.
MASK_CLOCK = (256, 256, 198, 56, 44, 228)
MASK_BADGE = (325, 325, 102)

ANY_ART = clock(*ANY_CLOCK) + badge(*ANY_BADGE)
MASK_ART = clock(*MASK_CLOCK) + badge(*MASK_BADGE)


def png(svg_text: str, size: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(bytestring=svg_text.encode(), write_to=str(path), output_width=size, output_height=size)


def squircle_mask(size: int) -> Image.Image:
    """Superellipse close to a Samsung / iOS squircle."""
    mask = Image.new("L", (size, size), 0)
    pix = mask.load()
    n = 5.0
    radius = (size - 1) / 2
    for y in range(size):
        ny = (y - radius) / radius
        ny_n = abs(ny) ** n
        for x in range(size):
            nx = (x - radius) / radius
            if abs(nx) ** n + ny_n <= 1:
                pix[x, y] = 255
    return mask


def circle_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


def apply_mask(image: Image.Image, kind: str) -> Image.Image:
    size = image.size[0]
    cover = circle_mask(size) if kind == "circle" else squircle_mask(size)
    out = image.convert("RGBA")
    out.putalpha(cover)
    return out


def assert_geometry() -> None:
    any_outer = ANY_CLOCK[2] * 2 / CANVAS
    any_badge = ANY_BADGE[2] * 2 / CANVAS
    if not 0.75 <= any_outer <= 0.80:
        raise SystemExit(f"any clock ring is {any_outer:.1%} of the icon, want 75–80%")
    if not 0.38 <= any_badge <= 0.42:
        raise SystemExit(f"any check is {any_badge:.1%} of the icon, want about 40%")

    content = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}">{MASK_ART}</svg>'
    raw = cairosvg.svg2png(bytestring=content.encode(), output_width=CANVAS, output_height=CANVAS)
    im = Image.open(__import__("io").BytesIO(raw)).convert("RGBA")
    pix = im.load()
    outside = 0
    farthest = 0.0
    cx = cy = CANVAS / 2
    for y in range(CANVAS):
        for x in range(CANVAS):
            if pix[x, y][3] < 20:
                continue
            dist = math.hypot(x - cx, y - cy)
            farthest = max(farthest, dist)
            if dist > SAFE_R + 0.75:
                outside += 1
    if outside:
        raise SystemExit(f"maskable art leaves the safe circle ({outside} px, farthest {farthest:.1f}, safe {SAFE_R:.1f})")
    if farthest < SAFE_R * 0.94:
        raise SystemExit(f"maskable art stops at {farthest:.1f}, short of the safe circle {SAFE_R:.1f}")
    print(f"any ring {any_outer:.1%}, any check {any_badge:.1%}, maskable reaches {farthest:.1f}/{SAFE_R:.1f}")


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def launcher_background(width: int, height: int) -> Image.Image:
    """Color wash in the family of the phone's home-screen wallpaper."""
    img = Image.new("RGB", (width, height))
    pix = img.load()
    top_l, top_r = (98, 42, 132), (196, 86, 118)
    mid_l, mid_r = (52, 148, 108), (58, 92, 176)
    low_l, low_r = (72, 118, 176), (78, 58, 156)
    bot_l, bot_r = (36, 52, 128), (42, 32, 108)
    for y in range(height):
        t = y / (height - 1)
        if t < 0.34:
            u = t / 0.34
            left, right = lerp(top_l, mid_l, u), lerp(top_r, mid_r, u)
        elif t < 0.62:
            u = (t - 0.34) / 0.28
            left, right = lerp(mid_l, low_l, u), lerp(mid_r, low_r, u)
        else:
            u = (t - 0.62) / 0.38
            left, right = lerp(low_l, bot_l, u), lerp(low_r, bot_r, u)
        for x in range(width):
            pix[x, y] = lerp(left, right, x / (width - 1))
    return img


def preview(maskable: Image.Image) -> None:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    width, height = 1280, 760
    canvas = launcher_background(width, height)
    draw = ImageDraw.Draw(canvas)
    name_font = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoSansHebrew-Regular.ttf", 32)
    label_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)

    def shadow_paste(icon: Image.Image, box: tuple[int, int]) -> None:
        alpha = icon.getchannel("A")
        shade = Image.new("RGBA", icon.size, (0, 0, 0, 150))
        shadow = Image.new("RGBA", icon.size, (0, 0, 0, 0))
        shadow.paste(shade, (0, 0), alpha)
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(8, icon.size[0] // 14)))
        canvas.paste(shadow, (box[0] + 8, box[1] + 16), shadow)
        canvas.paste(icon, box, icon)

    def caption(text: str, cx: int, y: int, font: ImageFont.FreeTypeFont) -> None:
        bbox = draw.textbbox((0, 0), text, font=font)
        draw.text((cx - (bbox[2] - bbox[0]) / 2, y), text, font=font, fill=(255, 255, 255))

    def place(kind: str, cx: int, cy: int, size: int, text: str, font: ImageFont.FreeTypeFont) -> None:
        framed = apply_mask(maskable, kind).resize((size, size), Image.Resampling.LANCZOS)
        shadow_paste(framed, (cx - size // 2, cy - size // 2))
        caption(text, cx, cy + size // 2 + 28, font)

    # Home-screen size, then the same maskable art under a circle and a squircle.
    place("squircle", 220, 330, 168, "נשארים", name_font)
    place("circle", 640, 320, 320, "circle", label_font)
    place("squircle", 1060, 320, 320, "squircle", label_font)
    canvas.save(PREVIEW / "icon-launcher-preview.png")


def main() -> None:
    assert_geometry()
    ICONS.mkdir(parents=True, exist_ok=True)
    any_svg = svg(ANY_ART)
    mask_svg = svg(MASK_ART)
    (PUBLIC / "icons" / "icon-any.svg").write_text(any_svg, encoding="utf-8")
    (PUBLIC / "icons" / "icon-maskable.svg").write_text(mask_svg, encoding="utf-8")
    (PUBLIC / "favicon.svg").write_text(any_svg, encoding="utf-8")

    png(any_svg, 192, ICONS / "icon-192.png")
    png(any_svg, 512, ICONS / "icon-512.png")
    png(mask_svg, 192, ICONS / "icon-maskable-192.png")
    png(mask_svg, 512, ICONS / "icon-maskable-512.png")
    png(any_svg, 180, PUBLIC / "icons" / "apple-touch-icon.png")
    png(any_svg, 32, PUBLIC / "favicon.png")
    png(any_svg, 48, PUBLIC / "favicon-48.png")

    # In-app logo uses the unmasked drawing.
    png(any_svg, 192, PUBLIC / "icons" / "icon-192.png")
    png(any_svg, 512, PUBLIC / "icons" / "icon-512.png")
    png(mask_svg, 512, PUBLIC / "icons" / "icon-maskable-512.png")

    mask_img = Image.open(ICONS / "icon-maskable-512.png").convert("RGBA")
    preview(mask_img)
    print("wrote icons")


if __name__ == "__main__":
    main()
