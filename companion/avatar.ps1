<#
  Desktop-Begleiter der Mod "avatar" (claude-desktop-avatar).

  Wird von der Mod gestartet; nichts davon muss man selbst aufrufen:
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Sta -File avatar.ps1 `
      -StateDir <Datenordner> -PluginRoot <Mod-Ordner> -Owner <Sitzungs-ID>

  Übersetzt Companion.cs einmal je Quelltextstand zu einer DLL im Datenordner
  (companion\bin) und startet dann das Fenster. Meldungen an die Mod gehen als
  JSON-Zeilen auf stdout, Fehler auf stderr.
#>
param(
  [Parameter(Mandatory = $true)][string]$StateDir,
  [Parameter(Mandatory = $true)][string]$PluginRoot,
  [string]$Owner = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

try {
  if ($PSVersionTable.PSVersion.Major -lt 5 -or $PSVersionTable.PSEdition -eq 'Core') {
    throw 'Der Desktop-Avatar braucht Windows PowerShell 5.1 (powershell.exe).'
  }
  if ([System.Threading.Thread]::CurrentThread.GetApartmentState() -ne [System.Threading.ApartmentState]::STA) {
    throw 'Der Desktop-Avatar muss mit -Sta gestartet werden.'
  }

  $references = @(
    'System.Core', 'System.Xaml', 'WindowsBase', 'PresentationCore', 'PresentationFramework',
    'System.Speech', 'System.Web.Extensions', 'System.Windows.Forms', 'System.Drawing'
  )
  foreach ($name in $references) { Add-Type -AssemblyName $name }

  $source = Join-Path $PSScriptRoot 'Companion.cs'
  $code = [System.IO.File]::ReadAllText($source, [System.Text.Encoding]::UTF8)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digest = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($code))
  } finally {
    $sha.Dispose()
  }
  $hash = ([System.BitConverter]::ToString($digest) -replace '-', '').Substring(0, 16).ToLowerInvariant()

  $binDir = Join-Path (Join-Path $StateDir 'companion') 'bin'
  [System.IO.Directory]::CreateDirectory($binDir) | Out-Null
  $dll = Join-Path $binDir ("Companion-$hash.dll")

  if (-not ('ClaudeDesktopAvatar.Program' -as [type])) {
    if (Test-Path -LiteralPath $dll) {
      Add-Type -LiteralPath $dll
    } else {
      # Alte Stände aufräumen (gesperrte Dateien bleiben einfach liegen).
      Get-ChildItem -LiteralPath $binDir -Filter 'Companion-*.dll' -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
      try {
        Add-Type -TypeDefinition $code -Language CSharp -ReferencedAssemblies $references `
          -OutputAssembly $dll -OutputType Library -IgnoreWarnings
        if (-not ('ClaudeDesktopAvatar.Program' -as [type])) { Add-Type -LiteralPath $dll }
      } catch {
        if ('ClaudeDesktopAvatar.Program' -as [type]) { throw }
        # Kein Schreibrecht oder Datei gesperrt: im Speicher übersetzen.
        Add-Type -TypeDefinition $code -Language CSharp -ReferencedAssemblies $references -IgnoreWarnings
      }
    }
  }

  $exitCode = [ClaudeDesktopAvatar.Program]::Run($StateDir, $PluginRoot, $Owner)
  exit $exitCode
} catch {
  $message = $_.Exception.Message
  if ($_.Exception.InnerException) { $message = $message + ' / ' + $_.Exception.InnerException.Message }
  [Console]::Error.WriteLine('avatar.ps1: ' + $message)
  exit 1
}
