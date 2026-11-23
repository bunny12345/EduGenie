import React, { useCallback, useEffect, useState } from 'react';
import {
  listOwnerSchools,
  updateOwnerSchool,
  deleteOwnerSchool,
  requestOwnerSchoolEmailCode,
  verifyOwnerSchoolEmailCode,
  requestSchoolPhoneCode,
  verifySchoolPhoneCode
} from '../api';
import { phoneFieldValue, registrationPhoneNumber, PHONE_COUNTRIES } from './RegistrationContactField';

function isAuthError(error) {
  return error?.status === 401 || error?.status === 403;
}

function deleteConfirmationPhrase(schoolName) {
  const name = String(schoolName || '').trim();
  return `delete ${name} permanently`;
}

export default function OwnerSchoolManagement({ token, onSessionExpired }) {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [confirmation, setConfirmation] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listOwnerSchools(token);
      setSchools(Array.isArray(result.schools) ? result.schools : []);
    } catch (e) {
      if (isAuthError(e)) await onSessionExpired(e.message);
      else setError(e.message || 'Could not load registered schools.');
    } finally {
      setLoading(false);
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    load();
  }, [load]);

  function beginEdit(school) {
    if (editing?.id === school.id) {
      setEditing(null);
      setError('');
      return;
    }
    setDeleting(null);
    setConfirmation('');
    setEditing({
      id: school.id,
      schoolName: school.schoolName || '',
      branch: school.branch || '',
      location: school.location || '',
      email: school.email || '',
      originalEmail: school.email || '',
      emailChallengeId: '',
      emailCode: '',
      emailVerificationId: '',
      emailExpiresAt: '',
      emailError: '',
      phone: phoneFieldValue(school.phone || ''),
      originalPhone: school.phone || '',
      phoneError: ''
    });
    setConfirmation('');
    setError('');
    setNote('');
  }

  async function sendEmailCode() {
    if (!editing) return;
    const email = String(editing.email || '').trim().toLowerCase();
    setBusy('email-send');
    setError('');
    try {
      const result = await requestOwnerSchoolEmailCode(editing.id, email, token);
      setEditing((value) => ({ ...value, emailChallengeId: result.challengeId, emailCode: '', emailError: '', emailVerificationId: '', emailExpiresAt: '' }));
    } catch (e) {
      if (isAuthError(e)) await onSessionExpired(e.message);
      else setEditing((value) => ({ ...value, emailError: e.message || 'Could not send the email code.' }));
    } finally {
      setBusy('');
    }
  }

  async function verifyEmailCode() {
    if (!editing) return;
    setBusy('email-verify');
    setError('');
    try {
      const email = String(editing.email || '').trim().toLowerCase();
      const result = await verifyOwnerSchoolEmailCode(editing.id, email, editing.emailChallengeId, editing.emailCode, token);
      setEditing((value) => ({
        ...value,
        emailVerificationId: result.verificationId,
        emailExpiresAt: result.expiresAt,
        emailError: ''
      }));
    } catch (e) {
      if (isAuthError(e)) await onSessionExpired(e.message);
      else setEditing((value) => ({ ...value, emailError: e.message || 'Could not verify the email code.' }));
    } finally {
      setBusy('');
    }
  }

  async function sendPhoneCode() {
    if (!editing) return;
    const phone = registrationPhoneNumber(editing.phone);
    if (!phone) {
      setEditing((value) => ({ ...value, phoneError: 'Enter a valid mobile number.' }));
      return;
    }
    setBusy('phone-send');
    setEditing((value) => ({ ...value, phoneError: '' }));
    try {
      const result = await requestSchoolPhoneCode({
        role: 'school',
        accountId: editing.id,
        country: editing.phone.country,
        phone
      }, token);
      setEditing((value) => ({
        ...value,
        phone: { ...value.phone, challengeId: result.challengeId },
        phoneError: ''
      }));
    } catch (e) {
      if (isAuthError(e)) await onSessionExpired(e.message);
      else setEditing((value) => ({ ...value, phoneError: e.message || 'Could not send the SMS code.' }));
    } finally {
      setBusy('');
    }
  }

  async function verifyPhoneCode() {
    if (!editing) return;
    setBusy('phone-verify');
    try {
      const phone = registrationPhoneNumber(editing.phone);
      const result = await verifySchoolPhoneCode({
        role: 'school',
        accountId: editing.id,
        country: editing.phone.country,
        phone,
        challengeId: editing.phone.challengeId,
        code: editing.phone.code
      }, token);
      setEditing((value) => ({
        ...value,
        phone: {
          ...value.phone,
          phone: result.phone,
          verificationId: result.verificationId,
          expiresAt: result.expiresAt,
          code: ''
        },
        phoneError: ''
      }));
    } catch (e) {
      if (isAuthError(e)) await onSessionExpired(e.message);
      else setEditing((value) => ({ ...value, phoneError: e.message || 'Could not verify the SMS code.' }));
    } finally {
      setBusy('');
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editing) return;
    const emailChanged = String(editing.email).trim().toLowerCase() !== String(editing.originalEmail).trim().toLowerCase();
    const phoneNumber = registrationPhoneNumber(editing.phone);
    const phoneChanged = phoneNumber && phoneNumber !== String(editing.originalPhone || '').trim();
    const phoneCleared = !editing.phone.number.trim() && !!String(editing.originalPhone || '').trim();
    if (emailChanged && !editing.emailVerificationId) {
      setEditing((value) => ({ ...value, emailError: 'Verify the new email address before saving.' }));
      return;
    }
    if (phoneChanged && !editing.phone.verificationId) {
      setEditing((value) => ({ ...value, phoneError: 'Verify the new mobile number before saving.' }));
      return;
    }

    setBusy('save');
    setError('');
    try {
      const payload = {
        schoolName: editing.schoolName,
        branch: editing.branch,
        location: editing.location
      };
      if (emailChanged) {
        payload.email = String(editing.email).trim().toLowerCase();
        payload.emailVerificationId = editing.emailVerificationId;
      }
      if (phoneChanged) {
        payload.phone = phoneNumber;
        payload.country = editing.phone.country;
        payload.phoneVerificationId = editing.phone.verificationId;
      } else if (phoneCleared) {
        payload.phone = null;
      }
      const result = await updateOwnerSchool(editing.id, payload, token);
      setNote(`${result.school.schoolName} was updated successfully.`);
      setEditing(null);
      await load();
    } catch (e) {
      if (isAuthError(e)) await onSessionExpired(e.message);
      else setError(e.message || 'Could not update the school.');
    } finally {
      setBusy('');
    }
  }

  async function confirmDelete(e) {
    e.preventDefault();
    if (!deleting) return;
    const requiredPhrase = deleteConfirmationPhrase(deleting.schoolName);
    if (confirmation !== requiredPhrase) {
      setError(`Type "${requiredPhrase}" exactly to confirm.`);
      return;
    }
    setBusy('delete');
    setError('');
    try {
      const result = await deleteOwnerSchool(deleting.id, confirmation, token);
      setNote(`${deleting.schoolName} was permanently deleted. ${result.deletedStudentCount} student accounts and ${result.deletedTeacherCount} teacher accounts were removed.`);
      setDeleting(null);
      setConfirmation('');
      await load();
    } catch (e) {
      if (isAuthError(e)) await onSessionExpired(e.message);
      else setError(e.message || 'The school could not be deleted.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="eg-owner-school-management">
      <div className="eg-owner-school-header">
        <div>
          <span className="eg-owner-school-eyebrow">Owner administration</span>
          <h2>Registered schools</h2>
          <p>View, edit or permanently remove an individual school.</p>
        </div>
        <button type="button" className="eg-owner-school-refresh" disabled={loading || !!busy} onClick={load}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {note ? <p className="rg-otp-note" role="status">{note}</p> : null}
      {error ? <p className="rg-error" role="alert">{error}</p> : null}

      {loading ? (
        <div className="eg-owner-school-list" aria-label="Registered schools list">
          <div className="eg-owner-school-skeleton" />
          <div className="eg-owner-school-skeleton" />
        </div>
      ) : schools.length === 0 ? (
        <p className="eg-owner-school-empty">No schools are registered yet.</p>
      ) : (
        <div className="eg-owner-school-list">
          {schools.map((school) => (
            <article className="eg-owner-school-card" key={school.id}>
              <div className="eg-owner-school-details">
                <h3>{school.schoolName || 'Unnamed school'}</h3>
                <p><strong>Branch:</strong> {school.branch || 'Not set'}</p>
                <p><strong>Location:</strong> {school.location || 'Not set'}</p>
                <p><strong>Email:</strong> {school.email || 'Not set'}</p>
                <p><strong>Phone:</strong> {school.phone || 'Not set'}</p>
                <p className="eg-owner-school-counts">{Number(school.teacherCount || 0)} teachers · {Number(school.studentCount || 0)} students</p>
              </div>
              <div className="eg-owner-school-actions">
                <button type="button" className="eg-owner-school-edit" disabled={!!busy} onClick={() => beginEdit(school)}>Edit</button>
                <button type="button" className="eg-owner-school-delete" disabled={!!busy} onClick={() => {
                  if (deleting?.id === school.id) {
                    setDeleting(null);
                    setConfirmation('');
                    setError('');
                    return;
                  }
                  setEditing(null);
                  setDeleting(school);
                  setConfirmation('');
                  setError('');
                  setNote('');
                }}>Delete permanently</button>
              </div>

              {editing?.id === school.id ? (
                <form className="eg-owner-school-inline" onSubmit={saveEdit}>
                  <div className="eg-owner-school-modal-head">
                    <div>
                      <span className="eg-owner-school-eyebrow">Edit school</span>
                      <h2>{editing.schoolName || 'School details'}</h2>
                    </div>
                    <button type="button" className="eg-owner-school-close" disabled={!!busy} onClick={() => setEditing(null)}>Close</button>
                  </div>
                  <label>School name
                    <input required value={editing.schoolName} onChange={(e) => setEditing({ ...editing, schoolName: e.target.value })} />
                  </label>
                  <label>Branch
                    <input required value={editing.branch} onChange={(e) => setEditing({ ...editing, branch: e.target.value })} />
                  </label>
                  <label>Location
                    <input required value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
                  </label>

                  {String(editing.email).trim().toLowerCase() === String(editing.originalEmail).trim().toLowerCase() ? (
                    <label>School email
                      <input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value, emailChallengeId: '', emailCode: '', emailVerificationId: '', emailExpiresAt: '', emailError: '' })} />
                    </label>
                  ) : (
                    <div className="eg-owner-contact-edit">
                      <label>New school email
                        <input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value, emailChallengeId: '', emailCode: '', emailVerificationId: '', emailExpiresAt: '', emailError: '' })} />
                      </label>
                      {!editing.emailVerificationId ? (
                        <>
                          <button type="button" disabled={!!busy} onClick={sendEmailCode}>{busy === 'email-send' ? 'Sending...' : 'Send email verification code'}</button>
                          {editing.emailChallengeId ? (
                            <div className="eg-owner-code-row">
                              <label>Email verification code
                                <input inputMode="numeric" maxLength={6} value={editing.emailCode} onChange={(e) => setEditing({ ...editing, emailCode: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
                              </label>
                              <button type="button" disabled={!!busy || editing.emailCode.length !== 6} onClick={verifyEmailCode}>{busy === 'email-verify' ? 'Verifying...' : 'Verify email'}</button>
                            </div>
                          ) : null}
                        </>
                      ) : <p className="sd-phone-verified" role="status">Verified {editing.email}</p>}
                      {editing.emailError ? <p className="rg-error" role="alert">{editing.emailError}</p> : null}
                    </div>
                  )}

                  <div className="eg-owner-contact-edit">
                    <label>Country
                      <select value={editing.phone.country} onChange={(e) => setEditing({
                        ...editing,
                        phone: { ...phoneFieldValue(''), country: e.target.value, number: '' },
                        phoneError: ''
                      })}>
                        {PHONE_COUNTRIES.map(({ country, name, code }) => (
                          <option key={country} value={country}>{name} (+{code})</option>
                        ))}
                      </select>
                    </label>
                    <label>Mobile number
                      <input type="tel" value={editing.phone.number} onChange={(e) => setEditing({
                        ...editing,
                        phone: { ...editing.phone, number: e.target.value, challengeId: '', code: '', verificationId: '', expiresAt: '' },
                        phoneError: ''
                      })} />
                    </label>
                    {editing.phone.verificationId ? (
                      <p className="sd-phone-verified" role="status">Verified {editing.phone.phone}</p>
                    ) : registrationPhoneNumber(editing.phone) !== String(editing.originalPhone || '').trim() ? (
                      <>
                        <button type="button" disabled={!!busy || !registrationPhoneNumber(editing.phone)} onClick={sendPhoneCode}>{busy === 'phone-send' ? 'Sending...' : 'Send SMS verification code'}</button>
                        {editing.phone.challengeId ? (
                          <div className="eg-owner-code-row">
                            <label>SMS verification code
                              <input inputMode="numeric" maxLength={6} value={editing.phone.code || ''} onChange={(e) => setEditing({
                                ...editing,
                                phone: { ...editing.phone, code: e.target.value.replace(/\D/g, '').slice(0, 6) }
                              })} />
                            </label>
                            <button type="button" disabled={!!busy || (editing.phone.code || '').length !== 6} onClick={verifyPhoneCode}>{busy === 'phone-verify' ? 'Verifying...' : 'Verify number'}</button>
                          </div>
                        ) : null}
                      </>
                    ) : <p className="sd-phone-help">Phone unchanged; verification is not required.</p>}
                    {String(editing.originalPhone || '').trim() ? (
                      <button type="button" disabled={!!busy} onClick={() => setEditing({
                        ...editing,
                        phone: { ...phoneFieldValue(''), country: editing.phone.country, number: '', verificationId: '', expiresAt: '', challengeId: '', code: '' },
                        phoneError: ''
                      })}>Clear mobile number</button>
                    ) : null}
                    {editing.phoneError ? <p className="rg-error" role="alert">{editing.phoneError}</p> : null}
                  </div>

                  <div className="eg-owner-school-modal-actions">
                    <button type="button" className="eg-owner-school-close" disabled={!!busy} onClick={() => setEditing(null)}>Cancel</button>
                    <button type="submit" className="eg-owner-school-save" disabled={!!busy}>{busy === 'save' ? 'Saving...' : 'Save changes'}</button>
                  </div>
                </form>
              ) : null}

              {deleting?.id === school.id ? (
                <form className="eg-owner-delete-inline" onSubmit={confirmDelete}>
                  <span className="eg-owner-school-eyebrow">Permanent deletion warning</span>
                  <h2>Delete {deleting.schoolName}?</h2>
                  <p>This permanently removes this school, every linked teacher and student account, and its recorded learning/support data in the database.</p>
                  <p><strong>It does not remove shared provider backups immediately.</strong> Existing backups retain normal expiry (up to seven days). Any older upload not recorded in the asset registry must be handled by manual upload review.</p>
                  <p>School ID: <code>{deleting.id}</code></p>
                  <label>Type <strong>{deleteConfirmationPhrase(deleting.schoolName)}</strong> to confirm
                    <input required autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
                  </label>
                  <div className="eg-owner-school-modal-actions">
                    <button type="button" className="eg-owner-school-close" disabled={!!busy} onClick={() => setDeleting(null)}>Cancel</button>
                    <button type="submit" className="eg-owner-school-delete-confirm" disabled={!!busy || confirmation !== deleteConfirmationPhrase(deleting.schoolName)}>{busy === 'delete' ? 'Deleting permanently...' : 'Delete permanently'}</button>
                  </div>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}

    </section>
  );
}
