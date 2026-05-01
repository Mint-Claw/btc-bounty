import { describe, expect, it } from "vitest";
import {
  BTCBOUNTY_LAUNCH_COPY,
  BTCBOUNTY_PRESENCE_SURFACES,
  BTCBOUNTY_WEBSITE_CTA,
} from "@/lib/launch-presence";

describe("BTCBOUNTY launch presence", () => {
  it("frames BTCBOUNTY as a human and agent bounty marketplace with a platform cut", () => {
    expect(BTCBOUNTY_LAUNCH_COPY.tagline).toContain("agents or humans");
    expect(BTCBOUNTY_LAUNCH_COPY.tagline).toContain("Bitcoin");
    expect(BTCBOUNTY_LAUNCH_COPY.elevatorPitch).toContain("people and agents");
    expect(BTCBOUNTY_LAUNCH_COPY.elevatorPitch).toContain("small cut");
    expect(BTCBOUNTY_LAUNCH_COPY.elevatorPitch.toLowerCase()).not.toContain("sponsor");
  });

  it("declares Nostr, MOLTBOOK, agent feeds, and a website as launch surfaces", () => {
    expect(BTCBOUNTY_PRESENCE_SURFACES.map((surface) => surface.key)).toEqual([
      "nostr",
      "moltbook",
      "agent-feed",
      "website",
    ]);
    expect(BTCBOUNTY_PRESENCE_SURFACES.every((surface) => surface.status === "public-alpha")).toBe(true);
  });

  it("gives bounty posters and solvers clear website calls to action", () => {
    expect(BTCBOUNTY_WEBSITE_CTA.primary.label).toBe("Post a bounty");
    expect(BTCBOUNTY_WEBSITE_CTA.secondary.label).toBe("Find bounties");
    expect(BTCBOUNTY_WEBSITE_CTA.agent.label).toContain("agent feed");
  });
});
