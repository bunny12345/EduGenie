import React, { useEffect, useMemo, useRef } from 'react';
import RankBadge from './RankBadge';

// Full-page celebration for a top-3 rank: confetti, firework bursts and 🚀
// rockets on a canvas, floating balloons, and a congratulations card. Rank 1
// gets the biggest show. Shown once per exam (the caller records that).
const SHOW = {
  1: { seconds: 10, confetti: 5, rockets: 7, fireworks: 0.9, balloons: 14, colors: ['#ffd21f', '#ffb300', '#ff6b6b', '#5b47ff', '#22c55e', '#00c2ff', '#ff4fd8'], title: 'You are the CLASS TOPPER!', tag: 'gold' },
  2: { seconds: 8, confetti: 3.4, rockets: 4, fireworks: 0.6, balloons: 9, colors: ['#e5e9f2', '#b8c4dc', '#5b8def', '#9b8cff', '#22d3ee', '#ff9ecb'], title: 'Brilliant! 2nd Rank in class!', tag: 'silver' },
  3: { seconds: 7, confetti: 2.4, rockets: 2, fireworks: 0.4, balloons: 6, colors: ['#ffb27a', '#e08a4c', '#22c55e', '#7dd3fc', '#fcd34d', '#fda4af'], title: 'Fantastic! 3rd Rank in class!', tag: 'bronze' }
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export default function RankCelebration({ rank, name, className, examName, onClose }) {
  const canvasRef = useRef(null);
  const cfg = SHOW[rank] || SHOW[3];
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const balloons = useMemo(
    () => Array.from({ length: cfg.balloons }, (_, i) => ({
      id: i,
      left: rand(2, 96),
      delay: rand(0, 3.5),
      duration: rand(6, 10),
      size: rand(26, 46),
      emoji: pick(['🎈', '🎈', '🎈', '🎊', '✨'])
    })),
    [cfg.balloons]
  );

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const confetti = [];
    const sparks = [];
    const rockets = [];
    const start = performance.now();
    let last = start;
    let rocketsLaunched = 0;
    let rain = 0;
    let nextRocket = 0.4;
    let nextFirework = 0.8;
    let raf = 0;

    function spawnConfetti(x, y, vx, vy) {
      confetti.push({
        x, y, vx, vy,
        w: rand(6, 11), h: rand(8, 16),
        rot: rand(0, Math.PI * 2), vr: rand(-8, 8),
        color: pick(cfg.colors), life: 1, drag: rand(0.985, 0.995)
      });
    }

    function burst(x, y, count = 46) {
      const color = pick(cfg.colors);
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + rand(-0.1, 0.1);
        const sp = rand(80, 260);
        sparks.push({ x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: rand(0.5, 0.9), color: Math.random() < 0.25 ? '#fff' : color });
      }
    }

    // Party poppers from both bottom corners at the start.
    for (let i = 0; i < 70 * (cfg.confetti / 3); i += 1) {
      spawnConfetti(0, H, rand(250, 700), rand(-1100, -500));
      spawnConfetti(W, H, rand(-700, -250), rand(-1100, -500));
    }

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = (now - start) / 1000;
      const active = t < cfg.seconds;
      ctx.clearRect(0, 0, W, H);

      if (active) {
        // Confetti rain from the top.
        rain += cfg.confetti * 60 * dt;
        while (rain >= 1) {
          rain -= 1;
          spawnConfetti(rand(0, W), -20, rand(-60, 60), rand(120, 260));
        }
        if (t > nextRocket && rocketsLaunched < cfg.rockets) {
          rocketsLaunched += 1;
          nextRocket = t + rand(0.5, 1.2);
          const x = rand(W * 0.1, W * 0.9);
          rockets.push({ x, y: H + 20, vy: -rand(520, 760), targetY: rand(H * 0.12, H * 0.42), trail: [] });
        }
        if (t > nextFirework) {
          nextFirework = t + rand(0.35, 1.1) / cfg.fireworks;
          burst(rand(W * 0.1, W * 0.9), rand(H * 0.1, H * 0.5), Math.round(rand(34, 56)));
        }
      }

      for (let i = rockets.length - 1; i >= 0; i -= 1) {
        const r = rockets[i];
        r.y += r.vy * dt;
        r.trail.push({ x: r.x + rand(-2, 2), y: r.y + 18 });
        if (r.trail.length > 18) r.trail.shift();
        r.trail.forEach((p, idx) => {
          ctx.globalAlpha = idx / r.trail.length * 0.8;
          ctx.fillStyle = idx % 2 ? '#ffd21f' : '#ff7a3d';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1 + idx / 6, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(-Math.PI / 4);
        ctx.font = '34px serif';
        ctx.textAlign = 'center';
        ctx.fillText('🚀', 0, 0);
        ctx.restore();
        if (r.y <= r.targetY) {
          burst(r.x, r.y, 70);
          burst(r.x, r.y, 36);
          rockets.splice(i, 1);
        }
      }

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const s = sparks[i];
        s.px = s.x; s.py = s.y;
        s.vy += 260 * dt;
        s.vx *= 0.985; s.vy *= 0.985;
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.life -= s.decay * dt;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(s.life, 0);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(s.px, s.py);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (let i = confetti.length - 1; i >= 0; i -= 1) {
        const c = confetti[i];
        c.vy += 520 * dt;
        c.vx *= c.drag; c.vy *= c.drag;
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.rot += c.vr * dt;
        if (c.y > H + 30 || c.x < -60 || c.x > W + 60) { confetti.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.scale(1, Math.abs(Math.cos(c.rot * 1.3)) * 0.8 + 0.2);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }

      if (active || confetti.length || sparks.length || rockets.length) {
        raf = requestAnimationFrame(frame);
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [cfg, reduceMotion]);

  const place = rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd';

  return (
    <div className={`eg-celebrate eg-celebrate-${cfg.tag}`} role="dialog" aria-modal="true" aria-label={`Congratulations on ${place} rank`}>
      {!reduceMotion ? <canvas ref={canvasRef} className="eg-celebrate-canvas" aria-hidden="true" /> : null}
      {!reduceMotion ? (
        <div className="eg-celebrate-balloons" aria-hidden="true">
          {balloons.map((b) => (
            <span key={b.id} style={{ left: `${b.left}%`, fontSize: b.size, animationDelay: `${b.delay}s`, animationDuration: `${b.duration}s` }}>{b.emoji}</span>
          ))}
        </div>
      ) : null}

      <div className="eg-celebrate-card">
        <div className="eg-celebrate-glow" aria-hidden="true" />
        <RankBadge rank={rank} size={rank === 1 ? 168 : 148} />
        <h2>🎉 Congratulations, {name || 'Champ'}!</h2>
        <p className="eg-celebrate-title">{cfg.title}</p>
        <p className="eg-celebrate-sub">You secured <b>{place} Rank</b> in {className || 'your class'}{examName ? ` — ${examName}` : ''}.</p>
        <button type="button" className="eg-celebrate-btn" onClick={onClose} autoFocus>Yay! 🎉</button>
      </div>
    </div>
  );
}
