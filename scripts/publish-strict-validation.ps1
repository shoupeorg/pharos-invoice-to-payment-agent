$ErrorActionPreference = "Stop"
$Project = Split-Path -Parent $PSScriptRoot
Set-Location $Project
$GitSafe = $Project.Replace("\", "/")

Write-Host "==> Build and deploy the focused strict-validation correction once"
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
npx.cmd wrangler deploy --no-bundle
if ($LASTEXITCODE -ne 0) { throw "Correction deployment failed." }

Write-Host "==> Verify both valid preparations and all required blocked cases"
node.exe scripts/verify-strict-validation.mjs
if ($LASTEXITCODE -ne 0) { throw "Public strict-validation verification failed." }

Write-Host "==> Commit and publish the focused correction"
git -c safe.directory=$GitSafe add README.md src/engine.js src/constants.js test/engine.test.js scripts/verify-strict-validation.mjs scripts/publish-strict-validation.ps1
git -c safe.directory=$GitSafe commit -m "Enforce strict network and JSON amount validation"
if (($LASTEXITCODE -ne 0) -and ((git -c safe.directory=$GitSafe status --porcelain).Length -gt 0)) { throw "Git commit failed." }
git -c safe.directory=$GitSafe push -u origin main
if ($LASTEXITCODE -ne 0) { throw "GitHub push failed." }

Write-Host "Strict validation correction deployed once, verified, and published."
