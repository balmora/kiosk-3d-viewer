@echo off
title Push to GitHub
color 0A

echo.
echo  ================================
echo   Push to GitHub
echo  ================================
echo.

:: Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Git is not installed!
    echo  Please install from https://git-scm.com
    echo.
    pause
    exit /b 1
)

:: Ask for commit message
echo  Enter a commit message:
echo  (describe what you changed)
echo.
set /p COMMIT_MSG="  > "

if "%COMMIT_MSG%"=="" (
    set COMMIT_MSG="Update"
)

echo.
echo  [..] Adding files...
git add .

echo  [..] Committing...
git commit -m "%COMMIT_MSG%"

echo  [..] Pushing to GitHub...
git push origin main

echo.
if %errorlevel%==0 (
    color 0A
    echo  [OK] Successfully pushed to GitHub!
) else (
    color 0C
    echo  [ERROR] Push failed!
    echo  Check your internet connection
    echo  and GitHub credentials
)

echo.
pause