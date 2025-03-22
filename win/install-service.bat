@echo off
rem install-service.bat - Installs the Orchestra Satellite service
setlocal enabledelayedexpansion

net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo This script requires administrative privileges.
    echo Please approve the prompt in the next window.
    powershell -Command "Start-Process '%~f0' -Verb runAs"
    exit /b
)

rem Get the directory of the script
set "SCRIPT_DIR=%~dp0"
set "NODE_EXE=%SCRIPT_DIR%bin\node.exe"
set "MAIN_JS=%SCRIPT_DIR%main.js --install"

rem Check if Node.exe exists
if not exist "%NODE_EXE%" (
    echo ERROR: Node executable not found at: %NODE_EXE%
    exit /b 1
)

rem Check if the main script exists
if not exist "%MAIN_JS%" (
    echo ERROR: Satellite main script not found at: %MAIN_JS%
    exit /b 1
)

echo Installing Orchestra Satellite...

rem Start the application
"%NODE_EXE%" "%MAIN_JS%"

rem Check if process started successfully
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install Orchestra Satellite. Exit code: %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

endlocal
exit /b
