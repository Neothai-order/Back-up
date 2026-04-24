$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$folderName = Get-Date -Format "yy.MM.dd"
$src = "C:\Users\pang8\OneDrive\Desktop\앱 개발"
$dstBase = "C:\Users\pang8\OneDrive\Desktop\네오 바이오텍\003 개인 업무\앱 개발 백업"
$dst = [System.IO.Path]::Combine($dstBase, $folderName)

if (!(Test-Path -LiteralPath $dst)) {
    [System.IO.Directory]::CreateDirectory($dst) | Out-Null
}

$cmdLine = """$src"" ""$dst"" /MIR /XF backup_app.bat backup_app.ps1 /XD node_modules .git /NFL /NDL /NJH /NJS /nc /ns /np"
Start-Process -FilePath "robocopy.exe" -ArgumentList $cmdLine -NoNewWindow -Wait

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$logPath = [System.IO.Path]::Combine($dst, "backup_log.txt")
Add-Content -LiteralPath $logPath -Value "[$timestamp] Backup completed" -Encoding UTF8
