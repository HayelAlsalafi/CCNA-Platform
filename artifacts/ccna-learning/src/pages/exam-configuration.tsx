import { useRef } from "react";
import type { ExamAvailability } from "@workspace/api-client-react";
import {
  AlertCircle,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  Clock3,
  Layers,
  Play,
  Settings2,
  Trophy,
} from "lucide-react";

type Props = {
  availability?: ExamAvailability;
  pending: boolean;
  fetching: boolean;
  error?: string;
  retry: () => void;
  count: number;
  minutes: number;
  domains: string[];
  chapters: string[];
  filter: string;
  setFilter: (value: string) => void;
  setCount: (value: number) => void;
  setMinutes: (value: number) => void;
  automaticTiming: boolean;
  restoreAutomaticTiming: () => void;
  setDomains: (value: string[]) => void;
  setChapters: (value: string[]) => void;
  changed: () => void;
  numberValid: boolean;
  busy: boolean;
  start: () => void;
  historyTotal?: number;
};

// Presentation only: state, requests, readiness and session creation remain in ExamActor.
export function ExamConfiguration(p: Props) {
  const { availability: data, count, minutes, domains, chapters } = p;
  const customCount = useRef<HTMLInputElement>(null);
  const domainOptions = [
    ...new Map(
      data?.chapters.map((c) => [
        c.domainId,
        { id: c.domainId, name: c.domainName, code: c.domainCode, weight: c.weight },
      ]) ?? [],
    ).values(),
  ];
  const maximum = Math.min(100, data?.available ?? 0);
  const countValid = Number.isInteger(count) && count >= 1 && count <= maximum;
  const durationValid = Number.isInteger(minutes) && minutes >= 5 && minutes <= 180;
  const loaded = !!data && !p.error && !p.pending;
  const selectedDomains = domainOptions.filter((d) => domains.includes(d.id));
  const blockedReason = p.error
    ? "Question availability could not be checked. Retry to continue."
    : p.pending
      ? "Checking exam availability..."
      : !data?.ready
        ? "Exam backend is not activated. Starting is unavailable."
        : !p.numberValid
          ? "Choose a valid question count and duration to continue."
          : p.fetching
            ? "Updating question availability..."
            : undefined;
  return (
    <>
      <section className="exam-metrics" aria-label="Exam statistics">
        <div className="exam-metric">
          <Layers aria-hidden="true" />
          <div>
            <span>Available Questions</span>
            <strong>{loaded ? data.available : "—"}</strong>
            <small>
              {p.pending
                ? "Checking question bank"
                : p.error
                  ? "Availability unavailable"
                  : "Eligible for your current filters"}
            </small>
          </div>
        </div>
        <div className="exam-metric">
          <ChartNoAxesColumnIncreasing aria-hidden="true" />
          <div>
            <span>Exams Taken</span>
            <strong>{p.historyTotal ?? "—"}</strong>
            <small>
              {p.historyTotal === undefined
                ? "History not available"
                : "Recorded exams, including active sessions"}
            </small>
          </div>
        </div>
        <div className="exam-metric">
          <Trophy aria-hidden="true" />
          <div>
            <span>Best Score</span>
            <strong>—</strong>
            <small>All-time best score is not available</small>
          </div>
        </div>
      </section>
      <div className="exam-setup-layout">
        <section className="nexus-panel exam-configuration" aria-labelledby="exam-config-title">
          <div className="exam-card-heading">
            <Settings2 size={20} aria-hidden="true" />
            <h2 id="exam-config-title">Configure Your Exam</h2>
          </div>
          {p.pending ? (
            <p role="status">Checking eligible published questions...</p>
          ) : p.error ? (
            <div role="alert" className="exam-availability-error">
              <p>{p.error}</p>
              <button className="nexus-button secondary" onClick={p.retry}>
                Retry availability
              </button>
            </div>
          ) : (
            <>
              <div className="exam-control-section">
                <label className="exam-control-label" htmlFor="exam-question-count">
                  Number of questions
                </label>
                <div className="exam-value-controls">
                  <div className="exam-presets" role="group" aria-label="Question count presets">
                    {[30, 60, 100].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={count === n}
                        disabled={n > maximum}
                        aria-describedby="exam-count-help"
                        title={
                          n > maximum
                            ? `Requires ${n} eligible questions; ${data?.available ?? 0} available`
                            : `${n} questions`
                        }
                        onClick={() => {
                          p.setCount(n);
                          p.changed();
                        }}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-pressed={![30, 60, 100].includes(count)}
                      onClick={() => customCount.current?.focus()}
                    >
                      Custom
                    </button>
                  </div>
                  <div className="exam-custom-value">
                    <span>Custom</span>
                    <input
                      ref={customCount}
                      id="exam-question-count"
                      type="number"
                      min={1}
                      max={maximum}
                      step={1}
                      aria-invalid={!countValid}
                      aria-describedby="exam-count-help"
                      value={Number.isNaN(count) ? "" : count}
                      onChange={(e) => {
                        p.setCount(e.target.valueAsNumber);
                        p.changed();
                      }}
                    />
                  </div>
                </div>
                <p id="exam-count-help" className={!countValid ? "exam-field-error" : ""}>
                  {data?.available === 0
                    ? "No published questions are available. An administrator can create, review and publish questions in the canonical chapters."
                    : !countValid
                      ? `Choose a whole number from 1 to ${maximum}. ${data?.available ?? 0} eligible published questions for these filters.`
                      : `${data?.available ?? 0} eligible published questions for these filters. Maximum ${maximum} per exam. Presets above the available bank are disabled.`}
                </p>
              </div>
              <div className="exam-control-section">
                <div className="exam-duration-heading">
                  <label className="exam-control-label" htmlFor="exam-duration">
                    Exam duration
                  </label>
                  <button
                    type="button"
                    className="exam-timing-mode"
                    aria-pressed={p.automaticTiming}
                    onClick={p.restoreAutomaticTiming}
                  >
                    {p.automaticTiming ? "Automatic timing" : "Restore automatic timing"}
                  </button>
                </div>
                <div className="exam-value-controls">
                  <div className="exam-presets" role="group" aria-label="Duration presets">
                    {[15, 30, 60].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={minutes === n}
                        onClick={() => {
                          p.setMinutes(n);
                          p.changed();
                        }}
                      >
                        <Clock3 size={15} aria-hidden="true" />
                        {n} min
                      </button>
                    ))}
                  </div>
                  <div className="exam-custom-value">
                    <span>Custom (min)</span>
                    <input
                      id="exam-duration"
                      type="number"
                      min={5}
                      max={180}
                      step={1}
                      aria-invalid={!durationValid}
                      aria-describedby="exam-duration-help"
                      value={Number.isNaN(minutes) ? "" : minutes}
                      onChange={(e) => {
                        p.setMinutes(e.target.valueAsNumber);
                        p.changed();
                      }}
                    />
                  </div>
                </div>
                <p id="exam-duration-help" className={!durationValid ? "exam-field-error" : ""}>
                  {p.automaticTiming
                    ? "Automatic: 100 questions / 120 minutes, scaled to your count."
                    : "Manual duration retained when question count changes."}{" "}
                  Practice approximation, not official Cisco per-question timing.
                  {p.automaticTiming &&
                  Number.isInteger(count) &&
                  count > 0 &&
                  Math.round(count * 1.2) < 5
                    ? " Minimum duration is 5 minutes."
                    : ""}
                  {!durationValid ? " Enter 5-180 whole minutes." : ""}
                </p>
              </div>
              <fieldset className="exam-domains">
                <legend>Exam domains</legend>
                <p>No selected domains means all domains.</p>
                <div className="exam-domain-grid">
                  {domainOptions.map((d) => (
                    <label key={d.id} className="exam-domain-card">
                      <input
                        type="checkbox"
                        checked={domains.includes(d.id)}
                        onChange={() => {
                          p.setDomains(
                            domains.includes(d.id)
                              ? domains.filter((x) => x !== d.id)
                              : [...domains, d.id],
                          );
                          p.setChapters([]);
                          p.changed();
                        }}
                      />
                      <div>
                        <span className="exam-domain-name">
                          {d.code} {d.name}
                        </span>
                        <small>{d.weight}% official blueprint weight</small>
                        <span className="exam-weight-track" aria-hidden="true">
                          <span style={{ width: `${d.weight}%` }} />
                        </span>
                      </div>
                      <Check className="exam-domain-check" size={16} aria-hidden="true" />
                    </label>
                  ))}
                </div>
              </fieldset>
              <details className="exam-chapters">
                <summary>
                  <BookOpen size={18} aria-hidden="true" />
                  <span>
                    Optional chapter selection
                    {chapters.length ? ` · ${chapters.length} selected` : ""}
                  </span>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <label htmlFor="exam-chapter-search">Search chapters</label>
                <input
                  id="exam-chapter-search"
                  type="search"
                  value={p.filter}
                  onChange={(e) => p.setFilter(e.target.value)}
                />
                <p>No chapters selected means all chapters in the chosen domains.</p>
                <div className="exam-chapter-select">
                  {data?.chapters
                    .filter(
                      (c) =>
                        (!domains.length || domains.includes(c.domainId)) &&
                        (c.title + " " + c.code).toLowerCase().includes(p.filter.toLowerCase()),
                    )
                    .map((c) => (
                      <label key={c.id}>
                        <input
                          type="checkbox"
                          checked={chapters.includes(c.id)}
                          onChange={() => {
                            p.setChapters(
                              chapters.includes(c.id)
                                ? chapters.filter((x) => x !== c.id)
                                : [...chapters, c.id],
                            );
                            p.changed();
                          }}
                        />
                        {c.code} — {c.title}
                      </label>
                    ))}
                  {!data?.chapters.some(
                    (c) =>
                      (!domains.length || domains.includes(c.domainId)) &&
                      (c.title + " " + c.code).toLowerCase().includes(p.filter.toLowerCase()),
                  ) && <p>No chapters match your search.</p>}
                </div>
              </details>
            </>
          )}
        </section>
        <aside className="nexus-panel exam-summary" aria-labelledby="exam-summary-title">
          <div className="exam-card-heading">
            <Layers size={20} aria-hidden="true" />
            <h2 id="exam-summary-title">Exam Summary</h2>
          </div>
          <dl>
            <div>
              <dt>Questions</dt>
              <dd>{Number.isInteger(count) && count > 0 ? count : "—"}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{durationValid ? `${minutes} min` : "—"}</dd>
            </div>
            <div>
              <dt>Domains</dt>
              <dd>{!domains.length ? "All Domains" : `${domains.length} selected`}</dd>
            </div>
            <div>
              <dt>Average time / question</dt>
              <dd>{p.numberValid ? `${(minutes / count).toFixed(1)} min` : "—"}</dd>
            </div>
          </dl>
          {!!selectedDomains.length && (
            <p className="exam-selected-domains">
              {selectedDomains.map((d) => d.name).join(" · ")}
            </p>
          )}
          {loaded && !data.ready && (
            <div className="exam-backend-notice" role="status">
              <AlertCircle size={19} aria-hidden="true" />
              <div>
                <strong>Exam backend NOT ACTIVATED</strong>
                <p>
                  The proposed exam migration and reviewed runtime permissions require separate
                  approval. No demo questions will be used.
                </p>
              </div>
            </div>
          )}
          <button
            className="nexus-button exam-start"
            disabled={p.busy || !data?.ready || !p.numberValid || p.fetching || !!p.error}
            aria-describedby="exam-start-reason"
            onClick={p.start}
          >
            <Play size={17} aria-hidden="true" />
            {p.busy ? "Creating exam..." : "Start exam"}
          </button>
          <p id="exam-start-reason" className="exam-start-reason">
            {blockedReason ?? "Ready to create your exam."}
          </p>
          <p className="exam-selection-note">
            Selection is randomized once when the server creates the exam. Questions cannot exceed
            the available bank; domain weights are learning context, not a promise of official exam
            distribution.
          </p>
        </aside>
      </div>
    </>
  );
}
