@echo off
setlocal
title GravityDesk - Android APK Builder
cd /d "%~dp0\mobile\android"

echo ============================================================
echo   GravityDesk Android APK Builder
echo ============================================================
echo.
echo Building Standalone Release APK...
echo (First build may take several minutes to download Android dependencies)
echo.

call gradlew.bat assembleRelease

if %ERRORLEVEL% equ 0 (
    echo.
    echo ============================================================
    echo [SUCCESS] APK Generated Successfully!
    echo Location: mobile\android\app\build\outputs\apk\release\app-release.apk
    echo ============================================================
    echo.
    echo To install on your connected Android device, run:
    echo adb install -r mobile\android\app\build\outputs\apk\release\app-release.apk
) else (
    echo.
    echo [ERROR] Build failed. Review gradle logs above.
)

pause
