@echo off
title LoanWise Backend (Port 8001)
cd /d "c:\Users\Supriya\Desktop\Loan-Risk-Assessment-System\backend"
echo ============================================================
echo Starting LoanWise FastAPI Backend on http://localhost:8001
echo ============================================================
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
pause
