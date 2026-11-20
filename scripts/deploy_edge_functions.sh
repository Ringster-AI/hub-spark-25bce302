#!/usr/bin/env bash
#
# Deploy the edge functions to the Ringster VPS.
#
# WHY THIS EXISTS
# ---------------
# The dispatcher (supabase/functions/main/index.ts) is the ONLY thing
# enforcing per-function authentication on the self-hosted edge runtime --
# the runtime has no JWT code of its own, and the global VERIFY_JWT switch
# cannot express "webhooks stay public, everything else needs a JWT".
#
# That means a deploy that overwrites the functions volume without carrying
# `main/` silently removes the auth gate and exposes every protected
# function. This script exists so that:
#
#   1. The dispatcher is always deployed alongside the functions.
#   2. A deploy that fails to carry the dispatcher fails LOUDLY, before
#      the functions container is recreated.
#   3. The result is verified after the deploy, not assumed.
#
# USAGE
# -----
#   ./scripts/deploy_edge_functions.sh [--dry-run] [--host HOST] [--key PATH]
#
# Environment:
#   RINGSTER_HOST    VPS hostname or IP        (default: 31.220.93.139)
#   RINGSTER_SSH_KEY Path to the SSH private key
#   RINGSTER_COMPOSE_DIR  compose directory on the VPS
#                                 (default: /opt/supabase/docker)
#   RINGSTER_FUNCTIONS_DIR  functions volume on the VPS
#                                 (default: $RINGSTER_COMPOSE_DIR/volumes/functions)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/supabase/functions"

HOST="${RINGSTER_HOST:-31.220.93.139}"
SSH_KEY="${RINGSTER_SSH_KEY:-$HOME/.ssh/id_ed25519_emtrio_vps}"
COMPOSE_DIR="${RINGSTER_COMPOSE_DIR:-/opt/supabase/docker}"
FUNCTIONS_DIR="${RINGSTER_FUNCTIONS_DIR:-$COMPOSE_DIR/volumes/functions}"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --host)   shift; HOST="$1" ;;
    --key)    shift; SSH_KEY="$1" ;;
    --help|-h)
      sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

log()  { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -d "$SOURCE_DIR" ] || fail "source directory not found: $SOURCE_DIR"
[ -f "$SSH_KEY" ]     || fail "SSH key not found: $SSH_KEY"

# The dispatcher is the security boundary. Refuse to deploy without it.
[ -f "$SOURCE_DIR/main/index.ts" ] || \
  fail "dispatcher missing: $SOURCE_DIR/main/index.ts -- refusing to deploy (this would remove the auth gate)"
[ -f "$SOURCE_DIR/main/policy.ts" ] || \
  fail "policy module missing: $SOURCE_DIR/main/policy.ts -- refusing to deploy"

SSH=(ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "root@$HOST")

log "source:      $SOURCE_DIR"
log "destination: root@$HOST:$FUNCTIONS_DIR"
log "dispatcher:  main/index.ts ($(wc -c < "$SOURCE_DIR/main/index.ts" | tr -d ' ') bytes)"

if [ "$DRY_RUN" = "1" ]; then
  log "DRY RUN -- files that would be synced:"
  (cd "$SOURCE_DIR" && find . -type f -name '*.ts' | sort | sed 's/^/    /')
  log "would then: docker compose up -d --force-recreate functions"
  log "would then: verify the dispatcher and the auth gate"
  exit 0
fi

# --- 1. sync the functions -------------------------------------------------
# --delete keeps the remote in step with the repo, but the dispatcher is
# excluded from deletion as a belt-and-braces guard: even a bad filter
# cannot remove the auth gate.
log "syncing functions..."
rsync -az --delete \
  --exclude 'main/' \
  --exclude '*.bak' \
  --exclude '*.pre-*' \
  --exclude '.DS_Store' \
  "$SOURCE_DIR/" "root@$HOST:$FUNCTIONS_DIR/" \
  -e "ssh -i $SSH_KEY -o IdentitiesOnly=yes"

log "syncing dispatcher (main/)..."
rsync -az \
  --exclude '*.bak' \
  --exclude '.DS_Store' \
  "$SOURCE_DIR/main/" "root@$HOST:$FUNCTIONS_DIR/main/" \
  -e "ssh -i $SSH_KEY -o IdentitiesOnly=yes"

# --- 2. verify the dispatcher landed BEFORE recreating the container -------
log "verifying the dispatcher landed..."
"${SSH[@]}" bash -s -- "$FUNCTIONS_DIR" <<'REMOTE'
set -euo pipefail
DIR="$1"

[ -f "$DIR/main/index.ts" ] || { echo "  dispatcher MISSING at $DIR/main/index.ts" >&2; exit 1; }
[ -f "$DIR/main/policy.ts" ] || { echo "  policy module MISSING at $DIR/main/policy.ts" >&2; exit 1; }

grep -q "PUBLIC_FUNCTIONS" "$DIR/main/index.ts" \
  || grep -q "PUBLIC_FUNCTIONS" "$DIR/main/policy.ts" \
  || { echo "  no PUBLIC_FUNCTIONS allowlist found -- this is not the patched dispatcher" >&2; exit 1; }

echo "  dispatcher present, allowlist present"
REMOTE

# --- 3. recreate the functions container ----------------------------------
log "recreating the functions container..."
"${SSH[@]}" bash -s -- "$COMPOSE_DIR" <<'REMOTE'
set -euo pipefail
cd "$1"
docker compose up -d --force-recreate functions
REMOTE

# --- 4. verify the running stack ------------------------------------------
log "waiting for the functions container to become healthy..."
for _ in $(seq 1 30); do
  status=$("${SSH[@]}" docker inspect supabase-edge-functions \
    --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
  [ "$status" = "healthy" ] && break
  sleep 2
done
[ "$status" = "healthy" ] || fail "functions container is '$status', expected 'healthy'"
log "container is healthy"

log "smoke-testing the auth gate..."
"${SSH[@]}" bash -s <<'REMOTE'
set -euo pipefail

# A protected function with no Authorization header must be rejected by
# the dispatcher. A public function must NOT be rejected for the same
# reason (it may fail for its own reasons, but not with a 401 from the
# dispatcher's gate).
protected_status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
  "http://kong:8000/functions/v1/text-to-speech" || echo 000)
echo "  protected function, no token -> $protected_status"
[ "$protected_status" = "401" ] || {
  echo "  expected 401 from the auth gate" >&2
  exit 1
}

public_status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
  "http://kong:8000/functions/v1/process-campaigns" || echo 000)
echo "  public function, no token   -> $public_status"
[ "$public_status" != "401" ] || {
  echo "  a public function is being rejected by the gate" >&2
  exit 1
}

echo "  auth gate behaving as expected"
REMOTE

log "deploy complete"
log "  dispatcher : $FUNCTIONS_DIR/main/index.ts"
log "  functions  : $(ls -1 "$SOURCE_DIR" | grep -vE '^_shared$|^config.toml$' | wc -l | tr -d ' ') directories"
