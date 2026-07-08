# ChatOut Tests

This folder contains **manual + scripted test recipes** for the ChatOut
backend + frontend. They are organised by *what they verify*, not by *file*.

## Files

| File | Purpose |
|---|---|
| [`test-playbooks.md`](./test-playbooks.md) | The canonical playbook — **~57 documented tests** covering smoke, tool calling, cart listing, grounding, system-prompt rules, multilingual, edge cases, admin auth + SQL-injection, and browser flows. |
| [`shell-helpers.sh`](./shell-helpers.sh) | `source` this to get `chat`, `add_to_cart`, `remove_from_cart`, `get_cart`, `recommend`, and `admin_get` helpers in your shell. Reduces test commands to one line. |

## How to run them

### One-time setup
```bash
# 1. Start backend + frontend (see main README)
cd /Users/macbookpro/Documents/projects/InventoryApp/production/biztrack/chatout/backend
npm run dev

# In another terminal
cd /Users/macbookpro/Documents/projects/InventoryApp/production/biztrack/chatout/frontend
npm run dev

# 2. Source the helpers
source /Users/macbookpro/Documents/projects/InventoryApp/production/biztrack/chatout/tests/shell-helpers.sh
```

### Quick run
```bash
# T01 — Backend health
health
# T02 — Basic greeting
chat "smoke-1" "hello" | jq '.rounds, .model, .grounding.passed'
# T10 — Add to cart
chat "tools-1" "add senator wine to cart" | jq '.actions[] | select(.type=="add_to_cart")'
```

### Full test pass
Walk through every section of `test-playbooks.md` in order:
`§2 Smoke → §3 Tools → §4 Listing → §5 Grounding → §6 Rules → §7
Multilingual → §8 Edge cases → §9 Admin auth → §10 Browser flow`.

## When to add tests

Every time you:

- Fix a bug → add a test that fails on the bug and passes on the fix.
- Add a feature → add at least one happy-path + one edge-case test.
- Change the system prompt → re-run §6 (Rules) and §4 (Listing).
- Change the schema → re-run §9 (Admin DB) and §5 (Grounding).
- Change a tool implementation → re-run §3 (Tools) and §8 (Edge cases).

## CI integration (future)

The curl-based tests in `test-playbooks.md` are deliberately shell-portable
so they can be lifted into a CI runner (GitHub Actions, etc.) with minimal
modification. Mark each test as `MUST` (blocks release) or `SHOULD` (warn)
once the suite reaches a stable size.

## Related docs

- `/plans/007_plan_tool_calling_interactions_db.md` — design rationale for
  tool calling + interactions DB.
- `/plans/008_plan_grounding_humanizer_admin_auth.md` — grounding verification
  + humanizer + admin auth.
- `/docs/commands.txt` — how to start the dev servers.