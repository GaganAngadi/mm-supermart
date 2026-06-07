$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Installing M&M SuperMart ERP locally..." -ForegroundColor Green

if (-not (Test-Path "node_modules")) {
  npm.cmd install
}

npm.cmd --workspace server run prisma:generate
npm.cmd --workspace server run build
npm.cmd --workspace client run build

$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "M&M SuperMart ERP.lnk"
$targetPath = Join-Path $root "MMSuperMartERP.cmd"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
$shortcut.Description = "Launch M&M SuperMart ERP billing software"
$shortcut.Save()

Write-Host "Installed successfully." -ForegroundColor Green
Write-Host "Desktop shortcut: $shortcutPath"
Write-Host "Launch URL: http://localhost:3000/dashboard"
