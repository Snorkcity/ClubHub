"""Render the approved vector mark to PNGs using ImageMagick (magick)."""

from copy import deepcopy
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "artifacts/clubhub/public"
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)


def render(svg: bytes, destination: str, size: int) -> None:
    subprocess.run(
        [
            "magick", "-background", "none", "-density", "768", "svg:-",
            "-resize", f"{size}x{size}", "-strip", f"PNG32:{PUBLIC / destination}",
        ],
        input=svg,
        check=True,
    )
    print(f"{destination}: {size}x{size}")


def app_icon(maskable: bool = False) -> bytes:
    mark = ET.parse(PUBLIC / "logo.svg").getroot()
    icon = ET.Element(f"{{{NS}}}svg", {"viewBox": "0 0 80 80", "fill": "none"})
    ET.SubElement(icon, f"{{{NS}}}rect", {
        "width": "80", "height": "80", "fill": "#F7F9FC",
    })
    # Keep the entire symbol inside the maskable icon's central safe circle.
    group = ET.SubElement(icon, f"{{{NS}}}g", {
        "transform": "translate(8 8) scale(0.8)" if maskable else "translate(0 0)",
    })
    for path in mark.findall(f"{{{NS}}}path"):
        group.append(deepcopy(path))
    return ET.tostring(icon)


if __name__ == "__main__":
    render((PUBLIC / "favicon.svg").read_bytes(), "favicon.png", 64)
    for destination, size in [
        ("apple-touch-icon.png", 180),
        ("icons/icon-192.png", 192),
        ("icons/icon-512.png", 512),
    ]:
        render(app_icon(), destination, size)
    render(app_icon(maskable=True), "icons/icon-512-maskable.png", 512)
    render((PUBLIC / "icons/notification-badge.svg").read_bytes(), "icons/notification-badge.png", 96)
