@echo off
REM ============================================================
REM  Double-click this file to publish to GitHub Pages.
REM
REM  Why a .cmd wrapper is needed:
REM    - .ps1 files are associated with Notepad by default, so
REM      double-clicking one only OPENS the editor.
REM    - PowerShell blocks unsigned scripts by default
REM      (ExecutionPolicy). .cmd is not subject to that.
REM    - This wrapper calls publish.ps1 with -ExecutionPolicy
REM      Bypass, which bypasses the block for this run only.
REM
REM  NOTE: keep this file ASCII-only. Non-ASCII bytes inside a
REM  .cmd break cmd.exe parsing on non-UTF8 codepages.
REM ============================================================

setlocal
cd /d "%~dp0"

where pwsh >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish.ps1" %*
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish.ps1" %*
)

set EXITCODE=%ERRORLEVEL%
echo.
if %EXITCODE% EQU 0 (
    echo [DONE] Press any key to close...
) else (
    echo [FAILED] Exit code %EXITCODE% - please screenshot the text above.
    echo Press any key to close...
)
pause >nul
endlocal
exit /b %EXITCODE%
