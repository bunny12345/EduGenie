import React, { useEffect, useState } from 'react';
import { listMemories } from '../api';

export default function Memories({ studentId = 'test' }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await listMemories(studentId);
        // supabase REST returns { data: [...] } or raw array
        let rows = res ? (res.data || res) : [];
        // Normalize to array
        if (!Array.isArray(rows)) {
          if (rows && Array.isArray(rows.data)) rows = rows.data;
          else rows = [];
        }
        if (mounted) setMemories(rows);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false };
  }, [studentId]);

  return (
    <div className="card" style={{ padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Memories</h3>
      {loading && <div>Loading...</div>}
      {!loading && (!Array.isArray(memories) || memories.length === 0) && <div>No memories found.</div>}
      <ul className="memories-list">
        {Array.isArray(memories) && memories.map((m) => (
          <li key={m.id}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{m.value}</div>
            <div style={{ color: '#666', fontSize: 12 }}>{m.id}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
