@echo off
title NITRO APEX - Game Server
cd /d "%~dp0"
set "NODE_EXE=%~dp0..\tools\node\node-v22.14.0-win-x64\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
start "" http://localhost:3000
"%NODE_EXE%" server.js
pause
