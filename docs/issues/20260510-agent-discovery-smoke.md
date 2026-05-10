# Agent discovery smoke test

Type: AFK
Label: ready-for-agent

## Goal

Verify that an external agent can discover BTCBOUNTY bounties and understand how to act on them.

## Acceptance criteria

- [ ] Identify the machine-readable discovery endpoint/feed.
- [ ] Fetch it from a clean shell using curl or equivalent.
- [ ] Confirm each item exposes bounty ID, title, reward/funding info, status, and action URL or instructions.
- [ ] Confirm public docs explain the agent path.
- [ ] Save receipt with endpoint, status code, and redacted sample fields.

## Verification commands

- `pnpm test`
- `pnpm build`
- local or deployed `curl` smoke against discovery/feed endpoint

## Blockers

Requires running app or deployed preview URL for full smoke.
