#!/bin/bash

# Start script for the Thread AI Agent System

echo "🚀 Starting Thread AI Agent System..."
echo ""

# Check if we're in the right directory
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ Error: Please run this script from the root of the thread directory"
    exit 1
fi

# Start backend in background
echo "📡 Starting backend server..."
cd backend
bun run dev &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start frontend
echo "🎨 Starting frontend..."
cd frontend
npm run dev

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    kill $BACKEND_PID 2>/dev/null
    exit 0
}

# Trap Ctrl+C
trap cleanup INT TERM

# Wait
wait
