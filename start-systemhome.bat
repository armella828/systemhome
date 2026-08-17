@echo off
cd /d "%~dp0"
title SYSTEMHOME Security - Servidor Principal
echo ============================================================
echo   SYSTEMHOME SECURITY - SISTEMA WEB INTEGRAL
echo ============================================================
echo.

echo [1/2] Verificando dependencias...
if not exist "node_modules\express\package.json" (
    echo Instalando dependencias necesarias...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo ERROR: No se pudieron instalar las dependencias.
        pause
        exit /b 1
    )
) else (
    echo Dependencias listas y verificadas.
)

echo.
echo [2/2] Iniciando servidor SYSTEMHOME en http://localhost:3000
echo Abrir en navegador: http://localhost:3000
echo.
node backend/server.js
pause