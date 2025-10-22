#!/bin/bash

echo "🎮 Minecraft Server Monitor - Startup Script"
echo "=============================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "🚀 Starting monitoring dashboard..."
echo "📊 Monitoring server: 178.75.238.194:25565"
echo "📈 Metrics endpoint: http://178.75.238.194:9225/metrics"
echo ""
echo "Open your browser and navigate to:"
echo "👉 http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm start
