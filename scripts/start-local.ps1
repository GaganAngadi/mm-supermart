$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$appUrl = "http://localhost:3000/login"

try {
  $response = Invoke-WebRequest -UseBasicParsing $appUrl -TimeoutSec 2
  if ($response.StatusCode -eq 200) {
    Start-Process $appUrl
    return
  }
} catch {
  # Server is not running yet.
}

if (-not (Test-Path "client\.next\BUILD_ID")) {
  npm.cmd --workspace client run build
}

Start-Process $appUrl
Start-Process -FilePath npm.cmd -ArgumentList @("--workspace","server","run","start") -WorkingDirectory $root -WindowStyle Hidden
npm.cmd --workspace client run start -- -p 3000
