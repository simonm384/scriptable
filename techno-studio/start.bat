@echo off
title Techno Studio
cd /d "%~dp0"

REM ====================================================================
REM  Techno Studio - Doppelklick-Starter fuer Windows
REM  Startet einen lokalen Server und oeffnet die App im Browser.
REM  Dieses Fenster bitte WAEHREND des Musikmachens offen lassen.
REM  Zum Beenden: dieses Fenster schliessen.
REM ====================================================================

REM --- Python suchen (python / py / python3) ---
set "PY="
where python  >nul 2>&1 && set "PY=python"
if not defined PY ( where py      >nul 2>&1 && set "PY=py" )
if not defined PY ( where python3 >nul 2>&1 && set "PY=python3" )

if not defined PY goto :nopython

echo.
echo  Techno Studio wird gestartet ...
echo  Adresse: http://localhost:8000
echo.
echo  (Dieses Fenster offen lassen. Zum Beenden Fenster schliessen.)
echo.

REM Browser kurz verzoegert oeffnen, damit der Server bereit ist
start "" cmd /c "ping -n 2 127.0.0.1 >nul & start "" http://localhost:8000"

REM Server starten (laeuft, bis das Fenster geschlossen wird)
%PY% -m http.server 8000
goto :eof

:nopython
echo.
echo  ============================================================
echo   Python wurde auf diesem PC nicht gefunden.
echo  ============================================================
echo.
echo   Fuer das MIDI-Keyboard wird ein lokaler Server gebraucht.
echo   Bitte installiere Python (einmalig, kostenlos):
echo.
echo       https://www.python.org/downloads/
echo.
echo   WICHTIG: beim Installieren das Haekchen
echo   "Add Python to PATH" setzen, dann diese Datei erneut starten.
echo.
echo   ------------------------------------------------------------
echo   Ich oeffne die App jetzt trotzdem direkt im Browser.
echo   Dann funktionieren alle Sounds - nur das MIDI-Keyboard
echo   eventuell noch nicht.
echo   ------------------------------------------------------------
echo.
pause
start "" "%~dp0index.html"
goto :eof
