#!/bin/sh
# Builds and starts smelp the way the README says, then checks that it works.
# Deletes only its own containers and volume, because of the project name.
set -eu

export COMPOSE_PROJECT_NAME=smelp-smoke-test
port="${SMELP_PORT:-3000}"
base="http://localhost:$port"

cleanup() {
	status=$?
	if [ "$status" -ne 0 ]; then docker compose logs --no-log-prefix || true; fi
	docker compose down -v || true
	exit "$status"
}
trap cleanup EXIT

# Waits until the container's health check passes.
docker compose up -d --build --wait --wait-timeout 120

curl --fail --silent --show-error --max-time 10 "$base/api/status" >/dev/null
curl --fail --silent --show-error --max-time 10 "$base/signin" | grep -q 'id="root"'

curl --fail --silent --show-error --max-time 10 "$base/rpc/auth/signUp" \
	-H 'content-type: application/json' \
	-d '{"json":{"email":"smoke@example.test","fullName":"Smoke","displayName":"smoke","password":"correct-horse-battery"}}' >/dev/null

docker compose exec -T smelp bun run --silent backup | grep -q 'Backup saved'

echo "Docker smoke test passed"
