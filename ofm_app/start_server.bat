@echo off
chcp 65001 > nul
title OFM 상품 조회 서버

echo ============================================================
echo   OFM 상품 조회 서버 시작
echo ============================================================
echo.

cd /d "%~dp0"

echo [*] 내 PC의 IP 주소:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=* delims= " %%b in ("%%a") do echo     http://%%b:8000
)
echo.
echo [*] 본인 PC에서:  http://localhost:8000
echo.
echo [*] 서버 종료: 이 창에서 Ctrl+C 누른 후 Y 입력
echo ============================================================
echo.

python app.py

echo.
echo [!] 서버가 종료되었습니다.
pause
