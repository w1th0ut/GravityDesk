@echo off
setlocal
title GravityDesk - Android APK Builder (EAS Cloud)
cd /d "%~dp0\mobile"

echo ============================================================
echo   GravityDesk - Standalone Android APK Builder (EAS Cloud)
echo ============================================================
echo.
echo Launching EAS Cloud Build for standalone Android APK...
echo.

call eas build -p android --profile preview

pause
