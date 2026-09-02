import React, { useEffect, useState } from 'react';
import { generateQuizRush, completeOrchardReview } from '../../api';

// Blossom/Fruit retention check — a quick 3-question quiz grounded in the
// chapter's own lesson content, shown on demand when a week/month review is
// due. Passing calls completeOrchardReview to advance the tree.
export default function RetentionCheckModal({ studentId, subjectKey, subjectLabel, chapter, reviewType, onClose, onDone }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await generateQuizRush(studentId, {
          lessonId: chapter?.lessonId,
          lessonTitle: chapter?.title,
          subject: subjectLabel,
          count: 3,
        });
        if (cancelled) return;
        if (res?.success && Array.isArray(res.questions) && res.questions.length) {
          setQuestions(res.questions);
        } else {
          setError('Could not prepare the memory check. Please try again later.');
        }
      } catch {
        if (!cancelled) setError('Could not prepare the memory check. Please try again later.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [studentId, chapter?.lessonId, chapter?.title, subjectLabel]);

  function selectOption(qId, idx) {
    if (result) return;
    setAnswers((prev) => ({ ...prev, [qId]: idx }));
  }

  async function onSubmit() {
    setSubmitting(true);
    try {
      const total = questions.length;
      const score = questions.reduce((sum, q) => sum + (answers[q.id] === q.correctIndex ? 1 : 0), 0);
      const passed = total > 0 && score >= Math.ceil(total / 2);
      await completeOrchardReview({
        studentId,
        chapterId: chapter?.chapterId,
        reviewType,
        passed,
      });
      setResult({ score, total, passed });
    } catch {
      setError('Could not submit the memory check. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id] !== undefined);
  const label = reviewType === 'month' ? '1-Month Memory Check' : '1-Week Memory Check';

  return (
    <div className="eg-modal-test-overlay" onClick={onClose}>
      <div className="eg-modal-test" onClick={(e) => e.stopPropagation()}>
        <div className="eg-modal-header">
          <h3>🧠 {label} · {chapter?.title}</h3>
          <button type="button" onClick={onClose}>✕</button>
        </div>

        <div className="eg-modal-content">
          {loading ? (
            <div className="eg-loading">Preparing your memory check…</div>
          ) : error ? (
            <div className="eg-error">{error}</div>
          ) : result ? (
            <div className={`eg-inline-note ${result.passed ? '' : ''}`}>
              {result.passed
                ? `✅ Nice! You got ${result.score}/${result.total} — this chapter's memory check is passed.`
                : `You got ${result.score}/${result.total}. That's below the pass mark — review the lesson and try again soon.`}
            </div>
          ) : (
            questions.map((q, i) => (
              <div className="eg-question-block" key={q.id}>
                <p><strong>Q{i + 1}.</strong> {q.question}</p>
                <div className="eg-options">
                  {q.options.map((opt, idx) => (
                    <button
                      type="button"
                      key={idx}
                      className={`eg-option-btn ${answers[q.id] === idx ? 'selected' : ''}`}
                      onClick={() => selectOption(q.id, idx)}
                    >
                      <span className="eg-option-radio">{answers[q.id] === idx ? '●' : '○'}</span>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="eg-modal-footer">
          {result ? (
            <button type="button" className="eg-btn-submit" onClick={() => onDone(result.passed)}>Done</button>
          ) : (
            <>
              <button type="button" className="eg-btn-cancel" onClick={onClose} disabled={submitting}>Cancel</button>
              <button
                type="button"
                className="eg-btn-submit"
                onClick={onSubmit}
                disabled={!allAnswered || submitting || loading || Boolean(error)}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
