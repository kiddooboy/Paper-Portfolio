import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const STOCKS = [
  { n: 'NIFTY 50', p: '23,997.55', c: '-0.74%', u: false },
  { n: 'SENSEX', p: '76,913.50', c: '-0.75%', u: false },
  { n: 'RELIANCE', p: '1,436.00', c: '+0.74%', u: true },
  { n: 'TCS', p: '3,512.40', c: '+0.88%', u: true },
  { n: 'INFY', p: '1,182.60', c: '+1.29%', u: true },
  { n: 'HDFC BANK', p: '1,742.30', c: '-0.43%', u: false },
  { n: 'BAJFINANCE', p: '939.70', c: '+1.04%', u: true },
  { n: 'AIRTEL', p: '1,347.90', c: '-0.34%', u: false },
  { n: 'SUNPHARMA', p: '1,810.00', c: '+1.76%', u: true },
  { n: 'TATASTEEL', p: '211.40', c: '-2.08%', u: false },
  { n: 'BANKNIFTY', p: '54,863.35', c: '-0.98%', u: false },
  { n: 'NIFTY IT', p: '29,353.90', c: '+0.37%', u: true },
];

const WORDS = [
  'NSE Stocks', 'BSE Stocks', 'Real-Time Prices', 'Paper Trading',
  'Free Forever', 'Portfolio Tracker', 'Leaderboard', 'Technical Charts',
  'Risk Free', 'Practice Trading', 'Indian Markets',
];

