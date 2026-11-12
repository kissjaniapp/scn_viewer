#define MyAppName "SCN Viewer"
#define MyAppVersion "1.2.0"
#define MyAppPublisher "kissjaniapp"
#define MyAppURL "https://github.com/kissjaniapp/scn_viewer"

[Setup]
; AppId unchanged from v1.1 to upgrade the existing installation.
AppId={{18D9183D-93C9-47E1-A09E-F4A47ADCA1E8}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/actions
DefaultDirName={localappdata}\Programs\SCN Viewer
DefaultGroupName=SCN Viewer
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\SCN Viewer.exe
OutputDir=..\output
OutputBaseFilename=SCN_Viewer_v{#MyAppVersion}_Telepito
SetupIconFile=SCNViewer.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=yes
RestartApplications=no
ShowLanguageDialog=no

[Languages]
Name: "hu"; MessagesFile: "compiler:Languages\Hungarian.isl"

[Tasks]
Name: "desktopicon"; Description: "Asztali parancsikon létrehozása"; GroupDescription: "Parancsikonok:"; Flags: checkedonce

[Files]
; Bundled Electron + Chromium + Viewer: executable opens its own window directly.
Source: "..\packed\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "SCNViewer.ico"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; Remove obsolete invisible PowerShell / VBScript launchers from v1.1.
Type: files; Name: "{app}\SCN_Viewer_Inditas.vbs"
Type: files; Name: "{app}\Start_ScnViewer.ps1"
Type: files; Name: "{app}\Start_ScnViewer.bat"

[Icons]
Name: "{autoprograms}\SCN Viewer\SCN Viewer"; Filename: "{app}\SCN Viewer.exe"; WorkingDir: "{app}"; IconFilename: "{app}\SCNViewer.ico"
Name: "{autoprograms}\SCN Viewer\KitchenDraw Bridge - beállítás"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\resources\Build_KitchenDraw_Bridge.ps1"""; WorkingDir: "{app}\resources"; IconFilename: "{app}\SCNViewer.ico"
Name: "{autodesktop}\SCN Viewer"; Filename: "{app}\SCN Viewer.exe"; WorkingDir: "{app}"; IconFilename: "{app}\SCNViewer.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\SCN Viewer.exe"; Description: "SCN Viewer indítása"; Flags: postinstall nowait skipifsilent
