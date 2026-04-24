@echo off
chcp 65001 >/dev/null 2>nul

for /f "tokens=*" %%a in ('powershell -NoProfile -Command "Get-Date -Format 'yy.MM.dd'"') do set "FNAME=%%a"

set "SRC=
C:\Users\pang8\OneDrive\Desktop\앱 개발
"
set "DSTBASE=
C:\Users\pang8\OneDrive\Desktop\네오 바이오텍\003 개인 업무\앱 개발 백업
"
set "DST=%DSTBASE%\%FNAME%"

if not exist "%DST%" mkdir "%DST%"

robocopy "%SRC%" "%DST%" /MIR /XF backup_app.bat backup_app.ps1 /XD node_modules .git /NFL /NDL /NJH /NJS /nc /ns /np

echo [%date% %time%] Backup completed >> "%DST%\backup_log.txt"