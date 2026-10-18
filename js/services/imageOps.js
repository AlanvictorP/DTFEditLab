/**
 * LATITUDE DTF COCKPIT - IMAGE OPS
 * Pipeline gráfico puro (sem estado global). Todas as funções recebem/retornam
 * ImageData ou Canvas, para rodar igual no preview, na exportação e (portado)
 * no backend Python/OpenCV (ver backend_architecture/image_pipeline.py).
 *
 *  - removeBackground : flood-fill pelas bordas + de-fringe (preserva pretos e sólidos)
 *  - blackKnockout    : preto -> alpha usando L* (Lab), com rampa de sombra
 *  - halftone         : retícula AM (ponto redondo, frequência + ângulo) aplicada
 *                       SOMENTE em gradientes de alpha; sólidos e bordas ficam intactos
 *  - vectorize        : quantização (median-cut + k-means) + tracing + simplificação
 *  - recolor          : troca de cor por HSV (usado pelo Copilot local)
 */
const ImageOps = (() => {
  // ---------------------------------------------------------------------------
  // Utilidades de cor
  // ---------------------------------------------------------------------------
  const SRGB_LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    SRGB_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  /** Luminosidade perceptual L* (0..100) de um pixel sRGB. */
  function labL(r, g, b) {
    const y = 0.2126 * SRGB_LIN[r] + 0.7152 * SRGB_LIN[g] + 0.0722 * SRGB_LIN[b];
    return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, max === 0 ? 0 : d / max, max];
  }

  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function cloneCanvas(src) {
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    c.getContext("2d", { willReadFrequently: true }).drawImage(src, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------------------
  // 1. TRATAMENTO DE BORDAS: CHOKE (EROSÃO) & DE-FRINGE (DESCONTAMINAÇÃO)
  // ---------------------------------------------------------------------------
  /**
   * Elimina halos e "restos de preto" ao redor da estampa:
   * 1) Choke: Encolhe a máscara alpha em N pixels (elimina a linha preta de transição).
   * 2) De-Fringe: Detecta pixels de borda contaminados por fundo escuro e substitui
   *    pela cor pura dos pixels sólidos vizinhos da arte.
   */
  function applyChokeAndDefringe(d, w, h, chokePx = 1, matteColor = [0, 0, 0]) {
    // 1. Choke (Erosão morfológica de arestas)
    for (let step = 0; step < chokePx; step++) {
      const toErode = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const p = i * 4;
          if (d[p + 3] === 0) continue;

          // Pixel encosta em transparência
          const isEdge =
            (x > 0 && d[(i - 1) * 4 + 3] === 0) ||
            (x < w - 1 && d[(i + 1) * 4 + 3] === 0) ||
            (y > 0 && d[(i - w) * 4 + 3] === 0) ||
            (y < h - 1 && d[(i + w) * 4 + 3] === 0);

          if (isEdge) {
            toErode.push(p);
          }
        }
      }
      for (let k = 0; k < toErode.length; k++) {
        d[toErode[k] + 3] = 0;
      }
    }

    // 2. De-Fringe inteligente (Descontaminação de cor nas novas bordas)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const p = i * 4;
        if (d[p + 3] === 0) continue;

        const touchesTransp =
          d[(i - 1) * 4 + 3] === 0 || d[(i + 1) * 4 + 3] === 0 ||
          d[(i - w) * 4 + 3] === 0 || d[(i + w) * 4 + 3] === 0;

        if (touchesTransp) {
          let sr = 0, sg = 0, sb = 0, count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const np = ((y + dy) * w + (x + dx)) * 4;
              if (d[np + 3] > 180) {
                sr += d[np];
                sg += d[np + 1];
                sb += d[np + 2];
                count++;
              }
            }
          }

          if (count > 0) {
            const avgR = sr / count, avgG = sg / count, avgB = sb / count;
            const lCurr = labL(d[p], d[p + 1], d[p + 2]);
            const lSolid = labL(avgR, avgG, avgB);

            // Se o pixel de borda estava escurecido pelo matte preto residual
            if (lCurr < lSolid * 0.75) {
              d[p] = Math.round(avgR);
              d[p + 1] = Math.round(avgG);
              d[p + 2] = Math.round(avgB);
            }
          }
        }
      }
    }
  }

  /**
   * Limpa bordas da imagem atual no canvas: aplica choke (encolhimento) e de-fringe.
   */
  function cleanEdges(srcCanvas, opts = {}) {
    const choke = opts.choke ?? 1;
    const w = srcCanvas.width, h = srcCanvas.height;
    const out = cloneCanvas(srcCanvas);
    const ctx = out.getContext("2d", { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, w, h);
    applyChokeAndDefringe(img.data, w, h, choke);
    ctx.putImageData(img, 0, 0);
    return out;
  }

  // ---------------------------------------------------------------------------
  // 2. REMOVER FUNDO INTELIGENTE (BORDAS EXTERNAS + ILHAS/VAZADOS + CHOKE)
  // ---------------------------------------------------------------------------
  function removeBackground(srcCanvas, opts = {}) {
    const tol = opts.tolerance ?? 35;
    const includeIslands = opts.includeIslands ?? false;
    const choke = opts.choke ?? 1;
    const w = srcCanvas.width, h = srcCanvas.height;
    const out = cloneCanvas(srcCanvas);
    const ctx = out.getContext("2d", { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    // Amostra cor de fundo dominante na borda externa
    const buckets = new Map();
    let total = 0, transparent = 0;
    const sample = (x, y) => {
      const i = (y * w + x) * 4;
      total++;
      if (d[i + 3] < 16) { transparent++; return; }
      const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      const b = buckets.get(key);
      if (b) { b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; }
      else buckets.set(key, { n: 1, r: d[i], g: d[i + 1], b: d[i + 2] });
    };
    for (let x = 0; x < w; x++) { sample(x, 0); sample(x, h - 1); }
    for (let y = 1; y < h - 1; y++) { sample(0, y); sample(w - 1, y); }

    if (transparent / total > 0.6) {
      return { canvas: out, removedPct: 0, alreadyTransparent: true, bg: null };
    }
    let best = null;
    buckets.forEach((b) => { if (!best || b.n > best.n) best = b; });
    if (!best) return { canvas: out, removedPct: 0, alreadyTransparent: true, bg: null };
    const bg = [best.r / best.n, best.g / best.n, best.b / best.n];

    const removed = new Uint8Array(w * h);
    const tol2 = tol * tol;
    const isBg = (i) => {
      const p = i * 4;
      if (d[p + 3] < 16) return true;
      const dr = d[p] - bg[0], dg = d[p + 1] - bg[1], db = d[p + 2] - bg[2];
      return dr * dr + dg * dg + db * db <= tol2;
    };

    if (includeIslands) {
      // Modo Global: Remove o fundo da borda e também TODAS as ilhas/vazados internos com essa cor
      for (let i = 0; i < w * h; i++) {
        if (isBg(i)) {
          removed[i] = 1;
        }
      }
    } else {
      // Modo Conectado: Flood fill 4-way a partir das bordas
      const queue = new Int32Array(w * h);
      let qh = 0, qt = 0;
      const push = (i) => {
        if (!removed[i] && isBg(i)) { removed[i] = 1; queue[qt++] = i; }
      };
      for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
      while (qh < qt) {
        const i = queue[qh++];
        const x = i % w, y = (i / w) | 0;
        if (x > 0) push(i - 1);
        if (x < w - 1) push(i + 1);
        if (y > 0) push(i - w);
        if (y < h - 1) push(i + w);
      }
    }

    let removedCount = 0;
    for (let i = 0; i < w * h; i++) {
      if (removed[i]) {
        d[i * 4 + 3] = 0;
        removedCount++;
      }
    }

    // Tratamento de bordas morfológico (Choke + De-fringe)
    if (choke > 0) {
      applyChokeAndDefringe(d, w, h, choke, bg);
    }

    ctx.putImageData(img, 0, 0);
    return { canvas: out, removedPct: (removedCount / (w * h)) * 100, alreadyTransparent: false, bg };
  }

  // ---------------------------------------------------------------------------
  // 3. VARINHA MÁGICA (SELEÇÃO E REMOÇÃO POR CLIQUE COM CHOKE DE BORDA)
  // ---------------------------------------------------------------------------
  /**
   * Clica em qualquer ponto da imagem (ex: ilha preta entre os chifres do DOOM)
   * e apaga a área correspondente com sensibilidade configurável e limpeza de borda.
   */
  function magicWand(srcCanvas, startX, startY, opts = {}) {
    const tol = opts.tolerance ?? 35;
    const contiguous = opts.contiguous ?? true;
    const choke = opts.choke ?? 1;
    const w = srcCanvas.width, h = srcCanvas.height;
    if (startX < 0 || startX >= w || startY < 0 || startY >= h) return srcCanvas;

    const out = cloneCanvas(srcCanvas);
    const ctx = out.getContext("2d", { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    const targetIdx = (startY * w + startX) * 4;
    if (d[targetIdx + 3] < 10) {
      return out; // Já transparente
    }
    const tr = d[targetIdx], tg = d[targetIdx + 1], tb = d[targetIdx + 2];
    const tol2 = tol * tol;
    const removed = new Uint8Array(w * h);

    if (contiguous) {
      // Flood fill local a partir do ponto clicado
      const queue = new Int32Array(w * h);
      let qh = 0, qt = 0;
      const startI = startY * w + startX;
      removed[startI] = 1;
      queue[qt++] = startI;

      const isMatch = (i) => {
        const p = i * 4;
        if (d[p + 3] < 16) return false;
        const dr = d[p] - tr, dg = d[p + 1] - tg, db = d[p + 2] - tb;
        return dr * dr + dg * dg + db * db <= tol2;
      };

      while (qh < qt) {
        const i = queue[qh++];
        const x = i % w, y = (i / w) | 0;
        if (x > 0 && !removed[i - 1] && isMatch(i - 1)) { removed[i - 1] = 1; queue[qt++] = i - 1; }
        if (x < w - 1 && !removed[i + 1] && isMatch(i + 1)) { removed[i + 1] = 1; queue[qt++] = i + 1; }
        if (y > 0 && !removed[i - w] && isMatch(i - w)) { removed[i - w] = 1; queue[qt++] = i - w; }
        if (y < h - 1 && !removed[i + w] && isMatch(i + w)) { removed[i + w] = 1; queue[qt++] = i + w; }
      }
    } else {
      // Global: apaga aquela cor em toda a imagem
      for (let i = 0; i < w * h; i++) {
        const p = i * 4;
        if (d[p + 3] < 16) continue;
        const dr = d[p] - tr, dg = d[p + 1] - tg, db = d[p + 2] - tb;
        if (dr * dr + dg * dg + db * db <= tol2) {
          removed[i] = 1;
        }
      }
    }

    for (let i = 0; i < w * h; i++) {
      if (removed[i]) {
        d[i * 4 + 3] = 0;
      }
    }

    if (choke > 0) {
      applyChokeAndDefringe(d, w, h, choke, [tr, tg, tb]);
    }

    ctx.putImageData(img, 0, 0);
    return out;
  }

  // ---------------------------------------------------------------------------
  // 2. KNOCKOUT DE PRETO (em L* - Lab)
  // ---------------------------------------------------------------------------
  /**
   * Converte luminosidade escura em transparência. threshold/feather vêm do
   * slider (escala 0..255) e são convertidos para L* (0..100).
   * O resultado é a "máscara de luminosidade/transparência" que alimenta o halftone.
   */
  function blackKnockout(img, { threshold = 28, feather = 15 } = {}) {
    const d = img.data;
    const lThr = threshold / 2.55;
    const lFea = Math.max(0.5, feather / 2.55);
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a === 0) continue;
      const L = labL(d[i], d[i + 1], d[i + 2]);
      if (L <= lThr) d[i + 3] = 0;
      else if (L < lThr + lFea) d[i + 3] = Math.round(a * ((L - lThr) / lFea));
    }
  }

  // ---------------------------------------------------------------------------
  // 2.1 KNOCKOUT TOTAL DE BRANCO (em L* - Lab para Camiseta Branca)
  // ---------------------------------------------------------------------------
  /**
   * Converte toda luminosidade branca (externa e interna) em transparência.
   * Elimina placa de borracha em camiseta branca (toque zero e economia de tinta).
   */
  function whiteKnockout(img, { threshold = 88, feather = 12 } = {}) {
    const d = img.data;
    const lThr = threshold; // 0..100 L*
    const lFea = Math.max(0.5, feather);
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a === 0) continue;
      const L = labL(d[i], d[i + 1], d[i + 2]);
      if (L >= lThr + lFea) {
        d[i + 3] = 0;
      } else if (L > lThr) {
        const factor = (lThr + lFea - L) / lFea;
        d[i + 3] = Math.round(a * Math.max(0, Math.min(1, factor)));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2.2 REMOVER FUNDO BRANCO DE CONTORNO (COM SUAVIZAÇÃO DE BORDAS)
  // ---------------------------------------------------------------------------
  /**
   * Remove apenas o fundo branco externo conectado às bordas da imagem,
   * preservando 100% intactos os elementos brancos internos (olhos, dentes, letras),
   * e aplicando suavização anti-serrilhado (anti-aliasing feather) nas arestas de corte.
   */
  function removeWhiteBackgroundContour(srcCanvas, opts = {}) {
    const tol = opts.tolerance ?? 35;
    const smoothing = opts.smoothing ?? 2;
    const choke = opts.choke ?? 1;
    const w = srcCanvas.width, h = srcCanvas.height;
    const out = cloneCanvas(srcCanvas);
    const ctx = out.getContext("2d", { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    const removed = new Uint8Array(w * h);
    const tol2 = tol * tol * 3;

    // Critério para pixel ser considerado fundo branco conectado
    const isWhiteBg = (i) => {
      const p = i * 4;
      if (d[p + 3] < 16) return true;
      const dr = 255 - d[p], dg = 255 - d[p + 1], db = 255 - d[p + 2];
      return (dr * dr + dg * dg + db * db) <= tol2;
    };

    // Flood fill 4-way estritamente a partir das 4 bordas externas
    const queue = new Int32Array(w * h);
    let qh = 0, qt = 0;
    const push = (i) => {
      if (!removed[i] && isWhiteBg(i)) {
        removed[i] = 1;
        queue[qt++] = i;
      }
    };

    for (let x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }

    while (qh < qt) {
      const i = queue[qh++];
      const x = i % w, y = (i / w) | 0;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }

    // Identifica pixels de fronteira para suavização anti-serrilhado
    const boundary = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (removed[i]) continue;

        const touchesBg =
          removed[i - 1] || removed[i + 1] ||
          removed[i - w] || removed[i + w] ||
          removed[i - w - 1] || removed[i - w + 1] ||
          removed[i + w - 1] || removed[i + w + 1];

        if (touchesBg) {
          boundary[i] = 1;
        }
      }
    }

    if (smoothing >= 2) {
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (removed[i] || boundary[i]) continue;
          if (boundary[i - 1] || boundary[i + 1] || boundary[i - w] || boundary[i + w]) {
            boundary[i] = 2;
          }
        }
      }
    }

    // 1. Zera o canal alfa do fundo branco externo
    let removedCount = 0;
    for (let i = 0; i < w * h; i++) {
      if (removed[i]) {
        d[i * 4 + 3] = 0;
        removedCount++;
      }
    }

    // 2. Aplica suavização anti-serrilhado (Anti-Aliasing Feather) e descontaminação de borda
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const bLevel = boundary[i];
        if (!bLevel) continue;

        const p = i * 4;
        const origA = d[p + 3];
        if (origA === 0) continue;

        let bgNeighbors = 0;
        let solidR = 0, solidG = 0, solidB = 0, solidCount = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ni = (y + dy) * w + (x + dx);
            if (removed[ni]) {
              bgNeighbors++;
            } else {
              const np = ni * 4;
              solidR += d[np];
              solidG += d[np + 1];
              solidB += d[np + 2];
              solidCount++;
            }
          }
        }

        if (bgNeighbors > 0) {
          const fadeRatio = 1.0 - (bgNeighbors / 8.0) * (bLevel === 1 ? 0.65 : 0.35);
          d[p + 3] = Math.round(origA * Math.max(0.18, Math.min(1.0, fadeRatio)));

          if (solidCount > 0) {
            const avgR = solidR / solidCount;
            const avgG = solidG / solidCount;
            const avgB = solidB / solidCount;

            const blend = bLevel === 1 ? 0.45 : 0.25;
            d[p] = Math.round(d[p] * (1 - blend) + avgR * blend);
            d[p + 1] = Math.round(d[p + 1] * (1 - blend) + avgG * blend);
            d[p + 2] = Math.round(d[p + 2] * (1 - blend) + avgB * blend);
          }
        }
      }
    }

    if (choke > 0) {
      applyChokeAndDefringe(d, w, h, choke, [255, 255, 255]);
    }

    ctx.putImageData(img, 0, 0);
    return {
      canvas: out,
      removedPct: Math.round((removedCount / (w * h)) * 100),
      bg: [255, 255, 255]
    };
  }

  // ---------------------------------------------------------------------------
  // 3. HALFTONE (fluxo Photoshop: máscara -> bitmap/retícula só nos gradientes)
  // ---------------------------------------------------------------------------
  let _spotSorted = null;
  /** Função de ponto redondo + tabela de equalização (cobertura -> limiar). */
  function spotThresholds() {
    if (_spotSorted) return _spotSorted;
    const N = 64;
    const arr = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N, v = (j + 0.5) / N;
        arr[j * N + i] = 0.5 + 0.25 * (Math.cos(2 * Math.PI * u) + Math.cos(2 * Math.PI * v));
      }
    }
    arr.sort();
    _spotSorted = arr;
    return arr;
  }

  function rangeFilter(src, w, h, r) {
    const n = w * h;
    const tmpMin = new Uint8Array(n), tmpMax = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let lo = 255, hi = 0;
        const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
        for (let k = x0; k <= x1; k++) {
          const v = src[row + k];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        tmpMin[row + x] = lo;
        tmpMax[row + x] = hi;
      }
    }
    const outMin = new Uint8Array(n), outMax = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      for (let x = 0; x < w; x++) {
        let lo = 255, hi = 0;
        for (let k = y0; k <= y1; k++) {
          const i = k * w + x;
          if (tmpMin[i] < lo) lo = tmpMin[i];
          if (tmpMax[i] > hi) hi = tmpMax[i];
        }
        outMin[y * w + x] = lo;
        outMax[y * w + x] = hi;
      }
    }
    return { min: outMin, max: outMax };
  }

  /**
   * @param img        ImageData (RGBA) - alpha já contém a máscara (fades / knockout)
   * @param pitchPx    distância entre pontos em pixels (= 1 / LPI convertido)
   * @param angleDeg   ângulo da retícula
   * @param edgeRadius raio (px) para distinguir borda anti-aliased de gradiente
   * @returns {{halftonedPx:number}} quantidade de pixels convertidos em pontos
   */
  function halftone(img, { pitchPx, angleDeg = 45, edgeRadius = 2 }) {
    const w = img.width, h = img.height, d = img.data, n = w * h;
    const alpha = new Uint8Array(n);
    let partial = 0;
    for (let i = 0; i < n; i++) {
      const a = d[i * 4 + 3];
      alpha[i] = a;
      if (a > 0 && a < 250) partial++;
    }
    if (partial === 0) return { halftonedPx: 0 };

    const { min, max } = rangeFilter(alpha, w, h, Math.max(1, edgeRadius));
    const lut = spotThresholds();
    const N = lut.length;
    const th = (angleDeg * Math.PI) / 180;
    const cs = Math.cos(th), sn = Math.sin(th);
    const pitch = Math.max(pitchPx, 0.75);
    const inv = 1 / pitch;
    const soft = Math.max(0.03, Math.min(0.6, 2.2 / Math.max(pitch, 1)));
    const TWO_PI = 2 * Math.PI;
    let count = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const a = alpha[idx];
        if (a === 0) continue;
        if (a >= 250) { d[idx * 4 + 3] = 255; continue; } // sólido: intacto
        if (max[idx] - min[idx] >= 140) continue;          // borda anti-aliased: intacta

        const c = a / 255;
        const t = lut[Math.min(N - 1, Math.floor((1 - c) * (N - 1)))];
        const u = (x * cs + y * sn) * inv;
        const v = (-x * sn + y * cs) * inv;
        const spot = 0.5 + 0.25 * (Math.cos(TWO_PI * u) + Math.cos(TWO_PI * v));
        let val = (spot - t) / soft + 0.5;
        if (c < 0.04) val *= c / 0.04; // sombras muito leves somem em vez de virar pontinhos
        d[idx * 4 + 3] = val <= 0 ? 0 : val >= 1 ? 255 : Math.round(val * 255);
        count++;
      }
    }
    return { halftonedPx: count };
  }

  // ---------------------------------------------------------------------------
  // 4. FILTROS DE QUALIDADE
  // ---------------------------------------------------------------------------
  function unsharp(img, strengthPct) {
    const w = img.width, h = img.height, d = img.data;
    const k = (strengthPct / 100) * 0.45;
    const src = new Uint8ClampedArray(d);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3] === 0) continue;
        const t = i - w * 4, b = i + w * 4, l = i - 4, r = i + 4;
        for (let c = 0; c < 3; c++) {
          d[i + c] = src[i + c] + k * (4 * src[i + c] - src[t + c] - src[b + c] - src[l + c] - src[r + c]);
        }
      }
    }
  }

  /** Denoise bilateral (preserva bordas; remove blocos JPEG). */
  function denoise(img, strengthPct) {
    const w = img.width, h = img.height, d = img.data;
    const r = strengthPct > 55 ? 2 : 1;
    const sigma = 18 + strengthPct * 0.5;
    const lut = new Float32Array(3 * 255 * 255 / 64 + 2);
    for (let i = 0; i < lut.length; i++) lut[i] = Math.exp(-(i * 64) / (2 * sigma * sigma));
    const mix = (strengthPct / 100) * 0.85;
    const src = new Uint8ClampedArray(d);
    for (let y = r; y < h - r; y++) {
      for (let x = r; x < w - r; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3] === 0) continue;
        const cr = src[i], cg = src[i + 1], cb = src[i + 2];
        let sr = 0, sg = 0, sb = 0, sw = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const j = i + (dy * w + dx) * 4;
            if (src[j + 3] === 0) continue;
            const dr = src[j] - cr, dg = src[j + 1] - cg, db = src[j + 2] - cb;
            const wt = lut[(dr * dr + dg * dg + db * db) >> 6] / (1 + (dx * dx + dy * dy) * 0.3);
            sr += src[j] * wt; sg += src[j + 1] * wt; sb += src[j + 2] * wt; sw += wt;
          }
        }
        if (sw > 0) {
          d[i] = cr * (1 - mix) + (sr / sw) * mix;
          d[i + 1] = cg * (1 - mix) + (sg / sw) * mix;
          d[i + 2] = cb * (1 - mix) + (sb / sw) * mix;
        }
      }
    }
  }

  function vibrance(img, boostPct) {
    const d = img.data;
    const f = (boostPct / 100) * 0.5;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const max = Math.max(r, g, b);
      const amt = ((Math.abs(max - (r + g + b) / 3) * 2) / 255) * f;
      let nr = r + (max - r) * amt, ng = g + (max - g) * amt, nb = b + (max - b) * amt;
      const curve = (v) => {
        v = Math.max(0, Math.min(1, v / 255));
        const s = v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
        return (v * (1 - f) + s * f) * 255;
      };
      d[i] = curve(nr); d[i + 1] = curve(ng); d[i + 2] = curve(nb);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. VETORIZAÇÃO REAL (raster -> curvas)
  // ---------------------------------------------------------------------------
  function medianCut(samples, k) {
    let boxes = [samples];
    while (boxes.length < k) {
      let bi = -1, bestScore = 0;
      boxes.forEach((b, i) => {
        if (b.length < 2) return;
        let lo = [255, 255, 255], hi = [0, 0, 0];
        for (const p of b) for (let c = 0; c < 3; c++) { if (p[c] < lo[c]) lo[c] = p[c]; if (p[c] > hi[c]) hi[c] = p[c]; }
        const range = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
        const score = range * Math.sqrt(b.length);
        if (score > bestScore) { bestScore = score; bi = i; }
      });
      if (bi < 0) break;
      const b = boxes[bi];
      let lo = [255, 255, 255], hi = [0, 0, 0];
      for (const p of b) for (let c = 0; c < 3; c++) { if (p[c] < lo[c]) lo[c] = p[c]; if (p[c] > hi[c]) hi[c] = p[c]; }
      const ch = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].indexOf(Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
      b.sort((p, q) => p[ch] - q[ch]);
      const mid = b.length >> 1;
      boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
    }
    return boxes.filter((b) => b.length).map((b) => {
      let r = 0, g = 0, bl = 0;
      for (const p of b) { r += p[0]; g += p[1]; bl += p[2]; }
      return [r / b.length, g / b.length, bl / b.length];
    });
  }

  function nearest(palette, r, g, b) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bd) { bd = dist; bi = i; }
    }
    return bi;
  }

  /** Marching por arestas de pixel: devolve laços fechados [x0,y0,x1,y1,...]. */
  function traceMask(mask, w, h) {
    const W = w + 1;
    const outA = new Int32Array(W * (h + 1)).fill(-1);
    const outB = new Int32Array(W * (h + 1)).fill(-1);
    const add = (a, b) => { if (outA[a] < 0) outA[a] = b; else outB[a] = b; };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        const tl = y * W + x, tr = tl + 1, bl = (y + 1) * W + x, br = bl + 1;
        if (y === 0 || !mask[(y - 1) * w + x]) add(tl, tr);
        if (x === w - 1 || !mask[y * w + x + 1]) add(tr, br);
        if (y === h - 1 || !mask[(y + 1) * w + x]) add(br, bl);
        if (x === 0 || !mask[y * w + x - 1]) add(bl, tl);
      }
    }
    const loops = [];
    for (let v = 0; v < outA.length; v++) {
      while (outA[v] >= 0 || outB[v] >= 0) {
        const pts = [];
        let cur = v;
        do {
          pts.push(cur % W, (cur / W) | 0);
          let next;
          if (outA[cur] >= 0) { next = outA[cur]; outA[cur] = -1; }
          else { next = outB[cur]; outB[cur] = -1; }
          cur = next;
        } while (cur !== v && cur >= 0);
        loops.push(pts);
      }
    }
    return loops;
  }

  function polygonArea(p) {
    let a = 0;
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
    }
    return Math.abs(a / 2);
  }

  function dpOpen(p, eps) {
    const n = p.length / 2;
    if (n < 3) return Array.from({ length: n }, (_, i) => i);
    const keep = new Uint8Array(n);
    keep[0] = 1; keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      const x1 = p[2 * s], y1 = p[2 * s + 1], x2 = p[2 * e], y2 = p[2 * e + 1];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1e-9;
      let md = 0, mi = -1;
      for (let i = s + 1; i < e; i++) {
        const dist = Math.abs(dy * p[2 * i] - dx * p[2 * i + 1] + x2 * y1 - y2 * x1) / len;
        if (dist > md) { md = dist; mi = i; }
      }
      if (md > eps && mi >= 0) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
    }
    const idx = [];
    for (let i = 0; i < n; i++) if (keep[i]) idx.push(i);
    return idx;
  }

  function simplifyClosed(p, eps) {
    const n = p.length / 2;
    if (n < 8) return p;
    let far = 0, fd = 0;
    for (let i = 1; i < n; i++) {
      const dd = (p[2 * i] - p[0]) ** 2 + (p[2 * i + 1] - p[1]) ** 2;
      if (dd > fd) { fd = dd; far = i; }
    }
    const a = [], b = [];
    for (let i = 0; i <= far; i++) a.push(p[2 * i], p[2 * i + 1]);
    for (let i = far; i <= n; i++) b.push(p[2 * (i % n)], p[2 * (i % n) + 1]);
    const ia = dpOpen(a, eps), ib = dpOpen(b, eps);
    const out = [];
    ia.slice(0, -1).forEach((i) => out.push(a[2 * i], a[2 * i + 1]));
    ib.slice(0, -1).forEach((i) => out.push(b[2 * i], b[2 * i + 1]));
    return out;
  }

  function pathFromPoints(P, sx, sy) {
    const n = P.length / 2;
    if (n < 3) return "";
    const f = (v) => Math.round(v * 10) / 10;
    const X = (i) => P[2 * ((i + n) % n)] * sx;
    const Y = (i) => P[2 * ((i + n) % n) + 1] * sy;
    const mid = (i) => [(X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2];
    const smooth = (i) => {
      const v1x = P[2 * i] - P[2 * ((i - 1 + n) % n)], v1y = P[2 * i + 1] - P[2 * ((i - 1 + n) % n) + 1];
      const v2x = P[2 * ((i + 1) % n)] - P[2 * i], v2y = P[2 * ((i + 1) % n) + 1] - P[2 * i + 1];
      const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
      return l1 < 10 && l2 < 10 && (v1x * v2x + v1y * v2y) / (l1 * l2 || 1) > 0.45;
    };
    const m0 = mid(n - 1);
    let d = `M${f(m0[0])} ${f(m0[1])}`;
    for (let i = 0; i < n; i++) {
      const m = mid(i);
      if (smooth(i)) d += `Q${f(X(i))} ${f(Y(i))} ${f(m[0])} ${f(m[1])}`;
      else d += `L${f(X(i))} ${f(Y(i))}L${f(m[0])} ${f(m[1])}`;
    }
    return d + "Z";
  }

  /**
   * Converte o canvas em SVG de camadas empilhadas (sem frestas entre cores).
   * Ideal para logos, tipografia e arte chapada (anime/mangá/streetwear).
   */
  function vectorize(srcCanvas, opts = {}) {
    const colors = Math.max(2, Math.min(32, opts.colors ?? 12));
    const maxSide = opts.maxSide ?? 900;
    const eps = opts.simplify ?? 0.9;
    const minArea = opts.minArea ?? 5;
    const ow = srcCanvas.width, oh = srcCanvas.height;
    const sc = Math.min(1, maxSide / Math.max(ow, oh));
    const w = Math.max(2, Math.round(ow * sc)), h = Math.max(2, Math.round(oh * sc));
    const work = document.createElement("canvas");
    work.width = w; work.height = h;
    const wctx = work.getContext("2d", { willReadFrequently: true });
    wctx.imageSmoothingQuality = "high";
    wctx.drawImage(srcCanvas, 0, 0, w, h);
    const d = wctx.getImageData(0, 0, w, h).data;
    const n = w * h;

    // amostragem para paleta
    const samples = [];
    const stepS = Math.max(1, Math.floor(n / 60000));
    for (let i = 0; i < n; i += stepS) if (d[i * 4 + 3] >= 128) samples.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
    if (samples.length === 0) return { svg: "", stats: { colors: 0, paths: 0, points: 0 } };
    let palette = medianCut(samples, colors);
    for (let it = 0; it < 3; it++) {
      const acc = palette.map(() => [0, 0, 0, 0]);
      samples.forEach((p) => { const k = nearest(palette, p[0], p[1], p[2]); acc[k][0] += p[0]; acc[k][1] += p[1]; acc[k][2] += p[2]; acc[k][3]++; });
      palette = palette.map((p, i) => (acc[i][3] ? [acc[i][0] / acc[i][3], acc[i][1] / acc[i][3], acc[i][2] / acc[i][3]] : p));
    }

    // rótulos por pixel (-1 = transparente)
    let labels = new Int16Array(n).fill(-1);
    const cache = new Map();
    for (let i = 0; i < n; i++) {
      if (d[i * 4 + 3] < 128) continue;
      const key = ((d[i * 4] >> 2) << 12) | ((d[i * 4 + 1] >> 2) << 6) | (d[i * 4 + 2] >> 2);
      let k = cache.get(key);
      if (k === undefined) { k = nearest(palette, d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); cache.set(key, k); }
      labels[i] = k;
    }

    // filtro de maioria 3x3 (remove ruído isolado)
    const K = palette.length;
    const smoothed = new Int16Array(labels);
    const counts = new Int32Array(K);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (labels[i] < 0) continue;
        counts.fill(0);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const l = labels[i + dy * w + dx]; if (l >= 0) counts[l]++; }
        let bk = labels[i], bc = counts[bk];
        for (let k = 0; k < K; k++) if (counts[k] > bc) { bc = counts[k]; bk = k; }
        smoothed[i] = bk;
      }
    }
    labels = smoothed;

    // ordem: maior área primeiro; camada r cobre todos com rank >= r
    const area = new Int32Array(K);
    for (let i = 0; i < n; i++) if (labels[i] >= 0) area[labels[i]]++;
    const order = Array.from({ length: K }, (_, i) => i).filter((k) => area[k] > 0).sort((a, b) => area[b] - area[a]);
    const rank = new Int16Array(K).fill(-1);
    order.forEach((k, r) => { rank[k] = r; });

    const sx = ow / w, sy = oh / h;
    let paths = 0, points = 0;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ow}" height="${oh}" viewBox="0 0 ${ow} ${oh}" shape-rendering="geometricPrecision">`;
    const mask = new Uint8Array(n);
    order.forEach((k, r) => {
      for (let i = 0; i < n; i++) mask[i] = labels[i] >= 0 && rank[labels[i]] >= r ? 1 : 0;
      const loops = traceMask(mask, w, h);
      let dAttr = "";
      loops.forEach((lp) => {
        if (polygonArea(lp) < minArea) return;
        const s = simplifyClosed(lp, eps);
        if (s.length < 6) return;
        dAttr += pathFromPoints(s, sx, sy);
        points += s.length / 2;
      });
      if (dAttr) {
        const c = palette[k].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
        svg += `<path fill="#${c}" fill-rule="evenodd" d="${dAttr}"/>`;
        paths++;
      }
    });
    svg += "</svg>";
    return { svg, stats: { colors: order.length, paths, points: Math.round(points) } };
  }

  function prepareSvgForRasterization(svgString, targetW, targetH) {
    if (!svgString || typeof svgString !== "string") return svgString;
    let s = svgString.trim();

    // Garante que exista viewBox para escalabilidade matemática pura
    const hasViewBox = /viewBox=["']?([^"'>]+)["']?/i.test(s);
    if (!hasViewBox) {
      const wMatch = s.match(/\bwidth=["']?([0-9.]+)(?:px)?["']?/i);
      const hMatch = s.match(/\bheight=["']?([0-9.]+)(?:px)?["']?/i);
      const origW = wMatch ? parseFloat(wMatch[1]) : targetW;
      const origH = hMatch ? parseFloat(hMatch[1]) : targetH;
      s = s.replace(/<svg\b([^>]*)>/i, `<svg$1 viewBox="0 0 ${origW} ${origH}">`);
    }

    // Força o elemento <svg> a ter width e height iguais à resolução de renderização alvo (Ultra-DPI)
    // Isso impede que o motor do navegador faça rasterização interna de baixa resolução (ex: 500px ou 800px)
    // e depois estique bilinearmente os pixels, mantendo as curvas Bézier 100% nítidas e antisserrilhadas.
    s = s.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
      let cleanAttrs = attrs
        .replace(/\bwidth=["'][^"']*["']/gi, "")
        .replace(/\bheight=["'][^"']*["']/gi, "")
        .replace(/\bshape-rendering=["'][^"']*["']/gi, "");
      return `<svg width="${Math.round(targetW)}" height="${Math.round(targetH)}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision"${cleanAttrs}>`;
    });

    return s;
  }

  function rasterizeSvg(svgString, width, height) {
    return new Promise((resolve, reject) => {
      const preparedSvg = prepareSvgForRasterization(svgString, width, height);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);
        resolve(c);
      };
      img.onerror = () => reject(new Error("Falha ao rasterizar SVG"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(preparedSvg);
    });
  }

  // ---------------------------------------------------------------------------
  // 6. RECOLOR POR HSV (Copilot local)
  // ---------------------------------------------------------------------------
  const COLOR_TABLE = {
    vermelho: { kind: "hue", h: 0 }, laranja: { kind: "hue", h: 28 }, amarelo: { kind: "hue", h: 52 },
    dourado: { kind: "hue", h: 45 }, verde: { kind: "hue", h: 125 }, ciano: { kind: "hue", h: 180 },
    azul: { kind: "hue", h: 215 }, roxo: { kind: "hue", h: 275 }, violeta: { kind: "hue", h: 270 },
    magenta: { kind: "hue", h: 300 }, rosa: { kind: "hue", h: 330 },
    preto: { kind: "black" }, branco: { kind: "white" }, cinza: { kind: "gray" }
  };

  function hueDist(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  function recolor(img, from, to, tol = 30) {
    const d = img.data;
    let changed = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const [h, s, v] = rgbToHsv(d[i], d[i + 1], d[i + 2]);
      let hit = false;
      if (from.kind === "hue") hit = s > 0.25 && v > 0.18 && hueDist(h, from.h) <= tol;
      else if (from.kind === "black") hit = v < 0.2;
      else if (from.kind === "white") hit = v > 0.82 && s < 0.2;
      else if (from.kind === "gray") hit = s < 0.12 && v > 0.25 && v < 0.8;
      if (!hit) continue;
      let nh = h, ns = s, nv = v;
      if (to.kind === "hue") {
        nh = from.kind === "hue" ? to.h + (h - from.h) * 0.35 : to.h;
        ns = from.kind === "hue" ? s : 0.85;
        nv = from.kind === "hue" ? v : Math.max(v, 0.55);
      } else if (to.kind === "black") { ns = s * 0.3; nv = v * 0.18; }
      else if (to.kind === "white") { ns = s * 0.1; nv = 0.8 + 0.2 * v; }
      else { ns = s * 0.1; nv = 0.3 + 0.4 * v; }
      const [r, g, b] = hsvToRgb(nh, Math.min(1, ns), Math.min(1, nv));
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
      changed++;
    }
    return changed;
  }

  // ---------------------------------------------------------------------------
  // 7. AUTO-TRIM / APARAR BORDAS TRANSPARENTES (PREPRESS & ROLO DTF)
  // ---------------------------------------------------------------------------
  /**
   * Encontra o Bounding Box exato dos pixels com conteúdo visível (alpha > threshold).
   * Permite calcular as dimensões reais da estampa sem o fundo vazio.
   */
  function getAlphaBoundingBox(srcCanvasOrImageData, alphaThreshold = 8) {
    let w, h, data;
    if (srcCanvasOrImageData instanceof ImageData) {
      w = srcCanvasOrImageData.width;
      h = srcCanvasOrImageData.height;
      data = srcCanvasOrImageData.data;
    } else {
      w = srcCanvasOrImageData.width;
      h = srcCanvasOrImageData.height;
      const ctx = srcCanvasOrImageData.getContext("2d", { willReadFrequently: true });
      data = ctx.getImageData(0, 0, w, h).data;
    }

    let minX = w, minY = h, maxX = -1, maxY = -1;

    for (let y = 0; y < h; y++) {
      const rowOffset = y * w * 4;
      for (let x = 0; x < w; x++) {
        const a = data[rowOffset + x * 4 + 3];
        if (a > alphaThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0 || maxY < 0) {
      return {
        isEmpty: true,
        minX: 0,
        minY: 0,
        maxX: w - 1,
        maxY: h - 1,
        width: w,
        height: h,
        origW: w,
        origH: h,
        padLeft: 0,
        padTop: 0,
        padRight: 0,
        padBottom: 0,
        trimRatioW: 1.0,
        trimRatioH: 1.0,
        savedAreaPct: 0
      };
    }

    const contentW = maxX - minX + 1;
    const contentH = maxY - minY + 1;

    return {
      isEmpty: false,
      minX,
      minY,
      maxX,
      maxY,
      width: contentW,
      height: contentH,
      origW: w,
      origH: h,
      padLeft: minX,
      padTop: minY,
      padRight: w - 1 - maxX,
      padBottom: h - 1 - maxY,
      trimRatioW: contentW / w,
      trimRatioH: contentH / h,
      savedAreaPct: Math.round((1 - (contentW * contentH) / (w * h)) * 100)
    };
  }

  /**
   * Recorta (apara) um canvas eliminando todas as bordas transparentes vazias.
   */
  function trimTransparentCanvas(srcCanvas, paddingPx = 0, alphaThreshold = 8) {
    const box = getAlphaBoundingBox(srcCanvas, alphaThreshold);
    if (box.isEmpty || (box.minX === 0 && box.minY === 0 && box.width === box.origW && box.height === box.origH)) {
      return { canvas: srcCanvas, box, wasTrimmed: false };
    }

    const p = Math.max(0, paddingPx);
    const outW = box.width + p * 2;
    const outH = box.height + p * 2;

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const oCtx = out.getContext("2d");
    oCtx.imageSmoothingQuality = "high";

    oCtx.drawImage(
      srcCanvas,
      box.minX, box.minY, box.width, box.height,
      p, p, box.width, box.height
    );

    return { canvas: out, box, wasTrimmed: true };
  }

  // ---------------------------------------------------------------------------
  // 7. INJEÇÃO DE METADADOS DE RESOLUÇÃO FÍSICA EM PNG (CHUNK pHYs)
  // Corrige o bug do Photoshop abrir o PNG em 72 DPI (exibindo 2.4 metros em vez de 58cm).
  // Com o chunk pHYs, Photoshop, Illustrator, Corel e RIPs de DTF leem exatamente 300 / 600 DPI
  // e as dimensões métricas físicas (cm) abrem 100% corretas no tamanho real da plotter!
  // ---------------------------------------------------------------------------
  const PNG_CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    PNG_CRC_TABLE[n] = c;
  }

  function crc32(buf, offset, length) {
    let crc = 0xffffffff;
    for (let i = offset; i < offset + length; i++) {
      crc = PNG_CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createPhysChunk(dpi) {
    // 1 polegada = 0.0254 metros
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21);
    const view = new DataView(chunk.buffer);

    // Comprimento dos dados: 9 bytes
    view.setUint32(0, 9, false); // big-endian

    // Tipo do chunk: 'pHYs' (0x70, 0x48, 0x59, 0x73)
    chunk[4] = 0x70;
    chunk[5] = 0x48;
    chunk[6] = 0x59;
    chunk[7] = 0x73;

    // Dados:
    view.setUint32(8, ppm, false);  // Pixels por unidade X (metro)
    view.setUint32(12, ppm, false); // Pixels por unidade Y (metro)
    chunk[16] = 1;                  // Especificador de unidade: 1 = metro

    // CRC32 sobre Tipo (4 bytes) + Dados (9 bytes) = 13 bytes a partir do índice 4
    const crc = crc32(chunk, 4, 13);
    view.setUint32(17, crc, false); // CRC

    return chunk;
  }

  function injectPhysIntoPngBuffer(pngUint8Array, dpi) {
    // Validação da assinatura PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      pngUint8Array.length < 33 ||
      pngUint8Array[0] !== 0x89 || pngUint8Array[1] !== 0x50 ||
      pngUint8Array[2] !== 0x4E || pngUint8Array[3] !== 0x47 ||
      pngUint8Array[4] !== 0x0D || pngUint8Array[5] !== 0x0A ||
      pngUint8Array[6] !== 0x1A || pngUint8Array[7] !== 0x0A
    ) {
      return pngUint8Array;
    }

    const physChunk = createPhysChunk(dpi);

    // Procura por chunk pHYs já existente entre o IHDR e o primeiro IDAT
    let offset = 8;
    let existingPhysOffset = -1;
    let ihdrEndOffset = 33; // padrão: 8 (sig) + 4 (len) + 4 (type) + 13 (data) + 4 (crc)

    while (offset + 8 <= pngUint8Array.length) {
      const chunkLength = (pngUint8Array[offset] << 24) |
                          (pngUint8Array[offset + 1] << 16) |
                          (pngUint8Array[offset + 2] << 8) |
                          pngUint8Array[offset + 3];
      const chunkType = String.fromCharCode(
        pngUint8Array[offset + 4],
        pngUint8Array[offset + 5],
        pngUint8Array[offset + 6],
        pngUint8Array[offset + 7]
      );

      if (chunkType === "IHDR") {
        ihdrEndOffset = offset + 8 + chunkLength + 4;
      } else if (chunkType === "pHYs") {
        existingPhysOffset = offset;
        break;
      } else if (chunkType === "IDAT") {
        break; // pHYs precisa vir antes do primeiro IDAT
      }

      offset += 8 + chunkLength + 4;
    }

    if (existingPhysOffset >= 0) {
      const newBuf = new Uint8Array(pngUint8Array.length);
      newBuf.set(pngUint8Array);
      newBuf.set(physChunk, existingPhysOffset);
      return newBuf;
    }

    // Insere novo chunk pHYs logo após o IHDR
    const newBuf = new Uint8Array(pngUint8Array.length + 21);
    newBuf.set(pngUint8Array.subarray(0, ihdrEndOffset), 0);
    newBuf.set(physChunk, ihdrEndOffset);
    newBuf.set(pngUint8Array.subarray(ihdrEndOffset), ihdrEndOffset + 21);
    return newBuf;
  }

  function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function uint8ArrayToDataUrl(bytes, mimeType = "image/png") {
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 65536;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return `data:${mimeType};base64,` + btoa(binary);
  }

  function setPngDpi(pngDataUrl, dpi = 300) {
    try {
      const bytes = dataUrlToUint8Array(pngDataUrl);
      const fixedBytes = injectPhysIntoPngBuffer(bytes, dpi);
      return uint8ArrayToDataUrl(fixedBytes, "image/png");
    } catch (e) {
      console.warn("Falha ao injetar DPI no PNG:", e);
      return pngDataUrl;
    }
  }

  function canvasToBlobWithDpi(canvas, dpi = 300) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const bytes = new Uint8Array(reader.result);
          const fixedBytes = injectPhysIntoPngBuffer(bytes, dpi);
          resolve(new Blob([fixedBytes], { type: "image/png" }));
        };
        reader.onerror = () => resolve(blob);
        reader.readAsArrayBuffer(blob);
      }, "image/png");
    });
  }

  async function downloadCanvasAsPngWithDpi(canvas, filename, dpi = 300) {
    const blob = await canvasToBlobWithDpi(canvas, dpi);
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  return {
    labL, cloneCanvas, removeBackground, removeWhiteBackgroundContour, magicWand, cleanEdges, applyChokeAndDefringe,
    blackKnockout, whiteKnockout, halftone,
    unsharp, denoise, vibrance, vectorize, rasterizeSvg, prepareSvgForRasterization, recolor, COLOR_TABLE,
    getAlphaBoundingBox, trimTransparentCanvas, setPngDpi, canvasToBlobWithDpi, downloadCanvasAsPngWithDpi
  };
})();

window.ImageOps = ImageOps;
