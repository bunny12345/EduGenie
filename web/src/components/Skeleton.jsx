import React from 'react';

// Reusable shimmer/skeleton placeholder block — see `.eg-skel` in App.css.
// Used only where a page previously rendered nothing while loading.
export function Skel({ height = 16, width, radius = 8, style, className = '' }) {
  return (
    <div
      className={`eg-skel ${className}`}
      style={{ height, width, borderRadius: radius, ...style }}
    />
  );
}

export default Skel;
