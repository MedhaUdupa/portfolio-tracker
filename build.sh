#!/usr/bin/env bash
# Render build script: install backend deps, then build the React frontend
# so FastAPI can serve it as static files from frontend/dist.
set -o errexit

pip install -r backend/requirements.txt

cd frontend
npm ci || npm install
npm run build
