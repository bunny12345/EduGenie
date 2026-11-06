import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import OwnerPortal from './OwnerPortal';
import RoleGateway from './RoleGateway';
import { createOwnerClient } from '../ownerAuthClient';
import { getOwnerAccess, schoolRegisterRequestOtp, schoolRegisterVerifyOtp } from '../api';

jest.mock('../ownerAuthClient', () => ({ createOwnerClient: jest.fn() }));
jest.mock('../api', () => ({
  getOwnerAccess: jest.fn(),
  schoolRegisterRequestOtp: jest.fn(),
  schoolRegisterVerifyOtp: jest.fn(),
}));

let client;
beforeEach(() => {
  jest.clearAllMocks();
  client = { auth: {
    signInWithPassword: jest.fn().mockResolvedValue({
      data: { session: { access_token: 'password-only-token', expires_at: Math.floor(Date.now() / 1000) + 3600 } },
      error: null,
    }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    mfa: {
      listFactors: jest.fn().mockResolvedValue({ data: { totp: [{ id: 'existing-factor', status: 'verified' }], all: [] }, error: null }),
      enroll: jest.fn().mockResolvedValue({ data: { id: 'new-factor', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg />' } }, error: null }),
      unenroll: jest.fn().mockResolvedValue({ error: null }),
      challengeAndVerify: jest.fn().mockResolvedValue({
        data: { access_token: 'mfa-token', expires_in: 3600 }, error: null,
      }),
    },
  } };
  createOwnerClient.mockReturnValue(client);
  getOwnerAccess.mockImplementation(async (token) => ({ success: true, mfaVerified: token === 'mfa-token' }));
});

async function login() {
  fireEvent.change(screen.getByLabelText('Owner email'), { target: { value: 'owner@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password-only' } });
  fireEvent.click(screen.getByRole('button', { name: 'Owner sign in' }));
  await screen.findByLabelText('Authenticator code');
}

async function verify() {
  fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify & continue' }));
  await screen.findByRole('heading', { name: 'Register a school' });
}

test('owner password eye toggles visibility without submitting or changing the password', () => {
  render(<OwnerPortal />);
  const input = screen.getByLabelText('Password');
  fireEvent.change(input, { target: { value: 'test-password-only' } });
  expect(input).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(input).toHaveAttribute('type', 'text');
  expect(input).toHaveValue('test-password-only');
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(input).toHaveAttribute('type', 'password');
  expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
});

test('school password eye toggles visibility and resets for the next registration', async () => {
  schoolRegisterRequestOtp.mockResolvedValue({ success: true });
  render(<OwnerPortal />);
  await login();
  await verify();
  const input = screen.getByLabelText('School password');
  fireEvent.change(input, { target: { value: 'school-password' } });
  expect(input).toHaveAttribute('type', 'password');
  expect(input).toHaveAttribute('minlength', '8');
  expect(input).toHaveAttribute('autocomplete', 'new-password');
  fireEvent.click(screen.getByRole('button', { name: 'Show school password' }));
  expect(input).toHaveAttribute('type', 'text');
  expect(input).toHaveValue('school-password');
  expect(schoolRegisterRequestOtp).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Hide school password' }));
  expect(input).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show school password' }));
  for (const [label, value] of [
    ['School name', 'Test school'], ['Location', 'City'], ['School email', 'school@example.test'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Send school verification code' }));
  await screen.findByLabelText('School email verification code');
  fireEvent.click(screen.getByRole('button', { name: 'Change details / request a new code' }));
  expect(screen.getByLabelText('School password')).toHaveAttribute('type', 'password');
  expect(screen.getByLabelText('School password')).toHaveValue('');
});

test('public gateway has only school login, not school registration', () => {
  render(<RoleGateway onLogin={jest.fn()} />);
  expect(screen.getByRole('heading', { name: 'School Login' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Register School' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('School Name')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Teacher' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Student' })).toBeInTheDocument();
});

test('configured owner enrolls TOTP on first sign-in before registering', async () => {
  client.auth.mfa.listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
  render(<OwnerPortal />);
  await login();
  expect(screen.getByAltText('Scan to set up your owner authenticator')).toHaveAttribute('src', 'data:image/svg+xml;charset=utf-8,%3Csvg%20%2F%3E');
  expect(screen.queryByLabelText('School name')).not.toBeInTheDocument();
  await verify();
  expect(getOwnerAccess).toHaveBeenLastCalledWith('mfa-token');
});

test('non-owner cannot enroll MFA or reach registration', async () => {
  getOwnerAccess.mockRejectedValue(new Error('This account does not have owner access.'));
  render(<OwnerPortal />);
  fireEvent.change(screen.getByLabelText('Owner email'), { target: { value: 'other@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password-only' } });
  fireEvent.click(screen.getByRole('button', { name: 'Owner sign in' }));
  await screen.findByText('This account does not have owner access.');
  expect(client.auth.mfa.listFactors).not.toHaveBeenCalled();
  expect(client.auth.mfa.enroll).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('School name')).not.toBeInTheDocument();
});

test('invalid MFA does not expose the registration form', async () => {
  client.auth.mfa.challengeAndVerify.mockResolvedValue({ data: null, error: new Error('Invalid authenticator code') });
  render(<OwnerPortal />);
  await login();
  fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '000000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify & continue' }));
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('School name')).not.toBeInTheDocument();
});

test('MFA owner verifies the school email and stays in the owner portal', async () => {
  schoolRegisterRequestOtp.mockResolvedValue({ success: true });
  schoolRegisterVerifyOtp.mockResolvedValue({ success: true, school: { schoolName: 'Test school' } });
  render(<OwnerPortal />);
  await login();
  await verify();
  for (const [label, value] of [
    ['School name', 'Test school'], ['Branch', 'Main'], ['Location', 'City'],
    ['School email', 'school@example.test'], ['School password', 'school-password'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Send school verification code' }));
  await screen.findByLabelText('School email verification code');
  expect(schoolRegisterRequestOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'school@example.test' }), 'mfa-token');
  fireEvent.change(screen.getByLabelText('School email verification code'), { target: { value: '654321' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify & register school' }));
  await screen.findByText(/Test school was registered successfully/);
  expect(schoolRegisterVerifyOtp).toHaveBeenCalledWith('school@example.test', '654321', 'mfa-token');
  expect(screen.getByRole('button', { name: 'Owner sign out' })).toBeInTheDocument();
  expect(localStorage.getItem('AcademiX.session')).toBeNull();
  // MFA returns expires_in, not expires_at: the elevated session must not expire immediately.
  expect(await screen.findByLabelText('School name')).toBeInTheDocument();
});

test('sign out clears the owner page without touching the regular portal session', async () => {
  const portalSession = JSON.stringify({ role: 'school_admin', token: 'existing-portal-token' });
  localStorage.setItem('AcademiX.session', portalSession);
  try {
    render(<OwnerPortal />);
    await login();
    await verify();
    fireEvent.click(screen.getByRole('button', { name: 'Owner sign out' }));
    expect(await screen.findByRole('button', { name: 'Owner sign in' })).toBeInTheDocument();
    expect(screen.queryByLabelText('School name')).not.toBeInTheDocument();
    expect(localStorage.getItem('AcademiX.session')).toBe(portalSession);
  } finally {
    localStorage.removeItem('AcademiX.session');
  }
});

test('expired owner session requires a fresh login and MFA', async () => {
  jest.useFakeTimers();
  try {
    render(<OwnerPortal />);
    await login();
    await verify();
    await act(async () => { jest.advanceTimersByTime(3600 * 1000); });
    expect(screen.getByRole('button', { name: 'Owner sign in' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Your owner session expired.');
    expect(screen.queryByLabelText('School name')).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});
