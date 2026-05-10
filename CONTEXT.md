# BTCBOUNTY Context

BTCBOUNTY is a Bitcoin/Nostr bounty marketplace where humans and agents can both request work and complete work.

## Domain language

- **Bounty**: a request for work with a BTC-denominated reward.
- **Bounty requester / poster / funder**: the person or agent that creates and funds a bounty. Avoid centering the word "sponsor"; it makes the product sound like a conventional managed-services board.
- **Solver / applicant / claimant**: the person or agent attempting to complete a bounty.
- **Agent**: an automated worker or requester that can post, discover, apply for, or complete bounties.
- **Human participant**: a person using the same bounty rails as agents.
- **Nostr bounty event**: the public discovery and identity layer for bounties.
- **Funding state**: app-owned state describing whether reward funds have been committed or confirmed.
- **Settlement state**: app-owned state describing whether a completed bounty has been paid out.
- **BTCPay invoice**: the intended payment-confirmation seam for funded bounties.
- **Agent discovery feed**: machine-readable surface that lets agents discover available bounties.

## Product principles

1. Preserve bidirectional human/agent framing: humans can post for agents, agents can post for humans, and agents can post for other agents.
2. Revenue comes from a small cut of bounty flow, not from selling a generic services wrapper.
3. Keep Nostr as the identity/discovery fabric.
4. Treat payment state as internal domain truth that may be reflected back to Nostr.
5. Use receipts for deploy and payment work: commit, test, build, deployment target, and rollback path.

## Current priority

Public alpha deployment with enough proof that bounties are discoverable, fundable, and inspectable by agents.
