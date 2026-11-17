@echo off
setlocal enabledelayedexpansion
title Push LoanWise to GitHub
echo ============================================================
echo         LoanWise System - GitHub Deployment Assistant
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

echo [*] Using Git: "!GIT_CMD!"
cd /d "%~dp0"

:: 2. Remote check
set "TARGET_REPO=https://github.com/supriyathorat203-dev/Loan-Risk-Assessment-System.git"
echo [*] Target Repository: !TARGET_REPO!
"!GIT_CMD!" remote remove origin >nul 2>&1
"!GIT_CMD!" remote add origin "!TARGET_REPO!"

echo.
echo ============================================================
echo GitHub requires authentication to push changes.
echo.
echo OPTION A: Enter your GitHub Personal Access Token (PAT) below.
echo   (To generate one: https://github.com/settings/tokens
echo    Select: Generate new token (classic) -> check 'repo' box)
echo.
echo OPTION B: Press ENTER without typing anything, and Git will
echo          prompt you for your GitHub username and password/token.
echo ============================================================
echo.
set /p "USER_TOKEN=Enter your GitHub Token (or press ENTER): "

if not "!USER_TOKEN!"=="" (
    echo.
    echo [*] Pushing with provided token to main branch...
    "!GIT_CMD!" branch -M main
    "!GIT_CMD!" push https://!USER_TOKEN!@github.com/supriyathorat203-dev/Loan-Risk-Assessment-System.git main:main
    set "PUSH_STATUS=!ERRORLEVEL!"
    
    :: Clean up remote to standard HTTPS without saving token in git config
    "!GIT_CMD!" remote set-url origin "!TARGET_REPO!"
    
    if !PUSH_STATUS! equ 0 (
        echo.
        echo ============================================================
        echo [SUCCESS] All code has been successfully pushed to GitHub!
        echo View your repository: https://github.com/supriyathorat203-dev/Loan-Risk-Assessment-System
        echo ============================================================
    ) else (
        echo.
        echo [!] Push failed. Please verify that your token has 'repo' write permissions.
    )
) else (
    echo.
    echo [*] Pushing to main branch via standard Git authentication...
    echo (When prompted for Password, paste your GitHub Personal Access Token)
    "!GIT_CMD!" branch -M main
    "!GIT_CMD!" push -u origin main
    
    if !ERRORLEVEL! equ 0 (
        echo.
        echo ============================================================
        echo [SUCCESS] All code has been successfully pushed to GitHub!
        echo View your repository: https://github.com/supriyathorat203-dev/Loan-Risk-Assessment-System
        echo ============================================================
    ) else (
        echo.
        echo [!] If authentication failed, remember GitHub requires a Personal
        echo     Access Token instead of your normal account password.
    )
)

echo.
pause
