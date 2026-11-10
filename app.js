(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const RGB = [[56, 189, 248], [244, 114, 182], [163, 230, 53]];
  const CSS = RGB.map(c => `rgb(${c})`);
  const SUB = ['e', 'μ', 'τ'];
  const PAD_L = 46, PAD_R = 18;
  const DEFAULT_MIX = { th12: 33.4, th23: 49, th13: 8.6, dcp: 195, dm21: 7.4, dm31: 2.51, inverted: 0 };
  const S = Object.assign({ flavor: 1, anti: 0, E: 0.6, L: 295, rho: 2.6 }, DEFAULT_MIX);

  const PRESETS = [
    { name: 'T2K', flavor: 1, anti: 0, E: 0.6, L: 295, rho: 2.6 },
    { name: 'NOvA', flavor: 1, anti: 0, E: 2.0, L: 810, rho: 2.8 },
    { name: 'DUNE', flavor: 1, anti: 0, E: 2.5, L: 1300, rho: 2.85 },
    { name: 'OPERA', flavor: 1, anti: 0, E: 17, L: 730, rho: 2.8 },
    { name: 'KamLAND', flavor: 0, anti: 1, E: 0.004, L: 180, rho: 2.6 },
    { name: 'Daya Bay', flavor: 0, anti: 1, E: 0.004, L: 1.65, rho: 2.6 },
    { name: 'Quer durch die Erde', flavor: 1, anti: 0, E: 5, L: 12742, rho: 8.4 },
  ];

  // ---------- Slider-Skalen ----------
  const E_MIN = 0.001, E_MAX = 100, L_MIN = 0.1, L_MAX = 13000;
  const toLog = (v, lo, hi) => lo * Math.pow(hi / lo, v / 1000);
  const fromLog = (x, lo, hi) => Math.round(1000 * Math.log(x / lo) / Math.log(hi / lo));
  const sig = (x, n) => Number(x.toPrecision(n));
  const de = (x, opt) => x.toLocaleString('de-CH', opt);
  const fmtE = E => E < 0.1 ? `${de(sig(E * 1000, 3))} MeV` : `${de(sig(E, 3))} GeV`;
  const fmtL = L => L < 1 ? `${de(sig(L * 1000, 3))} m` : `${de(sig(L, L < 100 ? 3 : 4))} km`;
  const nu = b => (S.anti ? 'ν̄' : 'ν') + `<sub>${SUB[b]}</sub>`;

  const FMT = {
    rho: v => v === 0 ? 'Vakuum' : `${de(v, { minimumFractionDigits: 2 })} g/cm³`,
    th12: v => `${de(v, { minimumFractionDigits: 1 })}°`,
    th23: v => `${de(v, { minimumFractionDigits: 1 })}°`,
    th13: v => `${de(v, { minimumFractionDigits: 1 })}°`,
    dcp: v => `${v}°`,
    dm21: v => `${de(v, { minimumFractionDigits: 2 })} · 10⁻⁵ eV²`,
    dm31: v => `${de(v, { minimumFractionDigits: 2 })} · 10⁻³ eV²`,
  };

  // ---------- Zustand der Simulation ----------
  let curve, spec, pDet = [0, 1, 0];
  let counts = [0, 0, 0], particles = [], flash = null;
  let simT = 0, lastEmit = -1e9, lastFrame = 0, paused = false;
  let strip = document.createElement('canvas');
  const FLIGHT = 3600, EMIT = 150;

  function params() {
    const d = Math.PI / 180;
    return {
      th12: S.th12 * d, th23: S.th23 * d, th13: S.th13 * d, dcp: S.dcp * d,
      dm21: S.dm21 * 1e-5, dm31: (S.inverted ? -1 : 1) * S.dm31 * 1e-3, anti: !!S.anti,
    };
  }

  function recompute() {
    const p = params();
    curve = Nu.curve(p, S.flavor, S.E, S.L, S.rho);
    spec = Nu.spectrum(p, S.flavor, S.L, S.rho, S.E / 10, S.E * 10, 480);
    pDet = curve.P.map(a => a[curve.n]);
    buildStrip();
    resetCounts();
    drawPlots();
  }

  function resetCounts() {
    counts = [0, 0, 0];
    particles = [];
    flash = null;
    lastEmit = -1e9;
    updateReadout();
  }

  // ---------- UI ----------
  function syncUI() {
    $('E').value = fromLog(S.E, E_MIN, E_MAX);
    $('L').value = fromLog(S.L, L_MIN, L_MAX);
    $('E_o').textContent = fmtE(S.E);
    $('L_o').textContent = fmtL(S.L);
    for (const k in FMT) { $(k).value = S[k]; $(k + '_o').textContent = FMT[k](S[k]); }
    for (const k of ['flavor', 'anti', 'inverted'])
      for (const b of $(k).children) b.classList.toggle('on', +b.dataset.v === +S[k]);
    PRESETS.forEach((p, i) => {
      const on = ['flavor', 'anti', 'E', 'L', 'rho'].every(k => Math.abs(p[k] - S[k]) < 1e-9);
      $('presets').children[i].classList.toggle('on', on);
    });
  }

  function change() { syncUI(); recompute(); }

  function initUI() {
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.textContent = p.name;
      b.onclick = () => { Object.assign(S, p); delete S.name; change(); };
      $('presets').appendChild(b);
    });
    $('E').oninput = e => { S.E = sig(toLog(+e.target.value, E_MIN, E_MAX), 3); $('E_o').textContent = fmtE(S.E); softChange(); };
    $('L').oninput = e => { S.L = sig(toLog(+e.target.value, L_MIN, L_MAX), 3); $('L_o').textContent = fmtL(S.L); softChange(); };
    for (const k in FMT) $(k).oninput = e => { S[k] = +e.target.value; softChange(); };
    for (const k of ['flavor', 'anti', 'inverted'])
      for (const b of $(k).children) b.onclick = () => { S[k] = +b.dataset.v; change(); };
    $('resetMix').onclick = () => { Object.assign(S, DEFAULT_MIX); change(); };
    $('resetCounts').onclick = resetCounts;
    $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Weiter' : 'Pause'; };

    const rows = [0, 1, 2].map(b => `
      <div class="row" style="--c:${CSS[b]}">
        <div class="name" id="n${b}"></div>
        <div class="bars"><div class="bar"><i id="p${b}"></i></div><div class="bar count"><i id="c${b}"></i></div></div>
        <div class="pct" id="t${b}"></div>
        <div class="cnt" id="k${b}"></div>
      </div>`).join('');
    $('readout').innerHTML = rows;
  }

  // Slider: Wert im <output> nicht per syncUI überschreiben (sonst springt der Regler)
  function softChange() {
    for (const k in FMT) $(k + '_o').textContent = FMT[k](S[k]);
    PRESETS.forEach((p, i) => {
      const on = ['flavor', 'anti', 'E', 'L', 'rho'].every(k => Math.abs(p[k] - S[k]) < 1e-9);
      $('presets').children[i].classList.toggle('on', on);
    });
    recompute();
  }

  function updateReadout() {
    const total = counts[0] + counts[1] + counts[2];
    for (let b = 0; b < 3; b++) {
      $('n' + b).innerHTML = nu(b);
      $('p' + b).style.width = (pDet[b] * 100).toFixed(2) + '%';
      $('t' + b).textContent = de(pDet[b] * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
      const share = total ? counts[b] / total : 0;
      $('c' + b).style.width = (share * 100).toFixed(2) + '%';
      $('k' + b).textContent = total
        ? `${counts[b]} gezählt · ${de(share * 100, { maximumFractionDigits: 0 })} %`
        : '–';
    }
    $('countNote').innerHTML = `Oberer Balken: berechnete Wahrscheinlichkeit für ${nu(S.flavor)} → ${nu(0).replace(/<sub>.*/, '')}<sub>x</sub>. ` +
      `Unterer Balken: Anteil der bisher gezählten Neutrinos (${total}) – er nähert sich mit der Zeit der Rechnung an.`;
  }

  // ---------- Canvas-Helfer ----------
  function fit(cv) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function mix(k) {
    const c = [0, 0, 0];
    for (let b = 0; b < 3; b++) for (let j = 0; j < 3; j++) c[j] += curve.P[b][k] * RGB[b][j];
    return c;
  }

  function buildStrip() {
    const w = 900;
    strip.width = w; strip.height = 1;
    const ctx = strip.getContext('2d');
    const img = ctx.createImageData(w, 1);
    for (let x = 0; x < w; x++) {
      const c = mix(Math.round(x / (w - 1) * curve.n));
      img.data[x * 4] = c[0]; img.data[x * 4 + 1] = c[1]; img.data[x * 4 + 2] = c[2]; img.data[x * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function niceStep(range, target) {
    const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }

  // ---------- Diagramme ----------
  function plotFrame(cv, xTicks, xLabel) {
    const { ctx, w, h } = fit(cv);
    const top = 12, bottom = h - 38, x0 = PAD_L, x1 = w - PAD_R;
    const y = p => bottom - p * (bottom - top);
    ctx.font = '11.5px system-ui, sans-serif';
    ctx.lineWidth = 1;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      ctx.strokeStyle = p === 0 ? '#34405f' : '#1b2440';
      ctx.beginPath(); ctx.moveTo(x0, Math.round(y(p)) + .5); ctx.lineTo(x1, Math.round(y(p)) + .5); ctx.stroke();
      ctx.fillStyle = '#8d98b5';
      if (p !== 0.25 && p !== 0.75) ctx.fillText(p * 100 + ' %', x0 - 8, y(p));
    }
    ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    let lastRight = -1e9;
    for (const t of xTicks) {
      const x = x0 + t.f * (x1 - x0);
      ctx.strokeStyle = '#34405f';
      ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, bottom); ctx.lineTo(Math.round(x) + .5, bottom + 4); ctx.stroke();
      const tw = ctx.measureText(t.label).width;
      const tx = Math.min(Math.max(x, x0 + tw / 2 - 6), x1 - tw / 2 + 6);
      if (tx - tw / 2 < lastRight + 8) continue;
      ctx.fillStyle = '#8d98b5';
      ctx.fillText(t.label, tx, bottom + 7);
      lastRight = tx + tw / 2;
    }
    ctx.fillStyle = '#6b7694';
    ctx.fillText(xLabel, (x0 + x1) / 2, bottom + 23);
    return { ctx, x0, x1, y, top, bottom };
  }

  function drawSeries(g, P, n) {
    const { ctx, x0, x1, y } = g;
    ctx.lineJoin = 'round';
    // Start-Flavour zuletzt, damit er oben liegt
    const order = [0, 1, 2].filter(b => b !== S.flavor).concat(S.flavor);
    for (const b of order) {
      ctx.strokeStyle = CSS[b];
      ctx.lineWidth = b === S.flavor ? 2.2 : 1.8;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const x = x0 + k / (n - 1) * (x1 - x0), yy = y(P[b][k]);
        k ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawPlots() {
    // P(L)
    const step = niceStep(S.L, 5), ticks = [];
    const unit = S.L < 1 ? 'm' : 'km', scale = S.L < 1 ? 1000 : 1;
    for (let i = 0; i * step <= S.L * 1.0001; i++)
      ticks.push({ f: i * step / S.L, label: de(sig(i * step * scale, 6)) });
    let g = plotFrame($('pl'), ticks, `Strecke ab Quelle (${unit})`);
    drawSeries(g, curve.P, curve.n + 1);

    // P(E), logarithmisch
    const lo = S.E / 10, hi = S.E * 10, et = [];
    for (let d = Math.floor(Math.log10(lo)); d <= Math.ceil(Math.log10(hi)); d++)
      for (const m of [1, 2, 5]) {
        const v = m * Math.pow(10, d);
        if (v >= lo * 0.999 && v <= hi * 1.001) et.push({ f: Math.log(v / lo) / Math.log(hi / lo), label: fmtE(sig(v, 3)) });
      }
    g = plotFrame($('spec'), et, 'Energie (logarithmisch)');
    drawSeries(g, spec.P, spec.E.length);
    const xm = (g.x0 + g.x1) / 2;
    g.ctx.setLineDash([4, 4]); g.ctx.strokeStyle = '#e6eaf5'; g.ctx.lineWidth = 1; g.ctx.globalAlpha = .6;
    g.ctx.beginPath(); g.ctx.moveTo(xm, g.top); g.ctx.lineTo(xm, g.bottom); g.ctx.stroke();
    g.ctx.setLineDash([]); g.ctx.globalAlpha = 1;
  }

  // ---------- Strahl-Animation ----------
  function sample() {
    const r = Math.random();
    return r < pDet[0] ? 0 : r < pDet[0] + pDet[1] ? 1 : 2;
  }

  function drawBeam() {
    const { ctx, w, h } = fit($('beam'));
    const x0 = PAD_L, x1 = w - PAD_R, cy = 78, bh = 22;

    // Medium
    ctx.font = '11.5px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    if (S.rho > 0) {
      ctx.fillStyle = `rgba(190, 150, 110, ${0.05 + 0.012 * S.rho})`;
      ctx.beginPath(); ctx.roundRect(x0, cy - 44, x1 - x0, 88, 8); ctx.fill();
    }
    ctx.fillStyle = '#6b7694'; ctx.textAlign = 'center';
    ctx.fillText(S.rho > 0 ? `Materie · ${FMT.rho(S.rho)}` : 'Vakuum', (x0 + x1) / 2, cy - 31);

    // Flavour-Band
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x0, cy - bh / 2, x1 - x0, bh, bh / 2); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = .8;
    ctx.drawImage(strip, x0, cy - bh / 2, x1 - x0, bh);
    ctx.globalAlpha = 1;
    const sh = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
    sh.addColorStop(0, 'rgba(7,10,20,.55)'); sh.addColorStop(.5, 'rgba(7,10,20,0)'); sh.addColorStop(1, 'rgba(7,10,20,.55)');
    ctx.fillStyle = sh; ctx.fillRect(x0, cy - bh / 2, x1 - x0, bh);
    ctx.restore();

    // Teilchen
    for (const p of particles) {
      const f = (simT - p.t0) / FLIGHT;
      const x = x0 + f * (x1 - x0);
      const c = mix(Math.min(curve.n, Math.round(f * curve.n)));
      const y = cy + p.dy;
      const gl = ctx.createRadialGradient(x, y, 0, x, y, 11);
      gl.addColorStop(0, 'rgba(255,255,255,.95)');
      gl.addColorStop(.22, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},.9)`);
      gl.addColorStop(1, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0)`);
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.2832); ctx.fill();
    }

    // Quelle
    ctx.fillStyle = '#0e1424'; ctx.strokeStyle = CSS[S.flavor]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x0, cy, 17, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.fillStyle = CSS[S.flavor]; ctx.textAlign = 'center';
    ctx.font = 'italic 600 15px Georgia, serif';
    ctx.fillText((S.anti ? 'ν̄' : 'ν'), x0 - 3, cy - 1);
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText(SUB[S.flavor], x0 + 6, cy + 5);

    // Detektor
    const a = flash ? Math.max(0, 1 - (simT - flash.t) / 350) : 0;
    ctx.fillStyle = '#0e1424';
    ctx.beginPath(); ctx.roundRect(x1 - 13, cy - 26, 26, 52, 6); ctx.fill();
    if (a > 0) {
      ctx.globalAlpha = a; ctx.fillStyle = CSS[flash.b];
      ctx.shadowColor = CSS[flash.b]; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.roundRect(x1 - 13, cy - 26, 26, 52, 6); ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = '#8d98b5'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x1 - 13, cy - 26, 26, 52, 6); ctx.stroke();

    ctx.font = '11.5px system-ui, sans-serif'; ctx.fillStyle = '#8d98b5';
    ctx.textAlign = 'left'; ctx.fillText('Quelle', x0 - 20, cy + 52);
    ctx.textAlign = 'right'; ctx.fillText('Detektor', x1 + 14, cy + 52);
    ctx.textAlign = 'center'; ctx.fillStyle = '#6b7694';
    ctx.fillText(`${fmtL(S.L)} · ${fmtE(S.E)}`, (x0 + x1) / 2, cy + 52);
  }

  function frame(now) {
    const dt = Math.min(60, now - lastFrame);
    lastFrame = now;
    if (!paused) {
      simT += dt;
      if (simT - lastEmit >= EMIT) {
        particles.push({ t0: simT, dy: (Math.random() - .5) * 10 });
        lastEmit = simT;
      }
      let hit = false;
      while (particles.length && simT - particles[0].t0 >= FLIGHT) {
        particles.shift();
        const b = sample();
        counts[b]++; flash = { b, t: simT }; hit = true;
      }
      if (hit) updateReadout();
    }
    drawBeam();
    requestAnimationFrame(frame);
  }

  initUI();
  syncUI();
  recompute();
  window.addEventListener('resize', drawPlots);
  requestAnimationFrame(t => { lastFrame = t; frame(t); });
})();
