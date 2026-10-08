#!/usr/bin/env bash
# Throwaway Postgres for the Series Finale e2e suite. Localhost only, no volume.
set -euo pipefail
NAME=watchthis-e2e-pg
IMAGE=docker.io/library/postgres:17
case "${1:-}" in
  up)
    podman container exists "$NAME" && { echo "$NAME already running"; exit 0; }
    podman run -d --name "$NAME" -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e \
      -e POSTGRES_DB=watchthis_e2e -p 127.0.0.1:5433:5432 "$IMAGE" >/dev/null
    # Over TCP, not the socket: the image's init phase runs a temporary server
    # on the socket only, then restarts, so a socket check passes too early and
    # the next client (migrate) is cut off mid-restart.
    for _ in $(seq 1 60); do
      podman exec "$NAME" pg_isready -h 127.0.0.1 -U e2e -d watchthis_e2e >/dev/null 2>&1 && { echo "ready"; exit 0; }
      sleep 1
    done
    echo "postgres did not become ready" >&2; exit 1 ;;
  down) podman rm -f "$NAME" >/dev/null 2>&1 || true; echo "removed" ;;
  reset) "$0" down; "$0" up ;;
  psql) shift; podman exec -i "$NAME" psql -U e2e -d watchthis_e2e "$@" ;;
  *) echo "usage: db.sh up|down|reset|psql" >&2; exit 2 ;;
esac
