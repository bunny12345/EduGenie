import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./components/RoleGateway', () => ({ onLogin }) => <button onClick={() => onLogin({ role: 'student', userId: 'student' })}>Sign in</button>);
jest.mock('./components/StudentDashboard', () => ({ studentId, onLogout }) => <div>Student {studentId}<button onClick={onLogout}>Sign out</button></div>);
jest.mock('./components/TeacherDashboard', () => () => <div>Teacher portal</div>);
jest.mock('./components/SchoolDashboard', () => () => <div>School portal</div>);
jest.mock('./components/OwnerPortal', () => () => <div>Owner portal</div>);
jest.mock('./api', () => ({ setRuntimeDevToken: jest.fn() }));

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

test('login and logout still clear the hash with lazily loaded portals', async () => {
  window.location.hash = 'Calendar';
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Student student')).toBeInTheDocument();
  expect(window.location.hash).toBe('');
  window.location.hash = 'Library';
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  expect(window.location.hash).toBe('');
});

test.each([['teacher', 'Teacher portal'], ['school_admin', 'School portal']])('restores the %s portal', async (role, label) => {
  localStorage.setItem('AcademiX.session', JSON.stringify({ role, userId: 'user' }));
  render(<App />);
  expect(await screen.findByText(label)).toBeInTheDocument();
  expect(screen.queryByText('Student student')).not.toBeInTheDocument();
});

test('owner path still opens the owner portal', async () => {
  window.history.replaceState(null, '', '/owner');
  render(<App />);
  expect(await screen.findByText('Owner portal')).toBeInTheDocument();
});
