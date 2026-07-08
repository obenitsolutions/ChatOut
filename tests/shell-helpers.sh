#!/usr/bin/env bash
#
# Shell helpers for running ChatOut tests.
# Source from your shell:
#   source /Users/macbookpro/Documents/projects/InventoryApp/production/biztrack/chatout/tests/shell-helpers.sh
#
# After sourcing, these functions are available:
#   health                — GET /api/chat/health
#   chat SID MSG          — POST /api/chat with a real catalog
#   add_to_cart SID PID [QTY]  — direct tool call (bypasses the model)
#   remove_from_cart SID PID [QTY]
#   get_cart SID          — GET /api/cart/state?sessionId=...
#   recommend SID Q [CAT] [LIMIT]
#   admin_get PATH        — GET /api/admin/PATH with the bearer token
#   require_admin         — fail loud if ADMIN_API_KEY isn't set in this shell
#
# The PRODUCT_CATALOG is loaded lazily into $PRODUCTS_JSON the first time
# you call any helper. It's about 25KB for the bundled 50 products.

# --- paths --------------------------------------------------------------------
CHATOUT_ROOT="/Users/macbookpro/Documents/projects/InventoryApp/production/biztrack/chatout"
BASE="${BASE:-http://localhost:3021}"
FRONT="${FRONT:-http://localhost:5180}"
ADMIN_API_KEY="${ADMIN_API_KEY:-$(grep '^ADMIN_API_KEY=' "$CHATOUT_ROOT/backend/.env" 2>/dev/null | cut -d= -f2)}"
PRODUCTS_JSON=""

# --- private helpers ----------------------------------------------------------
_load_products() {
  if [ -z "$PRODUCTS_JSON" ]; then
    # Read into a tmpfile so we don't lose the value across subshell boundaries.
    node -e "require('fs').writeFileSync('/tmp/chatout-products.json', JSON.stringify(JSON.parse(require('fs').readFileSync('$CHATOUT_ROOT/frontend/src/data/products.json','utf-8'))))" \
      || { echo "FATAL: cannot load products.json" >&2; return 1; }
    PRODUCTS_JSON=$(cat /tmp/chatout-products.json)
  fi
}

_require_admin() {
  if [ -z "$ADMIN_API_KEY" ]; then
    echo "FATAL: ADMIN_API_KEY is not set. Set it in the env or in backend/.env." >&2
    return 1
  fi
}

# --- public helpers -----------------------------------------------------------
health() {
  curl -s "$BASE/api/chat/health"
}

chat() {
  local sid="$1"; local msg="$2"
  if [ -z "$sid" ] || [ -z "$msg" ]; then
    echo "Usage: chat <sessionId> <message>" >&2
    return 1
  fi
  _load_products || return 1
  local payload
  payload=$(node -e "
    const p = $PRODUCTS_JSON;
    console.log(JSON.stringify({
      sessionId: process.argv[1],
      message: process.argv[2],
      context: { shop: { businessName: 'African Heritage Fashion', currency: 'NGN' }, products: p }
    }));
  " "$sid" "$msg")
  curl -s -X POST "$BASE/api/chat" -H 'Content-Type: application/json' --data-binary "$payload"
}

add_to_cart() {
  local sid="$1" pid="$2" qty="${3:-1}"
  curl -s -X POST "$BASE/api/cart/tools" -H 'Content-Type: application/json' \
    -d "$(printf '{"tool":"add_to_cart","args":{"productId":"%s","qty":%s},"sessionId":"%s"}' "$pid" "$qty" "$sid")"
}

remove_from_cart() {
  local sid="$1" pid="$2" qty="$3"
  if [ -n "$qty" ]; then
    curl -s -X POST "$BASE/api/cart/tools" -H 'Content-Type: application/json' \
      -d "$(printf '{"tool":"remove_from_cart","args":{"productId":"%s","qty":%s},"sessionId":"%s"}' "$pid" "$qty" "$sid")"
  else
    curl -s -X POST "$BASE/api/cart/tools" -H 'Content-Type: application/json' \
      -d "$(printf '{"tool":"remove_from_cart","args":{"productId":"%s"},"sessionId":"%s"}' "$pid" "$sid")"
  fi
}

get_cart() {
  local sid="$1"
  curl -s "$BASE/api/cart/state?sessionId=$sid"
}

recommend() {
  local sid="$1" q="$2" cat="$3" limit="${4:-5}"
  local args="{\"query\":\"$q\""
  [ -n "$cat" ] && args="$args,\"category\":\"$cat\""
  [ -n "$limit" ] && args="$args,\"limit\":$limit"
  args="$args}"
  curl -s -X POST "$BASE/api/cart/tools" -H 'Content-Type: application/json' \
    -d "$(printf '{"tool":"recommend","args":%s,"sessionId":"%s"}' "$args" "$sid")"
}

admin_get() {
  _require_admin || return 1
  curl -s -H "Authorization: Bearer $ADMIN_API_KEY" "$BASE/api/admin/$1"
}

require_admin() {
  _require_admin
}

# --- one-liner intros ----------------------------------------------------------
echo "ChatOut test helpers loaded."
echo "  BASE  = $BASE"
echo "  FRONT = $FRONT"
echo "  ADMIN_API_KEY = ${ADMIN_API_KEY:+***set***}${ADMIN_API_KEY:-NOT SET}"
echo ""
echo "Try:  chat smoke-1 'hello' | jq '.rounds, .grounding.passed'"
echo "Or:   health | jq"