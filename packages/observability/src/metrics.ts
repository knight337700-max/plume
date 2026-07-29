export type MetricKind = "counter" | "gauge" | "histogram";
export type MetricLabels = Readonly<Record<string, string>>;

interface MetricDefinition {
  readonly kind: MetricKind;
  readonly labels: readonly string[];
}

const DEFINITIONS: Readonly<Record<string, MetricDefinition>> = {
  http_requests_total: { kind: "counter", labels: ["method", "route", "status"] },
  queue_lag_seconds: { kind: "gauge", labels: ["queue"] },
  job_status_total: { kind: "counter", labels: ["job_type", "status"] },
  ai_request_duration_seconds: { kind: "histogram", labels: ["provider", "operation"] },
  render_duration_seconds: { kind: "histogram", labels: ["format", "purpose", "status"] },
};

interface MetricSample {
  readonly labels: MetricLabels;
  value: number;
  count: number;
}

function sampleKey(labels: MetricLabels): string {
  return Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("\u0000");
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

function normalizedLabels(name: string, labels: MetricLabels): MetricLabels {
  const definition = DEFINITIONS[name];
  if (!definition) throw new Error(`Unknown metric ${name}`);
  const received = Object.keys(labels).sort();
  const expected = [...definition.labels].sort();
  if (received.join("\u0000") !== expected.join("\u0000")) {
    throw new Error(`Metric ${name} accepts only low-cardinality labels: ${definition.labels.join(", ")}`);
  }
  return Object.fromEntries(definition.labels.map((label) => [label, String(labels[label])])) as MetricLabels;
}

export class MetricRegistry {
  private readonly samples = new Map<string, Map<string, MetricSample>>();

  increment(name: string, value = 1, labels: MetricLabels = {}): void {
    this.record(name, value, labels, "counter");
  }

  set(name: string, value: number, labels: MetricLabels = {}): void {
    this.record(name, value, labels, "gauge");
  }

  observe(name: string, value: number, labels: MetricLabels = {}): void {
    this.record(name, value, labels, "histogram");
  }

  get(name: string, labels: MetricLabels = {}): MetricSample | undefined {
    const normalized = normalizedLabels(name, labels);
    const sample = this.samples.get(name)?.get(sampleKey(normalized));
    return sample ? { labels: { ...sample.labels }, value: sample.value, count: sample.count } : undefined;
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    for (const [name, definition] of Object.entries(DEFINITIONS)) {
      lines.push(`# TYPE ${name} ${definition.kind}`);
      const samples = [...(this.samples.get(name)?.values() ?? [])].sort((left, right) => sampleKey(left.labels).localeCompare(sampleKey(right.labels)));
      for (const sample of samples) {
        const labels = Object.entries(sample.labels).map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(",");
        const suffix = labels ? `{${labels}}` : "";
        if (definition.kind === "histogram") {
          lines.push(`${name}_count${suffix} ${sample.count}`);
          lines.push(`${name}_sum${suffix} ${sample.value}`);
        } else {
          lines.push(`${name}${suffix} ${sample.value}`);
        }
      }
    }
    return `${lines.join("\n")}\n`;
  }

  private record(name: string, value: number, labels: MetricLabels, expectedKind: MetricKind): void {
    const definition = DEFINITIONS[name];
    if (!definition) throw new Error(`Unknown metric ${name}`);
    if (definition.kind !== expectedKind) throw new Error(`Metric ${name} is a ${definition.kind}, not a ${expectedKind}`);
    if (!Number.isFinite(value)) throw new Error(`Metric ${name} requires a finite value`);
    const normalized = normalizedLabels(name, labels);
    const byLabel = this.samples.get(name) ?? new Map<string, MetricSample>();
    const key = sampleKey(normalized);
    const existing = byLabel.get(key);
    if (definition.kind === "counter") {
      if (value < 0) throw new Error(`Counter ${name} cannot decrease`);
      if (existing) existing.value += value;
      else byLabel.set(key, { labels: normalized, value, count: 0 });
    } else if (definition.kind === "gauge") {
      if (existing) existing.value = value;
      else byLabel.set(key, { labels: normalized, value, count: 0 });
    } else if (existing) {
      existing.value += value;
      existing.count += 1;
    } else {
      byLabel.set(key, { labels: normalized, value, count: 1 });
    }
    this.samples.set(name, byLabel);
  }
}

export const defaultMetricsRegistry = new MetricRegistry();
