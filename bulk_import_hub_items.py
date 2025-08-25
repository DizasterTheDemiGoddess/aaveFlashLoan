#!/usr/bin/env python3
"""
Bulk-import items from the AnythingLLM Community Hub into an AnythingLLM instance.

This utility attempts multiple discovery and import strategies to accommodate
different deployment versions. It is safe to run repeatedly; items already present
in your instance should be skipped by the server if supported.

Environment variables:
  - HUB_URL (default: https://hub.anythingllm.com)
  - COMMUNITY_HUB_KEY (required): Your Community Hub API/connection key
  - ANYTHINGLLM_URL (required): Base URL of your AnythingLLM instance
  - ANYTHINGLLM_TOKEN (required): Developer API token for your AnythingLLM instance

CLI flags:
  --dry-run: Do not perform imports, only list what would be imported
  --types: Comma-separated list of types to import (e.g., agent-skill,tool,all)
  --max: Limit number of items to process

Note: Importing agent skills requires your instance to allow bundle downloads via
COMMUNITY_HUB_BUNDLE_DOWNLOADS_ENABLED. Set to "1" or "allow_all" depending on your policy.
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

import requests
from requests import Response


DEFAULT_HUB_URL = "https://hub.anythingllm.com"
DEFAULT_TYPES = {"agent-skill", "tool", "bundle", "integration", "template"}


def mask_secret(value: Optional[str], keep: int = 4) -> str:
    if not value:
        return ""
    if len(value) <= keep:
        return "*" * len(value)
    return f"{value[:keep]}***{value[-keep:]}"


def info(msg: str) -> None:
    print(msg, flush=True)


def warn(msg: str) -> None:
    print(f"[warn] {msg}", flush=True)


def err(msg: str) -> None:
    print(f"[error] {msg}", file=sys.stderr, flush=True)


class HttpClient:
    def __init__(self, base_url: str, headers: Optional[Dict[str, str]] = None, timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(headers or {})
        self.timeout = timeout

    def _request(self, method: str, path: str, **kwargs) -> Response:
        url = path if path.startswith("http") else f"{self.base_url}{path}"
        for attempt in range(5):
            try:
                resp = self.session.request(method=method, url=url, timeout=self.timeout, **kwargs)
                if resp.status_code in {429, 502, 503, 504}:
                    # transient
                    time.sleep(1.5 * (attempt + 1))
                    continue
                return resp
            except requests.RequestException as e:
                if attempt == 4:
                    raise
                time.sleep(1.0 * (attempt + 1))
        # Should not reach here
        raise RuntimeError("Unexpected request retry exit")

    def get(self, path: str, **kwargs) -> Response:
        return self._request("GET", path, **kwargs)

    def post(self, path: str, **kwargs) -> Response:
        return self._request("POST", path, **kwargs)


@dataclass
class HubItem:
    id: str
    title: str
    type: str
    import_url: Optional[str] = None
    bundle_url: Optional[str] = None


class HubClient:
    def __init__(self, hub_url: str, hub_key: str):
        # Try both Bearer and x-api-key header styles
        self.client_bearer = HttpClient(
            base_url=hub_url,
            headers={
                "Authorization": f"Bearer {hub_key}",
                "Accept": "application/json",
            },
        )
        self.client_key = HttpClient(
            base_url=hub_url,
            headers={
                "X-API-Key": hub_key,
                "Accept": "application/json",
            },
        )

    def _try_list(self, client: HttpClient, path: str) -> Optional[List[Dict[str, Any]]]:
        resp = client.get(path)
        if resp.status_code == 200:
            try:
                data = resp.json()
            except Exception:
                return None
            # Normalize common shapes
            if isinstance(data, dict):
                for key in ("items", "results", "data"):
                    if key in data and isinstance(data[key], list):
                        return data[key]
            if isinstance(data, list):
                return data
        return None

    def list_team_items(self) -> List[HubItem]:
        """Attempt several known/probable endpoints to list items accessible to the key."""
        candidate_paths = [
            "/api/v1/team/items",
            "/api/v1/me/team/items",
            "/api/v1/items?scope=team",
            "/api/team/items",
            "/api/v1/items",  # catch-all
        ]
        raw_items: Optional[List[Dict[str, Any]]] = None

        for client in (self.client_bearer, self.client_key):
            for path in candidate_paths:
                try:
                    raw_items = self._try_list(client, path)
                except requests.RequestException as e:
                    warn(f"Hub request failed for {path}: {e}")
                    continue
                if raw_items is not None:
                    break
            if raw_items is not None:
                break

        if raw_items is None:
            raise RuntimeError(
                "Unable to list items from the Hub. Ensure the COMMUNITY_HUB_KEY is valid and has access."
            )

        items: List[HubItem] = []
        for entry in raw_items:
            if not isinstance(entry, dict):
                continue
            item_id = str(entry.get("id") or entry.get("uuid") or entry.get("slug") or "").strip()
            title = str(entry.get("title") or entry.get("name") or item_id)
            item_type = str(entry.get("type") or entry.get("category") or "").strip().lower()
            import_url = entry.get("import_url") or entry.get("links", {}).get("import")
            bundle_url = entry.get("bundle_url") or entry.get("bundle")
            if not item_id:
                continue
            items.append(
                HubItem(
                    id=item_id,
                    title=title,
                    type=item_type,
                    import_url=import_url,
                    bundle_url=bundle_url,
                )
            )
        return items


class AnythingLLMClient:
    def __init__(self, base_url: str, api_token: str):
        self.client = HttpClient(
            base_url=base_url,
            headers={
                "Authorization": f"Bearer {api_token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )

    def _try_import_endpoints(self, payload: Dict[str, Any]) -> Optional[Response]:
        candidate_paths = [
            "/api/v1/community-hub/import",
            "/api/community-hub/import",
            "/api/v1/import",
            "/api/import",
        ]
        for path in candidate_paths:
            resp = self.client.post(path, data=json.dumps(payload))
            if resp.status_code in (200, 201, 202):
                return resp
            # If 404/405, try next; if 4xx with details, continue but log
            if resp.status_code >= 500:
                warn(f"Server error on {path}: {resp.status_code} {resp.text[:200]}")
            elif resp.status_code >= 400:
                warn(f"Import endpoint {path} rejected: {resp.status_code} {resp.text[:200]}")
        return None

    def import_hub_item(self, item: HubItem) -> bool:
        payload_candidates: List[Dict[str, Any]] = []

        # Prefer explicit import_url/bundle_url if available
        if item.import_url:
            payload_candidates.append({"import_url": item.import_url, "type": item.type, "id": item.id})
        if item.bundle_url:
            payload_candidates.append({"bundle_url": item.bundle_url, "type": item.type, "id": item.id})

        # Fallback to hub item reference only
        payload_candidates.append({"hub_item_id": item.id, "type": item.type})

        for payload in payload_candidates:
            resp = self._try_import_endpoints(payload)
            if resp is not None:
                return True
        return False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bulk import AnythingLLM Hub items")
    parser.add_argument("--dry-run", action="store_true", help="Only list items; do not import")
    parser.add_argument(
        "--types",
        type=str,
        default="all",
        help="Comma-separated item types to import (default: all)",
    )
    parser.add_argument("--max", type=int, default=0, help="Max number of items to process (0 = no limit)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    hub_url = os.getenv("HUB_URL", DEFAULT_HUB_URL).strip()
    hub_key = os.getenv("COMMUNITY_HUB_KEY", "").strip()
    instance_url = os.getenv("ANYTHINGLLM_URL", "").strip()
    instance_token = os.getenv("ANYTHINGLLM_TOKEN", "").strip()

    if not hub_key:
        err("COMMUNITY_HUB_KEY is required.")
        return 2
    if not args.dry_run and (not instance_url or not instance_token):
        err("ANYTHINGLLM_URL and ANYTHINGLLM_TOKEN are required unless using --dry-run.")
        return 2

    if args.dry_run:
        info(
            "Configured (dry-run):\n"
            f"  HUB_URL={hub_url}\n"
            f"  COMMUNITY_HUB_KEY={mask_secret(hub_key)}\n"
        )
    else:
        info(
            "Configured:\n"
            f"  HUB_URL={hub_url}\n"
            f"  COMMUNITY_HUB_KEY={mask_secret(hub_key)}\n"
            f"  ANYTHINGLLM_URL={instance_url}\n"
            f"  ANYTHINGLLM_TOKEN={mask_secret(instance_token)}\n"
        )

    hub = HubClient(hub_url=hub_url, hub_key=hub_key)
    try:
        items = hub.list_team_items()
    except Exception as e:
        err(f"Failed to enumerate Hub items: {e}")
        return 1

    if not items:
        info("No items found for your team.")
        return 0

    # Filter by types
    requested_types = args.types.strip().lower()
    if requested_types == "all" or requested_types == "*":
        allowed_types = None
    else:
        allowed_types = {t.strip() for t in requested_types.split(",") if t.strip()}

    filtered: List[HubItem] = []
    for item in items:
        item_type = item.type or ""
        if allowed_types is not None and item_type not in allowed_types:
            continue
        filtered.append(item)

    if args.max and len(filtered) > args.max:
        filtered = filtered[: args.max]

    info(f"Discovered {len(items)} items; {len(filtered)} match selection.")
    for idx, item in enumerate(filtered, start=1):
        info(f"[{idx}/{len(filtered)}] {item.type or 'unknown'} | {item.title} (id={item.id})")

    if args.dry_run:
        info("Dry-run complete. No imports attempted.")
        return 0

    client = AnythingLLMClient(base_url=instance_url, api_token=instance_token)

    success = 0
    for idx, item in enumerate(filtered, start=1):
        info(f"Importing {idx}/{len(filtered)}: {item.title} (type={item.type or 'unknown'}) ...")
        try:
            ok = client.import_hub_item(item)
        except Exception as e:
            warn(f"Import failed: {e}")
            ok = False
        if ok:
            success += 1
            info("  -> Imported")
        else:
            warn("  -> Import not accepted by server (skipped or unsupported endpoint)")

    info(f"Done. Imported {success}/{len(filtered)} items.")
    if success == 0:
        warn(
            "No items imported. Ensure your instance exposes a compatible import endpoint and that COMMUNITY_HUB_BUNDLE_DOWNLOADS_ENABLED is set."
        )
    return 0 if success > 0 else 1


if __name__ == "__main__":
    sys.exit(main())

