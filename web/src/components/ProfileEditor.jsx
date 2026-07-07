import React, { useEffect, useState } from 'react';
import { getStudent, saveStudent } from '../api';

export default function ProfileEditor({ studentId, onSaved }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!studentId) return;
      try {
        const res = await getStudent(studentId);
        if (!mounted) return;
        if (res && res.success && res.student) setName(res.student.name || '');
      } catch (e) {}
    }
    load();
    return () => { mounted = false; };
  }, [studentId]);

  async function onSave() {
    if (!name || !studentId) return;
    setLoading(true);
    try {
      const payload = { name, id: studentId };
      await saveStudent(payload);
      onSaved && onSaved({ name });
      alert('Saved');
    } catch (e) {
      alert('Save failed');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#666' }}>Student name</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Student name" />
        <button onClick={onSave} disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  );
}
