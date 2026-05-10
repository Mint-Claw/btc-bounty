# Public alpha deploy preflight

Type: AFK
Label: ready-for-agent

## Goal

Produce a verified production/deploy preflight for BTCBOUNTY public alpha without changing product scope.

## Acceptance criteria

- [ ] Identify deployment target and runtime command.
- [ ] Verify required env vars without printing secret values.
- [ ] Run unit tests.
- [ ] Run build.
- [ ] Confirm Nostr relay configuration and app URL configuration.
- [ ] Produce rollback/backup receipt.

## Verification commands

- `pnpm test`
- `pnpm build`
- deployment-target-specific smoke command, once target is confirmed

## Receipt expected

Save a status report with:

- commit
- branch
- tests
- build
- deploy target
- env preflight result without secrets
- rollback path

## Blockers

None for local preflight. Actual production deploy may be blocked by host/secret access.
