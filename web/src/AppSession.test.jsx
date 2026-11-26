import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { renewPortalSession } from './api';

jest.mock('./components/RoleGateway', () => () => <div>Login page</div>);
jest.mock('./components/StudentDashboard', () => ({ onLogout }) => <button onClick={onLogout}>Sign out</button>);
jest.mock('./components/TeacherDashboard', () => () => <div>Teacher portal</div>);
jest.mock('./components/SchoolDashboard', () => () => <div>School portal</div>);
jest.mock('./components/OwnerPortal', () => () => <div>Owner portal</div>);
jest.mock('./api', () => ({ setRuntimeDevToken: jest.fn(), renewPortalSession: jest.fn() }));

const hours = (value) => value * 60 * 60 * 1000;
const token = (expiresAt) => `header.${btoa(JSON.stringify({ sub: 'student', role: 'student', exp: expiresAt / 1000 }))}.signature`;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  jest.clearAllMocks();
});

afterEach(() => jest.useRealTimers());

async function openSession(expiresAt = Date.now() + hours(48)) {
  localStorage.setItem('AcademiX.session', JSON.stringify({ role: 'student', userId: 'student', token: token(expiresAt) }));
  await act(async () => { render(<App />); });
  expect(screen.getByText('Sign out')).toBeInTheDocument();
}

test('expires after 48 hours without interaction even while the page remains open', async () => {
  await openSession();
  window.location.hash = 'Homework';
  await act(async () => { jest.advanceTimersByTime(hours(48) - 1); });
  expect(screen.getByText('Sign out')).toBeInTheDocument();
  expect(renewPortalSession).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(screen.getByText('Login page')).toBeInTheDocument();
  expect(localStorage.getItem('AcademiX.session')).toBeNull();
  expect(window.location.hash).toBe('');
});

test('interaction renews the token and starts a fresh 48-hour window', async () => {
  renewPortalSession.mockImplementation(async () => token(Date.now() + hours(48)));
  await openSession();
  await act(async () => { jest.advanceTimersByTime(hours(47)); });
  fireEvent.pointerDown(window);
  await act(async () => { jest.advanceTimersByTime(1000); });
  const updated = JSON.parse(localStorage.getItem('AcademiX.session'));
  const expiry = JSON.parse(atob(updated.token.split('.')[1])).exp * 1000;
  expect(expiry).toBe(Date.now() - 1000 + hours(48));
  await act(async () => { jest.advanceTimersByTime(expiry - Date.now() - 1); });
  expect(screen.getByText('Sign out')).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(screen.getByText('Login page')).toBeInTheDocument();
});

test('a suspended page checks expiry when it becomes visible again', async () => {
  await openSession();
  jest.setSystemTime(Date.now() + hours(48));
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(screen.getByText('Login page')).toBeInTheDocument();
});

test('accessible click and text input count as interaction', async () => {
  renewPortalSession.mockImplementation(async () => token(Date.now() + hours(48)));
  await openSession();
  fireEvent.click(window);
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(renewPortalSession).toHaveBeenCalledTimes(1);
  fireEvent.input(window);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(renewPortalSession).toHaveBeenCalledTimes(2);
});

test('expiry returns to login even if browser storage is unavailable', async () => {
  await openSession();
  const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Storage unavailable');
  });
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => { jest.advanceTimersByTime(hours(48)); });
  expect(screen.getByText('Login page')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('browser storage could not be cleared');
  getItem.mockRestore();
  log.mockRestore();
});

test('an expired stored session opens the login page on reload', async () => {
  localStorage.setItem('AcademiX.session', JSON.stringify({ role: 'student', token: token(Date.now() - 1000) }));
  await act(async () => { render(<App />); });
  expect(screen.getByText('Login page')).toBeInTheDocument();
  expect(localStorage.getItem('AcademiX.session')).toBeNull();
});

test('a late renewal cannot restore a session after logout', async () => {
  let resolve;
  renewPortalSession.mockReturnValue(new Promise((done) => { resolve = done; }));
  await openSession();
  fireEvent.pointerDown(window);
  await act(async () => { jest.advanceTimersByTime(1000); });
  fireEvent.click(screen.getByText('Sign out'));
  await act(async () => { resolve(token(Date.now() + hours(48))); });
  expect(screen.getByText('Login page')).toBeInTheDocument();
  expect(localStorage.getItem('AcademiX.session')).toBeNull();
});

test('a rejected renewal signs out, but a connection error does not', async () => {
  renewPortalSession.mockRejectedValueOnce(new Error('Offline'));
  await openSession();
  fireEvent.keyDown(window, { key: 'a' });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(screen.getByText('Sign out')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to renew');
  renewPortalSession.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }));
  fireEvent.keyDown(window, { key: 'b' });
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(screen.getByText('Login page')).toBeInTheDocument();
});

test('another tab can update or sign out the shared session', async () => {
  await openSession();
  const updated = JSON.stringify({ role: 'student', userId: 'student', token: token(Date.now() + hours(72)) });
  localStorage.setItem('AcademiX.session', updated);
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'AcademiX.session', newValue: updated })));
  await act(async () => { jest.advanceTimersByTime(hours(48)); });
  expect(screen.getByText('Sign out')).toBeInTheDocument();
  localStorage.removeItem('AcademiX.session');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'AcademiX.session', newValue: null })));
  expect(screen.getByText('Login page')).toBeInTheDocument();
});
