import React from 'react';
import './App.css';
import StudentDashboard from './components/StudentDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import SchoolDashboard from './components/SchoolDashboard';
import RoleGateway from './components/RoleGateway';
import { setRuntimeDevToken } from './api';

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

function App() {
  const [session, setSession] = React.useState(() => {
    try {
      const raw = localStorage.getItem('edugenie.session');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.token && isExpiredToken(parsed.token)) {
        localStorage.removeItem('edugenie.session');
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  });

  // Shows the re-login modal without losing UI context
  const [sessionExpired, setSessionExpired] = React.useState(false);

  React.useEffect(() => {
    setRuntimeDevToken(session?.token || '');
  }, [session]);

  // Proactive expiry check — polls every 60 s; shows re-login modal 2 min before expiry
  React.useEffect(() => {
    if (!session?.token) return;
    const id = setInterval(() => {
      const secs = secondsUntilExpiry(session.token);
      if (secs <= 0) {
        setSessionExpired(true);
        setRuntimeDevToken('');
        localStorage.removeItem('edugenie.session');
      } else if (secs <= 120 && !sessionExpired) {
        setSessionExpired(true);
      }
    }, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  React.useEffect(() => {
    function handleExpiredAuth() {
      setSessionExpired(true);
      setRuntimeDevToken('');
      localStorage.removeItem('edugenie.session');
    }
    window.addEventListener('edugenie.authExpired', handleExpiredAuth);
    return () => window.removeEventListener('edugenie.authExpired', handleExpiredAuth);
  }, []);

  function handleLogin(nextSession) {
    setSession(nextSession);
    setSessionExpired(false);
    localStorage.setItem('edugenie.session', JSON.stringify(nextSession));
    setRuntimeDevToken(nextSession?.token || '');
  }

  function handleLogout() {
    setSession(null);
    setSessionExpired(false);
    localStorage.removeItem('edugenie.session');
    setRuntimeDevToken('');
  }

  // Re-login modal — shown when session expires while user is on a page
  if (sessionExpired || (!session && false /* keep gateway flow below */)) {
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
                  localStorage.removeItem('edugenie.session');
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
    return <RoleGateway onLogin={handleLogin} />;
  }

  if (session.role === 'teacher') {
    return <TeacherDashboard session={session} onLogout={handleLogout} />;
  }

  if (session.role === 'school_admin') {
    return <SchoolDashboard session={session} onLogout={handleLogout} />;
  }

  return <StudentDashboard studentId={session.userId || 'test'} onLogout={handleLogout} />;
}

export default App;
