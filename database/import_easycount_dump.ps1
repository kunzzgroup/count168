# Prepare a hosting dump for local MariaDB (XAMPP) and import into `easycount`.
# Usage:
#   .\import_easycount_dump.ps1 -InputPath "C:\Users\User\Downloads\u857194726_count168 (1).sql"
#   .\import_easycount_dump.ps1 -InputPath "..." -SkipImport   # only write prepared SQL

param(
    [Parameter(Mandatory = $true)]
    [string] $InputPath,
    [string] $MysqlExe = 'C:\xampp\mysql\bin\mysql.exe',
    [string] $DbUser = 'root',
    [string] $DbPass = '',
    [string] $DbName = 'easycount',
    [switch] $SkipImport
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $InputPath)) {
    Write-Error "File not found: $InputPath"
}
if (-not (Test-Path -LiteralPath $MysqlExe)) {
    Write-Error "mysql.exe not found: $MysqlExe"
}

$outDir = $PSScriptRoot
$prepared = Join-Path $outDir 'easycount_import_prepared.sql'

Write-Host "Preparing dump (strip DEFINER, fix collation)..."
$reader = [System.IO.StreamReader]::new($InputPath)
$writer = [System.IO.StreamWriter]::new($prepared, $false, [System.Text.UTF8Encoding]::new($false))
$writer.WriteLine("USE ``$DbName``;")
$writer.WriteLine('SET NAMES utf8mb4;')
$writer.WriteLine('SET FOREIGN_KEY_CHECKS = 0;')
$writer.WriteLine('SET SQL_MODE = ''NO_AUTO_VALUE_ON_ZERO'';')

$lineNum = 0
while ($null -ne ($line = $reader.ReadLine())) {
    $lineNum++
    if ($lineNum % 50000 -eq 0) { Write-Host "  ... line $lineNum" }
    $line = [regex]::Replace($line, 'DEFINER=`[^`]+`@`[^`]+`\s*', '')
    $line = $line.Replace('utf8mb4_uca1400_ai_ci', 'utf8mb4_unicode_ci')
    $writer.WriteLine($line)
}
$writer.WriteLine('SET FOREIGN_KEY_CHECKS = 1;')
$reader.Close()
$writer.Close()
Write-Host "Prepared: $prepared ($([math]::Round((Get-Item $prepared).Length / 1MB, 1)) MB)"

if ($SkipImport) { return }

Write-Host "Recreating database ``$DbName``..."
$mysqlArgs = @('-u', $DbUser)
if ($DbPass) { $mysqlArgs += @("-p$DbPass") }
& $MysqlExe @mysqlArgs '-e', "DROP DATABASE IF EXISTS ``$DbName``; CREATE DATABASE ``$DbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

Write-Host "Importing (may take several minutes)..."
$sourcePath = $prepared.Replace('\', '/')
& $MysqlExe @mysqlArgs $DbName -e "source $sourcePath"
if ($LASTEXITCODE -ne 0) { throw "mysql import failed with exit code $LASTEXITCODE" }

$count = & $MysqlExe @mysqlArgs '-N' '-e', "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DbName';"
Write-Host "Done. Tables in $DbName : $count"
