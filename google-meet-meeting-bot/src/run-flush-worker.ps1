# PowerShell script to run flush worker
Write-Host "Starting Flush Worker..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

npx ts-node src/flushWorker.ts

