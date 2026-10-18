/**
 * LATITUDE DTF COCKPIT - MÓDULO 2: MESA DE MONTAGEM INTERATIVA (GANG SHEET)
 *
 * - Canvas com largura fixa (boca da plotter, ex.: 58 cm) e altura dinâmica (cresce conforme as artes).
 * - Drag & Drop livre com "snap" magnético nas bordas, rotação em passos de 90°.
 * - Detecção de colisão AABB (bounding box 2D): uma arte NUNCA pode ser solta sobre outra.
 * - Guias de corte finas e discretas, com toggle global (Exibir/Ocultar Guias de Corte).
 * - Auto-Nesting opcional (candidatos de canto + rotação 90°), preenchimento de sobras e exportação.
 *
 * Todas as unidades de posição/tamanho do estado estão em centímetros.
 */

class GangSheetService {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.scale = 10;              // px por cm (zoom da mesa)
    this.userZoomed = false;
    this.tailCm = 20;             // folga livre exibida após a última arte
    this.minSheetCm = 60;
    this.totalLengthCm = 0;       // comprimento usado (cobrado)
    this.utilizationPct = 0;
    this.totalCostBrl = 0;
    this.imageCache = new Map();
    this.selectedId = null;
    this.drag = null;
    this.hoverId = null;
    this.history = [];
    this._rafPending = false;
    this._toastTimer = null;
    this.EPS = 1e-4;
  }

  // ========================================================================
  // SETUP
  // ========================================================================
  setCanvas(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext("2d");
    this._bindPointer();
    this._bindKeyboard();

    // Segurança: se o estado inicial tiver sobreposição/estouro, reorganiza uma única vez
    if (!this.isLayoutValid()) {
      this.runAutoNesting(false);
    } else {
      this.recomputeStats();
      this.render();
      this.updateStatsUI();
    }

    this.initInternalTags();
  }

  get gap() {
    const g = parseFloat(DTFState.gangSheet.safetyMarginCm);
    return isNaN(g) ? 0.3 : Math.max(0, g);
  }

  get rollW() {
    return DTFState.gangSheet.rollWidthCm;
  }

  get items() {
    return DTFState.gangSheet.items;
  }

  setGap(gapCm) {
    DTFState.gangSheet.safetyMarginCm = Math.max(0, Math.min(5, parseFloat(gapCm) || 0));
    if (!this.isLayoutValid()) {
      this.showNestingToast(`⚠️ Com a nova folga de ${this.gap} cm há artes muito juntas. Use Auto-Nesting ou arraste-as.`);
    }
    this.updateStatsUI();
    this.render();
  }

  // CONFIGURAÇÃO DA BOCA DA PLOTTER (LARGURA ÚTIL DO ROLO)
  setPlotterMouthWidth(widthCm) {
    const w = Math.max(20.0, Math.min(160.0, parseFloat(widthCm) || 58.0));
    DTFState.settings.rollUsefulWidthCm = w;
    DTFState.gangSheet.rollWidthCm = w;

    document.querySelectorAll(".plotter-btn").forEach((btn) => {
      const btnW = parseFloat(btn.getAttribute("data-width"));
      btn.classList.toggle("active", btnW === w);
    });

    const inputCustom = document.getElementById("inputCustomPlotterWidth");
    if (inputCustom && document.activeElement !== inputCustom) inputCustom.value = w;

    const headerPlotterBadge = document.getElementById("headerPlotterMouthDisplay");
    if (headerPlotterBadge) headerPlotterBadge.textContent = `${w.toFixed(1)} cm`;

    const rollMouthTitle = document.getElementById("rollMouthTitleDisplay");
    if (rollMouthTitle) rollMouthTitle.textContent = `ROLO DTF: ${w.toFixed(1)} CM (BOCA DA PLOTTER)`;

    const sidebarBadge = document.getElementById("sidebarRollBadge");
    if (sidebarBadge) sidebarBadge.textContent = `${Math.round(w)} cm`;

    const badgeRollWidth = document.getElementById("badgeRollWidthDisplay");
    if (badgeRollWidth) badgeRollWidth.textContent = `${w.toFixed(1)} cm`;

    // Mantém as posições do usuário sempre que possível; só reorganiza se algo ficar inválido
    this.revalidateAfterWidthChange();
    if (!this.userZoomed) this.fitWidth();

    if (window.costCalculatorService) window.costCalculatorService.renderUI();
  }

  revalidateAfterWidthChange() {
    this.items.forEach((it) => {
      if (it.xCm + it.widthCm > this.rollW) it.xCm = Math.max(0, this.rollW - it.widthCm);
    });
    if (!this.isLayoutValid()) {
      this.runAutoNesting(false);
      this.showNestingToast("↔ A largura do rolo mudou: as artes foram reencaixadas automaticamente.");
    } else {
      this.recomputeStats();
      this.render();
      this.updateStatsUI();
    }
  }

  // ========================================================================
  // GEOMETRIA / COLISÃO (Bounding Box 2D)
  // ========================================================================

  /** Retângulos A e B (expandidos pela folga) se interceptam? */
  rectsCollide(ax, ay, aw, ah, b, gap) {
    const e = this.EPS;
    return (
      ax < b.xCm + b.widthCm + gap - e &&
      b.xCm < ax + aw + gap - e &&
      ay < b.yCm + b.heightCm + gap - e &&
      b.yCm < ay + ah + gap - e
    );
  }

  /** Posição (x,y,w,h) é válida: dentro da boca da plotter e sem tocar nenhuma outra arte? */
  isPositionValid(x, y, w, h, ignoreId = null, list = null) {
    const e = this.EPS;
    if (x < -e || y < -e || x + w > this.rollW + e) return false;
    const gap = this.gap;
    const arr = list || this.items;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      if (b.id === ignoreId) continue;
      if (this.rectsCollide(x, y, w, h, b, gap)) return false;
    }
    return true;
  }

  isLayoutValid() {
    const arr = this.items;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (!this.isPositionValid(a.xCm, a.yCm, a.widthCm, a.heightCm, a.id)) return false;
    }
    return true;
  }

  /**
   * Dado um ponto desejado, devolve a posição válida mais próxima (ou null).
   * Candidatos: o ponto desejado + alinhamentos com as bordas das artes vizinhas e do rolo.
   */
  resolveNearest(w, h, wantX, wantY, ignoreId, maxDist = 12) {
    const gap = this.gap;
    const W = this.rollW;
    wantX = Math.min(Math.max(0, wantX), W - w);
    wantY = Math.max(0, wantY);

    if (this.isPositionValid(wantX, wantY, w, h, ignoreId)) return { x: wantX, y: wantY };

    const xs = [wantX, 0, W - w];
    const ys = [wantY, 0];
    this.items.forEach((b) => {
      if (b.id === ignoreId) return;
      xs.push(b.xCm - w - gap, b.xCm + b.widthCm + gap, b.xCm, b.xCm + b.widthCm - w);
      ys.push(b.yCm - h - gap, b.yCm + b.heightCm + gap, b.yCm, b.yCm + b.heightCm - h);
    });

    const cands = [];
    xs.forEach((x) => {
      if (x < -this.EPS || x + w > W + this.EPS) return;
      ys.forEach((y) => {
        if (y < -this.EPS) return;
        const d = Math.hypot(x - wantX, y - wantY);
        if (d <= maxDist) cands.push({ x, y, d });
      });
    });
    cands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < cands.length; i++) {
      if (this.isPositionValid(cands[i].x, cands[i].y, w, h, ignoreId)) {
        return { x: cands[i].x, y: cands[i].y };
      }
    }
    return null;
  }

  /** Snap magnético nas bordas do rolo e das artes vizinhas. */
  snapPosition(item, x, y, thresholdCm) {
    const gap = this.gap;
    const w = item.widthCm;
    const h = item.heightCm;
    const xc = [0, this.rollW - w];
    const yc = [0];
    this.items.forEach((b) => {
      if (b.id === item.id) return;
      xc.push(b.xCm + b.widthCm + gap, b.xCm - w - gap, b.xCm, b.xCm + b.widthCm - w);
      yc.push(b.yCm + b.heightCm + gap, b.yCm - h - gap, b.yCm, b.yCm + b.heightCm - h);
    });
    const nearest = (v, arr) => {
      let best = v;
      let bd = thresholdCm;
      arr.forEach((c) => {
        const d = Math.abs(c - v);
        if (d < bd) { bd = d; best = c; }
      });
      return best;
    };
    return { x: nearest(x, xc), y: nearest(y, yc) };
  }

  /**
   * Menor posição livre (mais acima, depois mais à esquerda) para um w×h.
   * maxBottomCm limita o preenchimento a buracos dentro do comprimento atual.
   */
  findFreeSpot(w, h, opts = {}) {
    const gap = this.gap;
    const W = this.rollW;
    const list = opts.list || this.items;
    if (w > W + this.EPS) return null;

    const xs = new Set([0]);
    const ys = new Set([0]);
    list.forEach((b) => {
      xs.add(b.xCm + b.widthCm + gap);
      xs.add(b.xCm);
      ys.add(b.yCm + b.heightCm + gap);
      ys.add(b.yCm);
    });
    const xa = [...xs].sort((a, b) => a - b);
    const ya = [...ys].sort((a, b) => a - b);

    let best = null;
    for (let yi = 0; yi < ya.length; yi++) {
      const y = ya[yi];
      if (best && y > best.y + this.EPS) break;
      if (opts.maxBottomCm && y + h > opts.maxBottomCm + this.EPS) continue;
      for (let xi = 0; xi < xa.length; xi++) {
        const x = xa[xi];
        if (x + w > W + this.EPS) continue;
        if (this.isPositionValid(x, y, w, h, opts.ignoreId || null, list)) {
          if (!best || y < best.y - this.EPS || (Math.abs(y - best.y) < this.EPS && x < best.x)) {
            best = { x, y };
          }
          break; // primeira (mais à esquerda) livre desta linha
        }
      }
    }
    return best;
  }

  /** Posiciona um item novo no melhor espaço livre (tentando também girar 90°). */
  addItemAtFreeSpot(item) {
    this.pushHistory();
    const normal = this.findFreeSpot(item.widthCm, item.heightCm);
    let chosen = { x: normal ? normal.x : 0, y: normal ? normal.y : 0, rotated: false };
    if (!normal) {
      // nada cabe na boca? coloca no fim
      chosen.y = this.items.reduce((m, it) => Math.max(m, it.yCm + it.heightCm + this.gap), 0);
    }
    if (item.widthCm !== item.heightCm) {
      const rot = this.findFreeSpot(item.heightCm, item.widthCm);
      if (rot) {
        const normalBottom = normal ? normal.y + item.heightCm : Infinity;
        const rotBottom = rot.y + item.widthCm;
        if (rotBottom < normalBottom - this.EPS) {
          chosen = { x: rot.x, y: rot.y, rotated: true };
        }
      }
    }
    if (chosen.rotated) {
      const w = item.widthCm;
      item.widthCm = item.heightCm;
      item.heightCm = w;
      item.rot = ((item.rot || 0) + 1) % 4;
    }
    item.xCm = parseFloat(chosen.x.toFixed(2));
    item.yCm = parseFloat(chosen.y.toFixed(2));
    this.items.push(item);
    this.selectedId = item.id;
    this.recomputeStats();
    this.render();
    this.updateStatsUI();
    return item;
  }

  // ========================================================================
  // AUTO-NESTING (opcional - o usuário tem o controle manual)
  // ========================================================================
  nestWithStrategy(strategy) {
    const gap = this.gap;
    const W = this.rollW;
    const src = this.items.map((it) => ({ ...it }));

    const area = (i) => i.widthCm * i.heightCm;
    const sorters = {
      area: (a, b) => area(b) - area(a),
      height: (a, b) => Math.max(b.widthCm, b.heightCm) - Math.max(a.widthCm, a.heightCm) || area(b) - area(a),
      width: (a, b) => Math.min(b.widthCm, b.heightCm) - Math.min(a.widthCm, a.heightCm) || area(b) - area(a),
      perimeter: (a, b) => (b.widthCm + b.heightCm) - (a.widthCm + a.heightCm)
    };
    src.sort(sorters[strategy] || sorters.area);

    const placed = [];
    src.forEach((it) => {
      let best = null;
      const orientations = [{ w: it.widthCm, h: it.heightCm, rotate: false }];
      if (Math.abs(it.widthCm - it.heightCm) > 0.01) {
        orientations.push({ w: it.heightCm, h: it.widthCm, rotate: true });
      }
      orientations.forEach((o) => {
        if (o.w > W + this.EPS) return;
        const spot = this.findFreeSpot(o.w, o.h, { list: placed });
        if (!spot) return;
        const bottom = spot.y + o.h;
        if (
          !best ||
          bottom < best.bottom - this.EPS ||
          (Math.abs(bottom - best.bottom) < this.EPS && spot.x < best.x)
        ) {
          best = { ...spot, bottom, o };
        }
      });

      if (!best) {
        const y = placed.reduce((m, p) => Math.max(m, p.yCm + p.heightCm + gap), 0);
        best = { x: 0, y, bottom: y + it.heightCm, o: { w: it.widthCm, h: it.heightCm, rotate: false } };
      }
      if (best.o.rotate) {
        it.widthCm = best.o.w;
        it.heightCm = best.o.h;
        it.rot = ((it.rot || 0) + 1) % 4;
      }
      it.xCm = parseFloat(best.x.toFixed(2));
      it.yCm = parseFloat(best.y.toFixed(2));
      placed.push(it);
    });

    const length = placed.reduce((m, p) => Math.max(m, p.yCm + p.heightCm), 0);
    return { placed, length };
  }

  runAutoNesting(showFeedback = false) {
    if (!this.items.length) {
      this.totalLengthCm = 0;
      this.recomputeStats();
      this.render();
      this.updateStatsUI();
      return;
    }
    this.pushHistory();

    let best = null;
    ["area", "height", "width", "perimeter"].forEach((s) => {
      const res = this.nestWithStrategy(s);
      if (!best || res.length < best.length) best = res;
    });

    // aplica preservando a ordem original da lista
    const byId = new Map(best.placed.map((p) => [p.id, p]));
    DTFState.gangSheet.items = this.items.map((it) => byId.get(it.id) || it);

    this.recomputeStats();
    this.render();
    this.updateStatsUI();

    if (showFeedback) {
      this.showNestingToast(`⚡ Auto-Nesting: ${this.items.length} artes em ${this.totalLengthCm.toFixed(1)} cm de rolo (${this.utilizationPct}% de aproveitamento). Você ainda pode ajustar manualmente.`);
    }
  }

  /**
   * Varre todas as artes do rolo, elimina margens transparentes vazias
   * e recalcula as dimensões em cm estritamente para a arte visível,
   * compactando o rolo e economizando metros de filme DTF.
   */
  async autoTrimAllItems() {
    if (!this.items.length) {
      this.showNestingToast("Nenhuma arte no rolo para aparar.");
      return;
    }

    this.showNestingToast("⏳ Analisando pixels e aparando fundos transparentes de todas as artes...");

    let trimmedCount = 0;
    const oldLength = this.totalLengthCm;

    this.pushHistory();

    for (const it of this.items) {
      if (!it.dataUrl) continue;

      const img = this._loadImage(it.dataUrl);
      if (!img.complete) {
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }

      if (!img.naturalWidth || !img.naturalHeight) continue;

      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      if (window.ImageOps && ImageOps.trimTransparentCanvas) {
        const res = ImageOps.trimTransparentCanvas(c, 0, 8);
        if (res.wasTrimmed && res.box) {
          trimmedCount++;
          const newW = Math.round((it.widthCm * res.box.trimRatioW) * 10) / 10;
          const newH = Math.round((it.heightCm * res.box.trimRatioH) * 10) / 10;

          it.widthCm = Math.max(2.0, newW);
          it.heightCm = Math.max(2.0, newH);
          it.dataUrl = res.canvas.toDataURL("image/png");
          this.imageCache.set(it.dataUrl, res.canvas);
        }
      }
    }

    if (trimmedCount > 0) {
      this.runAutoNesting(false);
      const savedLength = Math.max(0, oldLength - this.totalLengthCm);
      const savedBrl = (savedLength / 100) * DTFState.settings.dtfMeterCost;

      this.showNestingToast(
        `✂️ ${trimmedCount} arte(s) aparada(s)! Economizou ${savedLength.toFixed(1)} cm de rolo (R$ ${savedBrl.toFixed(2)} economizados).`
      );
    } else {
      this.showNestingToast("ℹ️ Todas as artes do rolo já estão 100% compactadas e sem sobras transparentes.");
    }

    this.recomputeStats();
    this.render();
    this.updateStatsUI();
  }

  // OTIMIZADOR DE SOBRAS: preenche apenas os buracos dentro do comprimento atual
  toggleFillers() {
    DTFState.gangSheet.autoFillersActive = !DTFState.gangSheet.autoFillersActive;
    this.pushHistory();
    DTFState.gangSheet.items = this.items.filter((it) => !it.isFiller);

    if (DTFState.gangSheet.autoFillersActive) {
      const fillersToAdd = [
        { desc: "Tag Gola Latitude M", w: 6.0, h: 4.0 },
        { desc: "Tag Gola Latitude G", w: 6.0, h: 4.0 },
        { desc: "Sticker Freebie DTF", w: 8.0, h: 5.0 },
        { desc: "Logo Peito 5x5 DTF", w: 5.0, h: 5.0 },
        { desc: "Tag Cuidados Lavagem", w: 7.0, h: 4.5 }
      ];
      const maxBottom = this.items.reduce((m, it) => Math.max(m, it.yCm + it.heightCm), 0);
      let added = 0;
      fillersToAdd.forEach((f, idx) => {
        let spot = this.findFreeSpot(f.w, f.h, { maxBottomCm: maxBottom });
        let w = f.w, h = f.h, rot = 0;
        if (!spot) {
          spot = this.findFreeSpot(f.h, f.w, { maxBottomCm: maxBottom });
          if (spot) { w = f.h; h = f.w; rot = 1; }
        }
        if (!spot) return;
        this.items.push({
          id: "filler_" + idx + "_" + Date.now(),
          orderNumber: "FILLER",
          customerName: "Latitude Brinde",
          artworkId: "art_minimal_03",
          sizeLabel: "Mini",
          shirtColor: "Preta",
          widthCm: w,
          heightCm: h,
          rot,
          xCm: parseFloat(spot.x.toFixed(2)),
          yCm: parseFloat(spot.y.toFixed(2)),
          isFiller: true,
          cutLabel: `[FILLER] ${f.desc}`
        });
        added++;
      });
      this.showNestingToast(added
        ? `✨ ${added} brinde(s) encaixado(s) nos buracos do rolo, sem aumentar o comprimento.`
        : "Nenhum buraco grande o suficiente para os brindes neste rolo.");
    }

    this.recomputeStats();
    this.render();
    this.updateStatsUI();
  }

  // ========================================================================
  // EDIÇÃO MANUAL: seleção, rotação, remoção, undo
  // ========================================================================
  getItem(id) {
    return this.items.find((i) => i.id === id) || null;
  }

  selectItem(id) {
    this.selectedId = id;
    this.render();
    this.renderQueueListUI();
  }

  pushHistory() {
    this.history.push(JSON.stringify(this.items));
    if (this.history.length > 40) this.history.shift();
  }

  undo() {
    if (!this.history.length) return;
    DTFState.gangSheet.items = JSON.parse(this.history.pop());
    this.recomputeStats();
    this.render();
    this.updateStatsUI();
  }

  rotateItem(id, silent = false) {
    const it = this.getItem(id);
    if (!it) return false;
    const nw = it.heightCm;
    const nh = it.widthCm;
    const spot = this.resolveNearest(nw, nh, it.xCm, it.yCm, it.id, 30);
    if (!spot) {
      this.showNestingToast("🚫 Sem espaço livre para girar essa arte aqui. Libere espaço e tente de novo.");
      return false;
    }
    this.pushHistory();
    it.widthCm = nw;
    it.heightCm = nh;
    it.rot = ((it.rot || 0) + 1) % 4;
    it.xCm = parseFloat(spot.x.toFixed(2));
    it.yCm = parseFloat(spot.y.toFixed(2));
    this.recomputeStats();
    this.render();
    this.updateStatsUI();
    return true;
  }

  rotateSelected() {
    if (this.selectedId) this.rotateItem(this.selectedId);
  }

  removeItem(id) {
    this.pushHistory();
    DTFState.gangSheet.items = this.items.filter((it) => it.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.recomputeStats();
    this.render();
    this.updateStatsUI();
  }

  // APARAR MARGEM TRANSPARENTE DE UMA ARTE ESPECÍFICA DO ROLO
  async trimItem(id) {
    const it = this.getItem(id);
    if (!it) return false;
    let dataUrl = it.dataUrl;
    if (!dataUrl && it.artworkId) {
      const art = DTFState.imageEngine.uploadedImages.find((a) => a.id === it.artworkId);
      if (art && art.dataUrl) dataUrl = art.dataUrl;
    }
    if (!dataUrl) {
      this.showNestingToast("⚠️ Arte sem imagem rasterizada para analisar.");
      return false;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = dataUrl;
    });

    if (!img.naturalWidth || !img.naturalHeight) return false;

    const tempC = document.createElement("canvas");
    tempC.width = img.naturalWidth;
    tempC.height = img.naturalHeight;
    const tCtx = tempC.getContext("2d", { willReadFrequently: true });
    tCtx.drawImage(img, 0, 0);

    if (window.ImageOps && ImageOps.trimTransparentCanvas) {
      const trimRes = ImageOps.trimTransparentCanvas(tempC, 0, 8);
      if (trimRes.wasTrimmed && trimRes.box) {
        this.pushHistory();
        it.dataUrl = trimRes.canvas.toDataURL("image/png");
        this.imageCache.delete(dataUrl);

        const newAspect = trimRes.box.height / Math.max(trimRes.box.width, 1);
        const newW = Math.round(it.widthCm * trimRes.box.trimRatioW * 10) / 10;
        const newH = Math.round((newW * newAspect) * 10) / 10;

        it.widthCm = Math.max(3.0, newW);
        it.heightCm = Math.max(3.0, newH);

        this.recomputeStats();
        this.render();
        this.updateStatsUI();
        this.showNestingToast(`✂️ Margens transparentes aparadas! Arte ajustada para ${it.widthCm}×${it.heightCm} cm (Economia de ${trimRes.box.savedAreaPct}% de área vazia).`);
        return true;
      } else {
        this.showNestingToast("ℹ️ Esta arte já está 100% calibrada sem sobras transparentes.");
        return false;
      }
    }
    return false;
  }

  // APARAR MARGENS TRANSPARENTES DE TODAS AS ARTES DO ROLO E REORGANIZAR COMPACTANDO O FILME
  async autoTrimAllItems() {
    if (!this.items.length) {
      this.showNestingToast("ℹ️ O rolo não possui artes para aparar.");
      return;
    }

    this.pushHistory();
    this.showNestingToast("⏳ Analisando pixels e aparando fundos transparentes de todas as artes...");

    let totalSavedAreaPct = 0;
    let trimmedCount = 0;
    const oldLength = this.totalLengthCm;
    const oldCost = this.totalCostBrl;

    await Promise.all(
      this.items.map(async (it) => {
        let dataUrl = it.dataUrl;
        if (!dataUrl && it.artworkId) {
          const art = DTFState.imageEngine.uploadedImages.find((a) => a.id === it.artworkId);
          if (art && art.dataUrl) dataUrl = art.dataUrl;
        }
        if (!dataUrl) return;

        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = dataUrl;
        });

        if (!img.naturalWidth || !img.naturalHeight) return;

        const tempC = document.createElement("canvas");
        tempC.width = img.naturalWidth;
        tempC.height = img.naturalHeight;
        const tCtx = tempC.getContext("2d", { willReadFrequently: true });
        tCtx.drawImage(img, 0, 0);

        if (window.ImageOps && ImageOps.trimTransparentCanvas) {
          const trimRes = ImageOps.trimTransparentCanvas(tempC, 0, 8);
          if (trimRes.wasTrimmed && trimRes.box) {
            trimmedCount++;
            totalSavedAreaPct += trimRes.box.savedAreaPct;
            it.dataUrl = trimRes.canvas.toDataURL("image/png");
            this.imageCache.delete(dataUrl);

            const newAspect = trimRes.box.height / Math.max(trimRes.box.width, 1);
            const newW = Math.round(it.widthCm * trimRes.box.trimRatioW * 10) / 10;
            const newH = Math.round((newW * newAspect) * 10) / 10;

            it.widthCm = Math.max(3.0, newW);
            it.heightCm = Math.max(3.0, newH);
          }
        }
      })
    );

    if (trimmedCount > 0) {
      // Re-organiza todas as artes para aproveitar os espaços vagos gerados
      this.runAutoNesting(false);
      this.recomputeStats();
      this.render();
      this.updateStatsUI();

      const savedCm = Math.max(0, oldLength - this.totalLengthCm);
      const savedMoney = Math.max(0, oldCost - this.totalCostBrl);
      this.showNestingToast(
        `✂️ ${trimmedCount} ${trimmedCount === 1 ? 'arte aparada' : 'artes aparadas'}! O rolo encolheu de ${oldLength.toFixed(1)} cm para ${this.totalLengthCm.toFixed(1)} cm (Economia de ${savedCm.toFixed(1)} cm de filme DTF e R$ ${savedMoney.toFixed(2)}).`
      );
    } else {
      this.showNestingToast("✅ Todas as artes do rolo já estão 100% justas, sem fundos transparentes vazios.");
    }
  }

  nudgeSelected(dx, dy) {
    const it = this.getItem(this.selectedId);
    if (!it) return;
    const x = Math.min(Math.max(0, it.xCm + dx), this.rollW - it.widthCm);
    const y = Math.max(0, it.yCm + dy);
    if (this.isPositionValid(x, y, it.widthCm, it.heightCm, it.id)) {
      it.xCm = parseFloat(x.toFixed(2));
      it.yCm = parseFloat(y.toFixed(2));
      this.recomputeStats();
      this.render();
      this.updateStatsUI();
    }
  }

  // ========================================================================
  // ENTRADA: PONTEIRO (drag & drop) E TECLADO
  // ========================================================================
  _pointerToCm(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.rollW,
      y: ((e.clientY - rect.top) / rect.height) * (this.canvas.height / this._dpr() / this.scale)
    };
  }

  _dpr() {
    return this._dprValue || 1;
  }

  _hitTest(px, py) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (px >= it.xCm && px <= it.xCm + it.widthCm && py >= it.yCm && py <= it.yCm + it.heightCm) return it;
    }
    return null;
  }

  _hitRotateHandle(it, px, py) {
    if (!it) return false;
    const r = 11 / this.scale; // raio do botão ↻ em cm
    const cx = it.xCm + it.widthCm - r - 2 / this.scale;
    const cy = it.yCm + r + 2 / this.scale;
    return Math.hypot(px - cx, py - cy) <= r;
  }

  _bindPointer() {
    const c = this.canvas;
    c.style.touchAction = "none";

    c.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const p = this._pointerToCm(e);
      const hit = this._hitTest(p.x, p.y);

      if (hit && hit.id === this.selectedId && this._hitRotateHandle(hit, p.x, p.y)) {
        this.rotateItem(hit.id);
        return;
      }
      if (!hit) {
        this.selectedId = null;
        this.render();
        this.renderQueueListUI();
        return;
      }
      // traz para frente e inicia o arraste
      this.selectedId = hit.id;
      this.pushHistory();
      this.drag = {
        id: hit.id,
        offX: p.x - hit.xCm,
        offY: p.y - hit.yCm,
        startX: hit.xCm,
        startY: hit.yCm,
        moved: false,
        wantX: hit.xCm,
        wantY: hit.yCm,
        blocked: false
      };
      c.setPointerCapture(e.pointerId);
      c.style.cursor = "grabbing";
      this.renderQueueListUI();
      this.render();
    });

    c.addEventListener("pointermove", (e) => {
      const p = this._pointerToCm(e);
      if (!this.drag) {
        const hit = this._hitTest(p.x, p.y);
        const newHover = hit ? hit.id : null;
        if (newHover !== this.hoverId) {
          this.hoverId = newHover;
          this.render();
        }
        const onHandle = hit && hit.id === this.selectedId && this._hitRotateHandle(hit, p.x, p.y);
        c.style.cursor = onHandle ? "pointer" : hit ? "grab" : "default";
        return;
      }

      const it = this.getItem(this.drag.id);
      if (!it) return;
      let wantX = p.x - this.drag.offX;
      let wantY = p.y - this.drag.offY;
      wantX = Math.min(Math.max(0, wantX), this.rollW - it.widthCm);
      wantY = Math.max(0, wantY);
      this.drag.wantX = wantX;
      this.drag.wantY = wantY;
      this.drag.moved = true;

      let target = { x: wantX, y: wantY };
      if (!e.altKey) target = this.snapPosition(it, wantX, wantY, 7 / this.scale);

      let spot = this.isPositionValid(target.x, target.y, it.widthCm, it.heightCm, it.id)
        ? target
        : this.resolveNearest(it.widthCm, it.heightCm, target.x, target.y, it.id, 6);

      if (spot) {
        it.xCm = parseFloat(spot.x.toFixed(2));
        it.yCm = parseFloat(spot.y.toFixed(2));
      }
      this.drag.blocked = !this.isPositionValid(wantX, wantY, it.widthCm, it.heightCm, it.id);
      this.recomputeStats();
      this.requestRender();
    });

    const end = (e) => {
      if (!this.drag) return;
      const it = this.getItem(this.drag.id);
      const moved = this.drag.moved && it && (Math.abs(it.xCm - this.drag.startX) > 0.01 || Math.abs(it.yCm - this.drag.startY) > 0.01);
      if (!moved) this.history.pop(); // nada mudou: descarta o snapshot
      this.drag = null;
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      c.style.cursor = "grab";
      this.recomputeStats();
      this.render();
      this.updateStatsUI();
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => {
      if (!this.drag && this.hoverId) {
        this.hoverId = null;
        this.render();
      }
    });

    // Ctrl + roda = zoom da mesa
    const container = c.closest(".roll-canvas-container");
    if (container) {
      container.addEventListener("wheel", (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        this.setScale(this.scale * (e.deltaY < 0 ? 1.1 : 0.9));
      }, { passive: false });
    }
  }

  _bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      const pane = document.getElementById("module-gang-sheet");
      if (!pane || !pane.classList.contains("active")) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        this.undo();
      } else if (key === "r" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.rotateSelected();
      } else if ((key === "delete" || key === "backspace") && this.selectedId) {
        e.preventDefault();
        this.removeItem(this.selectedId);
      } else if (key === "escape") {
        this.selectedId = null;
        this.render();
        this.renderQueueListUI();
      } else if (this.selectedId && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        this.nudgeSelected(dx, dy);
      }
    });
  }

  // ========================================================================
  // ZOOM DA MESA
  // ========================================================================
  setScale(pxPerCm, byUser = true) {
    this.scale = Math.min(30, Math.max(4, pxPerCm));
    if (byUser) this.userZoomed = true;
    const lbl = document.getElementById("rollZoomLabel");
    if (lbl) lbl.textContent = `${Math.round((this.scale / 10) * 100)}%`;
    this.render();
  }

  fitWidth() {
    const container = this.canvas && this.canvas.closest(".roll-canvas-container");
    if (!container || !container.clientWidth) return;
    this.userZoomed = false;
    this.setScale((container.clientWidth - 70) / this.rollW, false);
  }

  refreshLayout() {
    if (!this.userZoomed) this.fitWidth();
    else this.render();
  }

  // ========================================================================
  // ESTATÍSTICAS
  // ========================================================================
  recomputeStats() {
    const items = this.items;
    const used = items.reduce((m, it) => Math.max(m, it.yCm + it.heightCm), 0);
    this.totalLengthCm = parseFloat(used.toFixed(1));
    const area = items.reduce((s, it) => s + it.widthCm * it.heightCm, 0);
    this.utilizationPct = parseFloat(((area / Math.max(this.rollW * Math.max(used, 1), 1)) * 100).toFixed(1));
    this.totalCostBrl = parseFloat(((this.totalLengthCm / 100) * DTFState.settings.dtfMeterCost).toFixed(2));
  }

  showNestingToast(msg) {
    let toast = document.getElementById("nestingToastMessage");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "nestingToastMessage";
      toast.className = "nesting-toast-popup";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("visible");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove("visible"), 3800);
  }

  // ========================================================================
  // RENDERIZAÇÃO
  // ========================================================================
  requestRender() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.render();
    });
  }

  _loadImage(dataUrl) {
    let img = this.imageCache.get(dataUrl);
    if (!img) {
      img = new Image();
      img.src = dataUrl;
      img.onload = () => this.requestRender();
      this.imageCache.set(dataUrl, img);
    }
    return img;
  }

  drawItem(ctx, it, s, opts = {}) {
    const ix = it.xCm * s;
    const iy = it.yCm * s;
    const iw = it.widthCm * s;
    const ih = it.heightCm * s;
    const rot = (it.rot || 0) % 4;

    let img = null;
    if (it.dataUrl) {
      img = opts.img || this._loadImage(it.dataUrl);
      if (!(img.complete && img.naturalWidth > 0)) img = null;
    }

    if (img) {
      ctx.save();
      ctx.translate(ix + iw / 2, iy + ih / 2);
      ctx.rotate((rot * Math.PI) / 2);
      const dw = rot % 2 ? ih : iw;
      const dh = rot % 2 ? iw : ih;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else if (!opts.forExport) {
      // Placeholder (sem imagem associada)
      const grad = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
      if (it.isFiller) {
        grad.addColorStop(0, "rgba(245, 158, 11, 0.35)");
        grad.addColorStop(1, "rgba(239, 68, 68, 0.35)");
      } else {
        grad.addColorStop(0, "rgba(0, 240, 255, 0.28)");
        grad.addColorStop(1, "rgba(138, 43, 226, 0.28)");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(ix, iy, iw, ih);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillText("sem arte", ix + 4, iy + ih / 2);
    }
  }

  drawCutGuide(ctx, it, s, color, lineW, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.setLineDash(dash);
    const o = lineW / 2;
    ctx.strokeRect(it.xCm * s + o, it.yCm * s + o, it.widthCm * s - lineW, it.heightCm * s - lineW);
    ctx.restore();
  }

  render() {
    if (!this.canvas) return;
    const ctx = this.ctx;
    const s = this.scale;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this._dprValue = dpr;

    const sheetLenCm = Math.max(this.totalLengthCm + this.tailCm, this.minSheetCm,
      this.drag ? (this.getItem(this.drag.id).yCm + this.getItem(this.drag.id).heightCm + this.tailCm) : 0);
    const cssW = Math.round(this.rollW * s);
    const cssH = Math.round(sheetLenCm * s);

    if (this.canvas.width !== cssW * dpr || this.canvas.height !== cssH * dpr) {
      this.canvas.width = cssW * dpr;
      this.canvas.height = cssH * dpr;
    }
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Fundo do filme
    ctx.fillStyle = "#0c0e14";
    ctx.fillRect(0, 0, cssW, cssH);

    // Grade: 1 cm (muito sutil) + 10 cm (marcada)
    if (s >= 8) {
      ctx.strokeStyle = "rgba(255,255,255,0.018)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let cm = 1; cm < this.rollW; cm++) { if (cm % 10) { ctx.moveTo(cm * s + 0.5, 0); ctx.lineTo(cm * s + 0.5, cssH); } }
      for (let cm = 1; cm < sheetLenCm; cm++) { if (cm % 10) { ctx.moveTo(0, cm * s + 0.5); ctx.lineTo(cssW, cm * s + 0.5); } }
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    for (let cm = 10; cm < this.rollW; cm += 10) { ctx.moveTo(cm * s + 0.5, 0); ctx.lineTo(cm * s + 0.5, cssH); }
    for (let cm = 10; cm < sheetLenCm; cm += 10) { ctx.moveTo(0, cm * s + 0.5); ctx.lineTo(cssW, cm * s + 0.5); }
    ctx.stroke();

    // Régua vertical (cm) sutil à esquerda
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.font = "8px 'JetBrains Mono', monospace";
    for (let cm = 10; cm < sheetLenCm; cm += 10) ctx.fillText(`${cm}`, 3, cm * s - 2);

    // Zona livre (abaixo do comprimento usado) levemente escurecida + linha de fim do rolo
    const usedPx = this.totalLengthCm * s;
    if (this.items.length) {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(0, usedPx, cssW, cssH - usedPx);
      ctx.save();
      ctx.strokeStyle = "rgba(34,197,94,0.75)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, usedPx + 0.5);
      ctx.lineTo(cssW, usedPx + 0.5);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "rgba(34,197,94,0.9)";
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.fillText(`FIM DO ROLO • ${this.totalLengthCm.toFixed(1)} cm`, 6, usedPx + 12);
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(0, 240, 255, 0.85)";
      ctx.font = "28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🎞️", cssW / 2, 60);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px 'Outfit', sans-serif";
      ctx.fillText("Rolo de Impressão DTF Vazio", cssW / 2, 95);

      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.font = "10.5px 'JetBrains Mono', monospace";
      ctx.fillText("Adicione artes do Módulo 1 ou use as Estampas Internas de Gola na barra lateral.", cssW / 2, 116);
      ctx.restore();
    }

    // Artes (a selecionada/arrastada por último, fica em cima)
    const ordered = [...this.items].sort((a, b) => (a.id === this.selectedId) - (b.id === this.selectedId));
    ordered.forEach((it) => this.drawItem(ctx, it, s));

    // Guias de corte: finas e discretas (toggle global)
    if (DTFState.gangSheet.showCutMarks) {
      ordered.forEach((it) => {
        this.drawCutGuide(ctx, it, s, it.isFiller ? "rgba(245,158,11,0.75)" : "rgba(0,240,255,0.65)", 0.75, [3, 3]);

        // rótulo minúsculo dentro do canto superior esquerdo
        const text = `#${(it.orderNumber || "").toString().replace(/^PED-?/i, "")} ${it.widthCm}×${it.heightCm}`;
        ctx.font = "6.5px 'JetBrains Mono', monospace";
        const tw = ctx.measureText(text).width + 4;
        if (tw < it.widthCm * s - 2) {
          ctx.fillStyle = "rgba(8,9,13,0.72)";
          ctx.fillRect(it.xCm * s + 1, it.yCm * s + 1, tw, 8);
          ctx.fillStyle = it.isFiller ? "#f59e0b" : "#00f0ff";
          ctx.fillText(text, it.xCm * s + 3, it.yCm * s + 7.2);
        }
      });
    }

    // Hover
    const hov = this.hoverId && this.hoverId !== this.selectedId ? this.getItem(this.hoverId) : null;
    if (hov && !this.drag) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(hov.xCm * s + 0.5, hov.yCm * s + 0.5, hov.widthCm * s - 1, hov.heightCm * s - 1);
      ctx.restore();
    }

    // Seleção + botão de rotação (apenas UI, não é exportado)
    const sel = this.getItem(this.selectedId);
    if (sel) {
      ctx.save();
      ctx.strokeStyle = this.drag && this.drag.blocked ? "#ef4444" : "#00f0ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(sel.xCm * s + 1, sel.yCm * s + 1, sel.widthCm * s - 2, sel.heightCm * s - 2);
      ctx.restore();

      // fantasma vermelho onde o ponteiro tentou soltar (colisão)
      if (this.drag && this.drag.blocked) {
        ctx.save();
        ctx.fillStyle = "rgba(239,68,68,0.22)";
        ctx.strokeStyle = "rgba(239,68,68,0.9)";
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.fillRect(this.drag.wantX * s, this.drag.wantY * s, sel.widthCm * s, sel.heightCm * s);
        ctx.strokeRect(this.drag.wantX * s, this.drag.wantY * s, sel.widthCm * s, sel.heightCm * s);
        ctx.restore();
      }

      if (!this.drag) {
        const r = 11;
        const cx = (sel.xCm + sel.widthCm) * s - r - 2;
        const cy = sel.yCm * s + r + 2;
        ctx.save();
        ctx.fillStyle = "rgba(8,9,13,0.9)";
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#00f0ff";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("↻", cx, cy + 0.5);
        ctx.restore();
      }
    }

    this.updateRulerUI();
  }

  updateRulerUI() {
    const rulerEl = document.getElementById("rollRulerTicksContainer");
    if (!rulerEl) return;
    const w = this.rollW;
    const sheet = rulerEl.parentElement;
    if (sheet) sheet.style.width = `${Math.round(w * this.scale)}px`;
    const mk = (f) => `<span>${(w * f).toFixed(0)} cm</span>`;
    rulerEl.innerHTML = `<span>0 cm</span>${mk(0.25)}${mk(0.5)}${mk(0.75)}<span>${w.toFixed(1)} cm</span>`;
  }

  updateStatsUI() {
    const lenEl = document.getElementById("rollTotalLength");
    const utilEl = document.getElementById("rollUtilizationPct");
    const costEl = document.getElementById("rollTotalCost");
    const progressEl = document.getElementById("rollProgressFill");
    const queueCountEl = document.getElementById("rollQueueCount");
    const allocEl = document.getElementById("rollAllocatedCount");
    const gapBadge = document.getElementById("rollGapBadge");

    if (lenEl) lenEl.textContent = `${this.totalLengthCm} cm (${(this.totalLengthCm / 100).toFixed(2)} m)`;
    if (utilEl) utilEl.textContent = `${this.utilizationPct}%`;
    if (costEl) costEl.textContent = `R$ ${this.totalCostBrl.toFixed(2)}`;
    if (progressEl) progressEl.style.width = `${Math.min(this.utilizationPct, 100)}%`;
    if (queueCountEl) queueCountEl.textContent = `${this.items.length} itens`;
    if (allocEl) allocEl.textContent = `${this.items.length}`;
    if (gapBadge) gapBadge.textContent = `Folga: ${this.gap} cm`;

    this.renderQueueListUI();
    if (window.costCalculatorService && typeof window.costCalculatorService.renderUI === "function") {
      window.costCalculatorService.renderUI();
    }
  }

  renderQueueListUI() {
    const listContainer = document.getElementById("rollItemsQueueContainer");
    if (!listContainer) return;

    if (this.items.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 18px 10px; color: var(--text-muted); font-size: 11px; border: 1px dashed var(--border-medium); border-radius: var(--radius-sm);">
          <div style="font-size: 22px; margin-bottom: 4px;">🎞️</div>
          <strong style="color: var(--text-primary);">Rolo de impressão vazio</strong><br>
          <span style="font-size: 10px; color: var(--text-secondary); line-height: 1.4; display: inline-block; margin-top: 4px;">
            Envie estampas do Módulo 1 ou adicione Etiquetas de Gola abaixo.
          </span>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = this.items
      .map(
        (it) => `
      <div class="queue-item-card ${it.isFiller ? "filler-card" : ""} ${it.id === this.selectedId ? "selected" : ""}"
           onclick="window.gangSheetService.selectItem('${it.id}')" style="cursor:pointer;">
        <span class="badge ${it.isFiller ? "badge-amber" : "badge-cyan"}">${it.sizeLabel || ""}</span>
        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <strong>${it.orderNumber}</strong> - ${it.customerName}
          <div style="font-size: 10px; color: var(--text-muted);">${it.widthCm}×${it.heightCm} cm | ${it.shirtColor || ""}${(it.rot || 0) % 2 ? " | ↻ girada" : ""}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.gangSheetService.trimItem('${it.id}')" title="Aparar margem transparente desta arte (✂️)">✂️</button>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.gangSheetService.rotateItem('${it.id}')" title="Girar 90° (R)">↻</button>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.gangSheetService.removeItem('${it.id}')" title="Remover do rolo (Del)">✕</button>
      </div>`
      )
      .join("");
  }

  // ========================================================================
  // EXPORTAÇÃO COMPLETA DO ROLO (PNG, TIFF, PDF) - usa a imagem real de cada item
  // ========================================================================
  _loadAsyncImage(src) {
    return new Promise((resolve) => {
      if (!src) { resolve(null); return; }
      const cached = this.imageCache.get(src);
      if (cached && cached.complete && cached.naturalWidth > 0) {
        resolve(cached);
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        this.imageCache.set(src, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async drawItemForExport(ctx, it, exportScale, effectiveDpi) {
    const ix = Math.round(it.xCm * exportScale);
    const iy = Math.round(it.yCm * exportScale);
    const iw = Math.round(it.widthCm * exportScale);
    const ih = Math.round(it.heightCm * exportScale);
    const rot = (it.rot || 0) % 4;

    // Caso 1: Estampa interna de gola procedural (gera na escala nativa de impressão)
    if (it.isInternalTag && this.useOfficialLatitudeTag) {
      const tagW_px = rot % 2 ? ih : iw;
      const tagH_px = rot % 2 ? iw : ih;
      const tagDataUrl = this.generateProceduralNeckTag(it.sizeLabel || "M", tagW_px, tagH_px);
      const tagImg = await this._loadAsyncImage(tagDataUrl);
      if (tagImg) {
        this._renderImageOnExportCanvas(ctx, tagImg, ix, iy, iw, ih, rot, false);
        return;
      }
    }

    // Caso 2: Obter a imagem em alta resolução
    let img = null;
    let dataUrl = it.dataUrl;

    // Se a imagem no rolo tiver baixa resolução e for a arte ativa no Módulo 1, atualiza com a nova engine Ultra-HD
    if (window.imageEngineService && window.DTFState && it.artworkId === DTFState.imageEngine.activeArtworkId && window.imageEngineService.loaded) {
      const minRequiredW = Math.round(iw * 0.85);
      const currentNativeW = it.nativeWidthPx || 0;
      if (currentNativeW < minRequiredW) {
        const freshArt = window.imageEngineService.getCleanTransparentArtworkDataUrl(true, effectiveDpi);
        if (freshArt && freshArt.dataUrl) {
          it.dataUrl = freshArt.dataUrl;
          it.nativeWidthPx = freshArt.width;
          it.nativeHeightPx = freshArt.height;
          dataUrl = freshArt.dataUrl;
        }
      }
    }

    if (dataUrl) {
      img = await this._loadAsyncImage(dataUrl);
    } else if (it.artworkId) {
      const art = DTFState.imageEngine.uploadedImages.find((a) => a.id === it.artworkId);
      if (art && art.dataUrl) img = await this._loadAsyncImage(art.dataUrl);
    }

    if (img) {
      const isHalftone = Boolean(it.engineSettings && it.engineSettings.halftoneEnabled);
      this._renderImageOnExportCanvas(ctx, img, ix, iy, iw, ih, rot, isHalftone);
    }
  }

  _renderImageOnExportCanvas(ctx, img, ix, iy, iw, ih, rot, isHalftone) {
    ctx.save();

    // Para artes com Halftone DTF (retículas), desligamos a interpolação bilinear
    // garantindo que os pontos de tinta saiam 100% nítidos, sólidos e com borda definida
    if (isHalftone) {
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }

    if (rot === 0) {
      // Coordenadas inteiras exatas - renderização 1:1 sem jitter subpixel
      ctx.drawImage(img, ix, iy, iw, ih);
    } else {
      const cx = Math.round(ix + iw / 2);
      const cy = Math.round(iy + ih / 2);
      const dw = rot % 2 ? ih : iw;
      const dh = rot % 2 ? iw : ih;
      const halfW = Math.round(dw / 2);
      const halfH = Math.round(dh / 2);

      ctx.translate(cx, cy);
      ctx.rotate((rot * Math.PI) / 2);
      ctx.drawImage(img, -halfW, -halfH, dw, dh);
    }

    ctx.restore();
  }

  // ========================================================================
  // EXPORTAÇÃO COMPLETA DO ROLO (PNG, TIFF, PDF) - QUALIDADE ULTRA-HD NATIVA
  // ========================================================================
  async exportForPrintShop(format = "PNG") {
    const dpi = (window.DTFState && DTFState.imageEngine && DTFState.imageEngine.targetDPI) || 600;
    // Permite 300 e 600 DPI reais sem clamp artificial de 118 px/cm
    let exportScale = dpi / 2.54;
    const W = this.rollW;
    const L = Math.max(this.totalLengthCm, 1);

    // Limites de segurança do canvas do navegador (16384x16384 e ~160 Megapixels)
    const maxDim = 16384;
    const maxPixels = 160e6;
    exportScale = Math.min(exportScale, maxDim / W, maxDim / L, Math.sqrt(maxPixels / (W * L)));
    const effectiveDpi = Math.round(exportScale * 2.54);

    const expCanvas = document.createElement("canvas");
    expCanvas.width = Math.round(W * exportScale);
    expCanvas.height = Math.round(L * exportScale);
    const expCtx = expCanvas.getContext("2d", { willReadFrequently: true });
    expCtx.clearRect(0, 0, expCanvas.width, expCanvas.height); // fundo transparente (filme DTF)

    for (const it of this.items) {
      await this.drawItemForExport(expCtx, it, exportScale, effectiveDpi);
      if (DTFState.gangSheet.showCutMarks) {
        this.drawCutGuide(expCtx, it, exportScale, "rgba(255,0,0,0.85)", Math.max(1, exportScale * 0.02), [exportScale * 0.25, exportScale * 0.25]);
      }
    }

    const filename = `LATITUDE_DTF_GANG_${DTFState.gangSheet.rollCode}_${W}x${this.totalLengthCm}cm_${effectiveDpi}DPI`;

    if (format === "PNG") {
      if (window.ImageOps && ImageOps.downloadCanvasAsPngWithDpi) {
        await ImageOps.downloadCanvasAsPngWithDpi(expCanvas, filename, effectiveDpi);
      } else {
        const link = document.createElement("a");
        link.download = `${filename}.png`;
        link.href = expCanvas.toDataURL("image/png");
        link.click();
      }
      this.showNestingToast(`✅ Rolo PNG exportado em Ultra-HD: ${W} × ${this.totalLengthCm} cm (${effectiveDpi} DPI reais, ${expCanvas.width}×${expCanvas.height} px com pontos nítidos).`);
    } else if (format === "TIFF") {
      window.imageEngineService.downloadAsTIFF(expCanvas, filename, effectiveDpi);
    } else if (format === "PDF") {
      window.imageEngineService.downloadAsPDF(expCanvas, filename, W, this.totalLengthCm, effectiveDpi);
    }
  }

  // ========================================================================
  // EXPORTAR E IMPORTAR PROJETO DO ROLO (ARQUIVO .DTFROLL / JSON)
  // Salva o layout completo, medidas, posições, artes e configurações para reabrir depois
  // ========================================================================
  exportRollProject() {
    if (!this.items || this.items.length === 0) {
      this.showNestingToast("⚠️ O rolo está vazio. Adicione artes antes de exportar o projeto.");
      return;
    }

    const projectData = {
      app: "Latitude DTF Cockpit",
      version: "2.5.0",
      type: "gang-sheet-project",
      exportedAt: new Date().toISOString(),
      rollCode: DTFState.gangSheet.rollCode || "ROLO-PROJETO",
      rollWidthCm: this.rollW,
      safetyMarginCm: this.gap,
      totalLengthCm: this.totalLengthCm,
      utilizationPct: this.utilizationPct,
      totalCostBrl: this.totalCostBrl,
      targetDPI: (DTFState.imageEngine && DTFState.imageEngine.targetDPI) || 600,
      showCutMarks: DTFState.gangSheet.showCutMarks,
      items: this.items.map((it) => ({
        id: it.id,
        orderNumber: it.orderNumber,
        customerName: it.customerName,
        artworkId: it.artworkId,
        artworkName: it.artworkName,
        dataUrl: it.dataUrl,
        sourceDataUrl: it.sourceDataUrl || null,
        sizeLabel: it.sizeLabel,
        shirtColor: it.shirtColor,
        widthCm: it.widthCm,
        heightCm: it.heightCm,
        xCm: it.xCm,
        yCm: it.yCm,
        rot: it.rot || 0,
        isFiller: Boolean(it.isFiller),
        isInternalTag: Boolean(it.isInternalTag),
        cutLabel: it.cutLabel || "",
        nativeWidthPx: it.nativeWidthPx || null,
        nativeHeightPx: it.nativeHeightPx || null,
        engineSettings: it.engineSettings || null
      }))
    };

    const jsonStr = JSON.stringify(projectData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `PROJETO_ROLO_${projectData.rollCode}_${this.rollW}cm_${dateStamp}.dtfroll`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showNestingToast(`💾 Projeto do rolo exportado com sucesso: "${filename}" (${this.items.length} itens salvos)!`);
  }

  triggerImportRollProject() {
    let input = document.getElementById("importRollProjectInput");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "importRollProjectInput";
      input.accept = ".dtfroll,.json";
      input.style.display = "none";
      document.body.appendChild(input);
      input.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) this.importRollProject(file);
        input.value = "";
      });
    }
    input.click();
  }

  async importRollProject(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const project = JSON.parse(text);

      if (!project || !Array.isArray(project.items)) {
        this.showNestingToast("❌ Arquivo de projeto inválido ou corrompido.");
        return;
      }

      this.pushHistory();

      // Restaura largura da boca da plotter se especificada
      if (project.rollWidthCm) {
        this.setPlotterMouthWidth(project.rollWidthCm);
      }

      // Restaura folga entre artes
      if (project.safetyMarginCm !== undefined) {
        this.setGap(project.safetyMarginCm);
        const gapInput = document.getElementById("inputRollGapCm");
        if (gapInput) gapInput.value = project.safetyMarginCm;
      }

      // Restaura código do rolo
      if (project.rollCode) {
        DTFState.gangSheet.rollCode = project.rollCode;
      }

      // Limpa cache de imagens anterior e substitui itens
      this.imageCache.clear();
      DTFState.gangSheet.items = project.items.map((it) => ({
        id: it.id || "item_roll_" + Math.random().toString(36).slice(2, 9),
        orderNumber: it.orderNumber || "PED-IMPORT",
        customerName: it.customerName || "Cliente",
        artworkId: it.artworkId || null,
        artworkName: it.artworkName || "Arte",
        dataUrl: it.dataUrl || null,
        sourceDataUrl: it.sourceDataUrl || null,
        sizeLabel: it.sizeLabel || "M",
        shirtColor: it.shirtColor || "Preta",
        widthCm: parseFloat(it.widthCm) || 28.0,
        heightCm: parseFloat(it.heightCm) || 35.0,
        xCm: parseFloat(it.xCm) || 0,
        yCm: parseFloat(it.yCm) || 0,
        rot: parseInt(it.rot, 10) || 0,
        isFiller: Boolean(it.isFiller),
        isInternalTag: Boolean(it.isInternalTag),
        cutLabel: it.cutLabel || "",
        nativeWidthPx: it.nativeWidthPx || null,
        nativeHeightPx: it.nativeHeightPx || null,
        engineSettings: it.engineSettings || null
      }));

      this.selectedId = null;
      this.recomputeStats();
      this.render();
      this.updateStatsUI();

      this.showNestingToast(`📂 Projeto importado com sucesso: ${this.items.length} itens carregados no rolo!`);
    } catch (err) {
      console.error("Erro ao importar projeto do rolo:", err);
      this.showNestingToast("❌ Erro ao ler o arquivo de projeto. Verifique o formato do arquivo.");
    }
  }
  // ========================================================================
  initInternalTags() {
    this.internalTagWidthCm = 6.0;
    this.internalTagHeightCm = 7.0;
    this.customTagDataUrl = null;
    this.isTagBgRemoved = true;
    this.useOfficialLatitudeTag = true;

    try {
      const saved = localStorage.getItem("latitude.internalTags");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.widthCm) this.internalTagWidthCm = parseFloat(parsed.widthCm);
        if (parsed.heightCm) this.internalTagHeightCm = parseFloat(parsed.heightCm);
        if (parsed.useOfficialLatitudeTag !== undefined) {
          this.useOfficialLatitudeTag = Boolean(parsed.useOfficialLatitudeTag);
        } else {
          this.useOfficialLatitudeTag = true;
        }
        if (parsed.customTagDataUrl && !this.useOfficialLatitudeTag) {
          this.customTagDataUrl = parsed.customTagDataUrl;
          this.isTagBgRemoved = Boolean(parsed.isTagBgRemoved);
        }
      }
    } catch (e) { /* ignore */ }

    this.renderInternalTagsUI();
  }

  saveInternalTagsState() {
    try {
      localStorage.setItem("latitude.internalTags", JSON.stringify({
        widthCm: this.internalTagWidthCm,
        heightCm: this.internalTagHeightCm,
        useOfficialLatitudeTag: this.useOfficialLatitudeTag,
        customTagDataUrl: this.customTagDataUrl,
        isTagBgRemoved: this.isTagBgRemoved
      }));
    } catch (e) { /* ignore */ }
  }

  getInternalTagDataUrl(sizeLabel) {
    const s = String(sizeLabel || "M").toUpperCase().trim();

    // 1. Etiqueta Oficial Latitude Store (Padrão da Marca)
    if (this.useOfficialLatitudeTag || !this.customTagDataUrl) {
      if (window.LATITUDE_INTERNAL_TAGS && window.LATITUDE_INTERNAL_TAGS[s]) {
        return window.LATITUDE_INTERNAL_TAGS[s];
      }
      return this.generateDynamicLatitudeTag(s);
    }

    // 2. Arte personalizada carregada pelo operador
    return this.customTagDataUrl;
  }

  generateDynamicLatitudeTag(sizeLabel) {
    if (!window.LATITUDE_INTERNAL_TAGS || !window.LATITUDE_INTERNAL_TAGS.base) {
      return this.generateProceduralNeckTag(sizeLabel);
    }
    const canvas = document.createElement("canvas");
    canvas.width = 645;
    canvas.height = 746;
    const ctx = canvas.getContext("2d");

    // Base com logo Latitude e cuidados têxteis
    const baseImg = new Image();
    baseImg.src = window.LATITUDE_INTERNAL_TAGS.base;
    ctx.drawImage(baseImg, 0, 0);

    // Tipografia técnica do tamanho
    ctx.fillStyle = "#ffffff";
    const fontSize = sizeLabel.length > 2 ? 85 : 110;
    ctx.font = `italic 900 ${fontSize}px 'Arial Black', Impact, 'Outfit', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(sizeLabel, canvas.width / 2, 375);

    return canvas.toDataURL("image/png");
  }

  restoreOfficialLatitudeTag() {
    this.useOfficialLatitudeTag = true;
    this.customTagDataUrl = null;
    this.isTagBgRemoved = true;
    this.saveInternalTagsState();
    this.renderInternalTagsUI();
    this.showNestingToast("⭐ Etiqueta Oficial Latitude Store restaurada como padrão!");
  }

  generateProceduralNeckTag(sizeLabel, wPx = 600, hPx = 600) {
    const canvas = document.createElement("canvas");
    canvas.width = wPx;
    canvas.height = hPx;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, wPx, hPx);

    // Borda técnica suave
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, wPx - 40, hPx - 40);

    // Cabeçalho da Marca
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'Outfit', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("LATITUDE STORE", wPx / 2, 72);

    ctx.font = "600 15px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fillText("ESTAMPA INTERNA DTF", wPx / 2, 98);

    // Linha divisória
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 118);
    ctx.lineTo(wPx - 50, 118);
    ctx.stroke();

    // Box e Tamanho em Destaque
    ctx.fillStyle = "#00f0ff";
    ctx.font = "900 120px 'Arial Black', Impact, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(sizeLabel, wPx / 2, 230);

    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 4;
    ctx.strokeRect(wPx / 2 - 80, 155, 160, 150);

    // Informações da peça
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 19px 'Outfit', sans-serif";
    ctx.fillText("100% ALGODÃO PENTEADO 30.1", wPx / 2, 360);

    // Ícones de lavagem (Unicode limpo)
    ctx.font = "28px sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillText("🧺  🚫  🌡️  熨  💧", wPx / 2, 415);

    ctx.font = "14px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
    ctx.fillText("LAVAR DO AVESSO • SECAR À SOMBRA", wPx / 2, 465);

    ctx.font = "bold 16px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(0, 240, 255, 0.85)";
    ctx.fillText("FEITO NO BRASIL", wPx / 2, 520);

    return canvas.toDataURL("image/png");
  }

  addInternalTagToRoll(sizeLabel) {
    const dataUrl = this.getInternalTagDataUrl(sizeLabel);
    const w = this.internalTagWidthCm || 6.0;
    const h = this.internalTagHeightCm || 7.0;

    const newItem = {
      id: "tag_" + sizeLabel + "_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      orderNumber: "ETIQUETA",
      customerName: `Gola Tam ${sizeLabel}`,
      artworkId: "tag_internal_" + sizeLabel,
      artworkName: `Etiqueta_Gola_${sizeLabel}.png`,
      dataUrl: dataUrl,
      sizeLabel: `🏷️ ${sizeLabel}`,
      shirtColor: "Gola",
      widthCm: w,
      heightCm: h,
      xCm: 0,
      yCm: 0,
      rot: 0,
      isFiller: false,
      isInternalTag: true,
      cutLabel: `#ETIQUETA - Gola Tam ${sizeLabel}`
    };

    const added = this.addItemAtFreeSpot(newItem);
    this.showNestingToast(`🏷️ Etiqueta Latitude Tam ${sizeLabel} (${w}×${h} cm) adicionada ao rolo!`);
    return added;
  }

  addAllInternalTagsToRoll() {
    const sizes = ["PP", "P", "M", "G", "GG", "XG"];
    sizes.forEach((s) => this.addInternalTagToRoll(s));
    this.showNestingToast(`🏷️ Grade completa de etiquetas (PP ao XG) adicionada ao rolo!`);
  }

  handleInternalTagUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Gera canvas e remove fundo automaticamente uma única vez
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 600;
        canvas.height = img.naturalHeight || 600;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        let finalCanvas = canvas;
        if (window.ImageOps && ImageOps.removeBackground) {
          const bgRes = ImageOps.removeBackground(canvas, { tolerance: 35, includeIslands: true, choke: 1 });
          finalCanvas = bgRes.canvas;
          if (ImageOps.trimTransparentCanvas) {
            const trimRes = ImageOps.trimTransparentCanvas(finalCanvas, 0, 8);
            if (trimRes.wasTrimmed && trimRes.canvas) {
              finalCanvas = trimRes.canvas;
            }
          }
        }

        this.customTagDataUrl = finalCanvas.toDataURL("image/png");
        this.isTagBgRemoved = true;
        this.useOfficialLatitudeTag = false;
        this.saveInternalTagsState();
        this.renderInternalTagsUI();
        this.showNestingToast("✨ Arte personalizada carregada com fundo removido! Pronta para uso.");
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  removeInternalTagBackgroundOnce() {
    if (!this.customTagDataUrl) {
      this.showNestingToast("Carregue uma imagem de etiqueta primeiro para remover o fundo.");
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 600;
      canvas.height = img.naturalHeight || 600;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      let finalCanvas = canvas;
      if (window.ImageOps && ImageOps.removeBackground) {
        const bgRes = ImageOps.removeBackground(canvas, { tolerance: 35, includeIslands: true, choke: 1 });
        finalCanvas = bgRes.canvas;
        if (ImageOps.trimTransparentCanvas) {
          const trimRes = ImageOps.trimTransparentCanvas(finalCanvas, 0, 8);
          if (trimRes.wasTrimmed && trimRes.canvas) {
            finalCanvas = trimRes.canvas;
          }
        }
      }

      this.customTagDataUrl = finalCanvas.toDataURL("image/png");
      this.isTagBgRemoved = true;
      this.saveInternalTagsState();
      this.renderInternalTagsUI();
      this.showNestingToast("✨ Fundo da estampa interna removido e salvo permanentemente!");
    };
    img.src = this.customTagDataUrl;
  }

  setInternalTagDimensions(w, h) {
    if (w && w > 0) this.internalTagWidthCm = parseFloat(w);
    if (h && h > 0) this.internalTagHeightCm = parseFloat(h);
    this.saveInternalTagsState();
    this.renderInternalTagsUI();
    this.showNestingToast(`📐 Medida da estampa interna atualizada para ${this.internalTagWidthCm}×${this.internalTagHeightCm} cm.`);
  }

  renderInternalTagsUI() {
    const thumb = document.getElementById("internalTagThumbPreview");
    const nameDisp = document.getElementById("internalTagNameDisplay");
    const dimsLabel = document.getElementById("labelTagDims");
    const badgeStatus = document.getElementById("badgeTagBgRemoved");
    const inputW = document.getElementById("inputInternalTagWidth");
    const inputH = document.getElementById("inputInternalTagHeight");

    const w = this.internalTagWidthCm || 6.0;
    const h = this.internalTagHeightCm || 7.0;

    if (inputW) inputW.value = w;
    if (inputH) inputH.value = h;
    if (dimsLabel) dimsLabel.textContent = `${w} × ${h} cm`;

    // Atualiza botões da grade com a medida configurada
    document.querySelectorAll(".btn-internal-tag .tag-size-dim").forEach((el) => {
      el.textContent = `${w}×${h} cm`;
    });

    if (thumb) {
      if (this.useOfficialLatitudeTag || !this.customTagDataUrl) {
        const previewUrl = (window.LATITUDE_INTERNAL_TAGS && window.LATITUDE_INTERNAL_TAGS.M)
          ? window.LATITUDE_INTERNAL_TAGS.M
          : "assets/latitude_tag_M.png";
        thumb.innerHTML = `<img src="${previewUrl}" alt="Etiqueta Latitude" style="width:100%; height:100%; object-fit:contain; filter: drop-shadow(0 0 2px rgba(0,240,255,0.4));">`;
      } else {
        thumb.innerHTML = `<img src="${this.customTagDataUrl}" alt="Etiqueta Personalizada" style="width:100%; height:100%; object-fit:contain;">`;
      }
    }

    if (nameDisp) {
      if (this.useOfficialLatitudeTag || !this.customTagDataUrl) {
        nameDisp.innerHTML = `<span style="color: var(--accent-cyan);">⭐ Etiqueta Oficial Latitude Store</span>`;
      } else {
        nameDisp.innerHTML = `<span>Arte Personalizada do Operador</span>`;
      }
    }

    if (badgeStatus) {
      badgeStatus.textContent = "Fundo Transparente DTF";
      badgeStatus.className = "badge badge-green";
    }
  }
}

window.GangSheetService = GangSheetService;
