# BTCPay invoice proof path

Type: AFK, unless live BTCPay credentials are missing
Label: ready-for-agent

## Goal

Prove the narrow funding seam from BTCBOUNTY bounty state to BTCPay invoice creation/confirmation.

## Acceptance criteria

- [ ] Document required BTCPay env vars without exposing values.
- [ ] Run existing BTCPay proof scripts or identify exact missing credential/scope blocker.
- [ ] Verify a bounty can move through local funding metadata path.
- [ ] Confirm webhook handling path or document the gap.
- [ ] Save a receipt with command outputs summarized.

## Verification commands

- `pnpm test`
- `pnpm btcpay:e2e:doctor`
- `pnpm btcpay:e2e:preflight`
- `pnpm btcpay:e2e:invoice` when credentials are present

## Blockers

Live BTCPay credentials and reachable server may be required for full invoice proof.
