# PowerShell script to start flush worker and run test

Write-Host "Starting Flush Worker in background..." -ForegroundColor Green

# Start flush worker as a background job
$job = Start-Job -ScriptBlock {
    Set-Location "f:\Laraib-Zafar\FYP\onix\onix new\AI-Meeting-Assistant\google-meet-meeting-bot"
    npx ts-node ./src/infrastructure/workers/flushWorker.ts
}

Write-Host "Flush worker started (Job ID: $($job.Id))" -ForegroundColor Yellow
Write-Host "Waiting 2 seconds for worker to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "`nRunning comprehensive test..." -ForegroundColor Green
npx ts-node ./tests/comprehensive-test.ts

Write-Host "`nTo stop the flush worker, run: Stop-Job -Id $($job.Id); Remove-Job -Id $($job.Id)" -ForegroundColor Cyan

