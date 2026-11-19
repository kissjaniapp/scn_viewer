"""Build the Windows .ico from the EXACT SVG also used inside JOB Viewer.

Runs the pinned resvg renderer through Node.js, then packs PNG icon sizes
into Windows ICO without requiring Pillow or external image libraries.
"""
from pathlib import Path
import struct
import subprocess
import shutil

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "installer" / ".icon-sizes"
SIZES = (16, 24, 32, 48, 64, 128, 256)


def main():
    subprocess.run(["node", str(ROOT / "tools" / "render_icon.mjs")], cwd=ROOT, check=True)
    files = [(size, (ICON_DIR / f"{size}.png").read_bytes()) for size in SIZES]
    header = struct.pack("<HHH", 0, 1, len(files))
    directory = bytearray()
    offset = 6 + 16 * len(files)
    for size, blob in files:
        if blob[:8] != b"\\x89PNG\\r\\n\\x1a\\n":
            raise ValueError(f"Nem PNG ikon: {size}")
        directory.extend(struct.pack("<BBBBHHII", size % 256, size % 256,
                                     0, 0, 1, 32, len(blob), offset))
        offset += len(blob)
    ico = ROOT / "installer" / "SCNViewer.ico"
    ico.write_bytes(header + bytes(directory) + b"".join(blob for _, blob in files))
    shutil.rmtree(ICON_DIR, ignore_errors=True)
    print(f"JOB Viewer közös SVG logóból előállított Windows ICO: {ico} ({ico.stat().st_size} bájt)")


if __name__ == "__main__":
    main()
