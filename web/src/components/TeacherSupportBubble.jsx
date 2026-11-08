import React, { useEffect, useRef, useState } from 'react';
import TechnicalSupport from './TechnicalSupport';

export default function TeacherSupportBubble() {
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const dialog = useRef(null);
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    node.showModal();
    const opener = button.current;
    return () => { node.close(); opener?.focus(); };
  }, [open]);

  return <>
    <button ref={button} type="button" className="td-support-bubble" aria-label="Open teacher support" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z" /><path d="M7 9h10M7 13h7" /></svg>
    </button>
    {open ? <dialog ref={dialog} className="td-support-dialog" aria-label="Teacher support" onCancel={() => setOpen(false)} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    }}>
      <div className="td-support-dialog-bar"><strong>Teacher Help Assistant</strong><button type="button" aria-label="Close teacher support" onClick={() => setOpen(false)}>✕</button></div>
      <TechnicalSupport requesterRole="teacher" />
    </dialog> : null}
  </>;
}
