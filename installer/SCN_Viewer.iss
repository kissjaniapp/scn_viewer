#define MyAppName "SCN Viewer"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "kissjaniapp"
#define MyAppURL "https://github.com/kissjaniapp/scn_viewer"

[Setup]
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
UninstallDisplayIcon={app}\SCNViewer.ico
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
Source: "..\dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "SCNViewer.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\SCN Viewer\SCN Viewer"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\SCN_Viewer_Inditas.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\SCNViewer.ico"
Name: "{autoprograms}\SCN Viewer\KitchenDraw Bridge - beállítás"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Build_KitchenDraw_Bridge.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\SCNViewer.ico"
Name: "{autodesktop}\SCN Viewer"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\SCN_Viewer_Inditas.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\SCNViewer.ico"; Tasks: desktopicon

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\SCN_Viewer_Inditas.vbs"""; Description: "SCN Viewer indítása"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Stop_ScnViewer.ps1"""; Flags: runhidden waituntilterminated
