@echo off
setlocal
title GravityDesk - EAS Android APK Cloud Builder
cd /d "%~dp0\mobile"

echo ============================================================
echo   GravityDesk - EAS Cloud APK Builder (Expo)
echo ============================================================
echo.
echo Launching EAS Build for Android APK (profile: preview)...
echo.
echo NOTE: If not logged in, EAS will prompt you in this terminal
echo to log in or create a free Expo account (takes ~30 seconds).
echo Once started, Expo Cloud will build your standalone .apk!
echo.

call npx eas-cli build -p android --profile preview

pause
