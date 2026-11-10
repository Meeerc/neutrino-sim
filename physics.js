// Drei-Flavour-Neutrinooszillation mit Materieeffekt (konstante Dichte).
// Exakte Propagation über das Matrixexponential des Hamilton-Operators in der Flavour-Basis.
(function (root) {
  'use strict';

  const K = 2.5340;      // Phase = K * Δm²[eV²] * L[km] / E[GeV]  (= Δm² L / 2E)
  const A_MAT = 1.52e-4; // A[eV²] = A_MAT * Ye * ρ[g/cm³] * E[GeV]
  const YE = 0.5;

  const zero = () => ({ r: new Float64Array(9), i: new Float64Array(9) });
  const ident = () => { const m = zero(); m.r[0] = m.r[4] = m.r[8] = 1; return m; };

  function mul(a, b) {
    const o = zero();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      let sr = 0, si = 0;
      for (let k = 0; k < 3; k++) {
        const ar = a.r[i * 3 + k], ai = a.i[i * 3 + k], br = b.r[k * 3 + j], bi = b.i[k * 3 + j];
        sr += ar * br - ai * bi;
        si += ar * bi + ai * br;
      }
      o.r[i * 3 + j] = sr; o.i[i * 3 + j] = si;
    }
    return o;
  }

  // exp(M) per Skalieren-und-Quadrieren mit Taylorreihe
  function expm(m) {
    let norm = 0;
    for (let i = 0; i < 3; i++) {
      let s = 0;
      for (let j = 0; j < 3; j++) s += Math.hypot(m.r[i * 3 + j], m.i[i * 3 + j]);
      norm = Math.max(norm, s);
    }
    let sq = 0;
    while (norm > 0.5) { norm /= 2; sq++; }
    const sc = Math.pow(2, -sq);
    const a = zero();
    for (let n = 0; n < 9; n++) { a.r[n] = m.r[n] * sc; a.i[n] = m.i[n] * sc; }
    let res = ident(), term = ident();
    for (let k = 1; k <= 14; k++) {
      term = mul(term, a);
      for (let n = 0; n < 9; n++) {
        term.r[n] /= k; term.i[n] /= k;
        res.r[n] += term.r[n]; res.i[n] += term.i[n];
      }
    }
    for (let s = 0; s < sq; s++) res = mul(res, res);
    return res;
  }

  // PMNS-Matrix (PDG-Parametrisierung). Winkel in Radiant.
  function pmns(p) {
    const s12 = Math.sin(p.th12), c12 = Math.cos(p.th12);
    const s23 = Math.sin(p.th23), c23 = Math.cos(p.th23);
    const s13 = Math.sin(p.th13), c13 = Math.cos(p.th13);
    const d = p.anti ? -p.dcp : p.dcp;
    const cd = Math.cos(d), sd = Math.sin(d);
    const u = zero();
    const set = (n, re, im) => { u.r[n] = re; u.i[n] = im; };
    set(0, c12 * c13, 0);
    set(1, s12 * c13, 0);
    set(2, s13 * cd, -s13 * sd);
    set(3, -s12 * c23 - c12 * s23 * s13 * cd, -c12 * s23 * s13 * sd);
    set(4, c12 * c23 - s12 * s23 * s13 * cd, -s12 * s23 * s13 * sd);
    set(5, s23 * c13, 0);
    set(6, s12 * s23 - c12 * c23 * s13 * cd, -c12 * c23 * s13 * sd);
    set(7, -c12 * s23 - s12 * c23 * s13 * cd, -s12 * c23 * s13 * sd);
    set(8, c23 * c13, 0);
    return u;
  }

  // Hamilton-Operator (in eV², ohne Faktor 1/2E) in der Flavour-Basis
  function hamiltonian(p, E, rho) {
    const u = pmns(p);
    const m = [0, p.dm21, p.dm31];
    const h = zero();
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      let sr = 0, si = 0;
      for (let k = 1; k < 3; k++) {
        const ar = u.r[a * 3 + k], ai = u.i[a * 3 + k], br = u.r[b * 3 + k], bi = -u.i[b * 3 + k];
        sr += m[k] * (ar * br - ai * bi);
        si += m[k] * (ar * bi + ai * br);
      }
      h.r[a * 3 + b] = sr; h.i[a * 3 + b] = si;
    }
    h.r[0] += (p.anti ? -1 : 1) * A_MAT * YE * rho * E;
    return h;
  }

  // S = exp(-i * K/E * L * H)
  function propagator(p, E, L, rho) {
    const h = hamiltonian(p, E, rho);
    const t = K * L / E;
    const m = zero();
    for (let n = 0; n < 9; n++) { m.r[n] = t * h.i[n]; m.i[n] = -t * h.r[n]; }
    return expm(m);
  }

  // Wahrscheinlichkeiten P(ν_from → ν_b) nach Strecke L
  function probs(p, from, E, L, rho) {
    const s = propagator(p, E, L, rho);
    return [0, 1, 2].map(b => s.r[b * 3 + from] ** 2 + s.i[b * 3 + from] ** 2);
  }

  // Verlauf entlang der Strecke 0..L
  function curve(p, from, E, L, rho) {
    const phase = K * Math.max(Math.abs(p.dm31), Math.abs(p.dm21)) * L / E;
    const n = Math.min(6000, Math.max(600, Math.ceil(phase / 0.12)));
    const s = propagator(p, E, L / n, rho);
    const P = [new Float64Array(n + 1), new Float64Array(n + 1), new Float64Array(n + 1)];
    let vr = [0, 0, 0], vi = [0, 0, 0];
    vr[from] = 1;
    for (let k = 0; k <= n; k++) {
      for (let b = 0; b < 3; b++) P[b][k] = vr[b] * vr[b] + vi[b] * vi[b];
      const nr = [0, 0, 0], ni = [0, 0, 0];
      for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
        nr[b] += s.r[b * 3 + c] * vr[c] - s.i[b * 3 + c] * vi[c];
        ni[b] += s.r[b * 3 + c] * vi[c] + s.i[b * 3 + c] * vr[c];
      }
      vr = nr; vi = ni;
    }
    return { n, P };
  }

  // Energiespektrum bei fester Strecke (logarithmisch in E)
  function spectrum(p, from, L, rho, eMin, eMax, n) {
    const E = new Float64Array(n), P = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    for (let k = 0; k < n; k++) {
      E[k] = eMin * Math.pow(eMax / eMin, k / (n - 1));
      const pr = probs(p, from, E[k], L, rho);
      for (let b = 0; b < 3; b++) P[b][k] = pr[b];
    }
    return { E, P };
  }

  const api = { probs, curve, spectrum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Nu = api;
})(typeof window !== 'undefined' ? window : globalThis);
