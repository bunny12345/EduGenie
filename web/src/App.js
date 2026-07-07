import React from 'react';
import './App.css';
import Chat from './components/Chat';
import Memories from './components/Memories';

function App() {
  const studentId = 'test';
  return (
    <div className="App" style={{ padding: 20 }}>
      <h1>EduGenie</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <Chat studentId={studentId} />
        <Memories studentId={studentId} />
      </div>
    </div>
  );
}

export default App;
