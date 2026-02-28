@echo off
title Starting Ollama
color 0A

echo.
echo  ================================
echo   Starting Ollama AI Server
echo  ================================
echo.

:: ✅ Allow browser requests to Ollama
set OLLAMA_ORIGINS=*

echo  [..] Starting Ollama...
ollama serve

pause