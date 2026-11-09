import { useEffect, useRef } from 'react';

// Keep loaded data on screen, but refresh stale visible panels without polling
// hidden pages or starting a second request for the same panel.
export default function useVisiblePanels(scope, panels, loaders, interval = 20000) {
  const latest = useRef(loaders);
  latest.current = loaders;
  const state = useRef({ scope, entries: new Map() });
  if (state.current.scope !== scope) state.current = { scope, entries: new Map() };
  const panelKey = panels.join(',');

  useEffect(() => {
    const entries = state.current.entries;
    function refresh() {
      if (document.visibilityState === 'hidden') return;
      panelKey.split(',').filter(Boolean).forEach((key) => {
        const entry = entries.get(key);
        if (entry?.pending || (entry && Date.now() - entry.at < interval)) return;
        const next = { pending: true, at: Date.now() };
        entries.set(key, next);
        // Panel loaders own error presentation; keep this scheduler from
        // suppressing errors in loaders that do not handle their own failures.
        Promise.resolve().then(() => latest.current[key]()).finally(() => {
          next.pending = false;
          next.at = Date.now();
        });
      });
    }
    refresh();
    const timer = setInterval(refresh, interval);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [scope, panelKey, interval]);
}
