@echo off
title LoanWise System Launcher
echo ============================================================
echo Starting LoanWise System (Backend + Frontend)...
echo ============================================================

start "LoanWise Backend (Port 8001)" cmd /c ""%~dp0start_backend.bat""
timeout /t 2 /nobreak >nul
start "LoanWise Frontend (Port 5173)" cmd /c ""%~dp0start_frontend.bat""

echo.
echo ============================================================
echo Both servers have been launched in separate visible windows!
echo - Backend API:  http://127.0.0.1:8001
echo - Frontend UI:  http://localhost:5173
echo ============================================================
timeout /t 5
