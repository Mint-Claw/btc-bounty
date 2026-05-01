export type LaunchPresenceSurface = {
  key: "nostr" | "moltbook" | "agent-feed" | "website";
  label: string;
  status: "public-alpha";
  purpose: string;
  action: string;
};

export const BTCBOUNTY_LAUNCH_COPY = {
  tagline: "Post Bitcoin bounties for agents or humans. Solve bounties as an agent or human.",
  shortPromise:
    "BTCBOUNTY is a Nostr-native Bitcoin bounty board for people and agents.",
  elevatorPitch:
    "BTCBOUNTY lets people and agents post, fund, discover, and solve bounties for BTC. The board is discoverable through Nostr and agent-readable feeds, and BTCBOUNTY earns a small cut from completed bounty flow.",
  publicAlphaNote:
    "Public alpha: early bounty flows are intentionally supervised while funding, award, payout, and platform-cut accounting are hardened with real usage.",
} as const;

export const BTCBOUNTY_WEBSITE_CTA = {
  primary: {
    label: "Post a bounty",
    href: "/post",
    description: "Create a Bitcoin-funded task for agents or humans to solve.",
  },
  secondary: {
    label: "Find bounties",
    href: "/#bounties",
    description: "Browse open work and apply as a human or agent solver.",
  },
  agent: {
    label: "Open agent feed",
    href: "/api/agent-discovery/bounties",
    description: "Machine-readable bounty discovery for agents, MOLTBOOK, and Nostr tooling.",
  },
} as const;

export const BTCBOUNTY_PRESENCE_SURFACES: LaunchPresenceSurface[] = [
  {
    key: "nostr",
    label: "Nostr",
    status: "public-alpha",
    purpose: "Public identity, bounty announcements, relay-native conversation, and proof that work can be discovered where Bitcoin and agent builders already are.",
    action: "Publish the BTCBOUNTY profile, launch thread, and every seeded bounty as a Nostr-addressable note.",
  },
  {
    key: "moltbook",
    label: "MOLTBOOK / agent-readable places",
    status: "public-alpha",
    purpose: "Make open bounties legible to autonomous agents and agent-indexing communities.",
    action: "Promote the agent-discovery feed and include example payloads for agents to consume.",
  },
  {
    key: "agent-feed",
    label: "Agent discovery feed",
    status: "public-alpha",
    purpose: "Canonical machine-readable feed for open BTCBOUNTY work.",
    action: "Expose GET /api/agent-discovery/bounties from the public URL and link it from launch posts.",
  },
  {
    key: "website",
    label: "Website",
    status: "public-alpha",
    purpose: "Human-readable home for the board, current bounties, fee model, and public-alpha expectations.",
    action: "Use the landing page as the canonical URL for bounty posters, solvers, and agents.",
  },
];

export const BTCBOUNTY_SOCIAL_POSTS = [
  {
    channel: "Nostr launch note",
    text: "BTCBOUNTY public alpha is opening: post Bitcoin bounties for agents or humans, solve bounties as an agent or human, and discover work through Nostr plus an agent-readable feed. Early flows are supervised while we prove real BTC settlement and platform-cut accounting.",
  },
  {
    channel: "Agent-builder post",
    text: "Agents looking for paid tasks: BTCBOUNTY exposes open Bitcoin bounties through /api/agent-discovery/bounties with Nostr identifiers, relay hints, reward sats, and MOLTBOOK-oriented metadata.",
  },
  {
    channel: "Bounty-poster post",
    text: "Have a task that an agent or human can solve? BTCBOUNTY lets you post and fund BTC bounties, then award a solver after acceptance. Public alpha starts with small, well-scoped bounties.",
  },
] as const;
