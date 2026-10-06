param([string]$Har, [string]$Ca, [switch]$AllowUnverifiedNce)
$ErrorActionPreference = 'Stop'
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
$bundledPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
if (Test-Path -LiteralPath $bundledPython) { $pythonPath = $bundledPython }
elseif ($pythonCommand) { $pythonPath = $pythonCommand.Source }
else { throw 'Python 3 nu este instalat.' }
$scriptArguments = @((Join-Path $PSScriptRoot 'local_alarms.py'))
if ($Har) { $scriptArguments += @('--har', $Har) }
if ($Ca) { $scriptArguments += @('--ca', $Ca) }
if ($AllowUnverifiedNce) { $scriptArguments += '--allow-unverified-nce' }
Write-Host 'Deschide http://127.0.0.1:8765/ dupa mesajul OLT ORO local.'
& $pythonPath @scriptArguments
