import React, { useEffect, useState } from 'react';
import { listSchoolEnquiries } from '../api';
import SchoolEnquiryThread from './SchoolEnquiryThread';

export default function SchoolEnquiriesInbox({ token, onAuthError }) {
  const [enquiries, setEnquiries] = useState([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    let fetching = false;
    const controller = new AbortController();
    async function load() {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        let offset = 0;
        const all = [];
        do {
          const result = await listSchoolEnquiries(token, offset, controller.signal);
          all.push(...result.enquiries);
          offset = result.nextOffset;
        } while (offset !== null && active);
        if (active) { setEnquiries(all); setError(''); }
      } catch (e) {
        if (!active) return;
        setError(e.message || 'Unable to load school enquiries.');
        if (e.status === 401 || e.status === 403) onAuthError?.(e.message);
      } finally { fetching = false; }
    }
    load();
    const timer = setInterval(load, 15000);
    document.addEventListener('visibilitychange', load);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [token, refresh, onAuthError]);
  return <section className="vc-inbox">
    <header><h2>Prospective schools</h2><p>Verified website enquiries. Reply here; the visitor receives an email notification.</p></header>
    {error ? <div className="vc-error" role="alert">{error}<button type="button" className="vc-text-btn" onClick={() => setRefresh((v) => v + 1)}>Try again</button></div> : null}
    <div className="vc-inbox-layout">
      <div className="vc-enquiry-list" aria-label="School enquiries">
        {enquiries.map((enquiry) => <button type="button" key={enquiry.id} aria-pressed={selected === enquiry.id} onClick={() => setSelected((id) => id === enquiry.id ? '' : enquiry.id)}>
          <strong>{enquiry.school_name}</strong><span>{enquiry.name} · {enquiry.status}</span><small>{enquiry.email}</small>
        </button>)}
        {!enquiries.length && !error ? <p>Verified school enquiries will appear here.</p> : null}
      </div>
      {selected ? <SchoolEnquiryThread key={selected} id={selected} token={token} owner onAuthError={onAuthError} /> : <p>Select a school enquiry to read and reply.</p>}
    </div>
  </section>;
}
