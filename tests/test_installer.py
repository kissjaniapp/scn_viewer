"""Basic regression checks for the GitHub Actions Windows installer package."""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
iss = (root / 'installer/SCN_Viewer.iss').read_text(encoding='utf-8')
workflow = (root / '.github/workflows/windows-installer.yml').read_text(encoding='utf-8')
jsbuild = (root / 'tools/build.mjs').read_text(encoding='utf-8')
launcher = (root / 'SCN_Viewer_Inditas.vbs').read_text(encoding='utf-8')
assert 'PrivilegesRequired=lowest' in iss
assert 'UninstallRun' in iss
assert '[Icons]' in iss and 'desktopicon' in iss
assert 'SCN_Viewer_Inditas.vbs' in iss and 'SCN_Viewer_Inditas.vbs' in launcher + iss
assert 'Upload' in workflow or 'upload-artifact@v4' in workflow
assert 'actions/upload-artifact@v4' in workflow
assert 'bundle: true' in jsbuild
assert 'CDN' not in jsbuild
assert (root / 'tools/make_icon.py').is_file()  # Icon is generated during CI
print('Installer sources and workflow validated.')
