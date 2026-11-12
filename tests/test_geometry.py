"""Minimal smoke test for the OBJ sample; requires trimesh, not needed by app."""
from pathlib import Path
import trimesh
file = Path(__file__).parents[1] / 'examples' / 'pelda_lap_600x400x18.obj'
mesh = trimesh.load(file, force='mesh')
assert tuple(mesh.extents) == (600.0, 400.0, 18.0), mesh.extents
assert mesh.is_watertight, 'Example should have a closed mesh'
print('OK: sample OBJ = 600 × 400 × 18 (model units)')
