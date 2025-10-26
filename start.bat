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

REM Check if bun is installed
where bun >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: bun is not installed. Install it from https://bun.sh/
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: npm is not installed. Install Node.js from https://nodejs.org/
    exit /b 1
)

REM Install backend dependencies if needed
if not exist "backend\node_modules" (
    echo Installing backend dependencies...
    cd backend
    call bun install
    cd ..
)

REM Install Playwright browsers if needed
if not exist "%USERPROFILE%\AppData\Local\ms-playwright" (
    echo Installing Playwright browsers (this may take a few minutes)...
    cd backend
    call bunx playwright install chromium
    cd ..
)

REM Install frontend dependencies if needed
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

echo.
echo Dependencies ready!
echo.

REM Start backend
echo Starting backend server (with browser automation)...
start "Backend Server" cmd /k "cd backend && bun run dev"

REM Wait a bit for backend to start
echo Waiting for backend to initialize...
timeout /t 5 /nobreak > nul

REM Start frontend
echo Starting frontend...
echo.
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5173 (or next available port)
echo.
echo AI Agents now have browser capabilities!
echo    Try: 'Search Google for X' or 'Go to website.com'
echo.
cd frontend
call npm run dev

endlocal
