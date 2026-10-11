import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Bookmark, Check, CircleCheck, CircleX, Clock3, FileQuestion, RotateCcw, ShieldCheck } from 'lucide-react';
import type { ActiveExam, DemoExamQuestion, ExamResult } from '../lib/exam-simulator';
import {
  DEMO_EXAM_QUESTIONS,
  EXAM_DURATION_MINUTES,
  EXAM_QUESTION_COUNTS,
  createExam,
  formatExamTime,
  gradeExam,
  navigateExam,
  setExamAnswer,
  tickExam,
  toggleExamFlag,
} from '../lib/exam-simulator';
import './exam-simulator.css';

type ExamView = 'setup' | 'active' | 'result';

export function ExamSimulator() {
  const [view, setView] = useState<ExamView>('setup');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [durationMinutes, setDurationMinutes] = useState<number>(15);
  const [exam, setExamState] = useState<ActiveExam | null>(null);
  const examRef = useRef<ActiveExam | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);

  const saveExam = (next: ActiveExam | null) => {
    examRef.current = next;
    setExamState(next);
  };
  const updateExam = (update: (current: ActiveExam) => ActiveExam) => {
    const current = examRef.current;
    if (current) saveExam(update(current));
  };

  useEffect(() => {
    if (view !== 'active') return;
    const timer = window.setInterval(() => {
      const current = examRef.current;
      if (!current) return;
      const updated = tickExam(current);
      saveExam(updated);
      if (updated.remainingSeconds === 0) {
        setResult(gradeExam(updated));
        setView('result');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [view]);

  const startExam = () => {
    if (DEMO_EXAM_QUESTIONS.length === 0) return;
    setResult(null);
    saveExam(createExam({ questionCount, durationMinutes }));
    setView('active');
  };

  const submitExam = (expired = false) => {
    const currentExam = examRef.current;
    if (!currentExam) return;
    if (!expired && !window.confirm('Submit this practice exam now? You can review your answers after submission.')) return;
    setResult(gradeExam(currentExam));
    setView('result');
  };

  const restart = () => {
    saveExam(null);
    setResult(null);
    setView('setup');
  };

  const updateAnswer = (question: DemoExamQuestion, answerKey: string) => {
    updateExam((current) => setExamAnswer(current, question.id, answerKey));
  };

  const activeQuestion = exam?.questions[exam.currentIndex];
  const answeredCount = exam ? Object.keys(exam.answers).length : 0;
  const flaggedCount = exam?.flaggedQuestionIds.length ?? 0;
  const isEmpty = DEMO_EXAM_QUESTIONS.length === 0;

  return (
    <div className="exam-simulator">
      <div className="exam-shell">
        <header className="exam-heading">
          <div>
            <div className="exam-eyebrow">Assessment / local practice</div>
            <h1 className="exam-title">Exam simulator</h1>
            <p className="exam-lead">A timed run through networking fundamentals. Answer at your pace, mark questions to revisit, then review the reasoning behind every response.</p>
          </div>
          <div className="exam-local-tag" data-testid="status-exam-mode"><ShieldCheck size={15} aria-hidden="true" /> LOCAL DEMO MODE</div>
        </header>

        <div className="exam-notice" role="note" data-testid="status-local-question-disclaimer">
          <AlertTriangle size={16} aria-hidden="true" />
          <span><strong>Practice examples only.</strong> These questions are locally authored practice examples, not official Cisco exam questions.</span>
        </div>

        {isEmpty ? (
          <section className="exam-panel exam-state-panel" role="status" data-testid="status-demo-bank-unavailable">
            <div><FileQuestion size={28} aria-hidden="true" /><h2>Practice bank unavailable</h2><p>There are no local demo questions available right now. No server request was made. Please return when the local practice set is available.</p></div>
          </section>
        ) : view === 'setup' ? (
          <section className="exam-setup-grid" aria-label="Exam setup">
            <div className="exam-panel exam-config">
              <div className="exam-section-kicker">01 / Configure your run</div>
              <h2>Set the pace.</h2>
              <p className="exam-config-copy">Choose a supported practice length and timer. This run uses questions stored with the app and works without a network connection.</p>
              <div className="exam-config-fields">
                <div>
                  <label className="exam-field-label" htmlFor="exam-question-count">Question count</label>
                  <select id="exam-question-count" className="exam-select" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} data-testid="select-exam-question-count">
                    {EXAM_QUESTION_COUNTS.map((count) => <option key={count} value={count} disabled={count > DEMO_EXAM_QUESTIONS.length}>{count} questions{count > DEMO_EXAM_QUESTIONS.length ? ' · unavailable' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="exam-field-label" htmlFor="exam-duration">Time limit</label>
                  <select id="exam-duration" className="exam-select" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} data-testid="select-exam-duration">
                    {EXAM_DURATION_MINUTES.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
                  </select>
                </div>
              </div>
              <button type="button" className="exam-start-button" onClick={startExam} data-testid="button-start-exam">
                Start practice exam <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
            <aside className="exam-panel exam-overview">
              <div>
                <div className="exam-overview-mark"><FileQuestion size={19} aria-hidden="true" /></div>
                <h3>A focused practice session</h3>
                <p>Move freely between questions. Your answers and flags stay in this session and are used only to build your local review.</p>
              </div>
              <div className="exam-overview-stats">
                <div><span>Question bank</span><strong>{DEMO_EXAM_QUESTIONS.length} examples</strong></div>
                <div><span>Mode</span><strong>Offline-ready</strong></div>
              </div>
            </aside>
          </section>
        ) : view === 'active' && exam && activeQuestion ? (
          <section className="exam-session" aria-label="Active practice exam" data-testid="panel-active-exam">
            <div className="exam-session-top">
              <div className="exam-session-label"><FileQuestion size={15} aria-hidden="true" /> Timed practice / in progress</div>
              <div className={`exam-timer ${exam.remainingSeconds <= 60 ? 'is-low' : ''}`} role="timer" aria-live="off" data-testid="status-exam-timer">
                <Clock3 size={15} aria-hidden="true" /><span>{formatExamTime(exam.remainingSeconds)}</span><span className="exam-timer-label">remaining</span>
              </div>
            </div>
            <div className="exam-progress-line" aria-label={`${answeredCount} of ${exam.questions.length} answered`}><div className="exam-progress-value" style={{ width: `${(answeredCount / exam.questions.length) * 100}%` }} /></div>
            <div className="exam-session-layout">
              <aside className="exam-navigator" aria-label="Question navigator">
                <div className="exam-navigator-head"><h2>Question map</h2><span>{answeredCount}/{exam.questions.length} answered</span></div>
                <div className="exam-legend" aria-label="Question status legend">
                  <span className="exam-legend-item"><i className="exam-legend-dot current" />Current</span>
                  <span className="exam-legend-item"><i className="exam-legend-dot answered" />Answered</span>
                  <span className="exam-legend-item"><i className="exam-legend-dot flagged" />Flagged</span>
                  <span className="exam-legend-item"><i className="exam-legend-dot" />Unanswered</span>
                </div>
                <div className="exam-question-grid">
                  {exam.questions.map((question, index) => {
                    const answered = Boolean(exam.answers[question.id]);
                    const flagged = exam.flaggedQuestionIds.includes(question.id);
                    return <button key={question.id} type="button" className={`exam-question-jump ${answered ? 'is-answered' : ''} ${flagged ? 'is-flagged' : ''} ${exam.currentIndex === index ? 'is-current' : ''}`} onClick={() => updateExam((current) => navigateExam(current, index))} aria-current={exam.currentIndex === index ? 'step' : undefined} aria-label={`Question ${index + 1}${answered ? ', answered' : ', unanswered'}${flagged ? ', flagged' : ''}`} data-testid={`button-question-${index + 1}`}>{index + 1}</button>;
                  })}
                </div>
                <p className="exam-nav-footnote">{flaggedCount ? `${flaggedCount} question${flaggedCount === 1 ? '' : 's'} marked to revisit.` : 'Mark any question to return to it before you submit.'}</p>
              </aside>
              <div className="exam-question-area">
                <article className="exam-question-card">
                  <div className="exam-question-meta"><span className="exam-topic-tag">{activeQuestion.topic}</span><span className="exam-question-count">QUESTION {String(exam.currentIndex + 1).padStart(2, '0')} / {String(exam.questions.length).padStart(2, '0')}</span></div>
                  <h2 className="exam-prompt">{activeQuestion.prompt}</h2>
                  <fieldset className="exam-choice-list" aria-label={`Answer choices for question ${exam.currentIndex + 1}`} data-testid="group-answer-choices">
                    {activeQuestion.choices.map((choice) => {
                      const selected = exam.answers[activeQuestion.id] === choice.key;
                      return <label key={choice.key} className={`exam-choice ${selected ? 'is-selected' : ''}`} data-testid={`label-choice-${choice.key}`}>
                        <input type="radio" name={`answer-${activeQuestion.id}`} value={choice.key} checked={selected} onChange={() => updateAnswer(activeQuestion, choice.key)} aria-label={`${choice.key}: ${choice.text}`} data-testid={`input-answer-${choice.key}`} />
                        <span className="exam-choice-key" aria-hidden="true">{choice.key}</span><span className="exam-choice-text">{choice.text}</span>
                      </label>;
                    })}
                  </fieldset>
                  <div className="exam-actions">
                    <div className="exam-actions-group">
                      <button type="button" className="exam-sim-button" onClick={() => updateExam((current) => navigateExam(current, exam.currentIndex - 1))} disabled={exam.currentIndex === 0} data-testid="button-previous-question"><ArrowLeft size={14} aria-hidden="true" /> Back</button>
                      <button type="button" className={`exam-sim-button ${exam.flaggedQuestionIds.includes(activeQuestion.id) ? 'is-flagged' : ''}`} onClick={() => updateExam((current) => toggleExamFlag(current, activeQuestion.id))} aria-pressed={exam.flaggedQuestionIds.includes(activeQuestion.id)} data-testid="button-toggle-flag"><Bookmark size={14} aria-hidden="true" /> {exam.flaggedQuestionIds.includes(activeQuestion.id) ? 'Flagged' : 'Flag for review'}</button>
                    </div>
                    {exam.currentIndex < exam.questions.length - 1 ? (
                      <button type="button" className="exam-sim-button is-primary" onClick={() => updateExam((current) => navigateExam(current, exam.currentIndex + 1))} data-testid="button-next-question">Next <ArrowRight size={14} aria-hidden="true" /></button>
                    ) : (
                      <button type="button" className="exam-sim-button is-submit" onClick={() => submitExam()} data-testid="button-submit-exam">Submit exam <Check size={14} aria-hidden="true" /></button>
                    )}
                  </div>
                  {exam.currentIndex < exam.questions.length - 1 && <div className="exam-actions" style={{ justifyContent: 'flex-end', marginTop: 10 }}><button type="button" className="exam-sim-button is-submit" onClick={() => submitExam()} data-testid="button-submit-exam">Submit exam <Check size={14} aria-hidden="true" /></button></div>}
                </article>
              </div>
            </div>
          </section>
        ) : view === 'result' && result ? (
          <section aria-label="Exam results" data-testid="panel-exam-results">
            <div className="exam-result-top">
              <div className="exam-panel exam-score-panel">
                <div className="exam-eyebrow">02 / Review complete</div>
                <h2>{result.percentage >= 70 ? 'Good signal.' : 'Keep building the signal.'}</h2>
                <p>Your local practice run is complete. Review each answer and the explanation below.</p>
                <div className="exam-score-big" data-testid="status-exam-score">{result.percentage}<span>% · {result.score}/{result.total}</span></div>
              </div>
              <div className="exam-panel exam-result-stats">
                <div className="exam-result-stat"><span>Correct</span><strong data-testid="status-correct-count">{result.correctCount}</strong></div>
                <div className="exam-result-stat"><span>Incorrect</span><strong data-testid="status-incorrect-count">{result.incorrectCount}</strong></div>
                <div className="exam-result-stat"><span>Unanswered</span><strong data-testid="status-unanswered-count">{result.unansweredCount}</strong></div>
                <div className="exam-result-stat"><span>Flagged</span><strong data-testid="status-flagged-count">{flaggedCount}</strong></div>
              </div>
            </div>
            <div className="exam-review-head"><h2>Answer review</h2><span>EXPLANATION FOR EVERY QUESTION</span></div>
            <div className="exam-review-list">
              {result.questions.map((item, index) => (
                <article key={item.question.id} className={`exam-review-card ${item.isCorrect ? 'is-correct' : 'is-incorrect'}`} data-testid={`card-review-question-${index + 1}`}>
                  <div className={`exam-review-status ${item.isCorrect ? 'is-correct' : 'is-incorrect'}`}>
                    {item.isCorrect ? <CircleCheck size={14} aria-hidden="true" /> : <CircleX size={14} aria-hidden="true" />}
                    {item.isCorrect ? 'Correct' : item.selectedKey ? 'Incorrect' : 'Unanswered'}
                    {exam?.flaggedQuestionIds.includes(item.question.id) ? <><span aria-hidden="true">·</span><Bookmark size={12} aria-hidden="true" /> Flagged</> : null}
                  </div>
                  <h3>{index + 1}. {item.question.prompt}</h3>
                  <div className="exam-review-answers">
                    <div><strong>Your answer:</strong> {item.selectedKey ? `${item.selectedKey} — ${item.question.choices.find((choice) => choice.key === item.selectedKey)?.text}` : 'No answer selected'}</div>
                    <div><strong>Correct answer:</strong> {item.question.correctKey} — {item.question.choices.find((choice) => choice.key === item.question.correctKey)?.text}</div>
                  </div>
                  <p className="exam-review-explanation"><strong>Why:</strong> {item.question.explanation}</p>
                </article>
              ))}
            </div>
            <div className="exam-result-actions"><button type="button" className="exam-start-button" onClick={restart} data-testid="button-restart-exam"><RotateCcw size={14} aria-hidden="true" /> Set up another exam</button></div>
          </section>
        ) : (
          <section className="exam-panel exam-state-panel" role="status" data-testid="status-exam-unavailable">
            <div><AlertTriangle size={27} aria-hidden="true" /><h2>Session unavailable</h2><p>This practice session is no longer available. Start a new local exam to continue.</p><button type="button" className="exam-start-button" onClick={restart} data-testid="button-return-exam-setup">Return to setup</button></div>
          </section>
        )}
      </div>
    </div>
  );
}

export const ExamSimulatorPage = ExamSimulator;
export default ExamSimulator;
