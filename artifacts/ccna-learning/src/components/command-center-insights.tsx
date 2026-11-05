import { DateText } from '../i18n';
import { useI18n } from '../i18n';
import { Link } from "wouter";
import type { LearnerProgress, NexusAnalytics, NexusTopic } from "@workspace/api-client-react";
import { accuracy } from "../lib/nexus";

export function coveragePercent(practiced: number, available: number) {
  return available > 0
    ? Math.max(0, Math.min(100, Math.round((practiced / available) * 100)))
    : null;
}

export function recommendationReason(topic: NexusTopic) {
  if (topic.attempts >= 5 && topic.correct / topic.attempts < 0.7)
    return `${accuracy(topic.correct, topic.attempts)}% accuracy from ${topic.attempts} answers. Review this topic, then try another question.`;
  return `${Math.max(0, topic.available - topic.attempted)} currently available questions not yet attempted. Expand your coverage here.`;
}

export function CommandCenterInsights({ data }: { data: NexusAnalytics }) {
  const { t: translateUi } = useI18n();
  const summary = data.commandCenter;
  if (!summary) return null;
  const coverage = summary.coverage;
  const percent = coveragePercent(coverage.practicedQuestions, coverage.availableQuestions);
  return (
    <div className="command-center-grid" data-testid="dashboard-insights">
      <section className="nexus-panel command-center-coverage" aria-labelledby="coverage-title">
        <span className="nexus-eyebrow">{translateUi("CURRENT QUESTION BANK")}</span>
        <h2 id="coverage-title">{translateUi("Your learning coverage")}</h2>
        <strong className="command-center-number">
          {percent === null ? translateUi("Not available") : `${percent}%`}
        </strong>
        <p>
          {coverage.practicedQuestions} {translateUi("of")}{" "}{coverage.availableQuestions} {translateUi("currently available published questions practiced.")}</p>
        {percent !== null && (
          <div
            className="nexus-coverage"
            role="progressbar"
            aria-label={translateUi("Current question coverage")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <i style={{ width: `${percent}%` }} />
          </div>
        )}
        <p className="nexus-muted">
          {coverage.practicedChapters} {translateUi("of")}{" "}{coverage.availableChapters} {translateUi("chapters with available questions practiced. Correct and incorrect submissions both count; historical question totals can differ.")}</p>
        {!coverage.availableQuestions && (
          <p>
            {translateUi("No published questions are available yet. Your existing learning record is retained.")}</p>
        )}
        <Link href="/topics" className="nexus-text-link">
          {translateUi("Explore the curriculum")}</Link>
      </section>
      <section
        className="nexus-panel command-center-domains"
        aria-labelledby="domain-summary-title"
      >
        <span className="nexus-eyebrow">{translateUi("ALL-TIME PRACTICE EVIDENCE")}</span>
        <h2 id="domain-summary-title">{translateUi("Domain performance")}</h2>
        <p className="nexus-muted">
          {translateUi("Answer accuracy and sample size, separate from coverage. Includes saved legacy practice; the Skill evidence matrix uses revision-verified answers only. Exam weight describes the blueprint, not your score.")}</p>
        {data.totals.unmappedAttempts > 0 && (
          <p>
            {data.totals.unmappedAttempts} {translateUi("saved answers have no canonical chapter attribution. They remain in overall statistics and are not assigned to a domain by guessing.")}</p>
        )}
        {!summary.domains.length ? (
          <p>{translateUi("No domain evidence is available.")}</p>
        ) : (
          <ul className="command-center-domain-list">
            {summary.domains.map((domain) => (
              <li key={domain.id}>
                <div>
                  <Link href={`/practice?domainId=${encodeURIComponent(domain.id)}`}>
                    {domain.name}
                  </Link>
                  <small>
                    {domain.weightPercent}{translateUi("% exam weight ·")}{" "}{domain.correct}/{domain.attempts} {translateUi("answers correct")}</small>
                </div>
                <div className="command-center-domain-value">
                  <strong>{domain.accuracy === null ? translateUi("No answers") : `${domain.accuracy}%`}</strong>
                  <small>
                    {domain.status === "INSUFFICIENT"
                      ? translateUi("Insufficient evidence")
                      : domain.status === "REVIEW"
                        ? translateUi("Review suggested")
                        : domain.status === "STRONG"
                          ? translateUi("Stronger evidence")
                          : translateUi("Developing evidence")}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {summary.exams.available && (
        <section className="nexus-panel command-center-exam" aria-labelledby="exam-summary-title">
          <div>
            <span className="nexus-eyebrow">{translateUi("EXAM SIMULATOR")}</span>
            <h2 id="exam-summary-title">{summary.exams.completed} {translateUi("completed exams")}</h2>
            {summary.exams.latest ? (
              <p>
                {translateUi("Latest:")}{" "}
                {summary.exams.latest.percentage === null
                  ? translateUi("Score unavailable")
                  : `${summary.exams.latest.percentage.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`}{" "}
                {translateUi("across")}{" "}{summary.exams.latest.questionCount} {translateUi("questions ·")}{" "}
                <DateText value={summary.exams.latest.finalizedAt} options={{dateStyle:'medium'}}/> ·{" "}
                {summary.exams.latest.status === "EXPIRED" ? translateUi("Time expired") : translateUi("Submitted")}{translateUi(". Practice accuracy above excludes exam results.")}</p>
            ) : (
              <p>
                {translateUi("No completed exams yet. Start when you want a timed assessment of the available content.")}</p>
            )}
          </div>
          <Link
            href={
              summary.exams.latest
                ? `/exam?session=${encodeURIComponent(summary.exams.latest.id)}`
                : "/exam"
            }
            className="nexus-text-link"
          >
            {summary.exams.latest ? translateUi("Review latest exam") : translateUi("Open Exam Simulator")}
          </Link>
        </section>
      )}
    </div>
  );
}

export function SkillEvidenceSummary({ data }: { data: LearnerProgress }) {
  const { t: translateUi } = useI18n();
  const sufficient = data.skills.filter((skill) => skill.score !== null);
  const stronger = sufficient.filter(
    (skill) => skill.attempts > 0 && skill.correct / skill.attempts >= 0.8,
  );
  const review = sufficient.filter(
    (skill) => skill.attempts > 0 && skill.correct / skill.attempts < 0.7,
  );
  return (
    <section
      className="nexus-panel command-center-skill-summary"
      aria-labelledby="skill-summary-title"
    >
      <div>
        <span className="nexus-eyebrow">{translateUi("EVIDENCE CHECK")}</span>
        <h2 id="skill-summary-title">{translateUi("Where to focus")}</h2>
      </div>
      <dl>
        <div>
          <dt>{translateUi("Stronger accuracy")}</dt>
          <dd>{stronger.length}</dd>
        </div>
        <div>
          <dt>{translateUi("Review suggested")}</dt>
          <dd>{review.length}</dd>
        </div>
        <div>
          <dt>{translateUi("Insufficient evidence")}</dt>
          <dd>{data.skills.length - sufficient.length}</dd>
        </div>
      </dl>
      <p className="nexus-muted">
        {translateUi("Stronger accuracy means at least 80%; review means below 70%, only after the matrix’s minimum evidence requirements. Other supported domains are developing. These are practice signals, not mastery or exam readiness.")}</p>
      {review.length > 0 && (
        <p>
          {translateUi("Consider reviewing")}{" "}{review.map((skill) => skill.name).join(", ")} {translateUi("using the domain practice links below.")}</p>
      )}
    </section>
  );
}
