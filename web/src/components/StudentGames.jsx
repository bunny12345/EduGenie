import React, { useEffect, useRef, useState } from 'react';
import { getGamesCatalog } from '../api';
import Flashcards from './games/Flashcards';
import './StudentGames.css';

/**
 * Learning Arcade — the hub for study games. Starts with AI Flashcards; more
 * games are listed as "coming soon" so the collection feels alive. Selecting a
 * live game opens its full-screen player.
 */
export default function StudentGames({ studentId, greetingName, onAskTutor, onCoinsEarned }) {
  const [games, setGames] = useState(null);
  const [activeGame, setActiveGame] = useState(null); // gameKey being played
  const flashcardsBackRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getGamesCatalog()
      .then((res) => { if (alive) setGames((res && res.games) || []); })
      .catch(() => { if (alive) setGames([]); });
    return () => { alive = false; };
  }, []);

  const active = (games || []).find((g) => g.gameKey === activeGame) || null;

  if (activeGame && active) {
    return (
      <div className="eg-games">
        <div className="eg-games-playhead">
          <button
            className="eg-games-back"
            onClick={() => {
              if (active.gameKey === 'flashcards' && flashcardsBackRef.current?.()) return;
              setActiveGame(null);
            }}
          >← Arcade</button>
          <div className="eg-games-playtitle" style={{ '--game-accent': active.accent }}>
            <span className="eg-games-playicon">{active.icon}</span>
            <strong>{active.title}</strong>
          </div>
        </div>
        {active.gameKey === 'flashcards' && (
          <Flashcards
            studentId={studentId}
            onAskTutor={onAskTutor}
            onCoinsEarned={onCoinsEarned}
            onArcadeBackReady={(handler) => { flashcardsBackRef.current = handler; }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="eg-games">
      <header className="eg-games-hero">
        <div className="eg-games-hero-glow" aria-hidden="true" />
        <h1>Learning Arcade 🎮</h1>
        <p>{greetingName ? `${greetingName}, pick` : 'Pick'} a game and turn study time into play time.</p>
      </header>

      {/* The catalog arrives in the background — the grid simply appears. */}
      {games === null ? null : (
        <div className="eg-games-grid">
          {games.map((g) => (
            <button
              key={g.gameKey}
              className={`eg-game-card ${g.status === 'live' ? 'live' : 'soon'}`}
              style={{ '--game-accent': g.accent }}
              disabled={g.status !== 'live'}
              onClick={() => g.status === 'live' && setActiveGame(g.gameKey)}
            >
              <span className="eg-game-icon">{g.icon}</span>
              <span className="eg-game-title">{g.title}</span>
              <span className="eg-game-tagline">{g.tagline}</span>
              <span className={`eg-game-status ${g.status}`}>
                {g.status === 'live' ? '▶ Play' : '🔒 Coming soon'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
