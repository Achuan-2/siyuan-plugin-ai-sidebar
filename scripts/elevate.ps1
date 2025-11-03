# Copyright (c) 2024 by frostime. All Rights Reserved.
# @Author       : frostime
# @Date         : 2024-09-06 19:15:53
# @FilePath     : /scripts/elevate.ps1
# @LastEditTime : 2024-09-06 19:39:13
# @Description  : Force to elevate the script to admin privilege.

param (
    [string]$scriptPath
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectDir = Split-Path -Parent $scriptDir

if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    $args = "-NoProfile -ExecutionPolicy Bypass -File `"" + $MyInvocation.MyCommand.Path + "`" -scriptPath `"" + $scriptPath + "`""
    Start-Process powershell.exe -Verb RunAs -ArgumentList $args -WorkingDirectory $projectDir
    exit
}

Set-Location -Path $projectDir
& node $scriptPath

pause
