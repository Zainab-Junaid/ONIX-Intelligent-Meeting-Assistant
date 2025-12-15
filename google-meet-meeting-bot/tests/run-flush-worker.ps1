# PowerShell script to run flush worker
Write-Host "Starting Flush Worker..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Move to project root relative to this script
Set-Location (Join-Path $PSScriptRoot "..")

npx ts-node ./src/infrastructure/workers/flushWorker.ts

