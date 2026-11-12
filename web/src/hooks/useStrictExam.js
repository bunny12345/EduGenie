import { useCallback, useEffect, useRef, useState } from 'react';
import { controlExam, getExamAccess } from '../api';

export function useExamAccess(studentId, completion) {
  const [access, setAccess] = useState({ exams: [], error: '', checking: true });
  useEffect(() => {
    let alive = true;
    let busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      try {
        const data = await getExamAccess();
        if (!Array.isArray(data?.exams)) throw new Error('Unable to verify exam access. Please update the backend.');
        if (alive) setAccess({ exams: data.exams, error: '', checking: false });
      } catch (error) {
        if (alive) setAccess((previous) => ({ ...previous, error: error.message, checking: false }));
      } finally { busy = false; }
    }
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [studentId, completion]);
  return { ...access, blocked: access.checking || !!access.error || access.exams.length > 0 };
}

export default function useStrictExam(test, finished, onResult) {
  const [state, setState] = useState({ status: 'active', error: '', saving: false });
  const pending = useRef('');
  const revision = useRef(-1);
  const saving = useRef(false);
  const unsaved = useRef({});
  const serverOffset = useRef(0);
  const now = useCallback(() => Date.now() + (test?.strictMode ? serverOffset.current : 0), [test?.strictMode]);
  const alive = useRef(false);
  const resultCallback = useRef(onResult);
  resultCallback.current = onResult;
  const active = !!test?.strictMode && !finished;
  const key = test?.attemptId ? `AcademiX.examIncident.${test.attemptId}` : '';
  const currentKey = useRef(key);
  currentKey.current = key;

  const request = useCallback(async (action, extra = {}) => {
    if (!test?.attemptId) return;
    try {
      const data = await controlExam(test.attemptId, { action, ...extra });
      if (key !== currentKey.current) {
        if (data.control.status !== 'active') localStorage.removeItem(key);
        return data;
      }
      if (data.control.revision < revision.current) return data;
      revision.current = data.control.revision;
      if (data.control.serverNow) serverOffset.current = new Date(data.control.serverNow).getTime() - Date.now();
      if (action === 'save' && data.control.status === 'active') {
        Object.entries(extra.answers).forEach(([id, value]) => {
          if (unsaved.current[id] === value) delete unsaved.current[id];
        });
      }
      if (data.control.status !== 'active') {
        unsaved.current = {};
        pending.current = '';
        localStorage.removeItem(key);
      }
      if (!alive.current) return;
      setState({ status: pending.current ? 'paused' : data.control.status, error: '', saving: saving.current, answers: data.control.answers });
      if (data.result) resultCallback.current(data.result);
      return data;
    } catch (error) {
      if (alive.current && key === currentKey.current) setState((previous) => ({ ...previous, error: error.message, saving: false }));
    }
  }, [test?.attemptId, key]);

  const pause = useCallback((reason = 'left_test') => {
    if (!active) return;
    pending.current = reason;
    localStorage.setItem(key, reason);
    setState((previous) => ({ ...previous, status: 'paused' }));
    return request('pause', { reason });
  }, [active, key, request]);

  useEffect(() => {
    if (!active) return undefined;
    alive.current = true;
    revision.current = -1;
    serverOffset.current = test.control?.serverNow ? new Date(test.control.serverNow).getTime() - Date.now() : 0;
    unsaved.current = {};
    pending.current = localStorage.getItem(key) || '';
    setState({ status: pending.current ? 'paused' : test.control?.status || 'active', error: '', saving: false });
    let busy = false;
    const sync = async () => {
      if (busy) return;
      busy = true;
      const answers = { ...unsaved.current };
      await request(pending.current ? 'pause' : Object.keys(answers).length ? 'save' : 'heartbeat',
        pending.current ? { reason: pending.current } : Object.keys(answers).length ? { answers } : {});
      busy = false;
    };
    const hidden = () => { if (document.hidden) pause('tab_hidden'); };
    const blur = () => { pause('window_blur'); };
    const leave = () => { pause('left_test'); };
    sync();
    const timer = setInterval(sync, 5000);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', blur);
    window.addEventListener('pagehide', leave);
    window.addEventListener('hashchange', leave);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('hashchange', leave);
    };
  }, [active, key, pause, request, test?.control?.status, test?.control?.serverNow]);

  const save = useCallback((answers) => {
    if (!active) return;
    unsaved.current = { ...unsaved.current, ...answers };
    saving.current = true;
    setState((previous) => ({ ...previous, saving: true }));
    return request('save', { answers }).finally(() => {
      saving.current = false;
      if (alive.current) setState((previous) => ({ ...previous, saving: false }));
    });
  }, [active, request]);
  return { ...state, locked: active && (state.status !== 'active' || !!state.error || state.saving), pause, save, now };
}
