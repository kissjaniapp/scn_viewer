"""Checks that the 1.2 installer launches a bundled desktop window, not a browser."""
from pathlib import Path
import json

root = Path(__file__).resolve().parent.parent
iss = (root / 'installer/SCN_Viewer.iss').read_text(encoding='utf-8')
workflow = (root / '.github/workflows/windows-installer.yml').read_text(encoding='utf-8')
jsbuild = (root / 'tools/build.mjs').read_text(encoding='utf-8')
desktop = (root / 'desktop/main.cjs').read_text(encoding='utf-8')
server = (root / 'desktop/server.cjs').read_text(encoding='utf-8')
package = json.loads((root / 'package.json').read_text(encoding='utf-8'))

assert 'PrivilegesRequired=lowest' in iss
assert '[Icons]' in iss and 'desktopicon' in iss
assert 'SCN Viewer.exe' in iss
assert 'wscript.exe' not in iss
assert '[UninstallRun]' not in iss
assert 'SCN_Viewer_Inditas.vbs' in iss  # cleanup only
assert 'KitchenDraw Bridge - beállítás' not in iss
assert 'scn-parser.js' in (root/'viewer/main.js').read_text(encoding='utf-8')
assert 'electron-builder --win --dir --x64' in package['scripts']['package:win']
assert package['main'] == 'desktop/main.cjs'
assert 'electron' in package['devDependencies']
assert 'BrowserWindow' in desktop and 'loadURL(url)' in desktop
assert 'nodeIntegration: false' in desktop and 'contextIsolation: true' in desktop
assert 'server.listen(0' in server  # no fixed port conflicts
assert '127.0.0.1' in server
assert 'upload-artifact@v4' in workflow
assert 'SCN_Viewer_v1.3.0_Telepito' in workflow
assert 'bundle: true' in jsbuild
assert (root / 'tools/make_icon.py').is_file()
print('Desktop installer sources validated.')
