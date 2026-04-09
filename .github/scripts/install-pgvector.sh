#!/usr/bin/env bash
set -euo pipefail

container_id="${1:-$(docker ps -q --filter "ancestor=postgis/postgis:16-3.4" | head -n 1)}"

if [[ -z "${container_id}" ]]; then
  echo "PostGIS container not found" >&2
  exit 1
fi

docker exec -i "${container_id}" bash <<'EOF'
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

for attempt in 1 2 3; do
  echo "Installing pgvector package (attempt ${attempt}/3)"

  if apt-get update -o Acquire::Retries=3 \
    && apt-get install -y --no-install-recommends -o Acquire::Retries=3 postgresql-16-pgvector; then
    rm -rf /var/lib/apt/lists/*
    exit 0
  fi

  if [[ "${attempt}" -lt 3 ]]; then
    echo "pgvector install failed; cleaning apt state before retry" >&2
    apt-get clean
    rm -rf /var/lib/apt/lists/*
    sleep $((attempt * 5))
  fi
done

echo "pgvector install failed after 3 attempts" >&2
exit 1
EOF
