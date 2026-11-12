import React, { useEffect, useState } from 'react';
import { getSchoolProgressPeriod, saveSchoolProgressPeriod } from '../api';

export default function SchoolProgressPeriod({ schoolId, onSaved }) {
  const [dates, setDates] = useState({ startDate: '', endDate: '' });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setReady(false);
    setError('');
    setDates({ startDate: '', endDate: '' });
    getSchoolProgressPeriod().then((res) => {
      if (!active) return;
      if (res?.success === false) throw new Error(res.error || 'Unable to retrieve graph dates.');
      setDates(res.period || { startDate: '', endDate: '' });
      setReady(true);
    }).catch((e) => { if (active) setError(e.message || 'Unable to retrieve graph dates.'); });
    return () => { active = false; };
  }, [schoolId, retry]);

  async function save(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!dates.startDate || !dates.endDate || dates.endDate < dates.startDate) {
      setError('Choose a valid start date and an end date on or after it.');
      return;
    }
    setSaving(true);
    try {
      const res = await saveSchoolProgressPeriod(dates);
      if (res?.success === false || !res?.period) throw new Error(res?.error || 'Unable to save graph dates.');
      setDates(res.period);
      setMessage('Saved for your whole school. All subject and overall graph timelines now use these dates.');
      onSaved();
    } catch (e) {
      setError(e.message || 'Unable to save graph dates.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sd-progress-period" aria-label="School progress graph dates">
      <header>
        <span className="sd-progress-period-icon" aria-hidden="true">▦</span>
        <div><span className="sd-progress-period-kicker">SCHOOL-WIDE GRAPH SETTINGS · ADMIN ONLY</span>
          <h3>Your school’s learning calendar</h3>
          <p>Choose the first and last date shown on every student’s overall and subject progress graphs.</p>
        </div>
      </header>
      <form onSubmit={save}>
        <label>Start date<input type="date" required value={dates.startDate} disabled={!ready || saving} onChange={(e) => { setDates({ ...dates, startDate: e.target.value }); setMessage(''); }} /></label>
        <span className="sd-progress-period-arrow" aria-hidden="true">→</span>
        <label>End date<input type="date" required min={dates.startDate || undefined} value={dates.endDate} disabled={!ready || saving} onChange={(e) => { setDates({ ...dates, endDate: e.target.value }); setMessage(''); }} /></label>
        <button type="submit" disabled={!ready || saving}>{saving ? 'Saving…' : 'Apply to all progress graphs'}</button>
      </form>
      <p className="sd-progress-period-help">Up to 24 calendar months · Dates follow India time (IST). Each graph point includes all learning up to that date—earlier learning is never reset. Headline scores and report-card exam history stay unchanged.</p>
      {ready && !dates.startDate && <p className="sd-progress-period-help">No school dates saved yet. The existing default timeline stays in use until you apply a range.</p>}
      {error && <p className="sd-progress-period-error" role="alert">{error}{!ready && <button type="button" onClick={() => setRetry((n) => n + 1)}>Try again</button>}</p>}
      {message && <p className="sd-progress-period-success" role="status">{message}</p>}
    </section>
  );
}
