import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RoleGateway from './RoleGateway';
import { requestPasswordResetCode, resetForgottenPassword } from '../api';

jest.mock('./WelcomeAssistant', () => () => null);
jest.mock('../api', () => ({
  acceptInvite: jest.fn(),
  getInviteInfo: jest.fn(),
  schoolLogin: jest.fn(),
  studentLogin: jest.fn(),
  teacherLogin: jest.fn(),
  requestPasswordResetCode: jest.fn(),
  resetForgottenPassword: jest.fn(),
  requestRegistrationPhoneCode: jest.fn(),
  verifyRegistrationPhoneCode: jest.fn(),
  requestRegistrationEmailCode: jest.fn(),
  verifyRegistrationEmailCode: jest.fn(),
  requestSchoolPhoneCode: jest.fn(),
  verifySchoolPhoneCode: jest.fn()
}));

beforeEach(() => jest.clearAllMocks());

test('teacher is guided from an invalid email to phone verification and resets with a strong new password', async () => {
  requestPasswordResetCode
    .mockResolvedValueOnce({ success: false, error: 'This email address is not valid for this account. You can verify with your registered mobile number instead.' })
    .mockResolvedValueOnce({ success: true, challengeId: 'VEx', channel: 'phone', destination: '+919••••••10', resendAfter: 60 });
  resetForgottenPassword.mockResolvedValue({ success: true, message: 'Your password has been changed. You can now log in with your new password.' });

  render(<RoleGateway onLogin={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Teacher' }));
  fireEvent.change(screen.getByPlaceholderText('teacher login id'), { target: { value: 'jpr1521@gmail.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

  expect(screen.getByDisplayValue('jpr1521@gmail.com')).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'wrong@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
  expect(await screen.findByText(/verify with your registered mobile number instead/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Verify with mobile number instead' }));
  expect(screen.getByLabelText('Country code')).toHaveValue('IN');
  fireEvent.change(screen.getByPlaceholderText('mobile number'), { target: { value: '98765 43210' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
  await screen.findByText('Set a new password');
  expect(requestPasswordResetCode).toHaveBeenLastCalledWith({
    role: 'teacher', loginId: 'jpr1521@gmail.com', channel: 'phone', country: 'IN', phone: '98765 43210'
  });

  fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
  fireEvent.change(screen.getByPlaceholderText('new password'), { target: { value: 'NoSpecial1' } });
  fireEvent.change(screen.getByPlaceholderText('re-enter new password'), { target: { value: 'NoSpecial1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText(/include a letter, a number and a special character/)).toBeInTheDocument();
  expect(resetForgottenPassword).not.toHaveBeenCalled();

  fireEvent.change(screen.getByPlaceholderText('new password'), { target: { value: 'New#Pass1' } });
  fireEvent.change(screen.getByPlaceholderText('re-enter new password'), { target: { value: 'New#Pass1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

  await waitFor(() => expect(resetForgottenPassword).toHaveBeenCalledWith({
    role: 'teacher', loginId: 'jpr1521@gmail.com', challengeId: 'VEx', code: '123456', newPassword: 'New#Pass1', confirmPassword: 'New#Pass1'
  }));
  expect(await screen.findByRole('status')).toHaveTextContent('Your password has been changed');
  expect(screen.getByRole('button', { name: 'Login as Teacher' })).toBeInTheDocument();
});

test('school admin resets with the school email, and student reset errors stay visible', async () => {
  resetForgottenPassword
    .mockResolvedValueOnce({ success: true, message: 'Your password has been changed. You can now log in with your new password.' })
    .mockResolvedValue({ success: false, error: 'The new password must be different from your current password.' });
  requestPasswordResetCode.mockResolvedValue({ success: true, challengeId: 'id', channel: 'email', destination: 'ad••@school.edu', resendAfter: 60 });
  render(<RoleGateway onLogin={jest.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'School' }));
  fireEvent.change(screen.getByPlaceholderText('admin@school.edu'), { target: { value: 'admin@school.edu' } });
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  expect(screen.getByLabelText('School Email')).toHaveValue('admin@school.edu');
  expect(screen.queryByPlaceholderText('you@example.com')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
  await screen.findByText('Set a new password');
  expect(requestPasswordResetCode).toHaveBeenLastCalledWith({
    role: 'school', loginId: 'admin@school.edu', channel: 'email', email: 'admin@school.edu'
  });
  fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
  fireEvent.change(screen.getByPlaceholderText('new password'), { target: { value: 'New#Pass1' } });
  fireEvent.change(screen.getByPlaceholderText('re-enter new password'), { target: { value: 'New#Pass1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Your password has been changed');
  expect(screen.getByRole('button', { name: 'Login as School Admin' })).toBeInTheDocument();
  expect(screen.getByPlaceholderText('admin@school.edu')).toHaveValue('admin@school.edu');

  fireEvent.click(screen.getByRole('button', { name: 'Student' }));
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  fireEvent.change(screen.getByPlaceholderText('student login id'), { target: { value: 'stu1' } });
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'stu@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
  await screen.findByText('Set a new password');
  fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '654321' } });
  fireEvent.change(screen.getByPlaceholderText('new password'), { target: { value: 'Old#Pass1' } });
  fireEvent.change(screen.getByPlaceholderText('re-enter new password'), { target: { value: 'Old#Pass1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('different from your current password');
});
