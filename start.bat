@echo off
cd /d "%~dp0"
echo RecordSafe running at http://localhost:8000  (press Ctrl+C to stop)
start "" http://localhost:8000
py -m http.server 8000 || python -m http.server 8000
