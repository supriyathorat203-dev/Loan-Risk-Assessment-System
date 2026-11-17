@echo off
title LoanWise Frontend (Port 5173)
cd /d "c:\Users\Supriya\Desktop\Loan-Risk-Assessment-System\frontend"
echo ============================================================
echo Starting LoanWise React/Vite Frontend on http://localhost:5173
echo ============================================================
call npm.cmd run dev -- --host 0.0.0.0 --port 5173
pause
