$ErrorActionPreference = "Stop"
$Project = Split-Path -Parent $PSScriptRoot
Set-Location $Project
$GitSafe = $Project.Replace("\", "/")

Write-Host "==> Authenticate Wrangler only if the saved session is unusable"
npx.cmd wrangler whoami *> $null
if ($LASTEXITCODE -ne 0) {
  npx.cmd wrangler login
  if ($LASTEXITCODE -ne 0) { throw "Wrangler login failed." }
}

$Config = Get-Content "wrangler.jsonc" -Raw
if ($Config.Contains("REPLACE_D1_DATABASE_ID")) {
  Write-Host "==> Create the exact D1 database"
  $Created = (& npx.cmd wrangler d1 create pharos-invoice-to-payment-agent 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw $Created }
  $Match = [regex]::Match($Created, 'database_id\s*=\s*"([0-9a-f-]{36})"')
  if (-not $Match.Success) { $Match = [regex]::Match($Created, '"database_id"\s*:\s*"([0-9a-f-]{36})"') }
  if (-not $Match.Success) { throw "D1 was created but its database ID could not be parsed.`n$Created" }
  $Config = $Config.Replace("REPLACE_D1_DATABASE_ID", $Match.Groups[1].Value)
  Set-Content "wrangler.jsonc" $Config -Encoding utf8
}

Write-Host "==> Apply D1 schema and deploy the application"
npx.cmd wrangler d1 migrations apply pharos-invoice-to-payment-agent --remote
if ($LASTEXITCODE -ne 0) { throw "D1 migration failed." }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
npx.cmd wrangler deploy --no-bundle
if ($LASTEXITCODE -ne 0) { throw "Cloudflare deployment failed." }

Write-Host "==> Capture real deployed read-only evidence"
node.exe scripts/capture-live-evidence.mjs
if ($LASTEXITCODE -ne 0) { throw "Live evidence capture failed." }

Write-Host "==> Publish evidence assets in the final deployment"
npx.cmd wrangler deploy --no-bundle
if ($LASTEXITCODE -ne 0) { throw "Final evidence deployment failed." }

Write-Host "==> Commit and publish exact final source"
git -c safe.directory=$GitSafe add .
git -c safe.directory=$GitSafe commit -m "Publish verified invoice preparation evidence"
if (($LASTEXITCODE -ne 0) -and ((git -c safe.directory=$GitSafe status --porcelain).Length -gt 0)) { throw "Git commit failed." }
git -c safe.directory=$GitSafe push -u origin main
if ($LASTEXITCODE -ne 0) { throw "GitHub push failed." }

Write-Host "Invoice agent publication, deployment, and evidence capture completed."
