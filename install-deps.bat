@echo off
cd /d F:\SYSTEMHOME
echo Instalando dependencias de SYSTEMHOME...
call "C:\Program Files\nodejs\npm.cmd" install --no-audit --no-fund
echo.
echo Instalacion completada.
pause