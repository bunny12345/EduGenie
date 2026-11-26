import React from 'react';
import './App.css';
import RoleGateway from './components/RoleGateway';
import { renewPortalSession, setRuntimeDevToken } from './api';
import { watchSessionActivity } from './sessionActivity';

const StudentDashboard = React.lazy(() => import('./components/StudentDashboard'));
const TeacherDashboard = React.lazy(() => import('./components/TeacherDashboard'));
const SchoolDashboard = React.lazy(() => import('./components/SchoolDashboard'));
const OwnerPortal = React.lazy(() => import('./components/OwnerPortal'));

class PortalBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Unable to open portal:', error); }
  render() {
    if (this.state.failed) {
      return <main role="alert">
        <p>Unable to open this portal. Check your connection and reload.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload</button>
      </main>;
    }
    return this.props.children;
  }
}

// Temporary debug switch: disables automatic auth-expiry flows that can feel like
// page loops while we stabilize homework submit.
const DISABLE_SESSION_EXPIRY_GUARD = true;

function parseJwtPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '').trim();
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (e) {
    return null;
  }
}

function isExpiredToken(token) {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!exp) return false;
  return Date.now() >= exp * 1000;
}

/** Seconds until token expires; returns 0 if already expired or no expiry */
function secondsUntilExpiry(token) {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!exp) return Infinity;
  return Math.max(0, Math.floor(exp - Date.now() / 1000));
}

