#!/usr/bin/env bash
# Muestra solo las decisiones marcadas como "revision pendiente".
exec python3 "$(dirname "$0")/scripts/decisiones.py" review
