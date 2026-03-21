/**
 * Simple monitoring utilities for tracking system health over time.
 *
 * Collects metrics in memory (resets on deploy). For production,
 * export to Prometheus/Grafana via /api/metrics endpoint.
 */

export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

class MetricsCollector {
  private metrics: Metric[] = [];
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private readonly maxHistory = 1000;

  /** Increment a counter (monotonically increasing) */
  increment(name: string, amount = 1, labels?: Record<string, string>): void {
    const key = this.labelKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + amount);
    this.record(name, current + amount, labels);
  }

  /** Set a gauge (can go up or down) */
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.labelKey(name, labels);
    this.gauges.set(key, value);
    this.record(name, value, labels);
  }

  /** Record a timing measurement (ms) */
  timing(name: string, durationMs: number, labels?: Record<string, string>): void {
    this.record(`${name}_ms`, durationMs, labels);
  }

  /** Get current counter value */
  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.labelKey(name, labels)) || 0;
  }

  /** Get current gauge value */
  getGauge(name: string, labels?: Record<string, string>): number | undefined {
    return this.gauges.get(this.labelKey(name, labels));
  }

  /** Get all metrics for export */
  getAll(): { counters: Record<string, number>; gauges: Record<string, number> } {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
    };
  }

  /** Reset all metrics */
  reset(): void {
    this.metrics = [];
    this.counters.clear();
    this.gauges.clear();
  }

  private record(name: string, value: number, labels?: Record<string, string>): void {
    this.metrics.push({ name, value, timestamp: Date.now(), labels });
    if (this.metrics.length > this.maxHistory) {
      this.metrics = this.metrics.slice(-this.maxHistory);
    }
  }

  private labelKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const sorted = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return `${name}{${sorted}}`;
  }
}

/** Singleton metrics collector */
export const metrics = new MetricsCollector();

/** Pre-defined metric names */
export const METRICS = {
  BOUNTY_CREATED: "bounty_created_total",
  BOUNTY_COMPLETED: "bounty_completed_total",
  RELAY_PUBLISH: "relay_publish_total",
  RELAY_PUBLISH_FAIL: "relay_publish_fail_total",
  RELAY_LATENCY: "relay_latency",
  API_REQUEST: "api_request_total",
  API_ERROR: "api_error_total",
  PAYMENT_RECEIVED: "payment_received_total",
  PAYMENT_SATS: "payment_sats_total",
} as const;
