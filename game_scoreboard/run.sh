#!/usr/bin/with-contenv bashio
# ==============================================================================
# Home Assistant Add-on: Game Scoreboard
# Run script
# ==============================================================================

bashio::log.info "Iniciando Game Scoreboard Add-on..."

# Ensure data directories exist
mkdir -p /data/avatars
mkdir -p /data/backups

# Export environment variables for the FastAPI app
export DATA_DIR="/data"
export PORT="8099"

bashio::log.info "Iniciando servidor web en puerto 8099 con soporte de Ingress..."
exec python3 -m uvicorn main:app --host 0.0.0.0 --port 8099
