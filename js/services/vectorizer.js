/**
 * LATITUDE DTF COCKPIT - VECTOR ENGINE
 * Vetorização de alta fidelidade (raster -> curvas Bézier) para arte chapada
 * (anime / streetwear / logos), inspirada nos pipelines de "full-color tracing".
 *
 * Pipeline:
 *   A) Quantização  : reamostragem -> filtro bilateral -> histograma (somente pixels "planos")
 *                     -> paleta em CIE-Lab (farthest-point ponderado + k-means) -> rotulagem
 *                     -> remoção de cores de transição (antialiasing) -> limpeza de manchas.
 *   B) Edições      : recolorir / mesclar / remover cores e repintar regiões (desfazer/refazer).
 *   C) Traçado      : máscaras empilhadas (sem frestas) -> gaussiana -> marching squares
 *                     (contorno sub-pixel) -> detecção de cantos -> ajuste de Bézier cúbica.
 */
const VectorEngine = (() => {
  "use strict";

  const DEFAULTS = {
    maxSide: 1400,        // resolução de análise (px do maior lado)
    colors: 14,           // nº de cores da paleta
    autoColors: false,    // detectar nº de cores automaticamente
    autoDelta: 13,        // distância (ΔE) mínima para aceitar nova cor no modo automático
    detailBias: 0.4,      // 0 = só áreas grandes · 1 = prioriza cores raras (detalhes pequenos)
    mergeDelta: 6,        // mescla cores com ΔE menor que isso
    minArea: 10,          // manchas menores (px² na resolução de análise) são absorvidas
    denoise: 1,           // 0 off · 1 leve · 2 forte (bilateral)
    fringe: true,         // remove cores de transição geradas pelo antialiasing
    fringeTol: 11,        // tolerância (ΔE) para considerar uma cor "mistura" de duas vizinhas
    excludeBlack: false,  // trata preto como transparente (knockout DTF)
    blackThreshold: 22,   // 0..80 (canal máximo)
    excludeWhite: false,  // trata branco como transparente (knockout para camisa branca)
    whiteThreshold: 240,  // 180..255 (canal mínimo)
    smooth: 0.8,          // suavidade dos contornos (sigma da gaussiana, px)
    tolerance: 0.9,       // erro máximo do ajuste de curva (px) - menor = mais preciso
    corners: 60           // 0 = sem cantos (tudo redondo) · 100 = cantos muito nítidos
  };

  // parâmetros que exigem refazer a quantização (estágio A)
  const A_KEYS = [
    "maxSide", "colors", "autoColors", "autoDelta", "detailBias", "mergeDelta",
    "minArea", "denoise", "fringe", "fringeTol", "excludeBlack", "blackThreshold",
    "excludeWhite", "whiteThreshold"
  ];

  // ---------------------------------------------------------------------------
  // COR
  // ---------------------------------------------------------------------------
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

  function rgb2lab(r, g, b, out, o) {
    const R = LIN[clamp255(r)], G = LIN[clamp255(g)], B = LIN[clamp255(b)];
    const x = labF((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
    const y = labF(0.2126729 * R + 0.7151522 * G + 0.072175 * B);
    const z = labF((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
    out[o] = 116 * y - 16;
    out[o + 1] = 500 * (x - y);
    out[o + 2] = 200 * (y - z);
  }

  const hex2 = (v) => clamp255(v).toString(16).padStart(2, "0");
  const rgbToHex = (r, g, b) => "#" + hex2(r) + hex2(g) + hex2(b);
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  // ---------------------------------------------------------------------------
  // ESTÁGIO 0: REAMOSTRAGEM
  // ---------------------------------------------------------------------------
  function resample(source, maxSide) {
    const ow = source.width, oh = source.height;
    const sc = Math.min(1, maxSide / Math.max(ow, oh));
    const w = Math.max(2, Math.round(ow * sc));
    const h = Math.max(2, Math.round(oh * sc));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);
    return { canvas, w, h, ow, oh, data: ctx.getImageData(0, 0, w, h).data };
  }

  /** Filtro bilateral (preserva bordas, remove blocos JPEG). Ignora pixels transparentes. */
  function bilateral(d, w, h, radius) {
    const out = new Uint8ClampedArray(d);
    const sigma = radius > 1 ? 30 : 22;
    const lut = new Float32Array(Math.ceil((3 * 255 * 255) / 16) + 2);
    for (let i = 0; i < lut.length; i++) lut[i] = Math.exp(-(i * 16) / (2 * sigma * sigma));
    for (let y = radius; y < h - radius; y++) {
      for (let x = radius; x < w - radius; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] < 128) continue;
        const cr = d[i], cg = d[i + 1], cb = d[i + 2];
        let sr = 0, sg = 0, sb = 0, sw = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const j = i + (dy * w + dx) * 4;
            if (d[j + 3] < 128) continue;
            const dr = d[j] - cr, dg = d[j + 1] - cg, db = d[j + 2] - cb;
            const wt = lut[(dr * dr + dg * dg + db * db) >> 4];
            sr += d[j] * wt; sg += d[j + 1] * wt; sb += d[j + 2] * wt; sw += wt;
          }
        }
        if (sw > 0) { out[i] = sr / sw; out[i + 1] = sg / sw; out[i + 2] = sb / sw; }
      }
    }
    d.set(out);
  }

  // ---------------------------------------------------------------------------
  // ESTÁGIO A: QUANTIZAÇÃO PERCEPTUAL
  // ---------------------------------------------------------------------------
  function dist2Lab(a, ia, b, ib) {
    const dl = a[ia] - b[ib], da = a[ia + 1] - b[ib + 1], db = a[ia + 2] - b[ib + 2];
    return dl * dl + da * da + db * db;
  }

  function nearestLab(palLab, K, lab) {
    let bi = 0, bd = Infinity;
    for (let k = 0; k < K; k++) {
      const dl = palLab[k * 3] - lab[0], da = palLab[k * 3 + 1] - lab[1], db = palLab[k * 3 + 2] - lab[2];
      const dd = dl * dl + da * da + db * db;
      if (dd < bd) { bd = dd; bi = k; }
    }
    return bi;
  }

  function buildPalette(d, op, w, h, p) {
    const n = w * h;
    const EDGE_T = 54;

    // 1) separa pixels "planos" dos de borda (antialiasing não deve ditar a paleta)
    const edge = new Uint8Array(n);
    let opaque = 0, flat = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!op[i]) continue;
        opaque++;
        const o = i * 4;
        let e = 0;
        const cmp = (j) => {
          if (!op[j]) return;
          const q = j * 4;
          const df = Math.abs(d[o] - d[q]) + Math.abs(d[o + 1] - d[q + 1]) + Math.abs(d[o + 2] - d[q + 2]);
          if (df > e) e = df;
        };
        if (x > 0) cmp(i - 1);
        if (x < w - 1) cmp(i + 1);
        if (y > 0) cmp(i - w);
        if (y < h - 1) cmp(i + w);
        if (e > EDGE_T) edge[i] = 1; else flat++;
      }
    }
    if (opaque === 0) return null;
    const useFlat = flat >= opaque * 0.2;

    // 2) histograma 5 bits/canal
    const cnt = new Float64Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
    for (let i = 0; i < n; i++) {
      if (!op[i] || (useFlat && edge[i])) continue;
      const o = i * 4;
      const key = ((d[o] >> 3) << 10) | ((d[o + 1] >> 3) << 5) | (d[o + 2] >> 3);
      cnt[key]++; sr[key] += d[o]; sg[key] += d[o + 1]; sb[key] += d[o + 2];
    }
    const keys = [];
    for (let k = 0; k < 32768; k++) if (cnt[k] > 0) keys.push(k);
    const m = keys.length;
    const bc = new Float64Array(m), bl = new Float32Array(m * 3), brgb = new Float32Array(m * 3), bw = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      const k = keys[j];
      bc[j] = cnt[k];
      brgb[j * 3] = sr[k] / cnt[k]; brgb[j * 3 + 1] = sg[k] / cnt[k]; brgb[j * 3 + 2] = sb[k] / cnt[k];
      rgb2lab(brgb[j * 3], brgb[j * 3 + 1], brgb[j * 3 + 2], bl, j * 3);
      bw[j] = Math.pow(bc[j], p.detailBias);
    }

    // 3) farthest-point ponderado: garante cores raras porém distintas (ex.: raio azul)
    const Kmax = Math.min(p.autoColors ? 32 : p.colors, m);
    const centers = [];
    let first = 0;
    for (let j = 1; j < m; j++) if (bc[j] > bc[first]) first = j;
    centers.push(first);
    const minD = new Float32Array(m).fill(Infinity);
    while (centers.length < Kmax) {
      const c = centers[centers.length - 1];
      let best = -1, bestScore = -1, bestDist = 0;
      for (let j = 0; j < m; j++) {
        const dd = dist2Lab(bl, j * 3, bl, c * 3);
        if (dd < minD[j]) minD[j] = dd;
        const dist = Math.sqrt(minD[j]);
        const score = dist * bw[j];
        if (score > bestScore) { bestScore = score; best = j; bestDist = dist; }
      }
      if (best < 0 || bestDist < (p.autoColors ? p.autoDelta : 3)) break;
      centers.push(best);
    }

    // 4) k-means ponderado em Lab
    let K = centers.length;
    let cLab = new Float64Array(K * 3), cRgb = new Float64Array(K * 3), cW = new Float64Array(K);
    centers.forEach((j, k) => {
      for (let c = 0; c < 3; c++) { cLab[k * 3 + c] = bl[j * 3 + c]; cRgb[k * 3 + c] = brgb[j * 3 + c]; }
    });
    for (let it = 0; it < 8; it++) {
      const aL = new Float64Array(K * 3), aR = new Float64Array(K * 3), aW = new Float64Array(K);
      for (let j = 0; j < m; j++) {
        let bk = 0, bd = Infinity;
        for (let k = 0; k < K; k++) {
          const dl = cLab[k * 3] - bl[j * 3], da = cLab[k * 3 + 1] - bl[j * 3 + 1], db = cLab[k * 3 + 2] - bl[j * 3 + 2];
          const dd = dl * dl + da * da + db * db;
          if (dd < bd) { bd = dd; bk = k; }
        }
        for (let c = 0; c < 3; c++) { aL[bk * 3 + c] += bl[j * 3 + c] * bc[j]; aR[bk * 3 + c] += brgb[j * 3 + c] * bc[j]; }
        aW[bk] += bc[j];
      }
      for (let k = 0; k < K; k++) {
        if (aW[k] > 0) for (let c = 0; c < 3; c++) { cLab[k * 3 + c] = aL[k * 3 + c] / aW[k]; cRgb[k * 3 + c] = aR[k * 3 + c] / aW[k]; }
      }
      cW = aW;
    }

    // 5) mescla cores muito parecidas
    let pal = [];
    for (let k = 0; k < K; k++) {
      if (cW[k] <= 0) continue;
      pal.push({ lab: [cLab[k * 3], cLab[k * 3 + 1], cLab[k * 3 + 2]], rgb: [cRgb[k * 3], cRgb[k * 3 + 1], cRgb[k * 3 + 2]], w: cW[k] });
    }
    const md2 = p.mergeDelta * p.mergeDelta;
    let merged = true;
    while (merged && pal.length > 1) {
      merged = false;
      let bi = -1, bj = -1, bd = md2;
      for (let a = 0; a < pal.length; a++) {
        for (let b = a + 1; b < pal.length; b++) {
          const dl = pal[a].lab[0] - pal[b].lab[0], da = pal[a].lab[1] - pal[b].lab[1], db = pal[a].lab[2] - pal[b].lab[2];
          const dd = dl * dl + da * da + db * db;
          if (dd < bd) { bd = dd; bi = a; bj = b; }
        }
      }
      if (bi >= 0 && md2 > 0) {
        const A = pal[bi], B = pal[bj], t = A.w + B.w;
        pal[bi] = {
          lab: A.lab.map((v, c) => (v * A.w + B.lab[c] * B.w) / t),
          rgb: A.rgb.map((v, c) => (v * A.w + B.rgb[c] * B.w) / t),
          w: t
        };
        pal.splice(bj, 1);
        merged = true;
      }
    }
    return pal;
  }

  /** Remove "cores de transição": tons que são misturas de duas vizinhas (antialiasing). */
  function removeFringe(labels, d, op, w, h, pal, p) {
    const K = pal.length;
    if (K < 3) return;
    const n = w * h;
    const adj = new Float64Array(K * K);
    const isB = new Uint8Array(n);
    const total = new Float64Array(K), bnd = new Float64Array(K);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, a = labels[i];
        if (a < 0) continue;
        total[a]++;
        if (x < w - 1) {
          const b = labels[i + 1];
          if (b >= 0 && b !== a) { adj[a * K + b]++; adj[b * K + a]++; isB[i] = 1; isB[i + 1] = 1; }
        }
        if (y < h - 1) {
          const b = labels[i + w];
          if (b >= 0 && b !== a) { adj[a * K + b]++; adj[b * K + a]++; isB[i] = 1; isB[i + w] = 1; }
        }
      }
    }
    for (let i = 0; i < n; i++) if (isB[i] && labels[i] >= 0) bnd[labels[i]]++;

    const isFringe = new Uint8Array(K);
    const tol2 = p.fringeTol * p.fringeTol;
    for (let c = 0; c < K; c++) {
      if (total[c] === 0 || bnd[c] / total[c] < 0.6) continue;
      let sum = 0;
      for (let b = 0; b < K; b++) sum += adj[c * K + b];
      const nbs = [];
      for (let b = 0; b < K; b++) if (b !== c && adj[c * K + b] >= sum * 0.05) nbs.push(b);
      nbs.sort((a, b) => adj[c * K + b] - adj[c * K + a]);
      const top = nbs.slice(0, 5);
      const L = pal[c].lab;
      outer:
      for (let i = 0; i < top.length; i++) {
        for (let j = i + 1; j < top.length; j++) {
          const A = pal[top[i]].lab, B = pal[top[j]].lab;
          const vx = B[0] - A[0], vy = B[1] - A[1], vz = B[2] - A[2];
          const vv = vx * vx + vy * vy + vz * vz || 1e-9;
          const t = ((L[0] - A[0]) * vx + (L[1] - A[1]) * vy + (L[2] - A[2]) * vz) / vv;
          if (t < 0.08 || t > 0.92) continue;
          const px = A[0] + vx * t - L[0], py = A[1] + vy * t - L[1], pz = A[2] + vz * t - L[2];
          if (px * px + py * py + pz * pz < tol2) { isFringe[c] = 1; break outer; }
        }
      }
    }
    // nunca remove todas as cores
    let keep = 0;
    for (let c = 0; c < K; c++) if (!isFringe[c]) keep++;
    if (keep === 0) return;

    const src = Int16Array.from(labels);
    const palFlat = new Float32Array(K * 3);
    for (let k = 0; k < K; k++) { palFlat[k * 3] = pal[k].lab[0]; palFlat[k * 3 + 1] = pal[k].lab[1]; palFlat[k * 3 + 2] = pal[k].lab[2]; }
    const lab = [0, 0, 0];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, a = src[i];
        if (a < 0 || !isFringe[a]) continue;
        const o = i * 4;
        rgb2lab(d[o], d[o + 1], d[o + 2], lab, 0);
        let best = -1, bd = Infinity;
        for (let R = 2; R <= 5 && best < 0; R += 3) {
          for (let dy = -R; dy <= R; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -R; dx <= R; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= w) continue;
              const l = src[yy * w + xx];
              if (l < 0 || isFringe[l]) continue;
              const dl = palFlat[l * 3] - lab[0], da = palFlat[l * 3 + 1] - lab[1], db = palFlat[l * 3 + 2] - lab[2];
              const dd = dl * dl + da * da + db * db;
              if (dd < bd) { bd = dd; best = l; }
            }
          }
        }
        if (best < 0) {
          for (let k = 0; k < K; k++) {
            if (isFringe[k]) continue;
            const dl = palFlat[k * 3] - lab[0], da = palFlat[k * 3 + 1] - lab[1], db = palFlat[k * 3 + 2] - lab[2];
            const dd = dl * dl + da * da + db * db;
            if (dd < bd) { bd = dd; best = k; }
          }
        }
        labels[i] = best;
      }
    }
  }

  /** Absorve ilhas menores que minArea pelo vizinho dominante. */
  function cleanSpecks(labels, w, h, minArea) {
    if (minArea <= 0) return;
    const n = w * h;
    const seen = new Uint8Array(n);
    const stack = new Int32Array(n);
    for (let s = 0; s < n; s++) {
      if (seen[s]) continue;
      const target = labels[s];
      let sp = 0, count = 0;
      const members = [];
      stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const i = stack[--sp];
        members.push(i);
        count++;
        const x = i % w, y = (i / w) | 0;
        if (x > 0 && !seen[i - 1] && labels[i - 1] === target) { seen[i - 1] = 1; stack[sp++] = i - 1; }
        if (x < w - 1 && !seen[i + 1] && labels[i + 1] === target) { seen[i + 1] = 1; stack[sp++] = i + 1; }
        if (y > 0 && !seen[i - w] && labels[i - w] === target) { seen[i - w] = 1; stack[sp++] = i - w; }
        if (y < h - 1 && !seen[i + w] && labels[i + w] === target) { seen[i + w] = 1; stack[sp++] = i + w; }
      }
      if (count >= minArea) continue;
      const votes = new Map();
      for (const i of members) {
        const x = i % w, y = (i / w) | 0;
        const nb = [];
        if (x > 0) nb.push(labels[i - 1]);
        if (x < w - 1) nb.push(labels[i + 1]);
        if (y > 0) nb.push(labels[i - w]);
        if (y < h - 1) nb.push(labels[i + w]);
        for (const l of nb) if (l !== target) votes.set(l, (votes.get(l) || 0) + 1);
      }
      let bl = target, bv = 0;
      votes.forEach((v, l) => { if (v > bv) { bv = v; bl = l; } });
      if (bl !== target) for (const i of members) labels[i] = bl;
    }
  }

  function quantize(base, p) {
    const w = base.w, h = base.h, n = w * h;
    const d = new Uint8ClampedArray(base.data);
    const op = new Uint8Array(n);
    const bt = p.excludeBlack ? p.blackThreshold : -1;
    const wt = p.excludeWhite ? p.whiteThreshold : 999;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      let ok = d[o + 3] >= 128;
      if (ok && bt >= 0 && Math.max(d[o], d[o + 1], d[o + 2]) <= bt) ok = false;
      if (ok && wt <= 255 && Math.min(d[o], d[o + 1], d[o + 2]) >= wt) ok = false;
      op[i] = ok ? 1 : 0;
      d[o + 3] = ok ? 255 : 0;
    }
    if (p.denoise > 0) bilateral(d, w, h, p.denoise);

    const labels = new Int16Array(n).fill(-1);
    const pal = buildPalette(d, op, w, h, p);
    if (!pal || !pal.length) return { w, h, labels, palette: [] };

    const K = pal.length;
    const palLab = new Float32Array(K * 3);
    pal.forEach((c, k) => { palLab[k * 3] = c.lab[0]; palLab[k * 3 + 1] = c.lab[1]; palLab[k * 3 + 2] = c.lab[2]; });
    const cache = new Int16Array(1 << 18).fill(-2);
    const tmp = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      if (!op[i]) continue;
      const o = i * 4;
      const key = ((d[o] >> 2) << 12) | ((d[o + 1] >> 2) << 6) | (d[o + 2] >> 2);
      let k = cache[key];
      if (k === -2) {
        rgb2lab(d[o], d[o + 1], d[o + 2], tmp, 0);
        k = nearestLab(palLab, K, tmp);
        cache[key] = k;
      }
      labels[i] = k;
    }

    if (p.fringe) removeFringe(labels, d, op, w, h, pal, p);
    cleanSpecks(labels, w, h, p.minArea);

    // compacta paleta e calcula cor final a partir de pixels "internos" (sem antialiasing)
    const used = new Float64Array(K);
    for (let i = 0; i < n; i++) if (labels[i] >= 0) used[labels[i]]++;
    const remap = new Int16Array(K).fill(-1);
    const palette = [];
    for (let k = 0; k < K; k++) {
      if (used[k] > 0) { remap[k] = palette.length; palette.push({ r: 0, g: 0, b: 0, count: 0 }); }
    }
    const sum = palette.map(() => [0, 0, 0, 0]);
    const sumAll = palette.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const l = labels[i];
      if (l < 0) continue;
      const nl = remap[l];
      labels[i] = nl;
    }
    const src = base.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, l = labels[i];
        if (l < 0) continue;
        const o = i * 4;
        sumAll[l][0] += src[o]; sumAll[l][1] += src[o + 1]; sumAll[l][2] += src[o + 2]; sumAll[l][3]++;
        const inner = x > 0 && x < w - 1 && y > 0 && y < h - 1 &&
          labels[i - 1] === l && labels[i + 1] === l && labels[i - w] === l && labels[i + w] === l;
        if (inner) { sum[l][0] += src[o]; sum[l][1] += src[o + 1]; sum[l][2] += src[o + 2]; sum[l][3]++; }
      }
    }
    palette.forEach((c, k) => {
      const s = sum[k][3] > 0 ? sum[k] : sumAll[k];
      c.r = Math.round(s[0] / s[3]); c.g = Math.round(s[1] / s[3]); c.b = Math.round(s[2] / s[3]);
      c.count = sumAll[k][3];
    });
    return { w, h, labels, palette };
  }

  // ---------------------------------------------------------------------------
  // ESTÁGIO B: EDIÇÕES MANUAIS (paleta + regiões)
  // ---------------------------------------------------------------------------
  function floodRegion(labels, w, h, sx, sy) {
    const n = w * h;
    const start = sy * w + sx;
    const target = labels[start];
    const mask = new Uint8Array(n);
    const stack = new Int32Array(n);
    const out = [];
    let sp = 0;
    stack[sp++] = start; mask[start] = 1;
    while (sp) {
      const i = stack[--sp];
      out.push(i);
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && !mask[i - 1] && labels[i - 1] === target) { mask[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && !mask[i + 1] && labels[i + 1] === target) { mask[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && !mask[i - w] && labels[i - w] === target) { mask[i - w] = 1; stack[sp++] = i - w; }
      if (y < h - 1 && !mask[i + w] && labels[i + w] === target) { mask[i + w] = 1; stack[sp++] = i + w; }
    }
    return { label: target, indices: Int32Array.from(out), mask };
  }

  function dominantNeighbor(labels, w, h, region) {
    const votes = new Map();
    const { indices, mask, label } = region;
    for (let q = 0; q < indices.length; q++) {
      const i = indices[q], x = i % w, y = (i / w) | 0;
      const check = (j) => { if (!mask[j]) votes.set(labels[j], (votes.get(labels[j]) || 0) + 1); };
      if (x > 0) check(i - 1);
      if (x < w - 1) check(i + 1);
      if (y > 0) check(i - w);
      if (y < h - 1) check(i + w);
    }
    let best = label, bv = 0, bestOpaque = label, bvo = 0;
    votes.forEach((v, l) => {
      if (v > bv) { bv = v; best = l; }
      if (l >= 0 && v > bvo) { bvo = v; bestOpaque = l; }
    });
    return bestOpaque !== label ? bestOpaque : best;
  }

  function applyEdits(stage, edits) {
    const { w, h } = stage;
    const labels = Int16Array.from(stage.labels);
    const palette = stage.palette.map((c) => ({ ...c }));
    const n = w * h;
    for (const op of edits) {
      if (op.t === "color") {
        const [r, g, b] = hexToRgb(op.hex);
        if (palette[op.idx]) { palette[op.idx].r = r; palette[op.idx].g = g; palette[op.idx].b = b; }
      } else if (op.t === "new") {
        const [r, g, b] = hexToRgb(op.hex);
        palette.push({ r, g, b, count: 0 });
      } else if (op.t === "merge") {
        for (let i = 0; i < n; i++) if (labels[i] === op.from) labels[i] = op.to;
      } else if (op.t === "remove") {
        for (let i = 0; i < n; i++) if (labels[i] === op.idx) labels[i] = -1;
      } else if (op.t === "region") {
        if (op.x < 0 || op.y < 0 || op.x >= w || op.y >= h) continue;
        const reg = floodRegion(labels, w, h, op.x, op.y);
        let to = op.to;
        if (op.action === "remove") to = -1;
        else if (op.action === "merge") to = dominantNeighbor(labels, w, h, reg);
        for (let q = 0; q < reg.indices.length; q++) labels[reg.indices[q]] = to;
      }
    }
    const counts = new Float64Array(palette.length);
    for (let i = 0; i < n; i++) if (labels[i] >= 0) counts[labels[i]]++;
    palette.forEach((c, k) => { c.count = counts[k]; c.hex = rgbToHex(c.r, c.g, c.b); });
    return { w, h, labels, palette };
  }

  // ---------------------------------------------------------------------------
  // ESTÁGIO C: TRAÇADO SUB-PIXEL (gaussiana + marching squares)
  // ---------------------------------------------------------------------------
  const POOL = { ex: null, ey: null, next: null, vis: null, f: null, tmp: null };
  const ensure = (arr, Type, size) => (arr && arr.length >= size ? arr : new Type(size));

  function gaussKernel(sigma) {
    const R = Math.max(1, Math.ceil(sigma * 3));
    const k = new Float32Array(2 * R + 1);
    let s = 0;
    for (let i = -R; i <= R; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + R] = v; s += v; }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    return { k, R };
  }

  function blurField(F, T, sw, sh, sigma) {
    const { k, R } = gaussKernel(sigma);
    for (let y = 0; y < sh; y++) {
      const row = y * sw;
      for (let x = 0; x < sw; x++) {
        let acc = 0;
        const lo = Math.max(0, x - R), hi = Math.min(sw - 1, x + R);
        for (let xx = lo; xx <= hi; xx++) acc += F[row + xx] * k[xx - x + R];
        T[row + x] = acc;
      }
    }
    for (let x = 0; x < sw; x++) {
      for (let y = 0; y < sh; y++) {
        let acc = 0;
        const lo = Math.max(0, y - R), hi = Math.min(sh - 1, y + R);
        for (let yy = lo; yy <= hi; yy++) acc += T[yy * sw + x] * k[yy - y + R];
        F[y * sw + x] = acc;
      }
    }
  }

  /** Contornos fechados (sub-pixel) da máscara "labels>=0 e rank[label]>=r". */
  function traceLayer(labels, rank, r, w, h, sigma) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const l = labels[row + x];
        if (l >= 0 && rank[l] >= r) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return [];
    const R = Math.max(1, Math.ceil(sigma * 3));
    const m = R + 2;
    const sw = x1 - x0 + 1 + 2 * m, sh = y1 - y0 + 1 + 2 * m;
    const ox = x0 - m, oy = y0 - m;
    const size = sw * sh;
    POOL.f = ensure(POOL.f, Float32Array, size);
    POOL.tmp = ensure(POOL.tmp, Float32Array, size);
    const F = POOL.f, T = POOL.tmp;
    for (let sy = 0; sy < sh; sy++) {
      const iy = Math.min(h - 1, Math.max(0, oy + sy));
      for (let sx = 0; sx < sw; sx++) {
        const ix = Math.min(w - 1, Math.max(0, ox + sx));
        const l = labels[iy * w + ix];
        F[sy * sw + sx] = l >= 0 && rank[l] >= r ? 1 : 0;
      }
    }
    blurField(F, T, sw, sh, sigma);
    for (let sy = 0; sy < sh; sy++) {
      const iy = oy + sy;
      for (let sx = 0; sx < sw; sx++) {
        const ix = ox + sx;
        if (ix < 0 || ix >= w || iy < 0 || iy >= h) F[sy * sw + sx] = 0;
      }
    }
    // zera anel externo (garante contornos fechados)
    for (let sx = 0; sx < sw; sx++) { F[sx] = 0; F[(sh - 1) * sw + sx] = 0; }
    for (let sy = 0; sy < sh; sy++) { F[sy * sw] = 0; F[sy * sw + sw - 1] = 0; }

    const NE = size;
    POOL.next = ensure(POOL.next, Int32Array, 2 * NE);
    POOL.vis = ensure(POOL.vis, Uint8Array, 2 * NE);
    POOL.ex = ensure(POOL.ex, Float32Array, 2 * NE);
    POOL.ey = ensure(POOL.ey, Float32Array, 2 * NE);
    const next = POOL.next, vis = POOL.vis, ex = POOL.ex, ey = POOL.ey;
    next.fill(-1, 0, 2 * NE);
    vis.fill(0, 0, 2 * NE);

    const TH = 0.5;
    for (let cy = 0; cy < sh - 1; cy++) {
      for (let cx = 0; cx < sw - 1; cx++) {
        const a = F[cy * sw + cx], b = F[cy * sw + cx + 1];
        const c = F[(cy + 1) * sw + cx + 1], d = F[(cy + 1) * sw + cx];
        const idx = (a >= TH ? 1 : 0) | (b >= TH ? 2 : 0) | (c >= TH ? 4 : 0) | (d >= TH ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const eT = cy * sw + cx, eB = (cy + 1) * sw + cx;
        const eL = NE + cy * sw + cx, eR = NE + cy * sw + cx + 1;
        const pT = () => { ex[eT] = cx + (TH - a) / (b - a); ey[eT] = cy; return eT; };
        const pB = () => { ex[eB] = cx + (TH - d) / (c - d); ey[eB] = cy + 1; return eB; };
        const pL = () => { ex[eL] = cx; ey[eL] = cy + (TH - a) / (d - a); return eL; };
        const pR = () => { ex[eR] = cx + 1; ey[eR] = cy + (TH - b) / (c - b); return eR; };
        const link = (from, to) => { next[from] = to; };
        switch (idx) {
          case 1: link(pT(), pL()); break;
          case 2: link(pR(), pT()); break;
          case 3: link(pR(), pL()); break;
          case 4: link(pB(), pR()); break;
          case 5:
            if ((a + b + c + d) / 4 >= TH) { link(pT(), pR()); link(pB(), pL()); }
            else { link(pT(), pL()); link(pB(), pR()); }
            break;
          case 6: link(pB(), pT()); break;
          case 7: link(pB(), pL()); break;
          case 8: link(pL(), pB()); break;
          case 9: link(pT(), pB()); break;
          case 10:
            if ((a + b + c + d) / 4 >= TH) { link(pL(), pT()); link(pR(), pB()); }
            else { link(pR(), pT()); link(pL(), pB()); }
            break;
          case 11: link(pR(), pB()); break;
          case 12: link(pL(), pR()); break;
          case 13: link(pT(), pR()); break;
          case 14: link(pL(), pT()); break;
        }
      }
    }

    const loops = [];
    for (let e = 0; e < 2 * NE; e++) {
      if (next[e] < 0 || vis[e]) continue;
      const pts = [];
      let cur = e;
      let guard = 0;
      while (cur >= 0 && !vis[cur] && guard++ < 4000000) {
        vis[cur] = 1;
        pts.push(ox + ex[cur] + 0.5, oy + ey[cur] + 0.5);
        cur = next[cur];
      }
      if (cur === e && pts.length >= 8) loops.push(pts);
    }
    return loops;
  }

  // ---------------------------------------------------------------------------
  // AJUSTE DE CURVAS (Schneider, "An Algorithm for Automatically Fitting Digitized Curves")
  // ---------------------------------------------------------------------------
  const B0 = (u) => { const t = 1 - u; return t * t * t; };
  const B1 = (u) => { const t = 1 - u; return 3 * u * t * t; };
  const B2 = (u) => { const t = 1 - u; return 3 * u * u * t; };
  const B3 = (u) => u * u * u;

  function bezPoint(bz, u) {
    const b0 = B0(u), b1 = B1(u), b2 = B2(u), b3 = B3(u);
    return [
      bz[0] * b0 + bz[2] * b1 + bz[4] * b2 + bz[6] * b3,
      bz[1] * b0 + bz[3] * b1 + bz[5] * b2 + bz[7] * b3
    ];
  }

  function bezD1(bz, u) {
    const t = 1 - u;
    const a = 3 * t * t, b = 6 * t * u, c = 3 * u * u;
    return [
      (bz[2] - bz[0]) * a + (bz[4] - bz[2]) * b + (bz[6] - bz[4]) * c,
      (bz[3] - bz[1]) * a + (bz[5] - bz[3]) * b + (bz[7] - bz[5]) * c
    ];
  }

  function bezD2(bz, u) {
    const t = 1 - u;
    return [
      6 * t * (bz[4] - 2 * bz[2] + bz[0]) + 6 * u * (bz[6] - 2 * bz[4] + bz[2]),
      6 * t * (bz[5] - 2 * bz[3] + bz[1]) + 6 * u * (bz[7] - 2 * bz[5] + bz[3])
    ];
  }

  function chordParam(P, n) {
    const u = new Float64Array(n);
    for (let i = 1; i < n; i++) u[i] = u[i - 1] + Math.hypot(P[2 * i] - P[2 * i - 2], P[2 * i + 1] - P[2 * i - 1]);
    const t = u[n - 1] || 1e-9;
    for (let i = 1; i < n; i++) u[i] /= t;
    return u;
  }

  function generateBezier(P, n, u, t1, t2) {
    const p0x = P[0], p0y = P[1], p3x = P[2 * (n - 1)], p3y = P[2 * (n - 1) + 1];
    let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
    for (let i = 0; i < n; i++) {
      const ui = u[i], b0 = B0(ui), b1 = B1(ui), b2 = B2(ui), b3 = B3(ui);
      const a1x = t1[0] * b1, a1y = t1[1] * b1, a2x = t2[0] * b2, a2y = t2[1] * b2;
      c00 += a1x * a1x + a1y * a1y;
      c01 += a1x * a2x + a1y * a2y;
      c11 += a2x * a2x + a2y * a2y;
      const tx = P[2 * i] - (p0x * (b0 + b1) + p3x * (b2 + b3));
      const ty = P[2 * i + 1] - (p0y * (b0 + b1) + p3y * (b2 + b3));
      x0 += a1x * tx + a1y * ty;
      x1 += a2x * tx + a2y * ty;
    }
    const det = c00 * c11 - c01 * c01;
    let al = 0, ar = 0;
    if (Math.abs(det) > 1e-12) {
      al = (x0 * c11 - x1 * c01) / det;
      ar = (c00 * x1 - c01 * x0) / det;
    }
    const seg = Math.hypot(p3x - p0x, p3y - p0y);
    const eps = 1e-6 * seg;
    if (al < eps || ar < eps || Math.abs(det) <= 1e-12) { al = ar = seg / 3; }
    return [
      p0x, p0y,
      p0x + t1[0] * al, p0y + t1[1] * al,
      p3x + t2[0] * ar, p3y + t2[1] * ar,
      p3x, p3y
    ];
  }

  function maxError(P, n, bz, u) {
    let maxD = 0, split = n >> 1;
    for (let i = 1; i < n - 1; i++) {
      const q = bezPoint(bz, u[i]);
      const dx = q[0] - P[2 * i], dy = q[1] - P[2 * i + 1];
      const dd = dx * dx + dy * dy;
      if (dd >= maxD) { maxD = dd; split = i; }
    }
    return { err: maxD, split };
  }

  function reparam(P, n, bz, u) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const q = bezPoint(bz, u[i]), q1 = bezD1(bz, u[i]), q2 = bezD2(bz, u[i]);
      const dx = q[0] - P[2 * i], dy = q[1] - P[2 * i + 1];
      const num = dx * q1[0] + dy * q1[1];
      const den = q1[0] * q1[0] + q1[1] * q1[1] + dx * q2[0] + dy * q2[1];
      let nu = u[i];
      if (Math.abs(den) > 1e-12) nu = u[i] - num / den;
      out[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
    }
    return out;
  }

  const normalize = (x, y) => { const l = Math.hypot(x, y) || 1e-9; return [x / l, y / l]; };

  function fitCubic(P, n, t1, t2, errSq, out) {
    if (n === 2) {
      const d = Math.hypot(P[2] - P[0], P[3] - P[1]) / 3;
      out.push([P[0], P[1], P[0] + t1[0] * d, P[1] + t1[1] * d, P[2] + t2[0] * d, P[3] + t2[1] * d, P[2], P[3]]);
      return;
    }
    let u = chordParam(P, n);
    let bz = generateBezier(P, n, u, t1, t2);
    let me = maxError(P, n, bz, u);
    if (me.err < errSq) { out.push(bz); return; }
    if (me.err < errSq * 16) {
      for (let it = 0; it < 6; it++) {
        const up = reparam(P, n, bz, u);
        bz = generateBezier(P, n, up, t1, t2);
        me = maxError(P, n, bz, up);
        if (me.err < errSq) { out.push(bz); return; }
        u = up;
      }
    }
    const s = Math.max(1, Math.min(n - 2, me.split));
    const k = 2;
    const ia = Math.max(0, s - k), ib = Math.min(n - 1, s + k);
    const tc = normalize(P[2 * ia] - P[2 * ib], P[2 * ia + 1] - P[2 * ib + 1]);
    fitCubic(P.subarray(0, 2 * (s + 1)), s + 1, t1, tc, errSq, out);
    fitCubic(P.subarray(2 * s), n - s, [-tc[0], -tc[1]], t2, errSq, out);
  }

  /** Remove pontos duplicados/muito próximos de um laço. */
  function dedupe(pts) {
    const out = [];
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const x = pts[2 * i], y = pts[2 * i + 1];
      if (out.length) {
        const lx = out[out.length - 2], ly = out[out.length - 1];
        if ((x - lx) * (x - lx) + (y - ly) * (y - ly) < 0.0025) continue;
      }
      out.push(x, y);
    }
    if (out.length > 4) {
      const dx = out[0] - out[out.length - 2], dy = out[1] - out[out.length - 1];
      if (dx * dx + dy * dy < 0.0025) { out.pop(); out.pop(); }
    }
    return Float64Array.from(out);
  }

  /** Índices de cantos de um laço fechado (ângulo de virada > limiar, máximo local). */
  function detectCorners(P, n, thrRad, arm) {
    const cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      cum[i + 1] = cum[i] + Math.hypot(P[2 * j] - P[2 * i], P[2 * j + 1] - P[2 * i + 1]);
    }
    const total = cum[n];
    if (total < arm * 5) return [];
    const ang = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let b = i, f = i, acc = 0;
      for (let s = 0; s < n && acc < arm; s++) {
        const nb = (b - 1 + n) % n;
        acc += Math.hypot(P[2 * b] - P[2 * nb], P[2 * b + 1] - P[2 * nb + 1]);
        b = nb;
      }
      acc = 0;
      for (let s = 0; s < n && acc < arm; s++) {
        const nf = (f + 1) % n;
        acc += Math.hypot(P[2 * f] - P[2 * nf], P[2 * f + 1] - P[2 * nf + 1]);
        f = nf;
      }
      const v1x = P[2 * i] - P[2 * b], v1y = P[2 * i + 1] - P[2 * b + 1];
      const v2x = P[2 * f] - P[2 * i], v2y = P[2 * f + 1] - P[2 * i + 1];
      const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
      if (l1 < 1e-9 || l2 < 1e-9) { ang[i] = 0; continue; }
      ang[i] = Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2))));
    }
    const corners = [];
    for (let i = 0; i < n; i++) {
      if (ang[i] < thrRad) continue;
      let isMax = true;
      let acc = 0;
      for (let s = 1; s < n && acc < arm && isMax; s++) {
        const j = (i + s) % n, pj = (i + s - 1) % n;
        acc += Math.hypot(P[2 * j] - P[2 * pj], P[2 * j + 1] - P[2 * pj + 1]);
        if (ang[j] > ang[i] || (ang[j] === ang[i] && j < i)) isMax = false;
      }
      acc = 0;
      for (let s = 1; s < n && acc < arm && isMax; s++) {
        const j = (i - s + n) % n, pj = (i - s + 1 + n) % n;
        acc += Math.hypot(P[2 * j] - P[2 * pj], P[2 * j + 1] - P[2 * pj + 1]);
        if (ang[j] > ang[i] || (ang[j] === ang[i] && j < i)) isMax = false;
      }
      if (isMax) corners.push(i);
    }
    return corners;
  }

  /** Tangente unitária apontando "à frente" (dir=+1) ou "atrás" (dir=-1) a ~len px. */
  function tangentAt(P, n, i, dir, len) {
    let j = i, acc = 0;
    for (let s = 0; s < n && acc < len; s++) {
      const nj = (j + dir + n) % n;
      acc += Math.hypot(P[2 * nj] - P[2 * j], P[2 * nj + 1] - P[2 * j + 1]);
      j = nj;
    }
    return normalize(P[2 * j] - P[2 * i], P[2 * j + 1] - P[2 * i + 1]);
  }

  function fitClosedLoop(raw, tol, cornerSharp) {
    const P = dedupe(raw);
    const n = P.length / 2;
    if (n < 4) return null;
    const errSq = tol * tol;
    const arm = 2.5;
    const thr = cornerSharp <= 0 ? 99 : ((100 - cornerSharp * 0.6) * Math.PI) / 180;
    let corners = cornerSharp <= 0 ? [] : detectCorners(P, n, thr, arm);

    let splits;
    if (corners.length === 0) {
      splits = [{ i: 0, c: false }, { i: n >> 1, c: false }];
    } else if (corners.length === 1) {
      splits = [{ i: corners[0], c: true }, { i: (corners[0] + (n >> 1)) % n, c: false }];
    } else {
      splits = corners.map((i) => ({ i, c: true }));
    }

    const beziers = [];
    for (let s = 0; s < splits.length; s++) {
      const A = splits[s], B = splits[(s + 1) % splits.length];
      const seg = [];
      let i = A.i;
      seg.push(P[2 * i], P[2 * i + 1]);
      let guard = 0;
      do {
        i = (i + 1) % n;
        seg.push(P[2 * i], P[2 * i + 1]);
      } while (i !== B.i && guard++ < n + 1);
      const m = seg.length / 2;
      if (m < 2) continue;
      const segArr = Float64Array.from(seg);
      let t1, t2;
      if (A.c) t1 = tangentAt(P, n, A.i, +1, 1.6);
      else {
        const f = tangentAt(P, n, A.i, +1, 2), b = tangentAt(P, n, A.i, -1, 2);
        t1 = normalize(f[0] - b[0], f[1] - b[1]);
      }
      if (B.c) t2 = tangentAt(P, n, B.i, -1, 1.6);
      else {
        const f = tangentAt(P, n, B.i, +1, 2), b = tangentAt(P, n, B.i, -1, 2);
        const c = normalize(f[0] - b[0], f[1] - b[1]);
        t2 = [-c[0], -c[1]];
      }
      fitCubic(segArr, m, t1, t2, errSq, beziers);
    }
    return beziers;
  }

  const fmt = (v) => {
    const r = Math.round(v * 100) / 100;
    return Object.is(r, -0) ? "0" : String(r);
  };

  function pathData(beziers) {
    if (!beziers || !beziers.length) return "";
    let d = "M" + fmt(beziers[0][0]) + " " + fmt(beziers[0][1]);
    for (const b of beziers) {
      // segmento praticamente reto -> comando L (arquivo menor, retas perfeitas)
      const dx = b[6] - b[0], dy = b[7] - b[1];
      const len = Math.hypot(dx, dy) || 1e-9;
      const d1 = Math.abs((b[2] - b[0]) * dy - (b[3] - b[1]) * dx) / len;
      const d2 = Math.abs((b[4] - b[0]) * dy - (b[5] - b[1]) * dx) / len;
      if (d1 < 0.06 && d2 < 0.06) d += "L" + fmt(b[6]) + " " + fmt(b[7]);
      else d += "C" + fmt(b[2]) + " " + fmt(b[3]) + " " + fmt(b[4]) + " " + fmt(b[5]) + " " + fmt(b[6]) + " " + fmt(b[7]);
    }
    return d + "Z";
  }

  function polygonArea(P) {
    let a = 0;
    const n = P.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a += P[2 * i] * P[2 * j + 1] - P[2 * j] * P[2 * i + 1];
    }
    return Math.abs(a / 2);
  }

  function buildSvg(stage, base, p) {
    const { w, h, labels, palette } = stage;
    const K = palette.length;
    const order = [];
    for (let k = 0; k < K; k++) if (palette[k].count > 0) order.push(k);
    order.sort((a, b) => palette[b].count - palette[a].count);
    const rank = new Int16Array(K).fill(-1);
    order.forEach((k, r) => { rank[k] = r; });

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${base.ow}" height="${base.oh}" viewBox="0 0 ${w} ${h}">`;
    let paths = 0, nodes = 0;
    const sigma = Math.max(0.3, p.smooth);
    order.forEach((k, r) => {
      const loops = traceLayer(labels, rank, r, w, h, sigma);
      let dAttr = "";
      for (const lp of loops) {
        if (polygonArea(lp) < 1.2) continue;
        const bz = fitClosedLoop(lp, p.tolerance, p.corners);
        if (!bz || !bz.length) continue;
        dAttr += pathData(bz);
        nodes += bz.length;
      }
      if (dAttr) {
        svg += `<path fill="${palette[k].hex}" fill-rule="evenodd" d="${dAttr}"/>`;
        paths++;
      }
    });
    svg += "</svg>";
    return { svg, stats: { colors: order.length, paths, nodes, bytes: svg.length } };
  }

  // ---------------------------------------------------------------------------
  // SESSÃO (cache por estágio + desfazer/refazer)
  // ---------------------------------------------------------------------------
  class Session {
    constructor(source, params = {}) {
      this.source = source;
      this.params = { ...DEFAULTS, ...params };
      this.edits = [];
      this.redoStack = [];
      this._base = null;
      this._baseSide = null;
      this._stageA = null;
      this._aKey = null;
      this.stage = null;
      this.result = null;
    }

    get base() { return this._base; }

    setParams(patch) {
      const before = this._aKeyOf(this.params);
      Object.assign(this.params, patch);
      const changedA = before !== this._aKeyOf(this.params);
      if (changedA) { this.edits = []; this.redoStack = []; }
      return { stageA: changedA };
    }

    reset() {
      const keep = { maxSide: this.params.maxSide };
      this.params = { ...DEFAULTS, ...keep };
      this.edits = [];
      this.redoStack = [];
    }

    _aKeyOf(p) { return JSON.stringify(A_KEYS.map((k) => p[k])); }

    addEdit(op) { this.edits.push(op); this.redoStack = []; }
    addEdits(ops) { ops.forEach((o) => this.edits.push(o)); this.redoStack = []; }
    canUndo() { return this.edits.length > 0; }
    canRedo() { return this.redoStack.length > 0; }

    undo() {
      if (!this.edits.length) return false;
      // desfaz também "new" encadeado ao repintar
      const popped = [this.edits.pop()];
      while (this.edits.length && this.edits[this.edits.length - 1].t === "new" && popped[popped.length - 1].t === "region") {
        popped.push(this.edits.pop());
      }
      this.redoStack.push(popped.reverse());
      return true;
    }

    redo() {
      if (!this.redoStack.length) return false;
      this.redoStack.pop().forEach((o) => this.edits.push(o));
      return true;
    }

    labelAt(x, y) {
      if (!this.stage) return -1;
      const { w, h, labels } = this.stage;
      if (x < 0 || y < 0 || x >= w || y >= h) return -1;
      return labels[y * w + x];
    }

    regionAt(x, y) {
      if (!this.stage) return null;
      const { w, h, labels } = this.stage;
      if (x < 0 || y < 0 || x >= w || y >= h) return null;
      return floodRegion(labels, w, h, x, y);
    }

    run() {
      const p = this.params;
      if (!this._base || this._baseSide !== p.maxSide) {
        this._base = resample(this.source, p.maxSide);
        this._baseSide = p.maxSide;
        this._stageA = null;
      }
      const key = this._aKeyOf(p);
      if (!this._stageA || key !== this._aKey) {
        this._stageA = quantize(this._base, p);
        this._aKey = key;
      }
      this.stage = applyEdits(this._stageA, this.edits);
      const out = buildSvg(this.stage, this._base, p);
      this.result = {
        svg: out.svg,
        stats: out.stats,
        palette: this.stage.palette,
        w: this._base.w,
        h: this._base.h,
        ow: this._base.ow,
        oh: this._base.oh
      };
      return this.result;
    }
  }

  /** Atalho: vetoriza um canvas em uma chamada (sem UI). */
  function vectorize(canvas, opts = {}) {
    const s = new Session(canvas, opts);
    const r = s.run();
    return { svg: r.svg, stats: r.stats };
  }

  return { DEFAULTS, Session, vectorize, rgbToHex, hexToRgb };
})();

window.VectorEngine = VectorEngine;
