$ErrorActionPreference = "Stop"
$Project = Split-Path -Parent $PSScriptRoot
Set-Location $Project
$GitSafe = $Project.Replace("\", "/")

Write-Host "==> Deploy only the structured-JSON parser correction"
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
npx.cmd wrangler deploy --no-bundle
if ($LASTEXITCODE -ne 0) { throw "Correction deployment failed." }

Write-Host "==> Verify both public formats and capture versioned evidence"
node.exe scripts/capture-live-evidence.mjs
if ($LASTEXITCODE -ne 0) { throw "Live evidence capture failed." }

Write-Host "==> Publish the captured evidence assets"
npx.cmd wrangler deploy --no-bundle
if ($LASTEXITCODE -ne 0) { throw "Evidence publication failed." }

Write-Host "==> Commit and push the corrected source and evidence"
git -c safe.directory=$GitSafe add .
git -c safe.directory=$GitSafe commit -m "Fix structured invoice extraction and publish evidence"
if (($LASTEXITCODE -ne 0) -and ((git -c safe.directory=$GitSafe status --porcelain).Length -gt 0)) { throw "Git commit failed." }
git -c safe.directory=$GitSafe push -u origin main
if ($LASTEXITCODE -ne 0) { throw "GitHub push failed." }

Write-Host "Structured-JSON correction, public verification, evidence, and GitHub publication completed."
