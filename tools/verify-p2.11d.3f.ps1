param([string]$SourceRoot = "")
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = Split-Path -Parent $PSScriptRoot }
$SourceRoot = (Resolve-Path $SourceRoot).Path
$main = Get-Content (Join-Path $SourceRoot 'scripts\main.mjs') -Raw -Encoding UTF8
$api = Get-Content (Join-Path $SourceRoot 'scripts\artificer-infusion-runtime.mjs') -Raw -Encoding UTF8
$bridge = Get-Content (Join-Path $SourceRoot 'scripts\artificer-rest-bridge.mjs') -Raw -Encoding UTF8
foreach ($needle in @('registerWorldInfusionsSetting();','registerNativeLongRestInfusionBridge();')) {
 if (-not $main.Contains($needle)) { throw "main.mjs : absence de $needle" }
}
foreach ($needle in @('expireForNativeLongRest','processedRestMessageIds','r.entries.filter(e => e.targetActorUuid !== uuid)')) {
 if (-not $api.Contains($needle)) { throw "runtime : absence de $needle" }
}
foreach ($needle in @('createChatMessage','nativeLongRestRecipient','message.speaker?.actor','longRest.moves.','leadGM()')) {
 if (-not $bridge.Contains($needle)) { throw "bridge : absence de $needle" }
}
Write-Host '[ OK ] trigger chat downtime + longRest + Actor cohérents' -ForegroundColor Green
Write-Host '[ OK ] suppression ciblée par porteur et message traité mémorisé' -ForegroundColor Green
Write-Host '[ OK ] hook MJ au ready' -ForegroundColor Green
Write-Host 'P2.11d.3f GREEN (source)' -ForegroundColor Green
