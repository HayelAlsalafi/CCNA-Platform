import { useState, type ReactNode } from "react";
import {
  Router,
  Network,
  Server,
  Monitor,
  ShieldCheck,
  Workflow,
  Route,
  Wifi,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "wouter";
import type { NexusDomain, NexusAnalytics } from "@workspace/api-client-react";
import { accuracy } from "../lib/nexus";
const icons = [Network, Wifi, Route, Server, ShieldCheck, Workflow];
export function NetworkHero({
  eyebrow,
  title,
  description,
  children,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header className={"nexus-hero" + (compact ? " is-compact" : "")}>
      <div>
        <span className="nexus-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="nexus-hero-actions">{children}</div>
      </div>
      <svg className="nexus-hero-topology" viewBox="0 0 430 190" aria-hidden="true">
        <defs>
          <pattern id="nexus-grid" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M22 0H0V22" fill="none" stroke="#22D3EE" strokeOpacity=".1" />
          </pattern>
        </defs>
        <rect width="430" height="190" fill="url(#nexus-grid)" />
        <g fill="none" stroke="#22D3EE" strokeOpacity=".45" strokeWidth="1.5">
          <path d="M50 40H140L210 95H315L380 40M50 150H140L210 95L315 150H380M210 95V25" />
        </g>
        {[
          [50, 40],
          [50, 150],
          [380, 40],
          [380, 150],
          [210, 25],
        ].map(([x, y], i) => (
          <g transform={`translate(${x - 14},${y - 14})`} key={i}>
            <rect width="28" height="28" rx="7" fill="#10243E" stroke="#14B8A6" />
            {i === 4 ? (
              <Server x={6} y={6} width={16} height={16} color="#22D3EE" />
            ) : (
              <Monitor x={6} y={6} width={16} height={16} color="#22D3EE" />
            )}
          </g>
        ))}
        <circle cx="210" cy="95" r="32" fill="#10243E" stroke="#22D3EE" />
        <Router x={195} y={80} width={30} height={30} color="#22D3EE" />
        <circle cx="210" cy="95" r="42" fill="none" stroke="#22D3EE" strokeOpacity=".12" />
      </svg>
    </header>
  );
}
export function LearningMetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <article className="nexus-metric">
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
export function NetworkTopologyMap({ domains }: { domains: NexusDomain[] }) {
  const [selected, setSelected] = useState<string | null>(null),
    [view, setView] = useState<"map" | "list">("map"),
    current = domains.find((d) => d.id === selected);
  return (
    <section className="nexus-panel">
      <div className="nexus-section-heading">
        <div>
          <span className="nexus-eyebrow">LEARNING TOPOLOGY</span>
          <h2>Your six-domain network</h2>
        </div>
        <div className="nexus-segment">
          <button aria-pressed={view === "map"} onClick={() => setView("map")}>
            Topology
          </button>
          <button aria-pressed={view === "list"} onClick={() => setView("list")}>
            Accessible list
          </button>
        </div>
      </div>
      <p className="nexus-muted">
        Coverage counts unique available questions attempted. Accuracy counts recorded answers.
        Neither is a mastery claim.
      </p>
      <div className={"nexus-domain-grid " + view}>
        {view === "map" && (
          <svg
            viewBox="0 0 900 310"
            preserveAspectRatio="none"
            className="nexus-map-links"
            aria-hidden="true"
          >
            <path d="M150 75H450H750M150 235H450H750M150 75V235M450 75V235M750 75V235" />
          </svg>
        )}
        {domains.map((d, i) => {
          const Icon = icons[i % 6],
            covered = d.available ? Math.min(100, (d.attempted / d.available) * 100) : 0,
            rate = accuracy(d.correct, d.attempts);
          return (
            <button
              key={d.id}
              className={"nexus-domain-node" + (selected === d.id ? " is-selected" : "")}
              aria-pressed={selected === d.id}
              onClick={() => setSelected(d.id)}
            >
              <span className="nexus-node-icon">
                <Icon size={22} />
              </span>
              <span>
                <small>DOMAIN {d.code}</small>
                <strong>{d.name}</strong>
                <span>
                  {d.available} available · {d.attempted} attempted
                </span>
                <span>
                  {rate === null
                    ? "No answers yet"
                    : rate + "% accuracy · " + d.attempts + " answers"}
                </span>
                <span
                  className="nexus-coverage"
                  role="progressbar"
                  aria-label={d.name + " question coverage"}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(covered)}
                >
                  <i style={{ width: covered + "%" }} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {!domains.length && (
        <p>No active CCNA v1.1 domain catalog is available. No mappings are inferred.</p>
      )}
      {current && (
        <div className="nexus-domain-detail" role="status">
          <div>
            <strong>{current.name}</strong>
            <p>
              {current.covered_chapters}/{current.chapters} chapters have available question
              associations.{" "}
              {current.attempts < 5
                ? "Small sample; continue exploring."
                : "Accuracy is based on " + current.attempts + " recorded answers."}
            </p>
            {current.recommendedTopic && (
              <p>
                Suggested topic: {current.recommendedTopic.name}. Prioritize low accuracy after five
                answers, then expand coverage.
              </p>
            )}
          </div>
          <Link href={"/practice?domainId=" + current.id} className="nexus-button">
            Practice this domain <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
    </section>
  );
}
export function LearningAnalytics({
  data,
  range,
  onRange,
}: {
  data: NexusAnalytics;
  range: string;
  onRange: (range: string) => void;
}) {
  const [point, setPoint] = useState<number | null>(null),
    items = data.timeline;
  const points = items
    .map(
      (p, i) =>
        p.attempts ? `${items[i - 1]?.attempts ? "L" : "M"}${items.length === 1 ? 50 : 10 + (i / (items.length - 1)) * 580},${105 - (accuracy(p.correct, p.attempts) ?? 0) * 0.9}` : "",
    )
    .join(" ");
  return (
    <section className="nexus-panel">
      <div className="nexus-section-heading">
        <div>
          <span className="nexus-eyebrow">PERFORMANCE SIGNAL</span>
          <h2>Accuracy over time</h2>
        </div>
        <select
          aria-label="Analytics period"
          value={range}
          onChange={(e) => {
            setPoint(null);
            onRange(e.target.value);
          }}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time · monthly</option>
        </select>
      </div>
      <p className="nexus-muted">Selected period: {items.reduce((sum, row) => sum + row.attempts, 0)} practice answers · {items.reduce((sum, row) => sum + row.correct, 0)} correct · {items.reduce((sum, row) => sum + row.attempts - row.correct, 0)} incorrect. All-time statistics above do not change with this filter.</p>
      {items.filter(row => row.attempts > 0).length > 1 ? (
        <svg
          viewBox="0 0 600 125"
          className="nexus-timeline"
          role="img"
          aria-label="Accuracy timeline; exact values and sample sizes follow in the accessible list"
        >
          <path d="M10 15H590M10 60H590M10 105H590" stroke="#DEE8F2" fill="none" />
          <path d={points} stroke="#0891B2" strokeWidth="3" fill="none" />
          {items.map((p, i) => p.attempts > 0 && (
            <circle
              key={p.day}
              cx={10 + (i / (items.length - 1)) * 580}
              cy={105 - (accuracy(p.correct, p.attempts) ?? 0) * 0.9}
              r={4}
              fill="#14B8A6"
            />
          ))}
        </svg>
      ) : (
        <p className="nexus-empty">
          {items.some(row => row.attempts > 0)
            ? "One time bucket is available. More activity is needed to show a trend."
            : "Your submitted answers will build this timeline."}
        </p>
      )}
      <div className="nexus-timeline-list" aria-label="Exact timeline data">
        {items.map((p, i) => (
          <button key={p.day} aria-pressed={point === i} onClick={() => setPoint(i)}>
            {new Date(p.day.length === 10 ? p.day + "T00:00:00Z" : p.day).toLocaleDateString(undefined, {
              month: "short",
              day: data.granularity === "month" ? undefined : "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
            <strong>{p.attempts ? `${accuracy(p.correct, p.attempts)}%` : "No answers"}</strong>
            <small>
              {p.correct}/{p.attempts} correct{p.attempts < 5 ? " · small sample" : ""}
            </small>
            <small>{p.completedSessions ?? 0} completed practice sessions · {p.completedExams ?? 0} completed exams</small>
          </button>
        ))}
      </div>
      <small className="nexus-muted">
        Buckets use {data.commandCenter?.timezone ?? "UTC"}. {data.commandCenter?.timeline.truncated ? "The all-time chart shows the latest 120 calendar months; lifetime counters include older records. " : ""}Accuracy and answer count are shown together; no study duration or exam
        readiness is inferred.
      </small>
    </section>
  );
}
