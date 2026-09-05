@echo off
title GravityDesk Control Center
echo Starting GravityDesk Desktop GUI...
python gui.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo An error occurred running GravityDesk. Press any key to exit.
    pause >nul
)
