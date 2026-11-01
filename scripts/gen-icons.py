#!/usr/bin/env python3
"""Draw simple green app icons without third-party libraries."""

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public" / "icons"


def write_png(path: Path, size: int, paint) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(paint(x, y, size))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def icon(x: int, y: int, size: int):
    def px(nx: float, ny: float):
        return (x + 0.5) / size, (y + 0.5) / size

    nx, ny = px(x, y)
    # Rounded square.
    inset = 0.08
    radius = 0.18
    inside = inset <= nx <= 1 - inset and inset <= ny <= 1 - inset
    if inside:
        corners = (
            (inset + radius, inset + radius),
            (1 - inset - radius, inset + radius),
            (inset + radius, 1 - inset - radius),
            (1 - inset - radius, 1 - inset - radius),
        )
        for cx, cy in corners:
            dx, dy = abs(nx - 0.5) - (0.5 - inset - radius), abs(ny - 0.5) - (0.5 - inset - radius)
            if dx > 0 and dy > 0 and dx * dx + dy * dy > radius * radius:
                inside = False
    if not inside:
        return (0, 0, 0, 0)
    # Clock face.
    cx, cy, r = 0.50, 0.48, 0.24
    dist = ((nx - cx) ** 2 + (ny - cy) ** 2) ** 0.5
    if dist <= r:
        # Hands: a vertical minute hand and a short hour hand.
        if abs(nx - cx) < 0.018 and cy - r + 0.04 < ny < cy + 0.02:
            return (15, 107, 76, 255)
        if abs(ny - cy) < 0.016 and cx - 0.02 < nx < cx + r - 0.05:
            return (15, 107, 76, 255)
        return (255, 252, 247, 255)
    # Small bar under the clock, suggesting "stay".
    if 0.34 <= nx <= 0.66 and 0.78 <= ny <= 0.84:
        return (255, 214, 150, 255)
    return (15, 107, 76, 255)


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    write_png(ROOT / "icon-192.png", 192, icon)
    write_png(ROOT / "icon-512.png", 512, icon)
    write_png(ROOT / "apple-touch-icon.png", 180, icon)


if __name__ == "__main__":
    main()
