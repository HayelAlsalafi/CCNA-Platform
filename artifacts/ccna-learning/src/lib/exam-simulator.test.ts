import { describe, expect, it } from 'vitest';
import {
  createExam,
  DEMO_EXAM_QUESTIONS,
  formatExamTime,
  gradeExam,
  navigateExam,
  setExamAnswer,
  tickExam,
  toggleExamFlag,
} from './exam-simulator';

describe('local demo exam session', () => {
  it('creates the requested session without mutating its question bank', () => {
    const exam = createExam({ questionCount: 5, durationMinutes: 15 }, DEMO_EXAM_QUESTIONS, 100);
    expect(exam.questions).toHaveLength(5);
    expect(exam.startedAt).toBe(100);
    expect(exam.expiresAt).toBe(900100);
    expect(exam.remainingSeconds).toBe(900);
    expect(exam.answers).toEqual({});
  });

  it('records and updates answers only for session questions', () => {
    const exam = createExam({ questionCount: 5, durationMinutes: 15 });
    const questionId = exam.questions[0].id;
    const answered = setExamAnswer(exam, questionId, 'A');
    expect(answered.answers[questionId]).toBe('A');
    expect(setExamAnswer(answered, 'unknown-question', 'B')).toBe(answered);
    expect(setExamAnswer(answered, questionId, 'C').answers[questionId]).toBe('C');
  });

  it('toggles a review flag and clamps question navigation', () => {
    const exam = createExam({ questionCount: 5, durationMinutes: 15 });
    const flagged = toggleExamFlag(exam, exam.questions[2].id);
    expect(flagged.flaggedQuestionIds).toEqual([exam.questions[2].id]);
    expect(toggleExamFlag(flagged, exam.questions[2].id).flaggedQuestionIds).toEqual([]);
    expect(navigateExam(exam, 99).currentIndex).toBe(4);
    expect(navigateExam(exam, -1).currentIndex).toBe(0);
  });

  it('grades correct, incorrect, and unanswered questions separately', () => {
    const exam = createExam({ questionCount: 5, durationMinutes: 15 });
    const first = exam.questions[0];
    const second = exam.questions[1];
    const result = gradeExam(setExamAnswer(
      setExamAnswer(exam, first.id, first.correctKey),
      second.id,
      second.correctKey === 'A' ? 'B' : 'A',
    ));
    expect(result).toMatchObject({
      score: 1,
      total: 5,
      percentage: 20,
      correctCount: 1,
      incorrectCount: 1,
      unansweredCount: 3,
    });
    expect(result.questions[0].isCorrect).toBe(true);
    expect(result.questions[1].isCorrect).toBe(false);
  });

  it('keeps the timer at zero and formats timer labels consistently', () => {
    const exam = createExam({ questionCount: 5, durationMinutes: 15 }, DEMO_EXAM_QUESTIONS, 100);
    expect(tickExam(exam, 1_100).remainingSeconds).toBe(899);
    const lastSecond = { ...exam, remainingSeconds: 1, expiresAt: 2_000 };
    expect(tickExam(lastSecond, 1_001).remainingSeconds).toBe(1);
    expect(tickExam(lastSecond, 2_000).remainingSeconds).toBe(0);
    expect(tickExam(tickExam(lastSecond, 2_000), 3_000).remainingSeconds).toBe(0);
    expect(formatExamTime(901)).toBe('15:01');
    expect(formatExamTime(-2)).toBe('00:00');
  });
});
