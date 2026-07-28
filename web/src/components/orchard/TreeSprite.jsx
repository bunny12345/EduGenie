import React, { useEffect, useState } from 'react';
import { treeAssetCandidates, STAGE_EMOJI, TREE_TYPE_EMOJI, moodForState } from './treeAssets';

/**
 * Renders the artwork for a subject tree at a given growth stage.
 * The tree is "alive": its mood (happy / sad / sleepy / excited) is derived
 * from its health, and mood-specific art is used when available (falling back
 * to the plain stage image, then a styled emoji placeholder that also shows
 * the current expression). So the UI always works, even before art is added.
 *
 * Props: treeType, stage, size (px), accentColor, health, alt, mood (optional override)
 */
export default function TreeSprite({ treeType, stage, size = 140, accentColor = '#22c55e', health = 'healthy', alt, mood }) {
  const activeMood = mood || moodForState(stage, health);
  const candidates = treeAssetCandidates(treeType, stage, activeMood);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  // Reset when the tree/stage/mood changes so new art is attempted.
  useEffect(() => {
    setIdx(0);
    setFailed(false);
  }, [treeType, stage, activeMood]);

  const dim = { width: size, height: size };
  const wilt = health === 'wilting' ? 0.55 : health === 'thirsty' ? 0.8 : 1;

  if (!failed) {
    return (
      <img
        src={candidates[idx]}
        alt={alt || `${treeType} ${stage} (${activeMood})`}
        style={{ ...dim, objectFit: 'contain', filter: `saturate(${wilt})`, display: 'block' }}
        onError={() => {
          if (idx < candidates.length - 1) setIdx(idx + 1);
          else setFailed(true);
        }}
      />
    );
  }

  // Placeholder shown ONLY until real art is added: a soft disc + stage emoji.
  // The tree's real face (eyes + mouth) is drawn INTO the artwork by the artist,
  // with a different mouth/eyes per mood — so no emoji face is used in the final UI.
  const emoji = STAGE_EMOJI[stage] || TREE_TYPE_EMOJI[treeType] || '🌱';
  return (
    <div
      className="eg-tree-placeholder"
      style={{
        ...dim,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        background: `radial-gradient(circle at 50% 40%, ${hexToRgba(accentColor, 0.22)}, ${hexToRgba(accentColor, 0.05)} 70%, transparent)`,
        filter: `saturate(${wilt})`,
      }}
      aria-label={alt || `${treeType} ${stage} (${activeMood})`}
    >
      <span style={{ fontSize: Math.round(size * 0.5), lineHeight: 1 }}>{emoji}</span>
    </div>
  );
}

function hexToRgba(hex, alpha) {
  const h = String(hex || '#22c55e').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
