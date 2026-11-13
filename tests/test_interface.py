"""Static checks for the viewer's documented interaction controls and HTML bindings."""
from pathlib import Path
from html.parser import HTMLParser
import re

root = Path(__file__).parents[1] / "viewer"

class ElementParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])

page = ElementParser()
page.feed((root / "index.html").read_text(encoding="utf-8"))
js = (root / "main.js").read_text(encoding="utf-8")
referenced = set(re.findall(r"\$\('([^']+)'\)", js))
assert not referenced.difference(page.ids), sorted(referenced.difference(page.ids))
assert len(page.ids) == len(set(page.ids)), "Duplicate DOM ids"
for snippet in (
    "LEFT: null", "MIDDLE: THREE.MOUSE.PAN", "RIGHT: THREE.MOUSE.ROTATE",
    "function findCabinetGroup", "function pickHit", "function renderMeasure",
    "function updateSelectionStats", "addEventListener('change', invalidate)",
):
    assert snippet in js, snippet
for control in ("adjustX", "adjustY", "adjustZ", "applyPosition", "resetPosition", "scnOverlapList", "positionSource"):
    assert control in page.ids, f"Missing SCN placement interface: {control}"
assert "scnArea" not in page.ids
assert "hideSelected" in page.ids and "hiddenObjectsList" in page.ids and "showAllObjects" in page.ids
assert "function hideSelectedObject" in js and "function refreshHiddenObjects" in js
assert "correctedPosition" in js and "showScnEnvelopeWarnings" in js
print("OK: user controls, pickers, measurement, XYZ placement, render-on-demand, IDs")
