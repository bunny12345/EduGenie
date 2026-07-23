import React, { useEffect, useState } from 'react';
import { treeAssetCandidates, STAGE_EMOJI, TREE_TYPE_EMOJI } from './treeAssets';

/**
 * Renders the artwork for a subject tree at a given growth stage.
 * Tries the provided art files in order (png → svg → webp) and, if none load,
 * falls back to a styled emoji placeholder so the UI always works.
 *
 * Props: treeType, stage, size (px), accentColor, health, alt
 */
export default function TreeSprite({ treeType, stage, size = 140, accentColor = '#22c55e', health = 'healthy', alt }) {
  const candidates = treeAssetCandidates(treeType, stage);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  // Reset when the tree/stage changes so new art is attempted.
  useEffect(() => {
    setIdx(0);
    setFailed(false);
  }, [treeType, stage]);

  const dim = { width: size, height: size };
  const wilt = health === 'wilting' ? 0.55 : health === 'thirsty' ? 0.8 : 1;

  if (!failed) {
    return (
      <img
        src={candidates[idx]}
        alt={alt || `${treeType} ${stage}`}
        style={{ ...dim, objectFit: 'contain', filter: `saturate(${wilt})`, display: 'block' }}
        onError={() => {
          if (idx < candidates.length - 1) setIdx(idx + 1);
          else setFailed(true);
        }}
      />
    );
  }

  // Placeholder: soft radial disc + stage/tree emoji. Looks intentional, not broken.
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
      aria-label={alt || `${treeType} ${stage}`}
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
