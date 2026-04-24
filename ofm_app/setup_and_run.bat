@echo off
title OFM Makro Setup and Run
chcp 65001 > nul

cd /d "%~dp0"

echo ============================================================
echo  OFM / Makro Product Lookup - Setup and Run
echo ============================================================
echo.

python --version >nul 2>&1
if errorlevel 1 goto no_python

for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo [*] Python detected: %PYVER%
echo.

if not exist "venv\Scripts\python.exe" (
    echo [*] Creating virtual environment ^(first time only^)...
    python -m venv venv
    if errorlevel 1 goto venv_fail
)

echo [*] Installing dependencies...
"venv\Scripts\python.exe" -m pip install --upgrade pip >nul
"venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto pip_fail

echo [*] Installing Playwright Chromium...
"venv\Scripts\python.exe" -m playwright install chromium
if errorlevel 1 echo [!] Playwright install warning ^(search may be limited^)

echo.
echo ============================================================
echo [*] Starting server - open http://localhost:8000 in browser
echo ============================================================
echo.

"venv\Scripts\python.exe" app.py
goto end

:no_python
echo [X] Python is not installed or not in PATH.
echo     Download from https://www.python.org/downloads/
echo     Check "Add python.exe to PATH" during install.
goto end

:venv_fail
echo [X] Failed to create venv
goto end

:pip_fail
echo [X] pip install failed
goto end

:end
echo.
pause
