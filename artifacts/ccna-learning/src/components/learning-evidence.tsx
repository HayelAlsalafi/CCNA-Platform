import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Award, LockKeyhole, Activity } from "lucide-react";
import {
  nexusRequest,
  type LearningActivity,
  type LearnerProgress,
  type LearningSkill,
} from "@workspace/api-client-react";
import { useNexusIdentity, useNexusLifetime, nexusError } from "../lib/nexus";
import { sessionQueryKey } from "../lib/learning-progress-cache";
import { Skeleton } from "./ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import "../learning-evidence.css";
export const learnerTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export function useLearnerProgress() {
  const identity = useNexusIdentity(),
    timezone = learnerTimezone();
  return useQuery({
    queryKey: sessionQueryKey(["/api/nexus/progress", timezone], identity),
    enabled: !!identity,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      nexusRequest<LearnerProgress>("progress?" + new URLSearchParams({ timezone }), { signal }),
  });
}
export function calendarWeeks(days: LearningActivity["days"]) {
  if (!days.length) return [];
  const offset = new Date(days[0].date + "T00:00:00Z").getUTCDay();
  return Array.from({ length: Math.ceil((offset + days.length) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const index = week * 7 + weekday - offset;
      return index >= 0 && index < days.length ? { ...days[index], index } : null;
    }),
  );
}
export function YearlyActivity() {
  const identity = useNexusIdentity(),
    [year, setYear] = useState(() => new Date().getFullYear()),
    [day, setDay] = useState(0),
    timezone = learnerTimezone(),
    cells = useRef<(HTMLButtonElement | null)[]>([]);
  const query = useQuery({
    queryKey: sessionQueryKey(["/api/nexus/activity", year, timezone], identity),
    enabled: !!identity,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      nexusRequest<LearningActivity>(
        "activity?" + new URLSearchParams({ year: String(year), timezone }),
        { signal },
      ),
  });
  const data = query.data,
    weeks = calendarWeeks(data?.days || []);
  function move(event: React.KeyboardEvent, index: number) {
    const delta: { [key: string]: number } = {
      ArrowLeft: -7,
      ArrowRight: 7,
      ArrowUp: -1,
      ArrowDown: 1,
      Home: -index,
      End: (data?.days.length || 1) - 1 - index,
    };
    if (event.key in delta) {
      event.preventDefault();
      const next = Math.max(0, Math.min((data?.days.length || 1) - 1, index + delta[event.key]));
      setDay(next);
      cells.current[next]?.focus();
    }
  }
  return (
    <section className="nexus-panel nexus-yearly">
      <div className="nexus-section-heading">
        <div>
          <span className="nexus-eyebrow">YOUR YEAR IN CONNECTIONS</span>
          <h2>Yearly learning activity</h2>
        </div>
        <div className="nexus-year-controls">
          <button
            aria-label="Previous activity year"
            disabled={year <= 1970}
            onClick={() => {
              setYear((y) => y - 1);
              setDay(0);
            }}
          >
            <ChevronLeft size={17} />
          </button>
          <strong aria-live="polite">{year}</strong>
          <button
            aria-label="Next activity year"
            disabled={year >= new Date().getFullYear()}
            onClick={() => {
              setYear((y) => y + 1);
              setDay(0);
            }}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      {!identity ? (
        <p>Sign in to see your real learning activity.</p>
      ) : query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <div role="alert">
          <p>{nexusError(query.error)}</p>
          <button className="nexus-button secondary" onClick={() => void query.refetch()}>
            Retry activity
          </button>
        </div>
      ) : (
        data && (
          <>
            <p className="nexus-muted">
              {data.totals.answers} submitted answers · {data.totals.sessions} completed tracked
              sessions · {data.totals.activeDays} active days. Calendar timezone:{" "}
              <strong>{data.timezone}</strong>.
            </p>
            <div className="nexus-calendar-scroll">
              <div
                className="nexus-calendar"
                style={{ "--weeks": weeks.length } as React.CSSProperties}
              >
                <div className="nexus-months" aria-hidden="true">
                  {weeks.map((week, i) => {
                    const first = week.find((d) => d && d.date.endsWith("-01"));
                    return (
                      <span key={i}>
                        {first
                          ? new Date(first.date + "T00:00:00Z").toLocaleDateString(undefined, {
                              month: "short",
                              timeZone: "UTC",
                              calendar: "gregory",
                            })
                          : ""}
                      </span>
                    );
                  })}
                </div>
                <div className="nexus-weekdays" aria-hidden="true">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div
                  className="nexus-calendar-weeks"
                  role="grid"
                  aria-label={`${year} learning activity; use arrow keys to navigate dates, Home and End for year boundaries`}
                >
                  {weeks.map((week, i) => (
                    <div className="nexus-calendar-week" role="row" key={i}>
                      {week.map((d, j) =>
                        d ? (
                          <Tooltip key={d.date}>
                            <TooltipTrigger asChild>
                              <button
                                role="gridcell"
                                ref={(el) => {
                                  cells.current[d.index] = el;
                                }}
                                data-level={d.level}
                                tabIndex={day === d.index ? 0 : -1}
                                aria-selected={day === d.index}
                                aria-label={`${d.date}: ${d.answers} submitted answers, ${d.sessions} completed sessions; ${d.total} learning events in ${data.timezone}`}
                                onKeyDown={(e) => move(e, d.index)}
                                onFocus={() => setDay(d.index)}
                                onClick={() => setDay(d.index)}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              {d.date}: {d.answers} answers + {d.sessions} tracked sessions (
                              {data.timezone})
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span role="presentation" key={"blank-" + j} />
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="nexus-calendar-foot">
              <span aria-live="polite">
                {data.days[day]?.date}: {data.days[day]?.answers} answers,{" "}
                {data.days[day]?.sessions} completed sessions
              </span>
              <div
                className="nexus-activity-legend"
                aria-label="Activity intensity: none, 1 to 4, 5 to 9, 10 to 19, 20 or more events"
              >
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <i key={level} data-level={level} />
                ))}
                <span>More</span>
              </div>
            </div>
            {data.totals.activeDays === 0 && (
              <p className="nexus-empty">
                No recorded learning activity in {year}. Your submitted answers will build this
                calendar.
              </p>
            )}
            <p className="nexus-muted">
              One event means one saved answer or one completed tracked session; both can occur on
              the same day. Page visits do not count. Legacy submissions remain visible here; badge
              and skill rules use revision-bound evidence.{" "}
              {data.supportedEvents.PRACTICE_COMPLETED
                ? ""
                : "Tracked-session activity awaits the session upgrade. "}
              Lessons and labs are not yet tracked. Yearly longest streak:{" "}
              {data.totals.longestStreak} days.
            </p>
          </>
        )
      )}
    </section>
  );
}
export function SkillMatrix({ data }: { data: LearnerProgress }) {
  const [selected, setSelected] = useState<string | null>(null),
    [view, setView] = useState<"radar" | "table">("radar"),
    skills = data.skills,
    current = skills.find((s) => s.id === selected),
    point = (i: number, scale = 1) => {
      const angle = -Math.PI / 2 + (i * Math.PI) / 3;
      return { x: 260 + Math.cos(angle) * 132 * scale, y: 175 + Math.sin(angle) * 132 * scale };
    },
    supported = skills.filter((s) => s.score !== null);
  const short = ["Fundamentals", "Access", "Connectivity", "Services", "Security", "Automation"];
  return (
    <section className="nexus-panel nexus-skill-matrix">
      <div className="nexus-section-heading">
        <div>
          <span className="nexus-eyebrow">SKILL EVIDENCE · {data.framework.id}</span>
          <h2>Your CCNA Skill Matrix</h2>
        </div>
        <div className="nexus-segment">
          <button aria-pressed={view === "radar"} onClick={() => setView("radar")}>
            Radar
          </button>
          <button aria-pressed={view === "table"} onClick={() => setView("table")}>
            Accessible table
          </button>
        </div>
      </div>
      <p className="nexus-muted">
        Revision-verified practice evidence index, not mastery: accuracy × available-question
        coverage × sample weight (up to {data.framework.sampleTarget} answers). At least{" "}
        {data.framework.minimumAnswers} answers across {data.framework.minimumUnique} available
        questions are required per domain.
      </p>
      {!skills.length ? (
        <p>No active CCNA v1.1 domain evidence is available.</p>
      ) : (
        <>
          {view === "radar" ? (
            <div className="nexus-radar-layout">
              <svg
                viewBox="0 0 520 350"
                role="img"
                aria-label="Six-domain practice evidence radar; unavailable scores are omitted and exact evidence follows below"
              >
                {[0.25, 0.5, 0.75, 1].map((scale) => (
                  <polygon
                    key={scale}
                    points={Array.from({ length: 6 }, (_, i) => {
                      const p = point(i, scale);
                      return p.x + "," + p.y;
                    }).join(" ")}
                    fill="none"
                    stroke="#d8e5ee"
                  />
                ))}
                {skills.map((s, i) => {
                  const p = point(i),
                    label = point(i, 1.22);
                  return (
                    <g key={s.id}>
                      <path d={`M260 175L${p.x} ${p.y}`} stroke="#d8e5ee" />
                      <text
                        x={label.x}
                        y={label.y}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#435a73"
                      >
                        {short[i] || s.code}
                      </text>
                      {s.score !== null && (
                        <circle
                          cx={point(i, s.score / 100).x}
                          cy={point(i, s.score / 100).y}
                          r={selected === s.id ? 7 : 5}
                          fill="#0e7490"
                        >
                          <title>
                            {s.name}: evidence {s.score}/100, accuracy {s.accuracy}%, coverage{" "}
                            {s.coverage}%, {s.attempts} answers
                          </title>
                        </circle>
                      )}
                    </g>
                  );
                })}
                {supported.length === 6 && (
                  <polygon
                    points={skills
                      .map((s, i) => {
                        const p = point(i, s.score! / 100);
                        return p.x + "," + p.y;
                      })
                      .join(" ")}
                    fill="#14b8a620"
                    stroke="#0d9488"
                    strokeWidth="2"
                  />
                )}
                <text x="260" y="180" textAnchor="middle" fill="#435a73" fontSize="9">
                  EVIDENCE
                </text>
              </svg>
              <div className="nexus-skill-buttons">
                {skills.map((s) => (
                  <button
                    key={s.id}
                    aria-pressed={selected === s.id}
                    onClick={() => setSelected(s.id)}
                  >
                    <span>{s.name}</span>
                    <strong>{s.score === null ? "Insufficient data" : s.score + "/100"}</strong>
                    <small>
                      {s.correct}/{s.attempts} correct · {s.attempted}/{s.available} coverage
                    </small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="nexus-history-scroll">
              <table className="nexus-history-table">
                <caption className="sr-only">CCNA skill evidence, accuracy and coverage</caption>
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Accuracy</th>
                    <th>Coverage</th>
                    <th>Answers</th>
                    <th>Evidence index</th>
                    <th>Practice</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>
                        {s.accuracy === null ? "No answers" : s.accuracy + "%"} ({s.correct}/
                        {s.attempts})
                      </td>
                      <td>
                        {s.attempted}/{s.available}
                      </td>
                      <td>{s.attempts}</td>
                      <td>{s.score === null ? "Insufficient evidence" : s.score + "/100"}</td>
                      <td>
                        <Link className="nexus-text-link" href={"/practice?domainId=" + s.id}>
                          Practice domain
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {supported.length < 6 && (
            <p className="nexus-muted">
              {6 - supported.length} domains need more evidence. Missing scores are not plotted as
              zero; a filled radar appears only when all six domains have sufficient evidence.
            </p>
          )}
          {current && (
            <div className="nexus-domain-detail" role="status">
              <div>
                <strong>{current.name}</strong>
                <p>
                  {current.attempts} answers · {current.correct} correct · {current.attempted}/
                  {current.available} distinct available questions covered.{" "}
                  {current.score === null
                    ? "More evidence is needed."
                    : `Evidence index ${current.score}/100; this is not an exam-readiness measure.`}
                </p>
              </div>
              <Link href={"/practice?domainId=" + current.id} className="nexus-button">
                Practice this domain
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
export function AchievementGallery({ data }: { data: LearnerProgress }) {
  const life = useNexusLifetime(),
    cache = useQueryClient(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function evaluate() {
    if (busy) return;
    const current = life.capture();
    setBusy(true);
    setMessage("");
    try {
      const result = await nexusRequest<{ awarded: { id: string }[] }>("achievements/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Practice-Session": life.identity?.sessionId || "",
        },
        body: JSON.stringify({ timezone: learnerTimezone() }),
      });
      if (current()) {
        setMessage(
          result.awarded.length
            ? `${result.awarded.length} achievements recorded from verified learning evidence.`
            : "No new awards. Keep learning at your own pace.",
        );
        void cache.invalidateQueries({ predicate: (q) => q.queryKey[0] === "/api/nexus/progress" });
      }
    } catch (e) {
      if (current()) setMessage(nexusError(e));
    } finally {
      if (current()) setBusy(false);
    }
  }
  return (
    <section className="nexus-panel">
      <div className="nexus-section-heading">
        <div>
          <span className="nexus-eyebrow">RECOGNITION WITHOUT RANKING</span>
          <h2>Badges & achievements</h2>
        </div>
        <button
          className="nexus-button secondary"
          disabled={busy || !data.capabilities.achievements}
          onClick={() => void evaluate()}
        >
          {busy ? "Checking evidence…" : "Check earned badges"}
        </button>
      </div>
      <p role="status">{message}</p>
      <p className="nexus-muted">
        Badge eligibility uses revision-bound answers and reliably tracked completions. Legacy
        activity remains in history but never becomes unverified badge evidence.
      </p>
      {!data.capabilities.achievements ? (
        <p>
          Database-backed badges await the separately approved achievement migration. No historical
          lesson, lab or session awards are inferred.
        </p>
      ) : (
        <>
          <div className="nexus-badge-grid">
            {data.badges.map((b) => (
              <article key={b.id} className={"nexus-badge" + (b.awardedAt ? " earned" : "")}>
                <span className="nexus-badge-icon">
                  {b.awardedAt ? <Award size={27} /> : <LockKeyhole size={24} />}
                </span>
                <div>
                  <strong>{b.name}</strong>
                  <small>
                    {b.awardedAt
                      ? "Earned · recorded " + new Date(b.awardedAt).toLocaleDateString()
                      : b.eligible
                        ? "Eligible · not yet awarded"
                        : "Locked"}
                  </small>
                  <p>{b.description}</p>
                  {!b.supported && !b.awardedAt ? (
                    <p>Rule unavailable; no award can be granted.</p>
                  ) : (
                    <>
                      <progress
                        value={b.awardedAt ? 100 : b.progress}
                        max={100}
                        aria-label={b.name + " eligibility progress"}
                      />
                      <details>
                        <summary>Exact eligibility evidence</summary>
                        <ul>
                          {b.requirements.map((r) => (
                            <li key={r.label}>
                              {r.label}:{" "}
                              {r.current.toLocaleString(undefined, { maximumFractionDigits: 1 })}/
                              {r.target}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          <h3 className="mt-6">Recent milestones</h3>
          {data.badges.some((b) => b.awardedAt) ? (
            <ul className="nexus-recent-list">
              {[...data.badges]
                .filter((b) => b.awardedAt)
                .sort((a, b) => b.awardedAt!.localeCompare(a.awardedAt!))
                .slice(0, 5)
                .map((b) => (
                  <li key={b.id}>
                    <Award size={18} />
                    <strong>{b.name}</strong>
                    <span>Award recorded {new Date(b.awardedAt!).toLocaleString()}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p>
              No awards recorded yet. Progress is based on real submissions, not visits or points.
            </p>
          )}
        </>
      )}
    </section>
  );
}
