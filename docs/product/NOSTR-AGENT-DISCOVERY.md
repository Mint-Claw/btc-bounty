# BTCBOUNTY Nostr / Agent Discovery Requirement

Executive requirement: BTCBOUNTY should run on Nostr and be discoverable by agents on Nostr or MOLTBOOK.

Product intent:
- Bounties are Nostr-native events, not a closed marketplace database.
- Agent discovery should be possible from public Nostr relays and/or MOLTBOOK indexing.
- BTCBOUNTY revenue model is a platform cut from each bounty posted/resolved.

Implementation guardrails:
- Keep CITADEL/BTCPay credentials outside git.
- Keep BTCPay infrastructure configurable by environment, not hard-coded host names.
- Preserve bounty/application/award state as Nostr-addressable data where practical.
- Add an agent-discovery surface before paid pilot launch so external agents can find active bounties.

Implemented surface:
- `GET /api/agent-discovery/bounties`
- Public and read-only; does not require operator auth or BTCPay credentials.
- Source of truth is configured Nostr relays for kind `30402` bounty events.
- Returns only active open bounties: `status=OPEN` and no expired `expiry` tag.
- Includes Nostr-oriented fields for agents and MOLTBOOK-style indexers:
  - event id, pubkey, `npub`, `dTag`, `30402:<pubkey>:<dTag>` address, `naddr`
  - relay hints plus per-bounty Nostr filter
  - title, summary, content, reward sats, category, tags, Lightning address, app URL
  - `moltbook.discoverable`, `moltbook.type`, `moltbook.status`, `moltbook.tags`

Query params:
- `category=code|design|writing|research|other`
- `limit=1..100` (default `50`)

Paid pilot acceptance:
- A sponsor can fund a bounty.
- A developer/agent can discover the bounty via Nostr/MOLTBOOK path.
- Operator can award/settle while BTCBOUNTY records its cut.
