export function watchSessionActivity({ token, expiresAt, renew, onRenew, onExpired, onError, onAttempt, lastAttemptAt = 0, resumeActivity = false }) {
  let stopped = false;
  let pending = false;
  let activityTimer;
  let expiryTimer;
  let lastAttempt = lastAttemptAt;
  let activityWhilePending = false;

  function checkExpiry() {
    if (stopped) return true;
    if (Date.now() >= expiresAt) {
      onExpired();
      return true;
    }
    return false;
  }

  async function refresh() {
    activityTimer = null;
    if (checkExpiry() || pending) return;
    pending = true;
    lastAttempt = Date.now();
    onAttempt(lastAttempt);
    try {
      const nextToken = await renew(token);
      if (!stopped) onRenew(nextToken, activityWhilePending);
    } catch (error) {
      if (!stopped) {
        if (error?.status === 401 || error?.status === 403) onExpired();
        else if (!checkExpiry()) onError(error);
      }
    } finally {
      pending = false;
      if (!stopped && activityWhilePending) {
        activityWhilePending = false;
        activity();
      }
    }
  }

  function activity() {
    if (document.visibilityState === 'hidden' || checkExpiry()) return;
    if (pending) {
      activityWhilePending = true;
      return;
    }
    if (activityTimer) return;
    const retryDelay = lastAttempt ? Math.max(1000, 5000 - (Date.now() - lastAttempt)) : 0;
    const delay = Math.max(0, Math.min(retryDelay, expiresAt - Date.now() - 1500));
    activityTimer = setTimeout(refresh, delay);
  }

  function scheduleExpiry() {
    if (checkExpiry()) return;
    expiryTimer = setTimeout(scheduleExpiry, Math.min(expiresAt - Date.now(), 2147483647));
  }

  function visibilityChanged() {
    if (document.visibilityState !== 'hidden') {
      checkExpiry();
    } else if (activityTimer) {
      clearTimeout(activityTimer);
      activityTimer = null;
      refresh();
    }
  }

  const events = ['pointerdown', 'click', 'input', 'keydown', 'wheel', 'touchmove'];
  events.forEach((name) => window.addEventListener(name, activity, { passive: true }));
  document.addEventListener('visibilitychange', visibilityChanged);
  scheduleExpiry();
  if (resumeActivity) activity();
  return () => {
    stopped = true;
    clearTimeout(activityTimer);
    clearTimeout(expiryTimer);
    events.forEach((name) => window.removeEventListener(name, activity));
    document.removeEventListener('visibilitychange', visibilityChanged);
  };
}
