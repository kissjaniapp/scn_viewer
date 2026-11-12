# Builds KitchenDrawBridge.dll using only Windows PowerShell 5.1's .NET compiler.
# It does NOT download SDK libraries from any third-party source.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$locations = @(
    'C:\KD\KD.SDK2.dll',
    'C:\Program Files (x86)\KitchenDraw\KD.SDK2.dll',
    'C:\Program Files\KitchenDraw\KD.SDK2.dll'
)
$sdk = $locations | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $sdk) {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = 'Valaszd ki a KitchenDraw mappajaban levo KD.SDK2.dll fajlt'
    $dialog.Filter = 'KitchenDraw SDK|KD.SDK2.dll'
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }
    $sdk = $dialog.FileName
}
$source = Join-Path $PSScriptRoot 'KitchenDrawBridge\Plugin.cs'
$destination = Join-Path $PSScriptRoot 'KitchenDrawBridge\KitchenDrawBridge.dll'
if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
try {
    # The SDK2 DLL is a runtime dependency, not redistributed with this project.
    Add-Type -Language CSharp -TypeDefinition ([IO.File]::ReadAllText($source)) -ReferencedAssemblies @(
        'System.dll', 'System.Core.dll', 'System.Windows.Forms.dll', 'System.Web.Extensions.dll', $sdk
    ) -OutputAssembly $destination -OutputType Library -ErrorAction Stop
    Write-Host "Forditas kesz: $destination" -ForegroundColor Green
    Write-Host 'A DLL-t a KitchenDraw ? > Service > Plugin Manager menuben regisztrald.' -ForegroundColor Cyan
} catch {
    Write-Host ('Forditasi hiba: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Alternativa: Visual Studioban nyisd meg a KitchenDrawBridge.csproj projektet.' -ForegroundColor Yellow
    throw
}
Read-Host 'Enter a kilepeshez'
