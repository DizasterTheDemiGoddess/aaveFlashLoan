AnythingLLM Community Hub Bulk Import
=====================================

This utility discovers items shared with your team on the AnythingLLM Community Hub and attempts to import them into your AnythingLLM instance in one run.

Prerequisites
-------------
- An AnythingLLM instance URL and developer API token
- Your Community Hub API/connection key
- The instance must allow agent bundle downloads if importing agent skills:
  - COMMUNITY_HUB_BUNDLE_DOWNLOADS_ENABLED=1 (or allow_all)

Install
-------

Create a virtual environment (optional) and install dependencies:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Usage
-----

Option A: one-command via wrapper:

```bash
cp .env.example .env
# Edit .env with your values
./import_all.sh --types all
```

Option B: set environment and run Python directly:

```bash
export HUB_URL="https://hub.anythingllm.com"
export COMMUNITY_HUB_KEY="<your-hub-key>"
export ANYTHINGLLM_URL="https://your-instance.example.com"
export ANYTHINGLLM_TOKEN="<your-developer-api-token>"

python bulk_import_hub_items.py --types all
```

Flags:
- `--dry-run`: list items only
- `--types`: comma-separated types (e.g., `agent-skill,tool`) or `all` (default)
- `--max`: limit number of items processed

Notes
-----
- This tool tries multiple discovery and import endpoints to support different versions.
- If imports fail, verify your instance exposes a Hub import endpoint and that bundle downloads are enabled.
