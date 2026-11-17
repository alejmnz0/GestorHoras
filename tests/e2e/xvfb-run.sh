#!/bin/sh
# Ejecuta la E2E en Linux sin pantalla con un gestor de ventanas (necesario para minimizar).
openbox >/dev/null 2>&1 &
sleep 0.5
node tests/e2e/run.mjs
