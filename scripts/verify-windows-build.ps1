# =========================================================
# Nombre completo: verify-windows-build.ps1
# Ruta o ubicación: /scripts/verify-windows-build.ps1
# Función o funciones:
# - Verificar que el instalador NSIS haya sido generado.
# - Comprobar la aplicación desempaquetada y el archivo app.asar.
# - Instalar silenciosamente en una carpeta temporal.
# - Calcular hash SHA-256 y registrar el estado de firma.
# - Crear un reporte JSON reutilizable por GitHub Actions.
# =========================================================

param(
  [string]$DistPath = "dist"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-PathExists {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw $Message
  }
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$resolvedDist = Join-Path $repositoryRoot $DistPath
Assert-PathExists -Path $resolvedDist -Message "No existe la carpeta de compilación: $resolvedDist"

$installer = Get-ChildItem -LiteralPath $resolvedDist -Filter "Almacen-Familiar-Setup-*.exe" -File |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1

if (-not $installer) {
  throw "No se encontró el instalador esperado dentro de $resolvedDist"
}

if ($installer.Length -lt 10MB) {
  throw "El instalador parece incompleto: solo ocupa $($installer.Length) bytes."
}

$unpackedDirectory = Join-Path $resolvedDist "win-unpacked"
$appExecutable = Join-Path $unpackedDirectory "Almacén Familiar.exe"
$appAsar = Join-Path $unpackedDirectory "resources\app.asar"

Assert-PathExists -Path $unpackedDirectory -Message "No existe la aplicación desempaquetada."
Assert-PathExists -Path $appExecutable -Message "No existe el ejecutable principal desempaquetado."
Assert-PathExists -Path $appAsar -Message "No existe resources\app.asar."

$asarCli = Join-Path $repositoryRoot "node_modules\@electron\asar\bin\asar.js"
Assert-PathExists -Path $asarCli -Message "No se encontró la herramienta de verificación ASAR."

$asarListingPath = Join-Path $resolvedDist "asar-files.txt"
& node $asarCli list $appAsar | Set-Content -LiteralPath $asarListingPath -Encoding UTF8

if ($LASTEXITCODE -ne 0) {
  throw "No se pudo leer el contenido de app.asar."
}

$asarListing = Get-Content -LiteralPath $asarListingPath -Raw
$requiredEntries = @(
  "\app\main\main.js",
  "\app\preload\preload.js",
  "\app\renderer\index.html",
  "\package.json"
)

foreach ($entry in $requiredEntries) {
  if (-not $asarListing.Contains($entry)) {
    throw "Falta el archivo obligatorio $entry dentro de app.asar."
  }
}

$package = Get-Content -LiteralPath (Join-Path $repositoryRoot "package.json") -Raw | ConvertFrom-Json
$hash = Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256
$signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName

$temporaryInstall = Join-Path $env:RUNNER_TEMP "almacen-familiar-install-test"
if (-not $env:RUNNER_TEMP) {
  $temporaryInstall = Join-Path ([System.IO.Path]::GetTempPath()) "almacen-familiar-install-test"
}

Remove-Item -LiteralPath $temporaryInstall -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $temporaryInstall -Force | Out-Null

$installArguments = @(
  "/S",
  "/D=$temporaryInstall"
)

$process = Start-Process -FilePath $installer.FullName -ArgumentList $installArguments -Wait -PassThru

if ($process.ExitCode -ne 0) {
  throw "El instalador silencioso terminó con el código $($process.ExitCode)."
}

$installedExecutable = Join-Path $temporaryInstall "Almacén Familiar.exe"
$installedAsar = Join-Path $temporaryInstall "resources\app.asar"

Assert-PathExists -Path $installedExecutable -Message "La instalación silenciosa no creó el ejecutable principal."
Assert-PathExists -Path $installedAsar -Message "La instalación silenciosa no creó resources\app.asar."

$installedHash = Get-FileHash -LiteralPath $installedAsar -Algorithm SHA256
$unpackedHash = Get-FileHash -LiteralPath $appAsar -Algorithm SHA256

if ($installedHash.Hash -ne $unpackedHash.Hash) {
  throw "El app.asar instalado no coincide con el generado por electron-builder."
}

$report = [ordered]@{
  productName = "Almacén Familiar"
  version = [string]$package.version
  architecture = "x64"
  installer = $installer.Name
  installerSizeBytes = [int64]$installer.Length
  installerSha256 = $hash.Hash
  signatureStatus = [string]$signature.Status
  signatureSubject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
  unpackedExecutableVerified = $true
  asarVerified = $true
  silentInstallVerified = $true
  installedAsarSha256 = $installedHash.Hash
  requiredAsarEntries = $requiredEntries
  checkedAt = (Get-Date).ToUniversalTime().ToString("o")
}

$reportPath = Join-Path $resolvedDist "installer-verification.json"
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host "Instalador verificado correctamente: $($installer.Name)"
Write-Host "SHA-256: $($hash.Hash)"
Write-Host "Firma: $($signature.Status)"
Write-Host "Reporte: $reportPath"

Remove-Item -LiteralPath $temporaryInstall -Recurse -Force -ErrorAction SilentlyContinue
