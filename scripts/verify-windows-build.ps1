# =========================================================
# Nombre completo: verify-windows-build.ps1
# Ruta o ubicación: /scripts/verify-windows-build.ps1
# Función o funciones:
# - Verificar que el instalador NSIS haya sido generado.
# - Comprobar la aplicación desempaquetada y el archivo app.asar.
# - Instalar silenciosamente en una carpeta temporal.
# - Calcular hash SHA-256 y registrar el estado de firma.
# - Crear reportes reutilizables por GitHub Actions.
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

function Find-MainExecutable {
  param([Parameter(Mandatory = $true)][string]$Directory)

  return Get-ChildItem -LiteralPath $Directory -Filter "*.exe" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch "^(Uninstall|unins|elevate|notification_helper)" } |
    Sort-Object Length -Descending |
    Select-Object -First 1
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$resolvedDist = Join-Path $repositoryRoot $DistPath
$diagnosticPath = Join-Path $resolvedDist "verify-output.txt"

try {
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
  $appAsar = Join-Path $unpackedDirectory "resources\app.asar"
  Assert-PathExists -Path $unpackedDirectory -Message "No existe la aplicación desempaquetada."
  Assert-PathExists -Path $appAsar -Message "No existe resources\app.asar en la aplicación desempaquetada."

  $appExecutable = Find-MainExecutable -Directory $unpackedDirectory
  if (-not $appExecutable) {
    throw "No se encontró el ejecutable principal dentro de win-unpacked."
  }

  $asarCliCandidates = @(
    (Join-Path $repositoryRoot "node_modules\@electron\asar\bin\asar.js"),
    (Join-Path $repositoryRoot "node_modules\asar\bin\asar.js")
  )
  $asarCli = $asarCliCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $asarCli) {
    throw "No se encontró la herramienta de verificación ASAR."
  }

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

  $tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
  $temporaryInstall = Join-Path $tempRoot "almacen-familiar-install-test"
  Remove-Item -LiteralPath $temporaryInstall -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $temporaryInstall -Force | Out-Null

  try {
    $installArguments = @("/S", "/D=$temporaryInstall")
    $process = Start-Process -FilePath $installer.FullName -ArgumentList $installArguments -Wait -PassThru
    if ($process.ExitCode -ne 0) {
      throw "El instalador silencioso terminó con el código $($process.ExitCode)."
    }

    $installedAsar = Join-Path $temporaryInstall "resources\app.asar"
    Assert-PathExists -Path $installedAsar -Message "La instalación silenciosa no creó resources\app.asar."

    $installedExecutable = Find-MainExecutable -Directory $temporaryInstall
    if (-not $installedExecutable) {
      throw "La instalación silenciosa no creó el ejecutable principal."
    }

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
      executable = $appExecutable.Name
      installedExecutable = $installedExecutable.Name
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
    "Instalador verificado correctamente: $($installer.Name)" | Set-Content -LiteralPath $diagnosticPath -Encoding UTF8
    "Ejecutable: $($appExecutable.Name)" | Add-Content -LiteralPath $diagnosticPath -Encoding UTF8
    "SHA-256: $($hash.Hash)" | Add-Content -LiteralPath $diagnosticPath -Encoding UTF8

    Write-Host "Instalador verificado correctamente: $($installer.Name)"
    Write-Host "SHA-256: $($hash.Hash)"
    Write-Host "Firma: $($signature.Status)"
    Write-Host "Reporte: $reportPath"
  } finally {
    Remove-Item -LiteralPath $temporaryInstall -Recurse -Force -ErrorAction SilentlyContinue
  }
} catch {
  $message = $_.Exception.Message
  $details = $_ | Out-String
  "ERROR: $message" | Set-Content -LiteralPath $diagnosticPath -Encoding UTF8
  $details | Add-Content -LiteralPath $diagnosticPath -Encoding UTF8
  Write-Error $message
  throw
}
