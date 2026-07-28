import React, { useMemo } from 'react';

/**
 * OrchardAmbience — the living backdrop for the Knowledge Orchard.
 *
 * Purely decorative (aria-hidden, pointer-events: none). It layers a
 * season-aware sky, a sun/moon, drifting clouds, and gentle ambient life
 * (birds, butterflies, fireflies) plus seasonal particles (petals / leaves /
 * snow). The amount of life scales with how healthy the orchard is, so a
 * well-tended orchard literally comes alive. All motion is disabled under
 * `prefers-reduced-motion`.
 *
 * Props:
 *   season     'spring' | 'summer' | 'autumn' | 'winter'
 *   night      boolean — dusk/night sky + fireflies instead of birds
 *   vibrancy   0..1 — share of healthy trees; drives butterfly/firefly count
 *   golden     number — count of golden-fruit trees (adds celebration fireflies)
 *   treehouse  boolean — show the cosy treehouse once a tree is mature+
 */
export default function OrchardAmbience({
  season = 'spring',
  night = false,
  vibrancy = 0.5,
  golden = 0,
  treehouse = false,
}) {
  // How many butterflies/fireflies to sprinkle in, based on orchard health.
  const butterflyCount = night ? 0 : Math.round(vibrancy * 3); // 0..3 by day
  const fireflyCount = night ? 4 + Math.min(4, golden * 2) : Math.min(4, golden * 2);
  const birdCount = night ? 0 : 2;

  // Seasonal falling particles: petals (spring), leaves (autumn), snow (winter).
  const particle = useMemo(() => {
    if (season === 'spring') return { glyph: '🌸', count: 8, cls: 'petal' };
    if (season === 'autumn') return { glyph: '🍂', count: 9, cls: 'leaf' };
    if (season === 'winter') return { glyph: '❄️', count: 12, cls: 'snow' };
    return { glyph: '', count: 0, cls: '' }; // summer: clear skies
  }, [season]);

  const birds = useMemo(() => Array.from({ length: birdCount }), [birdCount]);
  const butterflies = useMemo(() => Array.from({ length: butterflyCount }), [butterflyCount]);
  const fireflies = useMemo(() => Array.from({ length: fireflyCount }), [fireflyCount]);
  const particles = useMemo(() => Array.from({ length: particle.count }), [particle.count]);

  return (
    <div
      className={`eg-orch-ambience season-${season} ${night ? 'is-night' : 'is-day'}`}
      aria-hidden="true"
    >
      {/* Sky gradient + celestial body */}
      <div className="eg-amb-sky" />
      <div className={`eg-amb-celestial ${night ? 'moon' : 'sun'}`}>{night ? '🌙' : '☀️'}</div>

      {/* Drifting clouds */}
      <span className="eg-amb-cloud c1">☁️</span>
      <span className="eg-amb-cloud c2">☁️</span>
      <span className="eg-amb-cloud c3">⛅</span>

      {/* Birds gliding across the sky (day) */}
      {birds.map((_, i) => (
        <span key={`bird-${i}`} className={`eg-amb-bird b${i + 1}`}>🐦</span>
      ))}

      {/* Butterflies fluttering near healthy trees (day) */}
      {butterflies.map((_, i) => (
        <span key={`fly-${i}`} className={`eg-amb-butterfly f${i + 1}`}>🦋</span>
      ))}

      {/* Fireflies at dusk / celebrating golden fruit */}
      {fireflies.map((_, i) => (
        <span key={`fire-${i}`} className={`eg-amb-firefly ff${(i % 5) + 1}`} />
      ))}

      {/* Seasonal falling particles */}
      {particles.map((_, i) => (
        <span key={`p-${i}`} className={`eg-amb-particle ${particle.cls} p${(i % 6) + 1}`}>
          {particle.glyph}
        </span>
      ))}

      {/* Cosy treehouse appears once the orchard has a mature tree */}
      {treehouse && <span className="eg-amb-treehouse" title="Your treehouse">🛖</span>}

      {/* Rolling green ground the trees sit on */}
      <div className="eg-amb-ground" />
    </div>
  );
}
