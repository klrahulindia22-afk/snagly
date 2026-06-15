import re
from datetime import datetime, timezone
from urllib.parse import urlparse
import httpx
from models.card import Card
from models.integration import Integration, IntegrationType
from services.encryption import decrypt_json

# Fix 3: SSRF prevention — validate GitLab base_url before making requests
_SAFE_URL_RE = re.compile(r'^https://[a-zA-Z0-9][a-zA-Z0-9.\-]+(:\d{1,5})?$')
_PRIVATE_HOST_RE = re.compile(
    r'^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)',
    re.IGNORECASE,
)


def _validate_gitlab_base_url(url: str) -> None:
    if not _SAFE_URL_RE.match(url):
        raise ValueError(f"Invalid GitLab base URL: {url!r}")
    hostname = urlparse(url).hostname or ""
    if _PRIVATE_HOST_RE.match(hostname):
        raise ValueError(f"GitLab base URL must not target internal hosts: {hostname}")


async def push_card(card: Card, integration: Integration) -> tuple:
    """Push card to external system. Returns (external_id, external_url, error_message)."""
    config = decrypt_json(integration.config_json)
    if not config:
        return None, None, "Failed to decrypt integration config"

    int_type = integration.type
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if int_type == IntegrationType.clickup:
                return await _push_clickup(client, card, config)
            elif int_type == IntegrationType.github:
                return await _push_github(client, card, config)
            elif int_type == IntegrationType.gitlab:
                return await _push_gitlab(client, card, config)
            else:
                return None, None, f"Unknown integration type: {int_type}"
    except httpx.TimeoutException:
        return None, None, "Request timed out"
    except httpx.RequestError as e:
        return None, None, f"Network error: {str(e)}"
    except Exception as e:
        return None, None, f"Unexpected error: {str(e)}"


async def _push_clickup(client: httpx.AsyncClient, card: Card, config: dict) -> tuple:
    api_token = config.get("api_token", "")
    list_id = config.get("list_id", "")
    if not api_token or not list_id:
        return None, None, "Missing ClickUp api_token or list_id in config"

    # Map priority: urgent=1, high=2, normal=3, low=4
    priority_map = {"urgent": 1, "high": 2, "normal": 3, "low": 4}
    priority_val = priority_map.get(card.priority.value if card.priority else "normal", 3)

    body = {
        "name": card.title,
        "description": card.description or "",
        "priority": priority_val,
    }
    if card.due_date:
        # ClickUp expects millisecond Unix timestamp
        ts = int(card.due_date.replace(tzinfo=timezone.utc).timestamp() * 1000)
        body["due_date"] = ts

    resp = await client.post(
        f"https://api.clickup.com/api/v2/list/{list_id}/task",
        headers={"Authorization": api_token, "Content-Type": "application/json"},
        json=body,
    )
    if resp.status_code in (200, 201):
        data = resp.json()
        task_id = data.get("id", "")
        url = data.get("url", f"https://app.clickup.com/t/{task_id}")
        return task_id, url, None
    return None, None, f"ClickUp API error {resp.status_code}: {resp.text[:200]}"


async def _push_github(client: httpx.AsyncClient, card: Card, config: dict) -> tuple:
    token = config.get("token", "")
    owner = config.get("owner", "")
    repo = config.get("repo", "")
    if not token or not owner or not repo:
        return None, None, "Missing GitHub token, owner, or repo in config"

    # Build body markdown
    body_parts = []
    if card.description:
        body_parts.append(card.description)
    body_parts.append(f"\n---\n*Priority: {card.priority.value if card.priority else 'normal'}*")
    if card.severity:
        body_parts.append(f"*Severity: {card.severity.value}*")
    body_parts.append(f"*Pushed from Snagly*")

    payload = {
        "title": card.title,
        "body": "\n".join(body_parts),
    }

    resp = await client.post(
        f"https://api.github.com/repos/{owner}/{repo}/issues",
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
        },
        json=payload,
    )
    if resp.status_code == 201:
        data = resp.json()
        issue_number = str(data.get("number", ""))
        url = data.get("html_url", "")
        return issue_number, url, None
    return None, None, f"GitHub API error {resp.status_code}: {resp.text[:200]}"


async def _push_gitlab(client: httpx.AsyncClient, card: Card, config: dict) -> tuple:
    token = config.get("token", "")
    project_id = config.get("project_id", "")
    base_url = config.get("base_url", "https://gitlab.com").rstrip("/")
    if not token or not project_id:
        return None, None, "Missing GitLab token or project_id in config"
    # Fix 3: reject SSRF — only allow safe https URLs pointing to public hosts
    try:
        _validate_gitlab_base_url(base_url)
    except ValueError as exc:
        return None, None, str(exc)

    description_parts = []
    if card.description:
        description_parts.append(card.description)
    description_parts.append(f"\n---\nPriority: {card.priority.value if card.priority else 'normal'}")
    if card.severity:
        description_parts.append(f"Severity: {card.severity.value}")
    description_parts.append("*Pushed from Snagly*")

    payload = {
        "title": card.title,
        "description": "\n".join(description_parts),
    }
    if card.due_date:
        payload["due_date"] = card.due_date.strftime("%Y-%m-%d")

    import urllib.parse
    encoded_id = urllib.parse.quote(str(project_id), safe="")
    resp = await client.post(
        f"{base_url}/api/v4/projects/{encoded_id}/issues",
        headers={"PRIVATE-TOKEN": token, "Content-Type": "application/json"},
        json=payload,
    )
    if resp.status_code == 201:
        data = resp.json()
        issue_iid = str(data.get("iid", ""))
        url = data.get("web_url", "")
        return issue_iid, url, None
    return None, None, f"GitLab API error {resp.status_code}: {resp.text[:200]}"
