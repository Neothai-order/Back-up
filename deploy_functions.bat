@echo off
setlocal

REM =============================================================
REM Firebase Cloud Functions Deploy Script
REM   Usage: deploy_functions.bat                  -> backfillGeocode only (admin manual)
REM          deploy_functions.bat all              -> all functions
REM          deploy_functions.bat <function_name>  -> specific function
REM
REM NOTE: geocodeCustomerOnWrite was PERMANENTLY REMOVED on 2026-04-19
REM       after a 47M invocation loop cost Baht 4,249. Do not re-add
REM       the Firestore onWrite trigger — use client-side geocoding
REM       (nearby-dentists.html) or the manual backfillGeocode HTTP
REM       function instead.
REM =============================================================

cd /d "%~dp0"

REM -- Check Firebase CLI installed --
where firebase >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Firebase CLI is not installed.
    echo         Install it first with:
    echo.
    echo         npm install -g firebase-tools
    echo.
    pause
    exit /b 1
)

REM -- Check login status --
call firebase projects:list >nul 2>&1
if errorlevel 1 (
    echo [WARN] Not logged in to Firebase.
    echo        Opening login window...
    echo.
    call firebase login
    if errorlevel 1 (
        echo [ERROR] Login failed. Exiting.
        pause
        exit /b 1
    )
)

REM -- Decide deploy target --
if "%~1"=="" (
    set "TARGET=functions:backfillGeocode"
    set "LABEL=backfillGeocode (admin manual)"
) else if /i "%~1"=="all" (
    set "TARGET=functions"
    set "LABEL=ALL functions"
) else (
    set "TARGET=functions:%~1"
    set "LABEL=%~1"
)

echo =============================================================
echo  Firebase Functions Deploy
echo  Target : %LABEL%
echo  Project: neothai-order
echo =============================================================
echo.

REM -- Run deploy --
call firebase deploy --only %TARGET% --project neothai-order

set "RC=%errorlevel%"
echo.

if %RC% neq 0 (
    echo [%date% %time%] FAILED - target: %LABEL% >> deploy_log.txt
    echo =============================================================
    echo  [X] Deploy FAILED ^(exit code: %RC%^)
    echo =============================================================
) else (
    echo [%date% %time%] SUCCESS - target: %LABEL% >> deploy_log.txt
    echo =============================================================
    echo  [OK] Deploy SUCCESS
    echo =============================================================
)

echo.
pause
endlocal
exit /b %RC%
