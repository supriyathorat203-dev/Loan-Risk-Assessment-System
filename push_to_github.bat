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
        echo Please ensure Git is installed or wait for installation to finish.
        pause
        exit /b 1
    )
)

echo [*] Using Git: "!GIT_CMD!"
cd /d "%~dp0"

:: 2. Initialize Git repo if needed
if not exist ".git" (
    echo [*] Initializing local Git repository (branch: main)...
    "!GIT_CMD!" init -b main
) else (
    echo [*] Existing Git repository detected.
)

:: 3. Configure Git identity if not set
"!GIT_CMD!" config user.name >nul 2>&1
if %ERRORLEVEL% neq 0 (
    "!GIT_CMD!" config user.name "Supriya"
    "!GIT_CMD!" config user.email "yogitaj2518@gmail.com"
    echo [*] Configured default user.name and user.email.
)

:: 4. Ensure .gitignore is staged and effective
echo [*] Staging all project files...
"!GIT_CMD!" add .

:: 5. Commit changes
echo [*] Creating commit...
"!GIT_CMD!" commit -m "Complete Loan Risk Assessment System: Separated Customer and Admin Portals, Document Verification Desk, Dark/Light Mode, and Underwriting Engine" >nul 2>&1

:: 6. Check existing remote
for /f "tokens=*" %%a in ('"!GIT_CMD!" remote get-url origin 2^>nul') do set "EXISTING_REMOTE=%%a"

if defined EXISTING_REMOTE (
    echo [*] Current GitHub Remote: !EXISTING_REMOTE!
    set /p "CHANGE_REMOTE=Do you want to push to this remote? (Y/N, default Y): "
    if /i "!CHANGE_REMOTE!"=="N" (
        set "EXISTING_REMOTE="
    )
)

if not defined EXISTING_REMOTE (
    echo.
    echo ============================================================
    echo Please create a new empty repository on GitHub:
    echo 1. Go to https://github.com/new
    echo 2. Name your repository (e.g. Loan-Risk-Assessment-System)
    echo 3. Do NOT check README, .gitignore or license
    echo 4. Copy the repository URL (e.g. https://github.com/your-username/Loan-Risk-Assessment-System.git)
    echo ============================================================
    echo.
    set /p "REPO_URL=Enter your GitHub Repository URL: "
    if "!REPO_URL!"=="" (
        echo [!] No URL provided. Aborting push.
        pause
        exit /b 1
    )
    "!GIT_CMD!" remote remove origin >nul 2>&1
    "!GIT_CMD!" remote add origin "!REPO_URL!"
)

echo.
echo [*] Pushing branch 'main' to GitHub...
"!GIT_CMD!" branch -M main
"!GIT_CMD!" push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ============================================================
    echo [SUCCESS] All code has been successfully transferred to GitHub!
    echo ============================================================
) else (
    echo.
    echo ============================================================
    echo [NOTE] If GitHub prompted for sign-in or a personal access token,
    echo please complete the authentication in your browser or terminal.
    echo ============================================================
)

echo.
pause
