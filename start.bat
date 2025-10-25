@echo off
setlocal

echo Starting Thread AI Agent System...
echo.

REM Check if we're in the right directory
if not exist "backend" (
    echo Error: backend directory not found
    exit /b 1
)
if not exist "frontend" (
    echo Error: frontend directory not found
    exit /b 1
)

REM Start backend
echo Starting backend server...
start "Backend" cmd /k "cd backend && bun run dev"

REM Wait a bit for backend to start
timeout /t 3 /nobreak > nul

REM Start frontend
echo Starting frontend...
cd frontend
call npm run dev

endlocal
