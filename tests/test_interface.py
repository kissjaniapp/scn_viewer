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
assert ".skp" in (root / "index.html").read_text(encoding="utf-8")
assert "decodeSkpToGlb" in js
assert "correctedPosition" in js and "showScnEnvelopeWarnings" in js
print("OK: user controls, pickers, measurement, XYZ placement, render-on-demand, IDs")

# Drafting measurements use a world-anchored SVG overlay, not large 3D spheres.
assert "function renderDimensionOverlay()" in js
assert "document.createElementNS('http://www.w3.org/2000/svg', 'svg')" in js
assert "renderDimensionOverlay();" in js
assert "new THREE.SphereGeometry(r" not in js
assert "cornerDist=8,edgeDist=7" in js
assert "JOB Viewer" in (root / "index.html").read_text(encoding="utf-8")

# CAD-style snap target and measurement mode regressions.
html = (root / "index.html").read_text(encoding="utf-8")
assert 'id="showAxes" checked' not in html
assert 'id="measureMode"' in html and 'value="ortho"' in html
assert 'function pickFeature(event)' in js
assert 'new THREE.EdgesGeometry(geo,1)' in js
assert 'function measurementAxis()' in js and 'function measuredDistance()' in js
assert "addEventListener('pointermove'" in js
assert 'hoveredSnap.type' in js

# Welcome area opens the same file picker as the toolbar.
assert 'for="fileInput" class="start-open"' in html
assert 'Nyisson meg egy fájlt!' in html
assert 'Nyiss meg egy SCN fájlt' not in html

# Multiple measurements keep their own points/mode, can be removed independently,
# and the PNG includes an SVG annotation layer composited over WebGL pixels.
for control in ("freezeMeasure", "clearSavedMeasures", "savedMeasureList", "exportPng"):
    assert control in html and control in js, control
assert "savedMeasures.push({" in js
assert "points:snapPoints.map(p=>p.clone())" in js
assert "savedMeasures.splice(index,1)" in js
assert "savedMeasures = [];" in js
assert "drawDimension(add, width, height, item.points, item.mode, true)" in js
assert "function exportPngWithOverlay()" in js
assert "ctx.drawImage(source,0,0)" in js and "ctx.drawImage(overlay,0,0,output.width,output.height)" in js
assert "'image/png'" in js and "new XMLSerializer().serializeToString(clone)" in js

# Every saved dimension has its own visible delete button, and deletion
# affects only the indexed pinned measurement.
assert "remove.className='saved-measure-delete'" in js
assert "remove.textContent='✕ Törlés'" in js
assert "savedMeasures.splice(index,1)" in js
assert "refreshSavedMeasureList();" in js
assert "notify('A kiválasztott méret törölve a rajzról.')" in js

# CAD format support and file-dialog parity.
assert 'id="fileInput" type="file"' in html
for ext in (".3mf", ".step", ".stp", ".f3d"):
    assert ext in html
assert "new ThreeMFLoader().parse(await file.arrayBuffer())" in js
assert "const step=await readStep(await file.arrayBuffer())" in js
assert "Az F3D Fusion saját archívuma" in js
assert "job-viewer-logo.svg" in html
assert "JOB Viewer v2.6.0" in html

# Editing the working copy: delete only unchecked subtrees and export a
# re-openable GLB, never pretend tessellated geometry is a true STEP solid.
for element in ('deleteUnchecked','saveFilteredModel'):
    assert f'id="{element}"' in html
    assert f"$('{element}').addEventListener" in js
assert "uncheckedRoots(model,hiddenObjects)" in js
assert "countMeshes(roots)" in js
assert "obj.parent?.remove(obj)" in js
assert "new GLTFExporter().parseAsync" in js
assert "wrapper.scale.setScalar(mmPerUnit/1000)" in js
assert "wrapper.rotation.x=-Math.PI/2" in js
assert "_kivalogatott.glb" in js
assert "window.confirm(question)" in js
