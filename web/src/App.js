import React from 'react';
import './App.css';
import StudentDashboard from './components/StudentDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import SchoolDashboard from './components/SchoolDashboard';
import RoleGateway from './components/RoleGateway';
import { setRuntimeDevToken } from './api';

function App() {
  const [session, setSession] = React.useState(() => {
    try {
      const raw = localStorage.getItem('edugenie.session');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  });

  React.useEffect(() => {
    setRuntimeDevToken(session?.token || '');
  }, [session]);

  function handleLogin(nextSession) {
    setSession(nextSession);
    localStorage.setItem('edugenie.session', JSON.stringify(nextSession));
    setRuntimeDevToken(nextSession?.token || '');
  }

  function handleLogout() {
    setSession(null);
    localStorage.removeItem('edugenie.session');
    setRuntimeDevToken('');
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
