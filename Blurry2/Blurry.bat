@echo off
:: Blurry 2 launcher - admin elevate + run main PS1
title Blurry 2

NET FILE 1>NUL 2>NUL
if '%errorlevel%' == '0' (goto :run) else (goto :elevate)

:elevate
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
exit /b

:run
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Blurry.ps1" %*
exit /b
