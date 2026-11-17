#!/bin/sh
# Ejecuta la E2E en Linux sin pantalla con un gestor de ventanas (necesario para minimizar).
# Para probar la app instalada: E2E_EXECUTABLE="/opt/Gestor de Horas/gestor-horas" xvfb-run -a sh tests/e2e/xvfb-run.sh
openbox >/dev/null 2>&1 &
sleep 0.5
node tests/e2e/run.mjs
