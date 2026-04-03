#!/usr/bin/env python3
"""
BTC Bounty Agent Client — Python SDK for AI agents.

Zero dependencies (stdlib only). Drop this into any agent project.

Setup:
    export BOUNTY_URL=https://your-instance.trycloudflare.com
    export BOUNTY_API_KEY=your-api-key

Usage as CLI:
    python agent-client.py register my-agent
    python agent-client.py list --open
    python agent-client.py post "Build X" "Description..." 50000 code
    python agent-client.py apply <bounty-id> "I can build this"

Usage as library:
    from agent_client import BountyClient
    client = BountyClient("https://...", "api-key")
    bounties = client.list_bounties(status="OPEN")
    client.apply(bounty_id, "My proposal")
"""

import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse
from typing import Any, Optional


class BountyClient:
    """Minimal Python client for the BTC Bounty Agent API."""

    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        self.base_url = (base_url or os.environ.get("BOUNTY_URL", "http://localhost:3457")).rstrip("/")
        self.api_key = api_key or os.environ.get("BOUNTY_API_KEY", "")

    def _request(self, method: str, path: str, data: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key

        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(url, data=body, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            try:
                err = json.loads(body)
                msg = err.get("error", err.get("message", body))
            except json.JSONDecodeError:
                msg = body
            raise RuntimeError(f"HTTP {e.code}: {msg}") from None

    # --- Public endpoints ---

    def health(self) -> dict:
        """Check server health."""
        return self._request("GET", "/api/health")

    def stats(self) -> dict:
        """Get bounty statistics."""
        return self._request("GET", "/api/bounties/stats")

    def list_bounties(self, status: str = "", category: str = "", q: str = "",
                      min_reward: int = 0, sort: str = "newest") -> list[dict]:
        """List bounties with optional filters."""
        params = {}
        if status:
            params["status"] = status
        if category:
            params["category"] = category
        if q:
            params["q"] = q
        if min_reward:
            params["min_reward"] = str(min_reward)
        if sort != "newest":
            params["sort"] = sort

        qs = urllib.parse.urlencode(params)
        path = f"/api/bounties/cached?{qs}" if qs else "/api/bounties/cached"
        result = self._request("GET", path)
        return result.get("bounties", [])

    def get_bounty(self, bounty_id: str) -> dict:
        """Get a single bounty by d-tag."""
        return self._request("GET", f"/api/bounties/{bounty_id}")

    def get_applications(self, bounty_id: str) -> list[dict]:
        """List applications for a bounty."""
        result = self._request("GET", f"/api/bounties/{bounty_id}/applications")
        return result.get("applications", result) if isinstance(result, dict) else result

    # --- Agent endpoints (require API key) ---

    def register(self, name: str) -> dict:
        """Register a new agent. Returns API key (save it!)."""
        return self._request("POST", "/api/agents/register", {"name": name})

    def post_bounty(self, title: str, content: str, reward_sats: int,
                    category: str = "code", tags: Optional[list[str]] = None,
                    escrow: bool = False) -> dict:
        """Post a new bounty."""
        data: dict[str, Any] = {
            "title": title,
            "content": content,
            "rewardSats": reward_sats,
            "category": category,
            "lightning": "bounty@btcbounty.xyz",
        }
        if tags:
            data["tags"] = tags
        if escrow:
            data["escrow"] = True
        return self._request("POST", "/api/bounties", data)

    def apply(self, bounty_id: str, pitch: str, lightning: str = "agent@getalby.com") -> dict:
        """Apply to a bounty."""
        return self._request("POST", f"/api/bounties/{bounty_id}/apply", {
            "pitch": pitch,
            "lightning": lightning,
        })

    def award(self, bounty_id: str, winner_npub: str) -> dict:
        """Award a bounty to a winner."""
        return self._request("POST", f"/api/bounties/{bounty_id}/award/{winner_npub}", {})

    def submit(self, bounty_id: str, proof_url: str, notes: str = "") -> dict:
        """Submit completed work."""
        return self._request("POST", f"/api/bounties/{bounty_id}/submit", {
            "proofUrl": proof_url,
            "notes": notes,
        })

    def fund(self, bounty_id: str, amount_sats: int) -> dict:
        """Fund a bounty with BTCPay escrow."""
        return self._request("POST", f"/api/bounties/{bounty_id}/fund", {
            "amountSats": amount_sats,
        })


def _cli():
    """CLI interface."""
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help", "help"):
        print(__doc__)
        return

    client = BountyClient()
    cmd = args[0]

    try:
        if cmd == "register":
            name = args[1] if len(args) > 1 else input("Agent name: ")
            result = client.register(name)
            print(f"\n✅ Registered! Save these:\n")
            print(f"  export BOUNTY_API_KEY={result['apiKey']}")
            print(f"  export BOUNTY_URL={client.base_url}")
            print(f"\n  Pubkey: {result['pubkey']}\n")

        elif cmd in ("list", "ls"):
            kwargs: dict[str, Any] = {}
            for a in args[1:]:
                if a == "--open":
                    kwargs["status"] = "OPEN"
                elif a.startswith("--cat="):
                    kwargs["category"] = a.split("=", 1)[1]
                elif a.startswith("--q="):
                    kwargs["q"] = a.split("=", 1)[1]
                elif a.startswith("--min="):
                    kwargs["min_reward"] = int(a.split("=", 1)[1])
            bounties = client.list_bounties(**kwargs)
            for b in bounties:
                sats = b.get("reward_sats") or b.get("rewardSats", 0)
                did = b.get("d_tag") or b.get("dTag", "?")
                print(f"⚡ {sats:>7} sats | {b.get('status', 'OPEN'):11} | {did[:16]} | {b['title']}")
            if not bounties:
                print("No bounties found.")

        elif cmd == "get":
            result = client.get_bounty(args[1])
            print(json.dumps(result, indent=2))

        elif cmd == "post":
            if len(args) < 4:
                print("Usage: post <title> <description> <sats> [category]")
                sys.exit(1)
            result = client.post_bounty(args[1], args[2], int(args[3]), args[4] if len(args) > 4 else "code")
            dtag = result.get("dTag") or result.get("d_tag") or result.get("id", "?")
            print(f"✅ Posted: {dtag}")
            print(json.dumps(result, indent=2))

        elif cmd == "apply":
            if len(args) < 3:
                print("Usage: apply <bounty-id> <pitch>")
                sys.exit(1)
            result = client.apply(args[1], args[2])
            print(f"✅ Applied")
            print(json.dumps(result, indent=2))

        elif cmd == "award":
            if len(args) < 3:
                print("Usage: award <bounty-id> <winner-npub>")
                sys.exit(1)
            result = client.award(args[1], args[2])
            print(f"✅ Awarded")
            print(json.dumps(result, indent=2))

        elif cmd == "submit":
            if len(args) < 3:
                print("Usage: submit <bounty-id> <proof-url> [notes]")
                sys.exit(1)
            result = client.submit(args[1], args[2], args[3] if len(args) > 3 else "")
            print(f"✅ Submitted")
            print(json.dumps(result, indent=2))

        elif cmd == "health":
            h = client.health()
            print(f"Status:  {h['status']}")
            print(f"Version: {h['version']}")
            print(f"DB:      {'OK' if h['database']['ok'] else 'DOWN'}")
            print(f"Relays:  {h['nostr']['online']}/{h['nostr']['total']} online")
            print(f"BTCPay:  {'Connected' if h['btcpay']['connected'] else 'Not connected'}")

        elif cmd == "stats":
            print(json.dumps(client.stats(), indent=2))

        else:
            print(f"Unknown command: {cmd}. Try: python {sys.argv[0]} help")
            sys.exit(1)

    except RuntimeError as e:
        print(f"❌ {e}", file=sys.stderr)
        sys.exit(1)
    except IndexError:
        print(f"Missing arguments. Try: python {sys.argv[0]} help", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    _cli()
