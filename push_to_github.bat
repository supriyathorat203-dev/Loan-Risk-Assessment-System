@echo off
setlocal enabledelayedexpansion
title Push LoanWise to Both GitHub Repositories
echo ============================================================
echo   LoanWise System - Dual-Repository Deployment Assistant
echo ============================================================
echo.

:: 1. Locate Git executable
set "GIT_CMD=git"
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if exist "%LOCALAPPDATA%\Programs\MinGit\cmd\git.exe" (
        set "GIT_CMD=%LOCALAPPDATA%\Programs\MinGit\cmd\git.exe"
    ) else if exist "C:\Program Files\Git\cmd\git.exe" (
        set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
    ) else (
        echo [ERROR] Git was not found on your system.
        pause
        exit /b 1
    )
)

cd /d "%~dp0"

:: 2. Target Repositories
set "REPO_YOGITA=https://github.com/yogita2518/Loan-Risk-Assessment-System.git"
set "REPO_SUPRIYA=https://github.com/supriyathorat203-dev/Loan-Risk-Assessment-System.git"

echo [*] Target 1: !REPO_YOGITA!
echo [*] Target 2: !REPO_SUPRIYA!
echo.

:: 3. Configure Git Dual Push Remotes
"!GIT_CMD!" remote remove origin >nul 2>&1
"!GIT_CMD!" remote add origin "!REPO_YOGITA!"
"!GIT_CMD!" remote set-url --add --push origin "!REPO_YOGITA!"
"!GIT_CMD!" remote set-url --add --push origin "!REPO_SUPRIYA!"

:: 4. Check for unstaged/uncommitted changes
echo [*] Staging all changes...
"!GIT_CMD!" add .

"!GIT_CMD!" diff --cached --quiet
if %ERRORLEVEL% neq 0 (
    echo [*] New changes detected!
    set /p "COMMIT_MSG=Enter commit message (Press ENTER for default): "
    if "!COMMIT_MSG!"=="" (
        set "COMMIT_MSG=Auto update: %date% %time%"
    )
    "!GIT_CMD!" commit -m "!COMMIT_MSG!"
) else (
    echo [*] Working tree is already clean.
)

echo.
echo ============================================================
echo GitHub Authentication for Dual Push:
echo - If you have a Personal Access Token (PAT), paste it below.
echo - Or press ENTER to let Git use your saved credentials.
echo ============================================================
echo.
set /p "USER_TOKEN=Enter your GitHub Token (or press ENTER): "

"!GIT_CMD!" branch -M main

if not "!USER_TOKEN!"=="" (
    echo.
    echo [*] 1/2 Pushing to yogita2518...
    "!GIT_CMD!" push https://!USER_TOKEN!@github.com/yogita2518/Loan-Risk-Assessment-System.git main:main
    if !ERRORLEVEL! equ 0 (
        echo [OK] Successfully pushed to yogita2518!
    ) else (
        echo [!] Failed to push to yogita2518.
    )

    echo.
    echo [*] 2/2 Pushing to supriyathorat203-dev...
    "!GIT_CMD!" push https://!USER_TOKEN!@github.com/supriyathorat203-dev/Loan-Risk-Assessment-System.git main:main
    if !ERRORLEVEL! equ 0 (
        echo [OK] Successfully pushed to supriyathorat203-dev!
    ) else (
        echo [!] Failed to push to supriyathorat203-dev.
    )
) else (
    echo.
    echo [*] Pushing simultaneously to both repositories...
    "!GIT_CMD!" push origin main
)

:: Restore clean origin remote URLs without tokens
"!GIT_CMD!" remote remove origin >nul 2>&1
"!GIT_CMD!" remote add origin "!REPO_YOGITA!"
"!GIT_CMD!" remote set-url --add --push origin "!REPO_YOGITA!"
"!GIT_CMD!" remote set-url --add --push origin "!REPO_SUPRIYA!"

echo.
echo ============================================================
echo [DONE] Dual Push Process Finished!
echo - Yogita:  https://github.com/yogita2518/Loan-Risk-Assessment-System
echo - Supriya: https://github.com/supriyathorat203-dev/Loan-Risk-Assessment-System
echo ============================================================
echo.
pause