function AppContent() {
  const [session, setSession] = React.useState(() => {
    try {
      const raw = localStorage.getItem('AcademiX.session');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.token && isExpiredToken(parsed.token)) {
        localStorage.removeItem('AcademiX.session');
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  });

  // Shows the re-login modal without losing UI context
  const [sessionExpired, setSessionExpired] = React.useState(false);
  const [sessionWarning, setSessionWarning] = React.useState('');
  const sessionActivityPendingRef = React.useRef(false);
  const sessionLastAttemptRef = React.useRef(0);

  React.useEffect(() => {
    setRuntimeDevToken(session?.token || '');
  }, [session]);

  React.useEffect(() => {
    function syncSession(event) {
      if (event.key !== 'AcademiX.session') return;
      try {
        const next = event.newValue ? JSON.parse(event.newValue) : null;
        if (!next) window.location.hash = '';
        setSession(next);
        setSessionExpired(false);
        setSessionWarning('');
        setRuntimeDevToken(next?.token || '');
      } catch (error) {
        console.error('Unable to synchronize the session:', error);
      }
    }
    window.addEventListener('storage', syncSession);
    return () => window.removeEventListener('storage', syncSession);
  }, []);

  React.useEffect(() => {
    if (!session?.token || window.location.pathname.replace(/\/+$/, '') === '/owner') return undefined;
    const exp = Number(parseJwtPayload(session.token)?.exp);
    if (!Number.isFinite(exp) || exp <= 0) return undefined;
    const originalToken = session.token;
    function currentStoredSession() {
      const raw = localStorage.getItem('AcademiX.session');
      return raw ? JSON.parse(raw) : null;
    }
    function withCurrentSession(action) {
      try {
        const current = currentStoredSession();
        if (current?.token !== originalToken) {
          setSession(current);
          setRuntimeDevToken(current?.token || '');
          return true;
        }
        action(current);
        return true;
      } catch (error) {
        console.error('Unable to update the session:', error);
        setSessionWarning('Unable to update your session. Check browser storage and try again.');
        return false;
      }
    }
    return watchSessionActivity({
      token: originalToken,
      expiresAt: exp * 1000,
      renew: renewPortalSession,
      lastAttemptAt: sessionLastAttemptRef.current,
      onAttempt: (timestamp) => { sessionLastAttemptRef.current = timestamp; },
      resumeActivity: sessionActivityPendingRef.current,
      onRenew: (token, activityWhilePending) => withCurrentSession((current) => {
        sessionActivityPendingRef.current = activityWhilePending;
        const updated = { ...current, token };
        localStorage.setItem('AcademiX.session', JSON.stringify(updated));
        setRuntimeDevToken(token);
        setSession(updated);
        setSessionWarning('');
      }),
      onExpired: () => {
        const updated = withCurrentSession(() => {
          sessionActivityPendingRef.current = false;
          sessionLastAttemptRef.current = 0;
          window.location.hash = '';
          localStorage.removeItem('AcademiX.session');
          setRuntimeDevToken('');
          setSession(null);
          setSessionExpired(false);
          setSessionWarning('');
        });
        if (!updated) {
          window.location.hash = '';
          setRuntimeDevToken('');
          setSession(null);
          setSessionExpired(false);
          setSessionWarning('Session expired, but browser storage could not be cleared.');
        }
      },
      onError: () => setSessionWarning('Unable to renew your session. Check your connection and try again.'),
    });
  }, [session]);

  // Proactive expiry check — polls every 60 s; shows re-login modal 2 min before expiry
  React.useEffect(() => {
    if (DISABLE_SESSION_EXPIRY_GUARD) return;
    if (!session?.token) return;
    const id = setInterval(() => {
      const secs = secondsUntilExpiry(session.token);
      if (secs <= 0) {
        setSessionExpired(true);
        setRuntimeDevToken('');
        localStorage.removeItem('AcademiX.session');
      } else if (secs <= 120 && !sessionExpired) {
        setSessionExpired(true);
      }
    }, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  React.useEffect(() => {
    if (DISABLE_SESSION_EXPIRY_GUARD) return;
    function handleExpiredAuth() {
      setSessionExpired(true);
      setRuntimeDevToken('');
      localStorage.removeItem('AcademiX.session');
    }
    window.addEventListener('AcademiX.authExpired', handleExpiredAuth);
    return () => window.removeEventListener('AcademiX.authExpired', handleExpiredAuth);
  }, []);

  function handleLogin(nextSession) {
    sessionActivityPendingRef.current = false;
    sessionLastAttemptRef.current = 0;
    window.location.hash = '';
    setSession(nextSession);
    setSessionExpired(false);
    setSessionWarning('');
    localStorage.setItem('AcademiX.session', JSON.stringify(nextSession));
    setRuntimeDevToken(nextSession?.token || '');
  }

  function handleLogout() {
    sessionActivityPendingRef.current = false;
    sessionLastAttemptRef.current = 0;
    window.location.hash = '';
    setSession(null);
    setSessionExpired(false);
    setSessionWarning('');
    localStorage.removeItem('AcademiX.session');
    setRuntimeDevToken('');
  }

  if (window.location.pathname.replace(/\/+$/, '') === '/owner') {
    return <OwnerPortal />;
  }

  // Re-login modal — shown when session expires while user is on a page
  if (!DISABLE_SESSION_EXPIRY_GUARD && (sessionExpired || (!session && false /* keep gateway flow below */))) {
    // If no prior session exists go to gateway; if session was active show modal
    if (session || sessionExpired) {
      return (
        <div className="eg-relogin-overlay">
          <div className="eg-relogin-modal">
            <p className="eg-relogin-icon">🔒</p>
            <h2>Session Expired</h2>
            <p>Your session has expired. Please log in again to continue.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button
                className="eg-relogin-btn"
                onClick={() => {
                  setSessionExpired(false);
                  setSession(null);
                  localStorage.removeItem('AcademiX.session');
                  setRuntimeDevToken('');
                }}
              >
                Log In Again
              </button>
              <button
                className="eg-relogin-btn secondary"
                onClick={handleLogout}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  if (!session) {
    return <>{sessionWarning && <p role="alert" className="session-renewal-warning">{sessionWarning}</p>}<RoleGateway onLogin={handleLogin} /></>;
  }

  if (session.role === 'teacher') {
    return <>{sessionWarning && <p role="alert" className="session-renewal-warning">{sessionWarning}</p>}<TeacherDashboard session={session} onLogout={handleLogout} /></>;
  }

  if (session.role === 'school_admin') {
    return <>{sessionWarning && <p role="alert" className="session-renewal-warning">{sessionWarning}</p>}<SchoolDashboard session={session} onLogout={handleLogout} /></>;
  }

  return <>{sessionWarning && <p role="alert" className="session-renewal-warning">{sessionWarning}</p>}<StudentDashboard key={session.userId || 'test'} studentId={session.userId || 'test'} onLogout={handleLogout} /></>;
}

function App() {
  return <PortalBoundary><React.Suspense fallback={null}><AppContent /></React.Suspense></PortalBoundary>;
}

export default App;
