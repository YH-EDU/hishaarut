#!/usr/bin/env python3
"""Build the נשארים launcher icons from one SVG design.

Maskable art stays inside the center 80% safe zone. The background is always
full bleed so Android's circle and squircle masks do not show a dark edge.
"""

from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons" / "v2"
PREVIEW = Path("/opt/cursor/artifacts")

# Artwork is authored on a 512 canvas. Maskable copies scale it into the
# safe zone; "any" copies keep it large.
ART = """
  <g fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="228" cy="214" r="138" stroke-width="40"/>
    <path d="M228 214 V96" stroke-width="36"/>
    <path d="M228 214 L318 268" stroke-width="36"/>
  </g>
  <circle cx="228" cy="214" r="16" fill="#FFFFFF"/>
  <circle cx="360" cy="352" r="92" fill="#00C853"/>
  <path d="M316 354 L346 386 L410 314" fill="none" stroke="#FFFFFF" stroke-width="28"
        stroke-linecap="round" stroke-linejoin="round"/>
"""


def svg(scale: float) -> str:
    # Scale around the canvas center so the gradient stays full bleed.
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00A3B4"/>
      <stop offset="100%" stop-color="#007285"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale({scale}) translate(-256 -256)">
    {ART}
  </g>
</svg>
"""


def write_svg(path: Path, scale: float) -> None:
    path.write_text(svg(scale), encoding="utf-8")


def png(svg_text: str, size: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(bytestring=svg_text.encode(), write_to=str(path), output_width=size, output_height=size)


def mask(image: Image.Image, kind: str) -> Image.Image:
    size = image.size[0]
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cover = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(cover)
    if kind == "circle":
        draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    else:
        # Squircle-like superellipse via a rounded square with a large radius.
        radius = int(size * 0.28)
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    out.paste(image, (0, 0))
    out.putalpha(cover)
    return out


def preview(any_icon: Image.Image, maskable: Image.Image) -> None:
    from PIL import ImageFont

    PREVIEW.mkdir(parents=True, exist_ok=True)
    width, height = 1200, 720
    canvas = Image.new("RGB", (width, height), (0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    for y in range(height):
        t = y / (height - 1)
        color = (
            int(120 + (64 - 120) * t),
            int(70 + (40 - 70) * t),
            int(190 + (130 - 190) * t),
        )
        draw.line((0, y, width, y), fill=color)

    label_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
    name_font = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoSerifHebrew-Bold.ttf", 36)

    def shadow_paste(icon: Image.Image, box: tuple[int, int]) -> None:
        alpha = icon.getchannel("A")
        shade = Image.new("RGBA", icon.size, (0, 0, 0, 100))
        shadow = Image.new("RGBA", icon.size, (0, 0, 0, 0))
        shadow.paste(shade, (0, 0), alpha)
        canvas.paste(shadow, (box[0] + 6, box[1] + 12), shadow)
        canvas.paste(icon, box, icon)

    def caption(text: str, cx: int, y: int, font: ImageFont.FreeTypeFont) -> None:
        bbox = draw.textbbox((0, 0), text, font=font)
        draw.text((cx - (bbox[2] - bbox[0]) / 2, y), text, font=font, fill=(255, 255, 255))

    def place(icon: Image.Image, cx: int, cy: int, size: int, text: str, font: ImageFont.FreeTypeFont) -> None:
        framed = icon.resize((size, size), Image.Resampling.LANCZOS)
        shadow_paste(framed, (cx - size // 2, cy - size // 2))
        caption(text, cx, cy + size // 2 + 24, font)

    # How it sits on a phone launcher, then the circle and squircle masks.
    place(mask(maskable, "squircle"), 200, 300, 132, "נשארים", name_font)
    place(mask(maskable, "circle"), 600, 300, 300, "circle", label_font)
    place(mask(maskable, "squircle"), 980, 300, 300, "squircle", label_font)
    canvas.save(PREVIEW / "icon-launcher-preview.png")


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    any_svg = svg(0.94)
    mask_svg = svg(0.78)
    write_svg(PUBLIC / "icons" / "icon-any.svg", 0.94)
    write_svg(PUBLIC / "icons" / "icon-maskable.svg", 0.78)
    write_svg(PUBLIC / "favicon.svg", 0.94)

    png(any_svg, 192, ICONS / "icon-192.png")
    png(any_svg, 512, ICONS / "icon-512.png")
    png(mask_svg, 192, ICONS / "icon-maskable-192.png")
    png(mask_svg, 512, ICONS / "icon-maskable-512.png")
    png(any_svg, 180, PUBLIC / "icons" / "apple-touch-icon.png")
    png(any_svg, 32, PUBLIC / "favicon.png")
    png(any_svg, 48, PUBLIC / "favicon-48.png")

    # Keep the in-app logo path current.
    png(any_svg, 192, PUBLIC / "icons" / "icon-192.png")
    png(any_svg, 512, PUBLIC / "icons" / "icon-512.png")
    png(mask_svg, 512, PUBLIC / "icons" / "icon-maskable-512.png")

    any_img = Image.open(ICONS / "icon-512.png").convert("RGBA")
    mask_img = Image.open(ICONS / "icon-maskable-512.png").convert("RGBA")
    preview(any_img, mask_img)
    print("wrote icons")


if __name__ == "__main__":
    main()
