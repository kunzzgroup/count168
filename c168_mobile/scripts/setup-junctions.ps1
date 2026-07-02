# 在 c168_mobile 目录执行：联接父级 api / includes / images（共用网页版数据库与后端）
# 用法: cd c168_mobile; .\scripts\setup-junctions.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

foreach ($name in @("api", "includes", "images")) {
    $link = Join-Path $root $name
    $target = Join-Path (Split-Path -Parent $root) $name
    if (-not (Test-Path $target)) {
        Write-Error "目标不存在: $target （请确认 count168test 根目录含 $name/）"
    }
    if (Test-Path $link) {
        Write-Host "已存在，跳过: $name"
        continue
    }
    cmd /c mklink /J "$link" "$target"
    Write-Host "已联接: $name -> $target"
}

Write-Host "完成。数据库配置见 ../includes/config.php 与 config.local.php"
