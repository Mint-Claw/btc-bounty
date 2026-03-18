"use client";

import { useState, useEffect, useCallback } from "react";

interface RelayStatus {
  url: string;
  status: "online" | "offline" | "connecting" | "error";
  latencyMs: number | null;
  nip11?: {
    name?: string;
    description?: string;
    supported_nips?: number[];
  };
  lastChecked: string;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  relays: RelayStatus[];
  timestamp: string;
}

interface StatsResponse {
  bounties: {
    total: number;
    open: number;
    assigned: number;
    completed: number;
    cancelled: number;
  };
  totalRewardSats: number;
  avgRewardSats: number;
}

export default function AdminDashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, statsRes] = await Promise.allSettled([
        fetch("/api/admin/relay-status"),
        fetch("/api/admin/stats"),
      ]);

      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        setHealth(await healthRes.value.json());
      }
      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        setStats(await statsRes.value.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const formatSats = (sats: number) => {
    if (sats >= 100_000_000) return `${(sats / 100_000_000).toFixed(2)} BTC`;
    if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M sats`;
    if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}K sats`;
    return `${sats} sats`;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">
            ⚡ BTC Bounty — Admin Dashboard
          </h1>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded p-4 mb-6">
            {error}
          </div>
        )}

        {/* Bounty Stats */}
        {stats && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4">📊 Bounty Stats</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Bounties" value={stats.bounties.total} />
              <StatCard
                label="Open"
                value={stats.bounties.open}
                color="green"
              />
              <StatCard
                label="Assigned"
                value={stats.bounties.assigned}
                color="yellow"
              />
              <StatCard
                label="Completed"
                value={stats.bounties.completed}
                color="blue"
              />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <StatCard
                label="Total Rewards"
                value={formatSats(stats.totalRewardSats)}
              />
              <StatCard
                label="Avg Reward"
                value={formatSats(stats.avgRewardSats)}
              />
            </div>
          </section>
        )}

        {/* Relay Health */}
        {health && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold">🔌 Relay Health</h2>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  health.status === "healthy"
                    ? "bg-green-900 text-green-300"
                    : health.status === "degraded"
                      ? "bg-yellow-900 text-yellow-300"
                      : "bg-red-900 text-red-300"
                }`}
              >
                {health.status.toUpperCase()}
              </span>
            </div>
            <div className="space-y-3">
              {health.relays.map((relay) => (
                <div
                  key={relay.url}
                  className="bg-gray-900 border border-gray-800 rounded p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          relay.status === "online"
                            ? "bg-green-400"
                            : relay.status === "connecting"
                              ? "bg-yellow-400"
                              : "bg-red-400"
                        }`}
                      />
                      <span className="font-mono text-sm">{relay.url}</span>
                    </div>
                    {relay.nip11?.name && (
                      <span className="text-xs text-gray-500 ml-4">
                        {relay.nip11.name}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm">
                      {relay.latencyMs !== null
                        ? `${relay.latencyMs}ms`
                        : "—"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {relay.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!health && !stats && !loading && (
          <div className="text-center text-gray-500 py-12">
            No data available. API endpoints may not be running.
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  const colorClass =
    color === "green"
      ? "text-green-400"
      : color === "yellow"
        ? "text-yellow-400"
        : color === "blue"
          ? "text-blue-400"
          : "text-orange-400";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider">
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</div>
    </div>
  );
}