export default function LandingPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const navigate = useNavigate();
  const chartRef = useRef<HTMLCanvasElement>(null);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!isInitializing && isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, isInitializing, navigate]);

  // Canvas chart
  useEffect(() => {
    const canvas = chartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const CW = 370, CH = 180;
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;
    canvas.style.width = CW + 'px';
    canvas.style.height = CH + 'px';

    let base = 920;
    const candles: { o: number; c: number; h: number; l: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const o = base + (Math.random() - 0.49) * 6;
      const c = o + (Math.random() - 0.47) * 14;
      const h = Math.max(o, c) + Math.random() * 6;
      const l = Math.min(o, c) - Math.random() * 6;
      candles.push({ o, c, h, l });
      base = c;
    }

    function draw() {
      if (!ctx) return;
      const W = CW * dpr, H = CH * dpr;
      ctx.clearRect(0, 0, W, H);
      const prices = candles.flatMap((c) => [c.h, c.l]);
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      const pad = 14 * dpr;
      const barW = (W - pad * 2) / candles.length;
      candles.forEach((c, i) => {
        const x = pad + i * barW + barW / 2;
        const yH = H - pad - ((c.h - minP) / (maxP - minP)) * (H - pad * 2);
        const yL = H - pad - ((c.l - minP) / (maxP - minP)) * (H - pad * 2);
        const yO = H - pad - ((c.o - minP) / (maxP - minP)) * (H - pad * 2);
        const yC = H - pad - ((c.c - minP) / (maxP - minP)) * (H - pad * 2);
        const col = c.c >= c.o ? '#00d68f' : '#ff5252';
        ctx.strokeStyle = col;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(x, yH);
        ctx.lineTo(x, yL);
        ctx.stroke();
        ctx.fillStyle = col;
        const bodyH = Math.max(Math.abs(yC - yO), 2 * dpr);
        ctx.fillRect(x - barW * 0.35, Math.min(yO, yC), barW * 0.7, bodyH);
      });
    }
    draw();

    const OPEN_PRICE = 942;
    const interval = setInterval(() => {
      candles.shift();
      const prev = candles[candles.length - 1];
      const o = prev.c;
      const mr = (920 - o) * 0.03;
      const c = Math.max(860, Math.min(985, o + mr + (Math.random() - 0.5) * 14));
      const h = Math.max(o, c) + Math.random() * 5;
      const l = Math.min(o, c) - Math.random() * 5;
      candles.push({ o, c, h, l });

      const prEl = document.getElementById('vcPrice');
      const chEl = document.getElementById('vcChg');
      const hiEl = document.getElementById('vcHigh');
      const loEl = document.getElementById('vcLow');
      if (prEl) prEl.textContent = '₹' + c.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      if (chEl) {
        const diff = c - OPEN_PRICE;
        const pct = ((diff / OPEN_PRICE) * 100).toFixed(2);
        const isUp = diff >= 0;
        chEl.textContent = (isUp ? '▲ +' : '▼ ') + Math.abs(diff).toFixed(2) + ' (' + (isUp ? '+' : '') + pct + '%)';
        (chEl as HTMLElement).style.color = isUp ? 'var(--lp-green)' : 'var(--lp-red)';
      }
      if (hiEl) { hiEl.textContent = candles[candles.length - 1].h.toFixed(2); }
      if (loEl) { loEl.textContent = candles[candles.length - 1].l.toFixed(2); }
      draw();
    }, 1200);

    return () => clearInterval(interval);
  }, []);

  // Reveal on scroll
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('lp-v');
          const n = e.target.querySelector('[data-target]') as HTMLElement | null;
          if (n && !n.dataset.done) {
            n.dataset.done = '1';
            const target = parseInt(n.dataset.target!);
            let cur = 0;
            const step = target / 50;
            const t = setInterval(() => {
              cur = Math.min(cur + step, target);
              n.textContent = Math.floor(cur) + '+';
              if (cur >= target) { n.textContent = target + '+'; clearInterval(t); }
            }, 24);
          }
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.lp-reveal').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const arr = [...STOCKS, ...STOCKS];
  const words = [...WORDS, ...WORDS, ...WORDS, ...WORDS];

  return (
    <>
      <style>{`
        .lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; }
        .lp-root {
          --lp-bg:    #0d1117;
          --lp-bg2:   #161b22;
          --lp-bg3:   #1c2333;
          --lp-bg4:   #21262d;
          --lp-border: rgba(255,255,255,0.08);
          --lp-border2: rgba(255,255,255,0.14);
          --lp-green: #00d68f;
          --lp-green2:#00ff9d;
          --lp-red:   #ff5252;
          --lp-text:  #e6edf3;
          --lp-muted: #7d8590;
          --lp-muted2:#484f58;
          background: var(--lp-bg);
          color: var(--lp-text);
          font-family: 'Inter', system-ui, sans-serif;
          overflow-x: hidden;
          min-height: 100vh;
        }

        /* TICKER */
        .lp-ticker { background: var(--lp-bg2); border-bottom: 1px solid var(--lp-border); height: 38px; display: flex; align-items: center; overflow: hidden; position: sticky; top: 0; z-index: 100; }
        .lp-ticker-badge { padding: 0 16px; height: 100%; display: flex; align-items: center; background: var(--lp-green); color: #000; font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; flex-shrink: 0; gap: 6px; }
        .lp-ticker-scroll { overflow: hidden; flex: 1; display: flex; }
        .lp-ticker-track { display: flex; animation: lpTickerMove 35s linear infinite; white-space: nowrap; }
        .lp-t-item { display: flex; align-items: center; gap: 8px; padding: 0 20px; font-size: 12px; font-weight: 500; border-right: 1px solid var(--lp-border); }
        .lp-t-name { color: var(--lp-muted); }
        .lp-t-price { color: var(--lp-text); }
        .lp-t-chg.up { color: var(--lp-green); }
        .lp-t-chg.dn { color: var(--lp-red); }
        @keyframes lpTickerMove { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        /* NAV */
        .lp-nav { position: sticky; top: 38px; z-index: 90; background: rgba(13,17,23,0.92); backdrop-filter: blur(16px); border-bottom: 1px solid var(--lp-border); display: flex; justify-content: space-between; align-items: center; padding: 0 40px; height: 60px; }
        .lp-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; font-size: 18px; font-weight: 700; color: var(--lp-text); }
        .lp-logo-icon { width: 32px; height: 32px; background: var(--lp-green); border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .lp-nav-right { display: flex; align-items: center; gap: 12px; }
        .lp-btn-ghost { padding: 8px 18px; border: 1px solid var(--lp-border2); border-radius: 8px; background: transparent; color: var(--lp-text); font-size: 13px; font-weight: 500; cursor: pointer; text-decoration: none; transition: all 0.2s; }
        .lp-btn-ghost:hover { background: var(--lp-bg3); }
        .lp-btn-green { padding: 8px 20px; border: none; border-radius: 8px; background: var(--lp-green); color: #000; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; transition: all 0.2s; display: inline-block; }
        .lp-btn-green:hover { background: var(--lp-green2); transform: translateY(-1px); }

        /* HERO */
        .lp-hero { min-height: calc(100vh - 98px); display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 60px; padding: 80px 60px; position: relative; overflow: hidden; }
        .lp-hero::before { content: ''; position: absolute; top: -200px; right: -150px; width: 650px; height: 650px; background: radial-gradient(ellipse, rgba(0,214,143,0.07) 0%, transparent 65%); pointer-events: none; }
        .lp-hero-tag { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; background: rgba(0,214,143,0.1); border: 1px solid rgba(0,214,143,0.25); border-radius: 100px; font-size: 12px; font-weight: 600; color: var(--lp-green); margin-bottom: 28px; }
        .lp-hero-tag::before { content: '●'; font-size: 8px; animation: lpBlink 2s ease-in-out infinite; }
        @keyframes lpBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .lp-h1 { font-size: clamp(40px, 5vw, 62px); font-weight: 800; line-height: 1.1; letter-spacing: -1.5px; margin-bottom: 22px; }
        .lp-h1 .g { color: var(--lp-green); }
        .lp-h1 .d { color: var(--lp-muted); }
        .lp-hero-desc { font-size: 17px; line-height: 1.7; color: var(--lp-muted); max-width: 460px; margin-bottom: 36px; }
        .lp-hero-btns { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 44px; }
        .lp-btn-big { padding: 14px 30px; background: var(--lp-green); color: #000; font-size: 15px; font-weight: 700; border: none; border-radius: 10px; cursor: pointer; text-decoration: none; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
        .lp-btn-big:hover { background: var(--lp-green2); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,214,143,0.2); }
        .lp-btn-outline { padding: 14px 26px; background: var(--lp-bg3); color: var(--lp-text); font-size: 15px; font-weight: 500; border: 1px solid var(--lp-border2); border-radius: 10px; cursor: pointer; text-decoration: none; transition: all 0.2s; }
        .lp-btn-outline:hover { background: var(--lp-bg4); }
        .lp-trust { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .lp-trust-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--lp-muted); }
        .lp-trust-item .chk { color: var(--lp-green); }
        .lp-divider-v { width: 1px; height: 14px; background: var(--lp-muted2); }

        /* HERO VISUAL */
        .lp-hero-visual { position: relative; padding: 20px 20px 20px 40px; }
        .lp-vis-chart-card { background: var(--lp-bg2); border: 1px solid var(--lp-border2); border-radius: 16px; padding: 22px 24px 16px; box-shadow: 0 24px 60px rgba(0,0,0,0.5); position: relative; overflow: hidden; }
        .lp-vis-chart-card::before { content: ''; position: absolute; top: -60px; right: -60px; width: 200px; height: 200px; background: radial-gradient(ellipse, rgba(0,214,143,0.08) 0%, transparent 70%); pointer-events: none; }
        .lp-vc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
        .lp-vc-symbol { font-size: 11px; font-weight: 700; color: var(--lp-muted); letter-spacing: 1.5px; }
        .lp-vc-price { font-size: 32px; font-weight: 800; letter-spacing: -1px; margin: 4px 0; }
        .lp-vc-chg { font-size: 13px; font-weight: 600; color: var(--lp-green); }
        .lp-vc-tabs { display: flex; gap: 4px; }
        .lp-vc-tab { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; color: var(--lp-muted); cursor: pointer; transition: all 0.2s; }
        .lp-vc-tab.active { background: rgba(0,214,143,0.15); color: var(--lp-green); }
        .lp-vc-canvas-wrap { height: 180px; margin: 14px 0 8px; position: relative; }
        .lp-vc-footer { display: grid; grid-template-columns: repeat(4,1fr); gap: 0; border-top: 1px solid var(--lp-border); padding-top: 12px; margin-top: 4px; }
        .lp-vc-stat { text-align: center; }
        .lp-vc-stat-l { font-size: 9px; color: var(--lp-muted); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px; }
        .lp-vc-stat-v { font-size: 13px; font-weight: 700; }
        .lp-vc-stat-v.up { color: var(--lp-green); }
        .lp-vc-stat-v.dn { color: var(--lp-red); }

        /* Floating cards */
        .lp-float-card { position: absolute; background: var(--lp-bg2); border: 1px solid var(--lp-border2); border-radius: 12px; padding: 12px 16px; font-size: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 5; }
        .lp-fc-trade { top: 0; right: -10px; min-width: 195px; display: flex; align-items: center; gap: 10px; animation: lpFloatY 3s ease-in-out infinite; }
        .lp-fc-portfolio { bottom: 10px; right: -10px; min-width: 175px; animation: lpFloatY 3.5s ease-in-out infinite; animation-delay: 0.8s; }
        .lp-fc-sector { top: 42%; left: -10px; min-width: 148px; animation: lpFloatY 4s ease-in-out infinite; animation-delay: 1.5s; }
        @keyframes lpFloatY { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        .lp-trade-icon { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
        .lp-trade-icon.buy { background: rgba(0,214,143,0.15); }
        .lp-t-label { font-size: 9px; color: var(--lp-muted); font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 2px; }
        .lp-t-name2 { font-size: 13px; font-weight: 700; }
        .lp-t-amt { font-size: 11px; font-weight: 600; margin-top: 1px; color: var(--lp-green); }
        .lp-pc-label { font-size: 9px; color: var(--lp-muted); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
        .lp-pc-val { font-size: 21px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 4px; }
        .lp-pc-row { display: flex; align-items: center; gap: 6px; }
        .lp-pc-badge { padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: rgba(0,214,143,0.12); color: var(--lp-green); }
        .lp-pc-since { font-size: 10px; color: var(--lp-muted); }
        .lp-sc-title { font-size: 9px; color: var(--lp-muted); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; }
        .lp-sc-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 11px; font-weight: 600; }
        .lp-sc-bar-wrap { flex: 1; height: 4px; background: var(--lp-bg4); border-radius: 2px; margin: 0 8px; }
        .lp-sc-bar { height: 100%; border-radius: 2px; }

        /* MARQUEE */
        .lp-mq { padding: 16px 0; overflow: hidden; border-top: 1px solid var(--lp-border); border-bottom: 1px solid var(--lp-border); background: var(--lp-bg2); }
        .lp-mq-inner { display: flex; animation: lpMq 22s linear infinite; }
        .lp-mq-word { font-size: 12px; font-weight: 600; color: var(--lp-muted2); padding: 0 18px; white-space: nowrap; display: flex; align-items: center; gap: 14px; letter-spacing: 0.8px; text-transform: uppercase; }
        .lp-mq-dot { color: var(--lp-green); font-size: 6px; }
        @keyframes lpMq { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        /* SECTIONS */
        .lp-sec { padding: 100px 60px; }
        .lp-sec-alt { background: var(--lp-bg2); border-top: 1px solid var(--lp-border); border-bottom: 1px solid var(--lp-border); }
        .lp-ey { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; color: var(--lp-green); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 14px; }
        .lp-ey::before { content: ''; width: 18px; height: 1px; background: var(--lp-green); }
        .lp-sec-title { font-size: clamp(30px, 4vw, 46px); font-weight: 800; letter-spacing: -1px; line-height: 1.15; margin-bottom: 14px; }
        .lp-sec-sub { font-size: 16px; color: var(--lp-muted); line-height: 1.7; max-width: 500px; }

        /* STATS */
        .lp-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--lp-border); border: 1px solid var(--lp-border); border-radius: 14px; overflow: hidden; max-width: 560px; margin: 52px auto 0; }
        .lp-s-box { background: var(--lp-bg2); padding: 40px 36px; text-align: center; transition: background 0.2s; }
        .lp-s-box:hover { background: var(--lp-bg3); }
        .lp-s-num { font-size: 52px; font-weight: 800; color: var(--lp-green); line-height: 1; letter-spacing: -2px; }
        .lp-s-lbl { font-size: 14px; color: var(--lp-muted); margin-top: 8px; font-weight: 500; }

        /* FEATURES */
        .lp-feat-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; margin-top: 52px; }
        .lp-feat { background: var(--lp-bg2); border: 1px solid var(--lp-border); border-radius: 14px; padding: 30px; transition: all 0.25s; }
        .lp-feat:hover { background: var(--lp-bg3); transform: translateY(-3px); border-color: rgba(0,214,143,0.28); }
        .lp-feat-icon { width: 44px; height: 44px; background: rgba(0,214,143,0.1); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 18px; }
        .lp-feat-t { font-size: 17px; font-weight: 700; margin-bottom: 10px; }
        .lp-feat-d { font-size: 14px; color: var(--lp-muted); line-height: 1.65; }

        /* STEPS */
        .lp-steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-top: 52px; }
        .lp-step { background: var(--lp-bg2); border: 1px solid var(--lp-border); border-radius: 14px; padding: 30px 26px; transition: all 0.25s; }
        .lp-step:hover { border-color: rgba(0,214,143,0.28); transform: translateY(-3px); }
        .lp-step-n { width: 36px; height: 36px; background: var(--lp-green); color: #000; font-size: 14px; font-weight: 800; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 18px; }
        .lp-step-t { font-size: 17px; font-weight: 700; margin-bottom: 10px; }
        .lp-step-d { font-size: 14px; color: var(--lp-muted); line-height: 1.65; }

        /* CTA */
        .lp-cta-sec { padding: 120px 60px; text-align: center; position: relative; overflow: hidden; }
        .lp-cta-sec::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 700px; height: 400px; background: radial-gradient(ellipse, rgba(0,214,143,0.07) 0%, transparent 70%); }
        .lp-cta-card { background: var(--lp-bg2); border: 1px solid var(--lp-border2); border-radius: 20px; padding: 70px 60px; max-width: 680px; margin: 0 auto; position: relative; z-index: 1; }
        .lp-cta-card h2 { font-size: clamp(30px, 4vw, 50px); font-weight: 800; letter-spacing: -1.5px; margin-bottom: 14px; line-height: 1.1; }
        .lp-cta-card p { font-size: 16px; color: var(--lp-muted); margin-bottom: 36px; line-height: 1.6; }
        .lp-cta-note { font-size: 12px; color: var(--lp-muted2); margin-top: 14px; }
        .lp-cta-note .g { color: var(--lp-green); }
        .lp-cta-btn-big { display: inline-flex; align-items: center; gap: 8px; padding: 14px 36px; background: var(--lp-green); color: #000; font-size: 15px; font-weight: 700; border: none; border-radius: 10px; cursor: pointer; text-decoration: none; transition: all 0.2s; }
        .lp-cta-btn-big:hover { background: var(--lp-green2); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,214,143,0.2); }

        /* FOOTER */
        .lp-footer { background: var(--lp-bg2); border-top: 1px solid var(--lp-border); padding: 36px 60px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
        .lp-fc { font-size: 13px; color: var(--lp-muted); margin-top: 6px; }
        .lp-fl { display: flex; gap: 24px; }
        .lp-fl a { font-size: 13px; color: var(--lp-muted); text-decoration: none; transition: color 0.2s; }
        .lp-fl a:hover { color: var(--lp-green); }

        /* REVEAL */
        .lp-reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
        .lp-reveal.d1 { transition-delay: 0.1s; } .lp-reveal.d2 { transition-delay: 0.2s; } .lp-reveal.d3 { transition-delay: 0.3s; }
        .lp-reveal.lp-v { opacity: 1; transform: none; }

        @media(max-width:960px){
          .lp-hero { grid-template-columns:1fr; padding:60px 24px; }
          .lp-hero-right { display:none; }
          .lp-sec,.lp-cta-sec { padding:60px 24px; }
          .lp-feat-grid,.lp-steps { grid-template-columns:1fr; }
          .lp-nav { padding:0 20px; }
          .lp-footer { padding:28px 24px; flex-direction:column; align-items:flex-start; }
          .lp-cta-card { padding:40px 24px; }
        }
      `}</style>

      <div className="lp-root">
        {/* TICKER */}
        <div className="lp-ticker">
          <div className="lp-ticker-badge">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="1,9 4,5 7,7 11,2" stroke="#000" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
            LIVE
          </div>
          <div className="lp-ticker-scroll">
            <div className="lp-ticker-track">
              {arr.map((s, i) => (
                <span key={i} className="lp-t-item">
                  <span className="lp-t-name">{s.n}</span>
                  <span className="lp-t-price">{s.p}</span>
                  <span className={`lp-t-chg ${s.u ? 'up' : 'dn'}`}>{s.c}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* NAV */}
        <nav className="lp-nav">
          <div className="lp-logo">
            <div className="lp-logo-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><polyline points="1,12 5,7 9,9 15,2" stroke="#000" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            Paper Portfolio
          </div>
          <div className="lp-nav-right">
            <Link to="/login" className="lp-btn-ghost">Login</Link>
            <Link to="/register" className="lp-btn-green">Create Account — It's Free</Link>
          </div>
        </nav>

        {/* HERO */}
        <section className="lp-hero">
          <div className="lp-hero-left">
            <div className="lp-hero-tag">India's Paper Trading Platform</div>
            <h1 className="lp-h1">Trade Smarter.<br /><span className="g">Zero Risk.</span><br /><span className="d">Real Experience.</span></h1>
            <p className="lp-hero-desc">Practice NSE &amp; BSE trading with ₹5,00,000 virtual cash. Real market prices, real charts — without spending a single rupee.</p>
            <div className="lp-hero-btns">
              <Link to="/register" className="lp-btn-big">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1v13M1 7.5h13" stroke="#000" strokeWidth="2.5" strokeLinecap="round"/></svg>
                Create Free Account
              </Link>
              <a href="#how" className="lp-btn-outline">See How It Works →</a>
            </div>
            <div className="lp-trust">
              <div className="lp-trust-item"><span className="chk">✓</span> 500+ NSE &amp; BSE Stocks</div>
              <div className="lp-divider-v" />
              <div className="lp-trust-item"><span className="chk">✓</span> Real-time Prices</div>
              <div className="lp-divider-v" />
              <div className="lp-trust-item"><span className="chk">✓</span> 100% Free Forever</div>
            </div>
          </div>

          <div className="lp-hero-right lp-reveal">
            <div className="lp-hero-visual">
              <div className="lp-vis-chart-card">
                <div className="lp-vc-header">
                  <div>
                    <div className="lp-vc-symbol">SHRIRAMFIN · NSE</div>
                    <div className="lp-vc-price" id="vcPrice">₹920.00</div>
                    <div className="lp-vc-chg" id="vcChg">▼ -22.00 (-2.33%)</div>
                  </div>
                  <div className="lp-vc-tabs">
                    {['1D','1W','1M','1Y'].map((t) => (
                      <span key={t} className={`lp-vc-tab${t === '1W' ? ' active' : ''}`}
                        onClick={(e) => { document.querySelectorAll('.lp-vc-tab').forEach((x) => x.classList.remove('active')); e.currentTarget.classList.add('active'); }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="lp-vc-canvas-wrap">
                  <canvas ref={chartRef} style={{ width: '100%', height: '100%', display: 'block' }} />
                </div>
                <div className="lp-vc-footer">
                  <div className="lp-vc-stat"><div className="lp-vc-stat-l">Open</div><div className="lp-vc-stat-v">942.00</div></div>
                  <div className="lp-vc-stat"><div className="lp-vc-stat-l">High</div><div id="vcHigh" className="lp-vc-stat-v up">955.00</div></div>
                  <div className="lp-vc-stat"><div className="lp-vc-stat-l">Low</div><div id="vcLow" className="lp-vc-stat-v dn">895.00</div></div>
                  <div className="lp-vc-stat"><div className="lp-vc-stat-l">52W Low</div><div className="lp-vc-stat-v">493.00</div></div>
                </div>
              </div>

              <div className="lp-float-card lp-fc-trade">
                <div className="lp-trade-icon buy">📈</div>
                <div>
                  <div className="lp-t-label">Order Executed</div>
                  <div className="lp-t-name2">INFY · BUY</div>
                  <div className="lp-t-amt">+5 qty @ ₹1,182.60</div>
                </div>
              </div>

              <div className="lp-float-card lp-fc-portfolio">
                <div className="lp-pc-label">Virtual Portfolio</div>
                <div className="lp-pc-val">₹5,12,480</div>
                <div className="lp-pc-row">
                  <span className="lp-pc-badge">+₹12,480</span>
                  <span className="lp-pc-since">this week</span>
                </div>
              </div>

              <div className="lp-float-card lp-fc-sector">
                <div className="lp-sc-title">Sectors Today</div>
                <div className="lp-sc-row"><span>IT</span><div className="lp-sc-bar-wrap"><div className="lp-sc-bar" style={{ width: '70%', background: 'var(--lp-green)' }} /></div><span style={{ color: 'var(--lp-green)' }}>+0.37%</span></div>
                <div className="lp-sc-row"><span>FMCG</span><div className="lp-sc-bar-wrap"><div className="lp-sc-bar" style={{ width: '45%', background: 'var(--lp-red)' }} /></div><span style={{ color: 'var(--lp-red)' }}>-1.35%</span></div>
                <div className="lp-sc-row" style={{ marginBottom: 0 }}><span>Auto</span><div className="lp-sc-bar-wrap"><div className="lp-sc-bar" style={{ width: '30%', background: 'var(--lp-red)' }} /></div><span style={{ color: 'var(--lp-red)' }}>-0.64%</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* MARQUEE */}
        <div className="lp-mq">
          <div className="lp-mq-inner">
            {words.map((w, i) => (
              <span key={i} className="lp-mq-word">{w}<span className="lp-mq-dot">●</span></span>
            ))}
          </div>
        </div>

        {/* STATS */}
        <section className="lp-sec" style={{ textAlign: 'center' }}>
          <div className="lp-ey lp-reveal">By The Numbers</div>
          <h2 className="lp-sec-title lp-reveal">Trusted by traders across India</h2>
          <div className="lp-stats-grid">
            <div className="lp-s-box lp-reveal"><div className="lp-s-num" data-target="500">0+</div><div className="lp-s-lbl">Stocks Available</div></div>
            <div className="lp-s-box lp-reveal d1"><div className="lp-s-num" data-target="100">0+</div><div className="lp-s-lbl">% Free Forever</div></div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="lp-sec lp-sec-alt" id="features">
          <div className="lp-ey lp-reveal">Everything You Need</div>
          <h2 className="lp-sec-title lp-reveal">Built for traders who want to grow</h2>
          <p className="lp-sec-sub lp-reveal">Every tool a professional trader uses — available to practise with, completely free.</p>
          <div className="lp-feat-grid">
            <div className="lp-feat lp-reveal"><div className="lp-feat-icon">📊</div><div className="lp-feat-t">Real-Time NSE &amp; BSE Data</div><p className="lp-feat-d">Live prices, order books, and market depth straight from Indian exchanges. Practise with the same data as real traders.</p></div>
            <div className="lp-feat lp-reveal d1"><div className="lp-feat-icon">📈</div><div className="lp-feat-t">Advanced Charts &amp; Indicators</div><p className="lp-feat-d">Candlestick charts with technical indicators. Spot patterns and make informed decisions just like the pros.</p></div>
            <div className="lp-feat lp-reveal d2"><div className="lp-feat-icon">🏆</div><div className="lp-feat-t">Leaderboard &amp; Competition</div><p className="lp-feat-d">Compete with other traders on the leaderboard. See how your portfolio ranks and sharpen your edge.</p></div>
            <div className="lp-feat lp-reveal d3"><div className="lp-feat-icon">💼</div><div className="lp-feat-t">Full Portfolio Analytics</div><p className="lp-feat-d">Track P&amp;L, returns, sector exposure, and order history. Understand exactly what's working and what needs improving.</p></div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="lp-sec" id="how">
          <div className="lp-ey lp-reveal">Simple to Start</div>
          <h2 className="lp-sec-title lp-reveal">From signup to first trade in 2 minutes</h2>
          <div className="lp-steps">
            <div className="lp-step lp-reveal"><div className="lp-step-n">1</div><div className="lp-step-t">Create Your Account</div><p className="lp-step-d">Sign up free. Get ₹5,00,000 virtual cash instantly. No wallet, no KYC, no credit card needed.</p></div>
            <div className="lp-step lp-reveal d1"><div className="lp-step-n">2</div><div className="lp-step-t">Search &amp; Analyse Stocks</div><p className="lp-step-d">Browse NSE &amp; BSE live. View charts, sector data, top gainers and losers to make your picks.</p></div>
            <div className="lp-step lp-reveal d2"><div className="lp-step-n">3</div><div className="lp-step-t">Trade &amp; Track Progress</div><p className="lp-step-d">Place orders, monitor your portfolio, and climb the leaderboard. Build confidence before going real.</p></div>
          </div>
        </section>

        {/* CTA */}
        <section className="lp-cta-sec">
          <div className="lp-cta-card lp-reveal">
            <h2>Start Trading.<br /><span style={{ color: 'var(--lp-green)' }}>No Money Needed.</span></h2>
            <p>Join thousands of Indian traders practising on Paper Portfolio. Free forever, no credit card required.</p>
            <Link to="/register" className="lp-cta-btn-big">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1v13M1 7.5h13" stroke="#000" strokeWidth="2.5" strokeLinecap="round"/></svg>
              Create Free Account
            </Link>
            <p className="lp-cta-note"><span className="g">✓</span> Free forever &nbsp;·&nbsp; <span className="g">✓</span> No credit card &nbsp;·&nbsp; <span className="g">✓</span> Instant access</p>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div>
            <div className="lp-logo">
              <div className="lp-logo-icon" style={{ width: 26, height: 26 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="1,9 4,5 7,7 11,2" stroke="#000" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
              </div>
              Paper Portfolio
            </div>
            <p className="lp-fc">© 2025 paperportfolio.in — All rights reserved.</p>
          </div>
          <div className="lp-fl">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Contact</a>
          </div>
        </footer>
      </div>
    </>
  );
}
