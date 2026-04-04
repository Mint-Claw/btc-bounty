import { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://btc-bounty.io";

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${baseUrl}/post`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  // Add individual bounty pages from cache
  try {
    const { listCachedBounties } = await import("@/lib/server/db");
    const bounties = listCachedBounties({ limit: 500 });
    const bountyPages: MetadataRoute.Sitemap = bounties.map((b) => ({
      url: `${baseUrl}/bounty/${b.d_tag}`,
      lastModified: new Date(b.created_at * 1000),
      changeFrequency: b.status === "OPEN" ? "daily" : "weekly",
      priority: b.status === "OPEN" ? 0.7 : 0.4,
    }));
    return [...staticPages, ...bountyPages];
  } catch {
    // If DB not available, return static pages only
    return staticPages;
  }
}
