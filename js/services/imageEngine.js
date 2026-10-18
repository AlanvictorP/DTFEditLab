/**
 * LATITUDE DTF COCKPIT - MÃ“DULO 1: TRATAMENTO GRÃFICO (IMAGE ENGINE ULTRA-DPI & LPI)
 * ManipulaÃ§Ã£o algorÃ­tmica em Canvas: Knockout de Preto, Halftone em LPI calibrado,
 * Zoom interativo, ExportaÃ§Ã£o individual (PNG, TIFF, PDF), Drag & Drop e Mockup Imediato.
 */

class ImageEngineService {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.sourceImage = new Image();
    this.loaded = false;
    this.zoomLevel = 1.0;
    this.bgTolerance = 35;
    this.bgIncludeIslands = false;
    this.bgChoke = 1;
    this.magicWandActive = false;
    this.magicWandContiguous = true;
    this.magicWandTolerance = 35;
    this.undoHistory = [];
    this.shirtSimulationMode = DTFState.imageEngine.shirtSimulationMode || false;
    this.shirtDragState = null;
    this.cachedShirtBounds = null;
    this.cropModeActive = false;
    this.cropBox = null;
    this.cropDragState = null;
    this.cropAspectRatio = "free";
    this.cachedCropRenderBounds = null;
    this.whiteRemovalTolerance = 35;
    this.init();
  }

  init() {
    this.sourceImage.crossOrigin = "anonymous";
    this.sourceImage.onload = () => {
      this.loaded = true;
      this.render();
      this.renderUploadedGalleryUI();
      this.renderSupplierSizeButtons();
    };

    // Inicializa arte ativa da lista de uploads
    this.loadActiveArtwork();
    this.renderSupplierSizeButtons();
  }

  setCanvas(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.setupDragAndDrop();

    const viewportBox = this.canvas.closest(".viewport-canvas-center");
    if (viewportBox && window.CanvasViewportController) {
      this.viewport = new CanvasViewportController(viewportBox, this.canvas, {
        minZoom: 0.1,
        maxZoom: 10.0,
        onChange: (z) => this.onViewportZoomChange(z),
        onSettle: () => this.render()
      });
    }

    if (this.loaded) {
      this.render();
    }
  }

  // CARREGA A IMAGEM ATIVA DO ESTADO
  loadActiveArtwork() {
    const list = DTFState.imageEngine.uploadedImages;
    let activeArt = list.find((a) => a.id === DTFState.imageEngine.activeArtworkId);

    if (!activeArt && list.length > 0) {
      activeArt = list[0];
      DTFState.imageEngine.activeArtworkId = activeArt.id;
      DTFState.imageEngine.activeArtworkName = activeArt.name;
    }

    if (activeArt && activeArt.dataUrl) {
      this.sourceImage.src = activeArt.dataUrl;
    } else {
      this.loaded = false;
      this.sourceImage.src = "";
      DTFState.imageEngine.activeArtworkId = null;
      DTFState.imageEngine.activeArtworkName = "";
      this.render();
      this.renderUploadedGalleryUI();
      this.updateMetricsUI();
    }
  }

  // ARTE PROCEDURAL RICA (DOOM STREETWEAR) PARA O INÃCIO DA SESSÃƒO
  createDoomStreetwearGraphic(artMetadata) {
    const offCanvas = document.createElement("canvas");
    offCanvas.width = 1600;
    offCanvas.height = 2000;
    const offCtx = offCanvas.getContext("2d");

    offCtx.clearRect(0, 0, 1600, 2000);

    // Fundo vitral gÃ³tico vermelho escuro com degradÃª
    const bgGrad = offCtx.createRadialGradient(800, 1000, 100, 800, 1000, 800);
    bgGrad.addColorStop(0, "#c41e3a");
    bgGrad.addColorStop(0.5, "#4a0404");
    bgGrad.addColorStop(0.8, "#1a0202");
    bgGrad.addColorStop(1, "#050508");

    offCtx.fillStyle = bgGrad;
    offCtx.beginPath();
    offCtx.arc(800, 1000, 650, 0, Math.PI * 2);
    offCtx.fill();

    // Vitral estilizado gÃ³tico com linhas pretas
    offCtx.strokeStyle = "#08080c";
    offCtx.lineWidth = 14;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      offCtx.beginPath();
      offCtx.moveTo(800, 1000);
      offCtx.lineTo(800 + Math.cos(angle) * 650, 1000 + Math.sin(angle) * 650);
      offCtx.stroke();
    }

    offCtx.beginPath();
    offCtx.arc(800, 1000, 420, 0, Math.PI * 2);
    offCtx.stroke();

    offCtx.beginPath();
    offCtx.arc(800, 1000, 220, 0, Math.PI * 2);
    offCtx.stroke();

    // Tipografia metÃ¡lica estilo DOOM (Verde Neon com bordas afiadas)
    offCtx.save();
    offCtx.font = "900 240px Impact, 'Arial Black', sans-serif";
    offCtx.textAlign = "center";
    offCtx.textBaseline = "middle";

    offCtx.fillStyle = "#000000";
    offCtx.fillText("DOOM", 800, 470);

    const doomGrad = offCtx.createLinearGradient(800, 320, 800, 560);
    doomGrad.addColorStop(0, "#a8ff78");
    doomGrad.addColorStop(0.5, "#78e08f");
    doomGrad.addColorStop(1, "#1e3c00");

    offCtx.fillStyle = doomGrad;
    offCtx.fillText("DOOM", 795, 460);

    offCtx.strokeStyle = "#ffffff";
    offCtx.lineWidth = 4;
    offCtx.strokeText("DOOM", 795, 460);
    offCtx.restore();

    // Detalhes da armadura / caveira central urbana
    offCtx.fillStyle = "#222530";
    offCtx.beginPath();
    offCtx.moveTo(600, 750);
    offCtx.lineTo(1000, 750);
    offCtx.lineTo(950, 1300);
    offCtx.lineTo(800, 1450);
    offCtx.lineTo(650, 1300);
    offCtx.closePath();
    offCtx.fill();
    offCtx.strokeStyle = "#00f0ff";
    offCtx.lineWidth = 6;
    offCtx.stroke();

    // Viseira cibernÃ©tica neon
    offCtx.fillStyle = "#00f0ff";
    offCtx.shadowColor = "#00f0ff";
    offCtx.shadowBlur = 40;
    offCtx.fillRect(680, 920, 240, 60);
    offCtx.shadowBlur = 0;

    // Microtextos e detalhes DTF 
    offCtx.fillStyle = "#ffffff";
    offCtx.font = "700 32px 'JetBrains Mono', monospace";
    offCtx.textAlign = "center";
    offCtx.fillText("// HEAVY WEIGHT STREETWEAR 30.1 //", 800, 1600);

    offCtx.fillStyle = "#00f0ff";
    offCtx.fillText("ULTRA RESOLUTION HIGH-DPI MASTER", 800, 1650);

    let finalCanvas = offCanvas;
    if (window.ImageOps && ImageOps.trimTransparentCanvas) {
      const trimRes = ImageOps.trimTransparentCanvas(offCanvas, 0, 8);
      if (trimRes.wasTrimmed && trimRes.canvas) {
        finalCanvas = trimRes.canvas;
      }
    }

    const generatedDataUrl = finalCanvas.toDataURL("image/png");
    artMetadata.dataUrl = generatedDataUrl;
    artMetadata.widthPx = finalCanvas.width;
    artMetadata.heightPx = finalCanvas.height;
    this.sourceImage.src = generatedDataUrl;
  }

  // ADICIONA UMA NOVA IMAGEM ENVIADA PELO USUÃRIO
  addUploadedImage(file, dataUrl, customName, width, height) {
    const name = file ? file.name : (customName || "Arte_Carregada_" + (DTFState.imageEngine.uploadedImages.length + 1) + ".png");
    const sizeFormatted = file
      ? (file.size > 1048576 ? (file.size / 1048576).toFixed(1) + " MB" : (file.size / 1024).toFixed(0) + " KB")
      : "Alta DefiniÃ§Ã£o";

    const newArt = {
      id: "usr_img_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      name: name,
      dataUrl: dataUrl,
      widthPx: width || 3000,
      heightPx: height || 4000,
      sizeFormatted: sizeFormatted,
      loadedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    DTFState.imageEngine.uploadedImages.unshift(newArt);
    this.selectUploadedImage(newArt.id);
  }

  // SELECIONA UMA IMAGEM DA GALERIA DO OPERADOR PARA EXIBIR NO CANVAS
  selectUploadedImage(id) {
    const art = DTFState.imageEngine.uploadedImages.find((a) => a.id === id);
    if (!art) return;

    DTFState.imageEngine.activeArtworkId = art.id;
    DTFState.imageEngine.activeArtworkName = art.name;

    if (art.dataUrl) {
      this.sourceImage.src = art.dataUrl;
    } else {
      this.loaded = false;
      this.sourceImage.src = "";
      this.render();
    }

    this.renderUploadedGalleryUI();
    this.updateMetricsUI();
  }

  // EXCLUI OU LIMPA A ARTE ATIVA ATUAL DA TELA
  clearActiveArtwork() {
    if (DTFState.imageEngine.activeArtworkId) {
      this.removeUploadedImage(DTFState.imageEngine.activeArtworkId);
    } else {
      this.loaded = false;
      this.sourceImage.src = "";
      DTFState.imageEngine.activeArtworkId = null;
      DTFState.imageEngine.activeArtworkName = "";
      this.render();
      this.renderUploadedGalleryUI();
      this.updateMetricsUI();
    }
    this.showFeedbackToast("🗑️ Imagem removida da tela de tratamento gráfico.");
  }

  // REMOVE UMA IMAGEM DA GALERIA DO OPERADOR
  removeUploadedImage(id, event) {
    if (event) event.stopPropagation();

    DTFState.imageEngine.uploadedImages = DTFState.imageEngine.uploadedImages.filter((a) => a.id !== id);

    if (DTFState.imageEngine.activeArtworkId === id) {
      if (DTFState.imageEngine.uploadedImages.length > 0) {
        this.selectUploadedImage(DTFState.imageEngine.uploadedImages[0].id);
      } else {
        DTFState.imageEngine.activeArtworkId = null;
        DTFState.imageEngine.activeArtworkName = "";
        this.loaded = false;
        this.sourceImage.src = "";
        this.render();
        this.renderUploadedGalleryUI();
        this.updateMetricsUI();
      }
    } else {
      this.renderUploadedGalleryUI();
    }
  }

  // RENDERIZA A LISTA VISUAL DAS IMAGENS CARREGADAS PELO USUÃRIO
  renderUploadedGalleryUI() {
    const container = document.getElementById("uploadedGalleryContainer");
    if (!container) return;

    const list = DTFState.imageEngine.uploadedImages;
    if (list.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 18px; color: var(--text-muted); font-size: 11.5px; border: 1px dashed var(--border-medium); border-radius: var(--radius-sm);">
          Nenhuma imagem carregada.<br>
          <span style="color: var(--accent-cyan);">Arraste arquivos aqui ou clique no botÃ£o acima.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = list
      .map((item) => {
        const isActive = item.id === DTFState.imageEngine.activeArtworkId;
        return `
          <div class="uploaded-item-card ${isActive ? 'active' : ''}" onclick="window.imageEngineService.selectUploadedImage('${item.id}')" title="Clique para trazer esta imagem para a tela">
            <div class="thumb-wrapper">
              ${item.dataUrl ? `<img src="${item.dataUrl}" alt="${item.name}" class="uploaded-thumb-img">` : `<div class="uploaded-thumb-placeholder">ARTE</div>`}
            </div>
            <div class="item-info">
              <div class="item-filename" title="${item.name}">${item.name}</div>
              <div class="item-meta">${item.sizeFormatted} â€¢ ${item.loadedAt}</div>
            </div>
            <button class="btn-delete-thumb" onclick="window.imageEngineService.removeUploadedImage('${item.id}', event)" title="Excluir imagem da fila">âœ•</button>
          </div>
        `;
      })
      .join("");

    this.updateMetricsUI();
  }

  // =========================================================================
  // SISTEMA DE SUPER ZOOM (ATÃ‰ 1000%) E NAVEGAÃ‡ÃƒO VIEWPORT (PAN / ZOOM)
  // =========================================================================
  onViewportZoomChange(zoomFactor) {
    const pct = Math.round(zoomFactor * 100);
    DTFState.imageEngine.canvasZoom = zoomFactor;

    const zoomDisplay = document.getElementById("canvasZoomDisplay");
    if (zoomDisplay) zoomDisplay.textContent = `${pct}%`;

    // Ativa interpolaÃ§Ã£o pixelada em zoom alto (>= 250%) para inspeÃ§Ã£o precisa de halftone e arestas
    if (this.canvas) {
      this.canvas.classList.toggle("pixelated", zoomFactor >= 2.5);
    }
  }

  zoomIn() {
    if (this.viewport) {
      this.viewport.zoomAt(undefined, undefined, this.viewport.zoom * 1.3);
    }
  }

  zoomOut() {
    if (this.viewport) {
      this.viewport.zoomAt(undefined, undefined, this.viewport.zoom / 1.3);
    }
  }

  setZoomQuick(level) {
    if (!this.viewport) return;
    if (level === "fit") {
      this.viewport.fit();
    } else {
      this.viewport.setZoom(parseFloat(level) || 1.0);
    }
  }

  /**
   * Traz a imagem para o centro da tela.
   * @param {boolean} fit - Se true, ajusta a escala para caber na tela.
   */
  centerArtwork(fit = false) {
    if (!this.viewport) return;
    this.viewport.centerImage(fit);
    this.showFeedbackToast(fit ? "⛶ Imagem ajustada à janela" : "🎯 Imagem centralizada na tela");
  }

  toggleFocusMode() {
    DTFState.imageEngine.focusMode = !DTFState.imageEngine.focusMode;
    const isFocus = DTFState.imageEngine.focusMode;

    const studioEl = document.querySelector(".image-studio");
    const btnFocus = document.getElementById("btnToggleCanvasFocus");

    if (studioEl) {
      studioEl.classList.toggle("focus-mode", isFocus);
    }

    if (btnFocus) {
      btnFocus.innerHTML = isFocus ? "⛶ Reduzir Painel" : "⛶ Expandir Tela";
      btnFocus.classList.toggle("btn-accent", isFocus);
      btnFocus.classList.toggle("btn-secondary", !isFocus);
    }

    setTimeout(() => {
      if (this.viewport) this.viewport.onContainerResized();
      this.render();
    }, 180);
  }

  // SIMULAÇÃO DE FUNDO DO TECIDO (VISUALIZAR KNOCKOUT DE PRETO NA CAMISETA)
  setCanvasBackground(bgType, customColor = null) {
    DTFState.imageEngine.canvasBgType = bgType;
    const centerViewport = document.querySelector(".viewport-canvas-center");
    const labelIndicator = document.getElementById("canvasBgModeLabel");

    document.querySelectorAll(".sim-fabric-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-bg") === bgType);
    });

    if (!centerViewport) return;

    if (bgType === "checkerboard") {
      centerViewport.classList.add("checkerboard-bg");
      centerViewport.style.backgroundColor = "";
      centerViewport.style.backgroundImage = "";
      if (labelIndicator) labelIndicator.textContent = "Transparência PNG (Xadrez)";
    } else {
      centerViewport.classList.remove("checkerboard-bg");
      let color = "#111317";
      let label = "Camiseta Preta";

      if (bgType === "black") {
        color = "#101216";
        label = "Camiseta Preta (Toque Zero)";
        centerViewport.style.backgroundImage = "radial-gradient(circle at center, #1b1e26 0%, #0c0d11 100%)";
      } else if (bgType === "white") {
        color = "#f4f5f8";
        label = "Camiseta Branca";
        centerViewport.style.backgroundImage = "radial-gradient(circle at center, #ffffff 0%, #e8eaee 100%)";
      } else if (bgType === "gray") {
        color = "#6c7380";
        label = "Cinza Mescla";
        centerViewport.style.backgroundImage = "radial-gradient(circle at center, #78808d 0%, #5d636f 100%)";
      } else if (bgType === "red") {
        color = "#851522";
        label = "Vermelha";
        centerViewport.style.backgroundImage = "radial-gradient(circle at center, #9e1a2b 0%, #6b101b 100%)";
      } else if (bgType === "offwhite") {
        color = "#e8e2d5";
        label = "Off-White";
        centerViewport.style.backgroundImage = "radial-gradient(circle at center, #f0ebd0 0%, #dad2c0 100%)";
      } else if (bgType === "custom" && customColor) {
        color = customColor;
        label = `Personalizada (${customColor})`;
        centerViewport.style.backgroundImage = "none";
      }

      centerViewport.style.backgroundColor = color;
      DTFState.imageEngine.canvasBgColor = color;
      if (labelIndicator) labelIndicator.textContent = `Fundo Simulado: ${label}`;
    }
  }


  // =========================================================================
  // AJUSTE DE RESOLUÃ‡ÃƒO (DPI) & HALFTONE (LPI - LINES PER INCH)
  // =========================================================================
  setDPI(dpiValue) {
    const dpi = Math.max(150, Math.min(4800, parseInt(dpiValue, 10) || 600));
    DTFState.imageEngine.targetDPI = dpi;

    document.querySelectorAll(".dpi-btn").forEach((btn) => {
      const btnDpi = parseInt(btn.getAttribute("data-dpi"), 10);
      btn.classList.toggle("active", btnDpi === dpi);
    });

    const slider = document.getElementById("sliderCustomDpi");
    const sliderDisplay = document.getElementById("sliderDpiValueDisplay");
    const badgeTop = document.getElementById("topbarDpiBadge");
    const badgeBlock = document.getElementById("badgeCurrentDpi");

    if (slider) slider.value = dpi;
    if (sliderDisplay) sliderDisplay.textContent = `${dpi} DPI`;
    if (badgeTop) badgeTop.textContent = `${dpi} DPI NATIVO`;
    if (badgeBlock) badgeBlock.textContent = `${dpi} DPI`;

    this.updateMetricsUI();
  }

  setHalftoneLPI(lpiValue) {
    const lpi = Math.max(10, Math.min(100, parseInt(lpiValue, 10) || 45));
    DTFState.imageEngine.halftoneLPI = lpi;

    const slider = document.getElementById("sliderHalftoneLPI");
    const display = document.getElementById("halftoneLpiVal");
    if (slider) slider.value = lpi;
    if (display) display.textContent = `${lpi} LPI`;

    this.updateHalftonePitchDisplay();
    this.render();
  }

  setHalftoneAngle(angleValue) {
    const angle = parseInt(angleValue, 10) || 0;
    DTFState.imageEngine.halftoneAngle = angle;

    const slider = document.getElementById("sliderHalftoneAngle");
    const display = document.getElementById("halftoneAngleVal");
    if (slider) slider.value = angle;
    if (display) display.textContent = `${angle}Â°`;

    this.render();
  }

  updateHalftonePitchDisplay() {
    const infoEl = document.getElementById("halftonePitchInfo");
    if (!infoEl) return;
    const lpi = DTFState.imageEngine.halftoneLPI || 45;
    const pitchMm = (25.4 / lpi).toFixed(2);
    infoEl.textContent = `Tamanho do microponto: ~${pitchMm} mm (${lpi} linhas/pol)`;
  }

  // =========================================================================
  // FERRAMENTAS DE QUALIDADE REAL & NITIDEZ (ALÃ‰M DO DPI)
  // =========================================================================
  setUnsharpStrength(strengthValue) {
    DTFState.imageEngine.unsharpStrength = parseInt(strengthValue, 10) || 0;
    const display = document.getElementById("valUnsharpDisplay");
    if (display) display.textContent = `${DTFState.imageEngine.unsharpStrength}%`;
    this.render();
  }

  setDenoiseStrength(denoiseValue) {
    DTFState.imageEngine.denoiseStrength = parseInt(denoiseValue, 10) || 0;
    const display = document.getElementById("valDenoiseDisplay");
    if (display) display.textContent = `${DTFState.imageEngine.denoiseStrength}%`;
    this.render();
  }

  setVibranceBoost(vibranceValue) {
    DTFState.imageEngine.vibranceBoost = parseInt(vibranceValue, 10) || 0;
    const display = document.getElementById("valVibranceDisplay");
    if (display) display.textContent = `+${DTFState.imageEngine.vibranceBoost}%`;
    this.render();
  }

  // =========================================================================
  // OPERAÇÕES PRINCIPAIS: REMOÇÃO DE FUNDO, VARINHA MÁGICA, CHOKE & HISTÓRICO
  // =========================================================================

  saveToHistory() {
    if (!this.sourceImage || !this.loaded) return;
    const currentArt = DTFState.imageEngine.uploadedImages.find(
      (a) => a.id === DTFState.imageEngine.activeArtworkId
    );
    const dataUrl = (currentArt && currentArt.dataUrl) || (this.canvas ? this.canvas.toDataURL("image/png") : this.sourceImage.src);
    this.undoHistory.push({
      dataUrl,
      name: (currentArt && currentArt.name) || "Arte"
    });
    if (this.undoHistory.length > 15) this.undoHistory.shift();
  }

  undoLastAction() {
    if (!this.undoHistory || this.undoHistory.length === 0) {
      this.showFeedbackToast("Nenhuma ação anterior para desfazer.");
      return;
    }
    const prev = this.undoHistory.pop();
    this.replaceActiveArtwork(prev.dataUrl, prev.name);
    this.showFeedbackToast("↺ Última alteração desfeita com sucesso.");
  }

  setBgTolerance(val) {
    this.bgTolerance = parseInt(val, 10) || 35;
    this.magicWandTolerance = this.bgTolerance;
    const disp = document.getElementById("bgToleranceVal");
    if (disp) disp.textContent = `${this.bgTolerance}%`;
  }

  setIncludeIslands(checked) {
    this.bgIncludeIslands = Boolean(checked);
    const label = document.getElementById("labelIncludeIslands");
    if (label) label.textContent = this.bgIncludeIslands ? "Eliminar Ilhas / Vazados (Ativo)" : "Apenas Bordas Externas";
  }

  setBgChoke(val) {
    this.bgChoke = parseInt(val, 10) || 1;
  }

  toggleMagicWand(enable = null) {
    this.magicWandActive = enable !== null ? enable : !this.magicWandActive;
    const btnWand = document.getElementById("btnToggleMagicWand");
    const btnSubWand = document.getElementById("btnSubstripWand");
    const vp = document.querySelector(".viewport-canvas-center");
    if (btnWand) btnWand.classList.toggle("active", this.magicWandActive);
    if (btnSubWand) btnSubWand.classList.toggle("active", this.magicWandActive);
    if (vp) vp.classList.toggle("vp-wand-active", this.magicWandActive);
    this.showFeedbackToast(this.magicWandActive
      ? "🪄 Varinha Mágica Ativa: Clique sobre qualquer resto de preto ou cor indesejada para apagar!"
      : "✋ Modo Pan / Navegação Reativado");
  }

  setMagicWandContiguous(contiguous) {
    this.magicWandContiguous = Boolean(contiguous);
    this.showFeedbackToast(this.magicWandContiguous ? "Varinha Mágica: Modo Ilha Contígua" : "Varinha Mágica: Modo Cor Global (Toda a Imagem)");
  }

  applyMagicWand(imgX, imgY) {
    if (!this.loaded || !this.sourceImage) return;
    this.saveToHistory();

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.sourceImage.naturalWidth || 1200;
    tempCanvas.height = this.sourceImage.naturalHeight || 1200;
    const tCtx = tempCanvas.getContext("2d");
    tCtx.drawImage(this.sourceImage, 0, 0);

    const tol = this.magicWandTolerance || this.bgTolerance || 35;
    const contiguous = this.magicWandContiguous;
    const choke = this.bgChoke || 1;

    const result = window.ImageOps && ImageOps.magicWand
      ? ImageOps.magicWand(tempCanvas, imgX, imgY, { tolerance: tol, contiguous, choke })
      : tempCanvas;

    let finalCanvas = result;
    if (window.ImageOps && ImageOps.trimTransparentCanvas) {
      const trimRes = ImageOps.trimTransparentCanvas(result, 0, 8);
      if (trimRes.wasTrimmed && trimRes.box) {
        finalCanvas = trimRes.canvas;
        const aspect = finalCanvas.height / Math.max(finalCanvas.width, 1);
        DTFState.imageEngine.customHeightCm = Math.round((DTFState.imageEngine.customWidthCm * aspect) * 10) / 10;
      }
    }

    this._cachedBox = null;
    this.replaceActiveArtwork(finalCanvas.toDataURL("image/png"), "Arte_Varinha_Magica.png");
    this.showFeedbackToast("🪄 Área/Cor apagada com sucesso! Bordas limpas sem restos de preto.");
  }

  cleanArtworkEdges(chokePx = 1) {
    if (!this.loaded || !this.sourceImage) return;
    this.saveToHistory();

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.sourceImage.naturalWidth || 1200;
    tempCanvas.height = this.sourceImage.naturalHeight || 1200;
    const tCtx = tempCanvas.getContext("2d");
    tCtx.drawImage(this.sourceImage, 0, 0);

    const cleaned = window.ImageOps && ImageOps.cleanEdges
      ? ImageOps.cleanEdges(tempCanvas, { choke: chokePx })
      : tempCanvas;

    let finalCanvas = cleaned;
    if (window.ImageOps && ImageOps.trimTransparentCanvas) {
      const trimRes = ImageOps.trimTransparentCanvas(cleaned, 0, 8);
      if (trimRes.wasTrimmed && trimRes.box) {
        finalCanvas = trimRes.canvas;
        const aspect = finalCanvas.height / Math.max(finalCanvas.width, 1);
        DTFState.imageEngine.customHeightCm = Math.round((DTFState.imageEngine.customWidthCm * aspect) * 10) / 10;
      }
    }

    this._cachedBox = null;
    this.replaceActiveArtwork(finalCanvas.toDataURL("image/png"), `Arte_Bordas_Limpas_${chokePx}px.png`);
    this.showFeedbackToast(`✂️ Tratamento de bordas concluído! Choke de ${chokePx}px aplicado e restos de preto eliminados.`);
  }

  /** Botão 1: "Apenas Remover Fundo" - Preserva contornos pretos e cores sólidas (Anime/Mangá) */
  /** Botão 1: "Apenas Remover Fundo" - Preserva contornos pretos e cores sólidas (Anime/Mangá) e apara bordas vazias */
  removeBackgroundOnly() {
    if (!this.loaded || !this.sourceImage) return;
    this.saveToHistory();

    const currentArt = DTFState.imageEngine.uploadedImages.find(
      (a) => a.id === DTFState.imageEngine.activeArtworkId
    );
    if (currentArt && !currentArt.originalDataUrl) {
      currentArt.originalDataUrl = currentArt.dataUrl || this.sourceImage.src;
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.sourceImage.naturalWidth || 1200;
    tempCanvas.height = this.sourceImage.naturalHeight || 1200;
    const tCtx = tempCanvas.getContext("2d");
    tCtx.drawImage(this.sourceImage, 0, 0);

    const tol = this.bgTolerance || 35;
    const includeIslands = this.bgIncludeIslands || false;
    const choke = this.bgChoke || 1;

    const result = window.ImageOps
      ? ImageOps.removeBackground(tempCanvas, { tolerance: tol, includeIslands, choke })
      : { canvas: tempCanvas };

    DTFState.imageEngine.blackKnockoutEnabled = false;
    const toggleKo = document.getElementById("toggleBlackKnockout");
    if (toggleKo) toggleKo.checked = false;

    // Auto-apara as margens transparentes que sobraram da remoção do fundo:
    let finalCanvas = result.canvas;
    let savedPct = 0;
    if (window.ImageOps && ImageOps.trimTransparentCanvas) {
      const trimRes = ImageOps.trimTransparentCanvas(result.canvas, 0, 8);
      if (trimRes.wasTrimmed && trimRes.box) {
        finalCanvas = trimRes.canvas;
        savedPct = trimRes.box.savedAreaPct;
        const aspect = finalCanvas.height / Math.max(finalCanvas.width, 1);
        DTFState.imageEngine.customHeightCm = Math.round((DTFState.imageEngine.customWidthCm * aspect) * 10) / 10;
      }
    }

    this._cachedBox = null;
    this.replaceActiveArtwork(finalCanvas.toDataURL("image/png"), "Sem_Fundo_Contorno_Limpo.png");
    this.showFeedbackToast(savedPct > 0
      ? `✨ Fundo removido e margens aparadas! Economizou ${savedPct}% de área vazia (Estampa real: ${DTFState.imageEngine.customWidthCm}×${DTFState.imageEngine.customHeightCm} cm).`
      : "✨ Fundo removido mantendo traços pretos internos intactos e bordas limpas!");
  }

  /**
   * Recorta todas as margens transparentes vazias ao redor da arte ativa,
   * ajustando a tela exatamente aos limites dos pixels da estampa e calibrando as medidas.
   */
  trimActiveArtworkTransparency(silent = false) {
    if (!this.loaded || !this.sourceImage) return;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.sourceImage.naturalWidth || 1200;
    tempCanvas.height = this.sourceImage.naturalHeight || 1200;
    const tCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    this.processArtwork(tCtx, tempCanvas.width, tempCanvas.height);

    if (!window.ImageOps || !ImageOps.trimTransparentCanvas) return;

    const trimRes = ImageOps.trimTransparentCanvas(tempCanvas, 0, 8);
    if (!trimRes.wasTrimmed) {
      if (!silent) this.showFeedbackToast("ℹ️ Esta arte já está 100% ajustada, sem sobras transparentes nas bordas.");
      return;
    }

    this.saveToHistory();

    const box = trimRes.box;
    const trimmedDataUrl = trimRes.canvas.toDataURL("image/png");

    // Mantém a largura física desejada para a arte visível e ajusta a altura com a nova proporção exata
    const aspect = trimRes.canvas.height / Math.max(trimRes.canvas.width, 1);
    DTFState.imageEngine.customHeightCm = Math.round((DTFState.imageEngine.customWidthCm * aspect) * 10) / 10;

    this._cachedBox = null;
    this.replaceActiveArtwork(trimmedDataUrl, "Arte_Aparada_Sem_Bordas.png");
    this.updateMetricsUI();
    this.render();

    if (!silent) {
      this.showFeedbackToast(`✂️ Margens transparentes eliminadas! Economia de ${box.savedAreaPct}% de área vazia. Tamanho calibrado para a arte real: ${DTFState.imageEngine.customWidthCm} × ${DTFState.imageEngine.customHeightCm} cm.`);
    }
  }

  /** Botão 2: "Knockout para Camisa Preta" - Remove fundo e elimina canal preto para o tecido */
  knockoutForBlackShirt() {
    if (!this.loaded || !this.sourceImage) return;
    this.saveToHistory();

    const currentArt = DTFState.imageEngine.uploadedImages.find(
      (a) => a.id === DTFState.imageEngine.activeArtworkId
    );
    if (currentArt && !currentArt.originalDataUrl) {
      currentArt.originalDataUrl = currentArt.dataUrl || this.sourceImage.src;
    }

    DTFState.imageEngine.blackKnockoutEnabled = true;
    DTFState.imageEngine.targetShirtColor = "Preta";

    const toggleKo = document.getElementById("toggleBlackKnockout");
    if (toggleKo) toggleKo.checked = true;

    const selectShirt = document.getElementById("selectTargetShirtColor");
    if (selectShirt) selectShirt.value = "Preta";

    this._cachedBox = null;
    this.setCanvasBackground("black");
    this.render();
    this.showFeedbackToast("⚡ Knockout para Camiseta Preta Ativado! O preto foi zerado para economia de tinta e toque suave.");
  }

  /**
   * OPÇÃO 1 DE BRANCO: "Remover Fundo Branco (Bordas Suavizadas)"
   * Remove o fundo branco externo conectado às bordas da estampa, preservando
   * 100% intactos os elementos brancos internos (olhos, dentes, letras, caveiras).
   * Aplica suavização anti-serrilhado (anti-aliasing feather) e descontaminação de aresta
   * para eliminar qualquer halo esbranquiçado ou escada de pixel.
   */
  removeWhiteBackgroundContour(opts = {}) {
    if (!this.loaded || !this.sourceImage) return;
    this.saveToHistory();

    const currentArt = DTFState.imageEngine.uploadedImages.find(
      (a) => a.id === DTFState.imageEngine.activeArtworkId
    );
    if (currentArt && !currentArt.originalDataUrl) {
      currentArt.originalDataUrl = currentArt.dataUrl || this.sourceImage.src;
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.sourceImage.naturalWidth || 1200;
    tempCanvas.height = this.sourceImage.naturalHeight || 1200;
    const tCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    tCtx.drawImage(this.sourceImage, 0, 0);

    const tol = opts.tolerance ?? this.whiteRemovalTolerance ?? 35;
    const smoothing = opts.smoothing ?? 2;
    const choke = opts.choke ?? 1;

    const result = window.ImageOps && ImageOps.removeWhiteBackgroundContour
      ? ImageOps.removeWhiteBackgroundContour(tempCanvas, { tolerance: tol, smoothing, choke })
      : { canvas: tempCanvas, removedPct: 0 };

    // Auto-apara margens transparentes que sobraram
    let finalCanvas = result.canvas;
    let savedPct = 0;
    if (window.ImageOps && ImageOps.trimTransparentCanvas) {
      const trimRes = ImageOps.trimTransparentCanvas(result.canvas, 0, 8);
      if (trimRes.wasTrimmed && trimRes.box) {
        finalCanvas = trimRes.canvas;
        savedPct = trimRes.box.savedAreaPct;
        const aspect = finalCanvas.height / Math.max(finalCanvas.width, 1);
        DTFState.imageEngine.customHeightCm = Math.round((DTFState.imageEngine.customWidthCm * aspect) * 10) / 10;
      }
    }

    this._cachedBox = null;
    this.replaceActiveArtwork(finalCanvas.toDataURL("image/png"), "Fundo_Branco_Suavizado.png");
    this.showFeedbackToast(savedPct > 0
      ? `✨ Fundo branco removido com bordas suavizadas! Elementos brancos internos preservados. Economizou ${savedPct}% de área vazia.`
      : "✨ Fundo branco externo removido com bordas suavizadas! Elementos brancos internos (olhos/letras) preservados intactos.");
  }

  setWhiteTolerance(val) {
    this.whiteRemovalTolerance = parseInt(val, 10);
    const label = document.getElementById("whiteToleranceVal");
    if (label) label.textContent = `${val}%`;
  }

  /**
   * OPÇÃO 2 DE BRANCO: "Knockout para Camiseta Branca (Zerar Todo Branco)"
   * Remove TODO o branco da estampa (externo e interno) convertendo para transparência suave em L* (Lab).
   * Elimina placa de borracha para estampar em camiseta branca (toque zero e economia de tinta branca).
   */
  knockoutForWhiteShirt() {
    if (!this.loaded || !this.sourceImage) return;
    this.saveToHistory();

    const currentArt = DTFState.imageEngine.uploadedImages.find(
      (a) => a.id === DTFState.imageEngine.activeArtworkId
    );
    if (currentArt && !currentArt.originalDataUrl) {
      currentArt.originalDataUrl = currentArt.dataUrl || this.sourceImage.src;
    }

    DTFState.imageEngine.whiteKnockoutEnabled = true;
    DTFState.imageEngine.targetShirtColor = "Branca";

    const toggleWhiteKo = document.getElementById("toggleWhiteKnockout");
    if (toggleWhiteKo) toggleWhiteKo.checked = true;

    const selectShirt = document.getElementById("selectTargetShirtColor");
    if (selectShirt) selectShirt.value = "Branca";

    this.setCanvasBackground("white");
    this._cachedBox = null;
    this.render();
    this.showFeedbackToast("⚪ Knockout para Camiseta Branca Ativado! Todo o branco foi zerado para estampa com toque suave no tecido branco.");
  }

  /**
   * Aplica permanentemente o knockout de todo o branco da arte, gerando PNG com transparência total.
   */
  applyPermanentWhiteKnockout() {
    if (!this.loaded || !this.sourceImage) return;
    this.saveToHistory();

    const currentArt = DTFState.imageEngine.uploadedImages.find(
      (a) => a.id === DTFState.imageEngine.activeArtworkId
    );
    if (currentArt && !currentArt.originalDataUrl) {
      currentArt.originalDataUrl = currentArt.dataUrl || this.sourceImage.src;
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.sourceImage.naturalWidth || 1200;
    tempCanvas.height = this.sourceImage.naturalHeight || 1200;
    const tCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    tCtx.drawImage(this.sourceImage, 0, 0);

    const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const thr = DTFState.imageEngine.whiteKnockoutThreshold || 88;
    const fea = DTFState.imageEngine.whiteKnockoutFeather || 12;

    if (window.ImageOps && ImageOps.whiteKnockout) {
      ImageOps.whiteKnockout(imgData, { threshold: thr, feather: fea });
      tCtx.putImageData(imgData, 0, 0);
    }

    let finalCanvas = tempCanvas;
    if (window.ImageOps && ImageOps.trimTransparentCanvas) {
      const trimRes = ImageOps.trimTransparentCanvas(tempCanvas, 0, 8);
      if (trimRes.wasTrimmed && trimRes.box) {
        finalCanvas = trimRes.canvas;
        const aspect = finalCanvas.height / Math.max(finalCanvas.width, 1);
        DTFState.imageEngine.customHeightCm = Math.round((DTFState.imageEngine.customWidthCm * aspect) * 10) / 10;
      }
    }

    DTFState.imageEngine.whiteKnockoutEnabled = false;
    const toggleWhiteKo = document.getElementById("toggleWhiteKnockout");
    if (toggleWhiteKo) toggleWhiteKo.checked = false;

    this._cachedBox = null;
    this.replaceActiveArtwork(finalCanvas.toDataURL("image/png"), "Sem_Branco_Total_Camiseta_Branca.png");
    this.showFeedbackToast("⚪ Todo o branco da arte foi convertido em transparência permanente para Camiseta Branca!");
  }

  // =========================================================================
  // FERRAMENTA DE CORTE INTERATIVO (CROP TOOL)
  // =========================================================================
  toggleCropMode() {
    if (this.cropModeActive) {
      this.cancelCrop();
    } else {
      this.startCropMode();
    }
  }

  startCropMode() {
    if (!this.loaded || !this.sourceImage) {
      this.showFeedbackToast("Carregue uma imagem antes de cortar.");
      return;
    }

    if (this.shirtSimulationMode) {
      this._wasShirtSim = true;
      this.shirtSimulationMode = false;
      const btnSim = document.getElementById("btnSubstripShirtSim");
      if (btnSim) btnSim.classList.remove("active");
    }

    if (this.magicWandActive) {
      this.toggleMagicWand();
    }

    this.cropModeActive = true;
    DTFState.imageEngine.cropModeActive = true;

    const imgW = this.sourceImage.naturalWidth || 1000;
    const imgH = this.sourceImage.naturalHeight || 1000;
    const padX = Math.round(imgW * 0.04);
    const padY = Math.round(imgH * 0.04);
    this.cropBox = {
      x: padX,
      y: padY,
      w: Math.max(20, imgW - padX * 2),
      h: Math.max(20, imgH - padY * 2)
    };

    const btnSubstrip = document.getElementById("btnSubstripCrop");
    if (btnSubstrip) btnSubstrip.classList.add("active");
    const btnSidebar = document.getElementById("btnSidebarCrop");
    if (btnSidebar) btnSidebar.classList.add("active");

    const bar = document.getElementById("cropFloatingBar");
    if (bar) bar.style.display = "flex";

    this.render();
    this.updateCropBarInfo();
    this.showFeedbackToast("✂️ Modo Cortar Imagem Ativado: Ajuste o retângulo pelas alças. Pressione [Enter] para confirmar ou [Esc] para cancelar.");
  }

  cancelCrop() {
    this.cropModeActive = false;
    DTFState.imageEngine.cropModeActive = false;
    this.cropDragState = null;
    if (this.canvas) this.canvas.style.cursor = "";

    const btnSubstrip = document.getElementById("btnSubstripCrop");
    if (btnSubstrip) btnSubstrip.classList.remove("active");
    const btnSidebar = document.getElementById("btnSidebarCrop");
    if (btnSidebar) btnSidebar.classList.add("active");

    const bar = document.getElementById("cropFloatingBar");
    if (bar) bar.style.display = "none";

    if (this._wasShirtSim) {
      this._wasShirtSim = false;
      this.shirtSimulationMode = true;
      const btnSim = document.getElementById("btnSubstripShirtSim");
      if (btnSim) btnSim.classList.add("active");
    }

    this.render();
    this.showFeedbackToast("Modo de corte cancelado.");
  }

  applyCrop() {
    if (!this.cropModeActive || !this.loaded || !this.sourceImage) return;

    const imgW = this.sourceImage.naturalWidth || 1000;
    const imgH = this.sourceImage.naturalHeight || 1000;
    const box = this.cropBox;

    const cx = Math.max(0, Math.round(box.x));
    const cy = Math.max(0, Math.round(box.y));
    const cw = Math.min(imgW - cx, Math.round(box.w));
    const ch = Math.min(imgH - cy, Math.round(box.h));

    if (cw <= 10 || ch <= 10) {
      this.showFeedbackToast("⚠️ Selecione uma área de corte maior.");
      return;
    }

    this.saveToHistory();

    const currentArt = DTFState.imageEngine.uploadedImages.find(
      (a) => a.id === DTFState.imageEngine.activeArtworkId
    );
    if (currentArt && !currentArt.originalDataUrl) {
      currentArt.originalDataUrl = currentArt.dataUrl || this.sourceImage.src;
    }

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cw;
    cropCanvas.height = ch;
    const cctx = cropCanvas.getContext("2d", { willReadFrequently: true });
    cctx.imageSmoothingQuality = "high";

    // Desenha exatamente a fatia selecionada
    cctx.drawImage(this.sourceImage, cx, cy, cw, ch, 0, 0, cw, ch);

    // Recalcula medidas físicas (cm) mantendo a largura e ajustando proporção exata
    const newAspect = ch / Math.max(cw, 1);
    DTFState.imageEngine.customHeightCm = Math.round((DTFState.imageEngine.customWidthCm * newAspect) * 10) / 10;

    // Sai do modo de corte
    this.cropModeActive = false;
    DTFState.imageEngine.cropModeActive = false;
    this.cropDragState = null;
    if (this.canvas) this.canvas.style.cursor = "";

    const btnSubstrip = document.getElementById("btnSubstripCrop");
    if (btnSubstrip) btnSubstrip.classList.remove("active");
    const btnSidebar = document.getElementById("btnSidebarCrop");
    if (btnSidebar) btnSidebar.classList.add("active");

    const bar = document.getElementById("cropFloatingBar");
    if (bar) bar.style.display = "none";

    if (this._wasShirtSim) {
      this._wasShirtSim = false;
      this.shirtSimulationMode = true;
      const btnSim = document.getElementById("btnSubstripShirtSim");
      if (btnSim) btnSim.classList.add("active");
    }

    this._cachedBox = null;
    this.replaceActiveArtwork(cropCanvas.toDataURL("image/png"), "Arte_Cortada.png");
    this.showFeedbackToast(`✂️ Imagem cortada com sucesso! Resolução: ${cw} × ${ch} px (${DTFState.imageEngine.customWidthCm} × ${DTFState.imageEngine.customHeightCm} cm).`);
  }

  setCropAspect(ratio) {
    this.cropAspectRatio = ratio;
    document.querySelectorAll(".crop-ratio-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-ratio") === ratio);
    });

    if (!this.sourceImage || !this.cropBox) return;
    const imgW = this.sourceImage.naturalWidth || 1000;
    const imgH = this.sourceImage.naturalHeight || 1000;

    if (ratio === "1:1") {
      const side = Math.min(this.cropBox.w, this.cropBox.h);
      this.cropBox.w = side;
      this.cropBox.h = side;
    } else if (ratio === "original") {
      const origRatio = imgW / imgH;
      const newH = Math.round(this.cropBox.w / origRatio);
      if (this.cropBox.y + newH <= imgH) {
        this.cropBox.h = newH;
      } else {
        this.cropBox.w = Math.round(this.cropBox.h * origRatio);
      }
    }
    this.render();
    this.updateCropBarInfo();
  }

  snapCropToArtwork() {
    if (!this.loaded || !this.sourceImage) return;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.sourceImage.naturalWidth || 1000;
    tempCanvas.height = this.sourceImage.naturalHeight || 1000;
    const tCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    tCtx.drawImage(this.sourceImage, 0, 0);

    if (window.ImageOps && ImageOps.getAlphaBoundingBox) {
      const box = ImageOps.getAlphaBoundingBox(tempCanvas, 8);
      if (!box.isEmpty) {
        const pad = 4;
        this.cropBox = {
          x: Math.max(0, box.minX - pad),
          y: Math.max(0, box.minY - pad),
          w: Math.min(tempCanvas.width - Math.max(0, box.minX - pad), box.width + pad * 2),
          h: Math.min(tempCanvas.height - Math.max(0, box.minY - pad), box.height + pad * 2)
        };
        this.render();
        this.updateCropBarInfo();
        this.showFeedbackToast("🎯 Corte ajustado automaticamente aos limites exatos da estampa!");
      } else {
        this.showFeedbackToast("Nenhuma área não-transparente detectada para ajuste automático.");
      }
    }
  }

  updateCropBarInfo() {
    const infoEl = document.getElementById("cropBarInfo");
    if (!infoEl || !this.cropBox) return;
    const cw = Math.round(this.cropBox.w);
    const ch = Math.round(this.cropBox.h);
    const aspect = ch / Math.max(cw, 1);
    const cmW = DTFState.imageEngine.customWidthCm;
    const cmH = (cmW * aspect).toFixed(1);
    infoEl.textContent = `${cw} × ${ch} px (${cmW} × ${cmH} cm)`;
  }

  renderCropOverlay(ctx, backingW, backingH) {
    if (!this.cropModeActive || !this.sourceImage) return;

    const imgW = this.sourceImage.naturalWidth || 1000;
    const imgH = this.sourceImage.naturalHeight || 1000;

    if (!this.cropBox || this.cropBox.w <= 0) {
      const padX = Math.round(imgW * 0.04);
      const padY = Math.round(imgH * 0.04);
      this.cropBox = { x: padX, y: padY, w: Math.max(20, imgW - padX * 2), h: Math.max(20, imgH - padY * 2) };
    }

    const scaleX = backingW / imgW;
    const scaleY = backingH / imgH;
    const cX = Math.round(this.cropBox.x * scaleX);
    const cY = Math.round(this.cropBox.y * scaleY);
    const cW = Math.round(this.cropBox.w * scaleX);
    const cH = Math.round(this.cropBox.h * scaleY);

    this.cachedCropRenderBounds = { cX, cY, cW, cH, scaleX, scaleY };

    ctx.save();

    // 1. Área escura fora do recorte (Shade)
    ctx.fillStyle = "rgba(6, 8, 12, 0.72)";
    ctx.fillRect(0, 0, backingW, cY);                               // Top
    ctx.fillRect(0, cY + cH, backingW, Math.max(0, backingH - (cY + cH))); // Bottom
    ctx.fillRect(0, cY, cX, cH);                                   // Left
    ctx.fillRect(cX + cW, cY, Math.max(0, backingW - (cX + cW)), cH); // Right

    // 2. Linhas de enquadramento (Regra dos Terços)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cX, cY + cH / 3); ctx.lineTo(cX + cW, cY + cH / 3);
    ctx.moveTo(cX, cY + (2 * cH) / 3); ctx.lineTo(cX + cW, cY + (2 * cH) / 3);
    ctx.moveTo(cX + cW / 3, cY); ctx.lineTo(cX + cW / 3, cY + cH);
    ctx.moveTo(cX + (2 * cW) / 3, cY); ctx.lineTo(cX + (2 * cW) / 3, cY + cH);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Moldura do recorte (Neon Cyan)
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(cX, cY, cW, cH);

    // 4. Alças nos 4 cantos (cantoneiras L grossas de alta precisão)
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    const arm = Math.min(18, Math.min(cW, cH) / 3);

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(cX, cY + arm); ctx.lineTo(cX, cY); ctx.lineTo(cX + arm, cY);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(cX + cW - arm, cY); ctx.lineTo(cX + cW, cY); ctx.lineTo(cX + cW, cY + arm);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(cX, cY + cH - arm); ctx.lineTo(cX, cY + cH); ctx.lineTo(cX + arm, cY + cH);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(cX + cW - arm, cY + cH); ctx.lineTo(cX + cW, cY + cH); ctx.lineTo(cX + cW, cY + cH - arm);
    ctx.stroke();

    // 5. Barras no centro de cada aresta
    const midArm = Math.min(14, Math.min(cW, cH) / 4);
    // Top
    ctx.beginPath();
    ctx.moveTo(cX + cW / 2 - midArm, cY); ctx.lineTo(cX + cW / 2 + midArm, cY);
    ctx.stroke();
    // Bottom
    ctx.beginPath();
    ctx.moveTo(cX + cW / 2 - midArm, cY + cH); ctx.lineTo(cX + cW / 2 + midArm, cY + cH);
    ctx.stroke();
    // Left
    ctx.beginPath();
    ctx.moveTo(cX, cY + cH / 2 - midArm); ctx.lineTo(cX, cY + cH / 2 + midArm);
    ctx.stroke();
    // Right
    ctx.beginPath();
    ctx.moveTo(cX + cW, cY + cH / 2 - midArm); ctx.lineTo(cX + cW, cY + cH / 2 + midArm);
    ctx.stroke();

    // 6. Pill Flutuante de Medidas
    const cropW_px = Math.round(this.cropBox.w);
    const cropH_px = Math.round(this.cropBox.h);
    const cmW = DTFState.imageEngine.customWidthCm;
    const cmH = Math.round((cmW * (cropH_px / Math.max(cropW_px, 1))) * 10) / 10;
    const badgeText = `✂️ ${cropW_px} × ${cropH_px} px  •  ${cmW} × ${cmH} cm`;

    ctx.font = "bold 11.5px 'JetBrains Mono', monospace";
    const tw = ctx.measureText(badgeText).width;
    const bw = tw + 20;
    const bh = 24;
    const bx = Math.round(cX + (cW / 2) - (bw / 2));
    const by = cY > 32 ? Math.round(cY - 30) : Math.round(cY + 8);

    ctx.fillStyle = "rgba(10, 14, 20, 0.92)";
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#00f0ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, bx + bw / 2, by + bh / 2);

    ctx.restore();
  }

  handleCropPointerDown(e) {
    if (!this.cropModeActive || !this.cachedCropRenderBounds) return false;

    const rect = this.canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const canvasY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    const b = this.cachedCropRenderBounds;
    const cX = b.cX, cY = b.cY, cW = b.cW, cH = b.cH;
    const hitTol = 16;

    let handle = null;
    let mode = "resize";

    if (Math.hypot(canvasX - cX, canvasY - cY) <= hitTol) handle = "tl";
    else if (Math.hypot(canvasX - (cX + cW), canvasY - cY) <= hitTol) handle = "tr";
    else if (Math.hypot(canvasX - cX, canvasY - (cY + cH)) <= hitTol) handle = "bl";
    else if (Math.hypot(canvasX - (cX + cW), canvasY - (cY + cH)) <= hitTol) handle = "br";
    else if (Math.abs(canvasY - cY) <= hitTol && canvasX >= cX && canvasX <= cX + cW) handle = "t";
    else if (Math.abs(canvasY - (cY + cH)) <= hitTol && canvasX >= cX && canvasX <= cX + cW) handle = "b";
    else if (Math.abs(canvasX - cX) <= hitTol && canvasY >= cY && canvasY <= cY + cH) handle = "l";
    else if (Math.abs(canvasX - (cX + cW)) <= hitTol && canvasY >= cY && canvasY <= cY + cH) handle = "r";
    else if (canvasX > cX && canvasX < cX + cW && canvasY > cY && canvasY < cY + cH) {
      mode = "move";
      handle = "center";
    }

    if (handle) {
      this.cropDragState = {
        mode,
        handle,
        startCanvasX: canvasX,
        startCanvasY: canvasY,
        origBox: { ...this.cropBox },
        scaleX: b.scaleX,
        scaleY: b.scaleY
      };
      return true;
    }

    // Se clicou fora, reposiciona o retângulo iniciando nova seleção
    const imgX = canvasX / b.scaleX;
    const imgY = canvasY / b.scaleY;
    const imgW = this.sourceImage.naturalWidth || 1000;
    const imgH = this.sourceImage.naturalHeight || 1000;
    const minW = Math.round(imgW * 0.3);
    const minH = Math.round(imgH * 0.3);
    this.cropBox = {
      x: Math.round(Math.max(0, Math.min(imgW - minW, imgX - minW / 2))),
      y: Math.round(Math.max(0, Math.min(imgH - minH, imgY - minH / 2))),
      w: minW,
      h: minH
    };
    this.render();
    this.updateCropBarInfo();
    return true;
  }

  handleCropPointerMove(e) {
    if (!this.cropModeActive || !this.cachedCropRenderBounds) return false;

    const rect = this.canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const canvasY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    const b = this.cachedCropRenderBounds;
    const imgW = this.sourceImage.naturalWidth || 1000;
    const imgH = this.sourceImage.naturalHeight || 1000;

    if (this.cropDragState) {
      const s = this.cropDragState;
      const dxImg = (canvasX - s.startCanvasX) / s.scaleX;
      const dyImg = (canvasY - s.startCanvasY) / s.scaleY;

      if (s.mode === "move") {
        let newX = s.origBox.x + dxImg;
        let newY = s.origBox.y + dyImg;
        newX = Math.max(0, Math.min(imgW - s.origBox.w, newX));
        newY = Math.max(0, Math.min(imgH - s.origBox.h, newY));
        this.cropBox.x = Math.round(newX);
        this.cropBox.y = Math.round(newY);
      } else if (s.mode === "resize") {
        let x1 = s.origBox.x;
        let y1 = s.origBox.y;
        let x2 = s.origBox.x + s.origBox.w;
        let y2 = s.origBox.y + s.origBox.h;

        const h = s.handle;
        if (h.includes("l")) {
          x1 = Math.min(x2 - 20, Math.max(0, s.origBox.x + dxImg));
        }
        if (h.includes("r")) {
          x2 = Math.max(x1 + 20, Math.min(imgW, s.origBox.x + s.origBox.w + dxImg));
        }
        if (h.includes("t")) {
          y1 = Math.min(y2 - 20, Math.max(0, s.origBox.y + dyImg));
        }
        if (h.includes("b")) {
          y2 = Math.max(y1 + 20, Math.min(imgH, s.origBox.y + s.origBox.h + dyImg));
        }

        // Proporções fixas
        if (this.cropAspectRatio === "1:1") {
          const side = Math.min(x2 - x1, y2 - y1);
          if (h.includes("l")) x1 = x2 - side; else x2 = x1 + side;
          if (h.includes("t")) y1 = y2 - side; else y2 = y1 + side;
        } else if (this.cropAspectRatio === "original") {
          const targetAspect = imgH / imgW;
          const currW = x2 - x1;
          const targetH = currW * targetAspect;
          if (h.includes("t")) y1 = y2 - targetH; else y2 = y1 + targetH;
        }

        this.cropBox = {
          x: Math.round(Math.max(0, x1)),
          y: Math.round(Math.max(0, y1)),
          w: Math.round(Math.min(imgW - Math.max(0, x1), x2 - x1)),
          h: Math.round(Math.min(imgH - Math.max(0, y1), y2 - y1))
        };
      }

      this.render();
      this.updateCropBarInfo();
      return true;
    }

    // Cursor hover update
    const cX = b.cX, cY = b.cY, cW = b.cW, cH = b.cH;
    const hitTol = 14;

    const nearTL = Math.hypot(canvasX - cX, canvasY - cY) <= hitTol;
    const nearTR = Math.hypot(canvasX - (cX + cW), canvasY - cY) <= hitTol;
    const nearBL = Math.hypot(canvasX - cX, canvasY - (cY + cH)) <= hitTol;
    const nearBR = Math.hypot(canvasX - (cX + cW), canvasY - (cY + cH)) <= hitTol;

    const nearT = Math.abs(canvasY - cY) <= hitTol && canvasX >= cX && canvasX <= cX + cW;
    const nearB = Math.abs(canvasY - (cY + cH)) <= hitTol && canvasX >= cX && canvasX <= cX + cW;
    const nearL = Math.abs(canvasX - cX) <= hitTol && canvasY >= cY && canvasY <= cY + cH;
    const nearR = Math.abs(canvasX - (cX + cW)) <= hitTol && canvasY >= cY && canvasY <= cY + cH;

    if (nearTL || nearBR) {
      this.canvas.style.cursor = "nwse-resize";
    } else if (nearTR || nearBL) {
      this.canvas.style.cursor = "nesw-resize";
    } else if (nearT || nearB) {
      this.canvas.style.cursor = "ns-resize";
    } else if (nearL || nearR) {
      this.canvas.style.cursor = "ew-resize";
    } else if (canvasX > cX && canvasX < cX + cW && canvasY > cY && canvasY < cY + cH) {
      this.canvas.style.cursor = "move";
    } else {
      this.canvas.style.cursor = "crosshair";
    }

    return false;
  }

  handleCropPointerUp() {
    if (this.cropDragState) {
      this.cropDragState = null;
      if (this.canvas) this.canvas.style.cursor = "";
      return true;
    }
    return false;
  }

  /** Restaura a imagem original sem cortes ou edições */
  restoreOriginalArtwork() {
    const currentArt = DTFState.imageEngine.uploadedImages.find(
      (a) => a.id === DTFState.imageEngine.activeArtworkId
    );
    if (!currentArt || !currentArt.originalDataUrl) {
      this.showFeedbackToast("Esta já é a versão original da imagem.");
      return;
    }
    this.saveToHistory();
    this.replaceActiveArtwork(currentArt.originalDataUrl, currentArt.name);
    this.showFeedbackToast("↺ Versão original restaurada.");
  }

  /** Botão "Vetorizar (SVG)": Abre o Vector AI Studio para comparação split e refinamento */
  vectorizeArtwork() {
    if (!this.loaded || !this.sourceImage) return;

    // Prepara canvas limpo contendo estritamente a arte (com tratamentos e knockouts), sem o molde da camiseta nem cotas técnicas
    const artW = this.sourceImage.naturalWidth || 1600;
    const artH = this.sourceImage.naturalHeight || 2000;
    const artCanvas = document.createElement("canvas");
    artCanvas.width = artW;
    artCanvas.height = artH;
    const aCtx = artCanvas.getContext("2d", { willReadFrequently: true });
    this.processArtwork(aCtx, artW, artH);

    if (window.vectorStudioService) {
      window.vectorStudioService.open(artCanvas);
      return;
    }

    if (window.VectorEngine && VectorEngine.vectorize) {
      const { svg, stats } = VectorEngine.vectorize(artCanvas, { colors: 16, maxSide: 1200, corners: 65, smooth: 0.8 });
      this.lastSvg = svg;

      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const name = (DTFState.imageEngine.activeArtworkName || "Arte").replace(/\.[^/.]+$/, "");
      link.download = `${name}_Vetor_Curvas.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      this.showFeedbackToast(`📐 Vetorização Concluída! ${stats.paths} curvas Bézier geradas em ${stats.colors} cores.`);
      return;
    }

    if (!window.ImageOps || !ImageOps.vectorize) {
      this.showFeedbackToast("Módulo de vetorização não disponível.");
      return;
    }

    const { svg, stats } = ImageOps.vectorize(this.canvas, { colors: 14, maxSide: 900 });
    this.lastSvg = svg;

    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const name = (DTFState.imageEngine.activeArtworkName || "Arte").replace(/\.[^/.]+$/, "");
    link.download = `${name}_Vetor_Curvas.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);

    this.showFeedbackToast(`📐 Vetorização Concluída! ${stats.paths} curvas geradas.`);
  }

  /** Botão "Redesenho IA (AI Redraw)": Pipeline generativo inteligente em 2 etapas (Visão GPT-4o + Geração Silk/DTF) */
  async aiRedraw() {
    if (!this.loaded || !this.sourceImage) return;

    this.showFeedbackToast("🎨 Iniciando Redesenho IA: Etapa A (Visão GPT-4o) + Etapa B (Geração Serigráfica)...");

    const backendUrl = (window.aiCopilotService && aiCopilotService.backendUrl) || "http://localhost:8000";

    try {
      const res = await fetch(`${backendUrl}/api/v1/ai/redraw_advanced`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_data: this.canvas.toDataURL("image/png"),
          extra_instructions: "Estilo serigráfico de alto impacto, contornos pretos espessos, cores 100% chapadas, fundo preto puro."
        })
      });

      const data = await res.json();
      if (data.success && data.imageUrl) {
        this.replaceActiveArtwork(data.imageUrl, "IA_Redraw_UltraHD.png");
        
        let toastMsg = "✅ Redesenho IA Concluído em Altíssima Resolução!";
        if (data.vision_data && data.vision_data.R1) {
          toastMsg += ` Estilo: ${data.vision_data.R1}`;
        }
        this.showFeedbackToast(toastMsg);

        if (window.aiCopilotService) {
          aiCopilotService.appendMessage({
            sender: "assistant",
            text: `🎨 **Redesenho de Estampa Concluído com Sucesso!**\n\n• **Estilo Visual:** ${data.vision_data?.R1 || "Serigrafia / Silk-screen"}\n• **Paleta Chapada:** ${data.vision_data?.R2 || "Cores sólidas de alto contraste"}\n• **Motor:** ${data.engine || "Generative AI"}\n\nA imagem no simulador foi atualizada com traços nítidos e contornos limpos para estamparia.`
          });
        }
        return;
      }
    } catch (err) {
      console.warn("Backend avançado offline ou erro na chamada, aplicando tratamento local:", err);
      this.showFeedbackToast("⚠️ Backend offline: inicie o servidor Python (uvicorn api_server:app) para usar o Redesenho com GPT-4o + Flux/DALL-E.");
    }
  }

  /** Troca tonalidades de cores (ex.: "mude a cor para vermelho") */
  recolorActiveArtwork(fromColor, toColor) {
    if (!this.canvas) return false;
    const ctx = this.canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const count = ImageOps.recolor(imgData, fromColor, toColor, 45);
    if (count > 0) {
      ctx.putImageData(imgData, 0, 0);
      this.replaceActiveArtwork(this.canvas.toDataURL("image/png"), "Recolorida.png");
      return true;
    }
    return false;
  }

  replaceActiveArtwork(dataUrl, name) {
    const list = DTFState.imageEngine.uploadedImages;
    let art = list.find((a) => a.id === DTFState.imageEngine.activeArtworkId);
    if (!art) {
      art = { id: "art_" + Date.now(), name: name || "Arte_Modificada.png", dataUrl };
      list.unshift(art);
      DTFState.imageEngine.activeArtworkId = art.id;
    } else {
      if (!art.originalDataUrl && art.dataUrl) art.originalDataUrl = art.dataUrl;
      art.dataUrl = dataUrl;
      if (name) art.name = name;
    }
    DTFState.imageEngine.activeArtworkName = art.name;

    this.sourceImage = new Image();
    this.sourceImage.crossOrigin = "anonymous";
    this.sourceImage.onload = () => {
      this.loaded = true;
      this.render();
      this.renderUploadedGalleryUI();
    };
    this.sourceImage.src = dataUrl;
  }

  showFeedbackToast(msg) {
    if (window.gangSheetService && window.gangSheetService.showNestingToast) {
      window.gangSheetService.showNestingToast(msg);
    } else {
      console.log(msg);
    }
  }

  // =========================================================================
  // GESTÃO DE FORNECEDORES E GRADE DINÂMICA DE TAMANHOS
  // =========================================================================
  setSupplier(supplierId) {
    const supplier = DTFState.suppliers[supplierId];
    if (!supplier) return;

    DTFState.imageEngine.activeSupplierId = supplierId;

    const selectEl = document.getElementById("selectShirtSupplier");
    if (selectEl) selectEl.value = supplierId;

    // Se o tamanho atual não existir no novo fornecedor, adota o primeiro disponível
    if (!supplier.sizes[DTFState.imageEngine.selectedSize]) {
      DTFState.imageEngine.selectedSize = Object.keys(supplier.sizes)[0] || "M";
    }

    const currentSizeData = DTFState.getCurrentShirtSizeData();
    DTFState.imageEngine.customWidthCm = currentSizeData.defaultPrintWidthCm;
    DTFState.imageEngine.customHeightCm = currentSizeData.defaultPrintHeightCm;

    this.renderSupplierSizeButtons();
    this.updateMetricsUI();
    this.render();

    this.showFeedbackToast(`🏢 Fornecedor ativo: ${supplier.name} (${supplier.subtitle})`);
  }

  renderSupplierSizeButtons() {
    const container = document.getElementById("supplierSizeGridButtons");
    if (!container) return;

    const supplier = DTFState.getCurrentSupplier();
    const activeKey = DTFState.imageEngine.selectedSize;

    // Renderiza botões focados estritamente nas medidas da estampa DTF (sem poluição da grade de camisas)
    container.innerHTML = Object.entries(supplier.sizes).map(([key, item]) => {
      const isActive = key === activeKey;
      return `
        <button type="button" class="size-btn ${isActive ? 'active' : ''}" data-size="${key}" onclick="window.imageEngineService.setSizePreset('${key}')" title="${item.label} - Estampa: ${item.defaultPrintWidthCm}×${item.defaultPrintHeightCm} cm">
          <div class="size-btn-header">
            <strong>Tam ${item.label}</strong>
          </div>
          <div class="size-print-badge">${item.defaultPrintWidthCm}×${item.defaultPrintHeightCm} cm</div>
        </button>
      `;
    }).join("");
  }

  setSizePreset(presetKey) {
    const supplier = DTFState.getCurrentSupplier();
    const sizeData = supplier.sizes[presetKey];
    if (sizeData) {
      DTFState.imageEngine.selectedSize = presetKey;
      DTFState.imageEngine.customWidthCm = sizeData.defaultPrintWidthCm;
      DTFState.imageEngine.customHeightCm = sizeData.defaultPrintHeightCm;

      if (sizeData.isPocket) {
        DTFState.imageEngine.shirtPlacement = "pocket";
        DTFState.imageEngine.shirtOffsetXCm = Math.round(sizeData.shirtWidthCm * 0.20);
        DTFState.imageEngine.shirtOffsetYCm = 8.0;
      } else if (sizeData.isSleeve) {
        DTFState.imageEngine.shirtPlacement = "sleeve";
        DTFState.imageEngine.shirtOffsetXCm = -Math.round(sizeData.shirtWidthCm * 0.44);
        DTFState.imageEngine.shirtOffsetYCm = 16.0;
      } else {
        DTFState.imageEngine.shirtPlacement = "chest";
        DTFState.imageEngine.shirtOffsetXCm = 0.0;
        DTFState.imageEngine.shirtOffsetYCm = 7.0; // 4 dedos abaixo da gola
      }

      this.renderSupplierSizeButtons();
      this.updateMetricsUI();
      this.render();

      if (window.costCalculatorService) {
        window.costCalculatorService.renderUI();
      }

      this.showFeedbackToast(`👕 Molde calibrado para: ${sizeData.fullLabel}`);
    }
  }

  // =========================================================================
  // SIMULAÇÃO EM MEDIDA REAL DA CAMISETA (MOLDE TÉCNICO EXATO)
  // =========================================================================
  toggleShirtSimulation(enable = null) {
    this.shirtSimulationMode = enable !== null ? enable : !this.shirtSimulationMode;
    DTFState.imageEngine.shirtSimulationMode = this.shirtSimulationMode;

    const btnSub = document.getElementById("btnSubstripShirtSim");
    const btnTool = document.getElementById("btnToggleShirtSimulation");
    const blockControls = document.getElementById("shirtSimulationControlsBlock");

    if (btnSub) btnSub.classList.toggle("active", this.shirtSimulationMode);
    if (btnTool) btnTool.classList.toggle("active", this.shirtSimulationMode);
    if (blockControls) blockControls.style.display = this.shirtSimulationMode ? "block" : "none";

    this.render();
    if (this.shirtSimulationMode) {
      setTimeout(() => this.centerArtwork(true), 40);
      const s = DTFState.getCurrentShirtSizeData();
      this.showFeedbackToast(`👕 Molde Técnico Ativo: Camiseta ${DTFState.imageEngine.selectedSize} (${s.shirtWidthCm}×${s.shirtHeightCm} cm)`);
    } else {
      setTimeout(() => this.centerArtwork(true), 40);
      this.showFeedbackToast("📐 Modo Inspeção de Arte Pura Reativado");
    }
  }

  setPrintDimensionCm(w, h = null, lockAspect = true) {
    const aspect = (this.sourceImage.naturalHeight || 800) / Math.max(this.sourceImage.naturalWidth || 800, 1);

    let finalW = w;
    let finalH = h;

    if (w !== null && (h === null || lockAspect)) {
      finalW = Math.max(4.0, Math.min(65.0, parseFloat(w)));
      finalH = finalW * aspect;
    } else if (h !== null && (w === null || lockAspect)) {
      finalH = Math.max(4.0, Math.min(90.0, parseFloat(h)));
      finalW = finalH / aspect;
    }

    DTFState.imageEngine.customWidthCm = Math.round(finalW * 10) / 10;
    DTFState.imageEngine.customHeightCm = Math.round(finalH * 10) / 10;

    this.updateMetricsUI();
    this.render();

    if (window.costCalculatorService) {
      window.costCalculatorService.renderUI();
    }
  }

  setShirtPlacement(placement) {
    const s = DTFState.getCurrentShirtSizeData();
    DTFState.imageEngine.shirtPlacement = placement;

    if (placement === "chest") {
      DTFState.imageEngine.shirtOffsetXCm = 0;
      DTFState.imageEngine.shirtOffsetYCm = 7.0; // 4 dedos
      this.showFeedbackToast("🎯 Posição: Centro do Tórax (4 dedos abaixo da gola)");
    } else if (placement === "pocket") {
      DTFState.imageEngine.shirtOffsetXCm = Math.round(s.shirtWidthCm * 0.20);
      DTFState.imageEngine.shirtOffsetYCm = 8.0;
      this.showFeedbackToast("👕 Posição: Bolso / Peito Esquerdo");
    } else if (placement === "sleeve") {
      DTFState.imageEngine.shirtOffsetXCm = -Math.round(s.shirtWidthCm * 0.44);
      DTFState.imageEngine.shirtOffsetYCm = 16.0;
      this.showFeedbackToast("💪 Posição: Manga Lateral");
    } else if (placement === "lower") {
      DTFState.imageEngine.shirtOffsetXCm = 0;
      DTFState.imageEngine.shirtOffsetYCm = Math.max(10, s.shirtHeightCm - DTFState.imageEngine.customHeightCm - 6.0);
      this.showFeedbackToast("🏷️ Posição: Barra Inferior");
    }

    this.render();
  }

  updateShirtControlsUI() {
    const shirtData = DTFState.getCurrentShirtSizeData();
    const w = DTFState.imageEngine.customWidthCm;
    const h = DTFState.imageEngine.customHeightCm;
    const coveragePct = Math.round((w / (shirtData.shirtWidthCm || 50)) * 100);

    const inputW = document.getElementById("inputPrintWidthCm");
    const sliderW = document.getElementById("sliderPrintWidthCm");
    const inputH = document.getElementById("inputPrintHeightCm");
    const sliderH = document.getElementById("sliderPrintHeightCm");

    if (inputW && document.activeElement !== inputW) inputW.value = w.toFixed(1);
    if (sliderW) sliderW.value = w;
    if (inputH && document.activeElement !== inputH) inputH.value = h.toFixed(1);
    if (sliderH) sliderH.value = h;

    const coveragePctEl = document.getElementById("shirtCoveragePctDisplay");
    const coverageBar = document.getElementById("shirtCoverageProgressBar");
    const coverageTag = document.getElementById("shirtCoverageFeedbackTag");

    if (coveragePctEl) coveragePctEl.textContent = `${coveragePct}%`;
    if (coverageBar) {
      coverageBar.style.width = `${Math.min(100, coveragePct)}%`;
      if (coveragePct < 38) {
        coverageBar.style.background = "var(--accent-green)";
      } else if (coveragePct <= 62) {
        coverageBar.style.background = "var(--accent-cyan)";
      } else if (coveragePct <= 75) {
        coverageBar.style.background = "var(--accent-amber)";
      } else {
        coverageBar.style.background = "#ff4466";
      }
    }

    if (coverageTag) {
      if (coveragePct < 38) {
        coverageTag.textContent = "Discreta / Pequena";
        coverageTag.className = "badge badge-gray";
      } else if (coveragePct <= 62) {
        coverageTag.textContent = "Proporção Padrão Ideal";
        coverageTag.className = "badge badge-cyan";
      } else if (coveragePct <= 75) {
        coverageTag.textContent = "Maxi Print / Streetwear";
        coverageTag.className = "badge badge-amber";
      } else {
        coverageTag.textContent = "Atenção: Limite das Costuras";
        coverageTag.className = "badge badge-red";
      }
    }

    const shirtSpec = document.getElementById("shirtCurrentSpecsBadge");
    if (shirtSpec) {
      shirtSpec.textContent = `${DTFState.imageEngine.selectedSize} (${shirtData.shirtWidthCm}×${shirtData.shirtHeightCm} cm | Manga ${shirtData.sleeveLengthCm}cm)`;
    }
  }

  getContentBoundingBox() {
    if (!this.sourceImage || !this.loaded) return null;
    const key = `${this.sourceImage.src}_${DTFState.imageEngine.blackKnockoutEnabled}_${DTFState.imageEngine.knockoutThreshold}`;
    if (this._cachedBox && this._cachedBox.key === key) {
      return this._cachedBox.box;
    }
    try {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = this.sourceImage.naturalWidth || 800;
      tempCanvas.height = this.sourceImage.naturalHeight || 800;
      const tCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
      this.processArtwork(tCtx, tempCanvas.width, tempCanvas.height);
      const box = window.ImageOps ? ImageOps.getAlphaBoundingBox(tempCanvas, 8) : null;
      this._cachedBox = { key, box };
      return box;
    } catch (e) {
      return null;
    }
  }

  getDimensionsCurrentDPI() {
    const cmW = DTFState.imageEngine.customWidthCm;
    const cmH = DTFState.imageEngine.customHeightCm;
    const dpi = DTFState.imageEngine.targetDPI || 600;

    const pxW = Math.round((cmW / 2.54) * dpi);
    const pxH = Math.round((cmH / 2.54) * dpi);
    const areaCm2 = Math.round(cmW * cmH);

    const costPerCm2 = DTFState.settings.dtfMeterCost / (DTFState.settings.rollUsefulWidthCm * 100);
    const estimatedCost = (areaCm2 * costPerCm2).toFixed(2);

    const box = this.getContentBoundingBox();
    const hasTransparentBorder = box && !box.isEmpty && box.savedAreaPct > 2;

    const contentCmW = hasTransparentBorder ? Math.round((cmW * box.trimRatioW) * 10) / 10 : cmW;
    const contentCmH = hasTransparentBorder ? Math.round((cmH * box.trimRatioH) * 10) / 10 : cmH;
    const contentAreaCm2 = Math.round(contentCmW * contentCmH);
    const contentEstimatedCost = (contentAreaCm2 * costPerCm2).toFixed(2);

    return {
      cmW, cmH, pxW, pxH, areaCm2, estimatedCost, dpi,
      contentCmW, contentCmH, contentAreaCm2, contentEstimatedCost,
      hasTransparentBorder,
      savedAreaPct: box ? box.savedAreaPct : 0,
      box
    };
  }

  updateMetricsUI() {
    const nameEl = document.getElementById("activeImageFilename");
    const rulerEl = document.getElementById("canvasRulerInfo");
    const costBadgeEl = document.getElementById("dtfPieceCostEstimate");
    const trimBadge = document.getElementById("badgeTrimStatus");
    const topDpiBadge = document.getElementById("topbarDpiBadge");

    if (!this.loaded || !DTFState.imageEngine.activeArtworkId || !this.sourceImage || !this.sourceImage.naturalWidth) {
      if (nameEl) nameEl.textContent = "Nenhuma imagem carregada";
      if (rulerEl) rulerEl.textContent = "AGUARDANDO ARTE | Arraste um arquivo PNG/JPG para a tela ou use '+ Mais'";
      if (costBadgeEl) { costBadgeEl.textContent = "R$ 0,00"; costBadgeEl.title = ""; }
      if (trimBadge) { trimBadge.textContent = "Aguardando Arte"; trimBadge.className = "badge badge-cyan"; }
      if (topDpiBadge) topDpiBadge.textContent = `${DTFState.imageEngine.targetDPI || 600} DPI NATIVO`;
      this.updateShirtControlsUI();
      return;
    }

    const metrics = this.getDimensionsCurrentDPI();
    const shirtData = DTFState.getCurrentShirtSizeData();
    const supplier = DTFState.getCurrentSupplier();

    if (nameEl) {
      nameEl.textContent = DTFState.imageEngine.activeArtworkName || "Arte_Carregada.png";
    }

    if (rulerEl) {
      if (this.shirtSimulationMode) {
        const coveragePct = Math.round((metrics.cmW / (shirtData.shirtWidthCm || 50)) * 100);
        rulerEl.textContent = `ESTAMPA: ${metrics.cmW} × ${metrics.cmH} CM (${coveragePct}% DO TÓRAX) | TAMANHO: ${DTFState.imageEngine.selectedSize} | ${metrics.pxW} × ${metrics.pxH} PX (${metrics.dpi} DPI)`;
      } else if (metrics.hasTransparentBorder) {
        rulerEl.textContent = `ARTE REAL: ${metrics.contentCmW} × ${metrics.contentCmH} CM (ÁREA ÚTIL: ${metrics.contentAreaCm2} CM² | CUSTO: R$ ${metrics.contentEstimatedCost}) • LONA: ${metrics.cmW} × ${metrics.cmH} CM (✂️ ${metrics.savedAreaPct}% TRANSPARÊNCIA VAZIA)`;
      } else {
        rulerEl.textContent = `GRADE: ${DTFState.imageEngine.selectedSize} | ESTAMPA: ${metrics.cmW} × ${metrics.cmH} CM | ${metrics.pxW} × ${metrics.pxH} PX (${metrics.dpi} DPI) | ÁREA: ${metrics.areaCm2} CM² | CUSTO DTF: R$ ${metrics.estimatedCost}`;
      }
    }

    if (costBadgeEl) {
      costBadgeEl.textContent = `R$ ${metrics.hasTransparentBorder ? metrics.contentEstimatedCost : metrics.estimatedCost}`;
      if (metrics.hasTransparentBorder) {
        costBadgeEl.title = `Calculado estritamente sobre os ${metrics.contentAreaCm2} cm² da arte real (economizando R$ ${(metrics.estimatedCost - metrics.contentEstimatedCost).toFixed(2)})`;
      } else {
        costBadgeEl.title = "";
      }
    }

    if (trimBadge) {
      if (metrics.hasTransparentBorder) {
        trimBadge.textContent = `✂️ ${metrics.savedAreaPct}% a aparar`;
        trimBadge.className = "badge badge-amber";
      } else {
        trimBadge.textContent = "✅ 100% Calibrado";
        trimBadge.className = "badge badge-green";
      }
    }

    if (topDpiBadge) {
      topDpiBadge.textContent = `${metrics.dpi} DPI NATIVO`;
    }

    this.updateShirtControlsUI();
  }

  // =========================================================================
  // INTERAÇÃO DO MOUSE: REDIMENSIONAR E MOVER ESTAMPA NO MOLDE DA CAMISA
  // =========================================================================
  handleShirtPointerDown(e) {
    if (!this.shirtSimulationMode || !this.cachedShirtBounds) return false;

    const rect = this.canvas.getBoundingClientRect();
    const cX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const cY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    const b = this.cachedShirtBounds;

    const handleHitDist = 18 * (b.renderScale || 1.0);
    const handles = [
      { id: "br", x: b.pX + b.pW, y: b.pY + b.pH },
      { id: "bl", x: b.pX, y: b.pY + b.pH },
      { id: "tr", x: b.pX + b.pW, y: b.pY },
      { id: "tl", x: b.pX, y: b.pY }
    ];

    for (const h of handles) {
      if (Math.hypot(cX - h.x, cY - h.y) <= handleHitDist) {
        this.shirtDragState = {
          mode: "resize",
          handle: h.id,
          startX: cX,
          startY: cY,
          origW: DTFState.imageEngine.customWidthCm,
          origH: DTFState.imageEngine.customHeightCm,
          scale: b.scale
        };
        return true;
      }
    }

    // Clique dentro da estampa para reposicionar
    if (cX >= b.pX && cX <= b.pX + b.pW && cY >= b.pY && cY <= b.pY + b.pH) {
      this.shirtDragState = {
        mode: "move",
        startX: cX,
        startY: cY,
        origOffsetX: DTFState.imageEngine.shirtOffsetXCm,
        origOffsetY: DTFState.imageEngine.shirtOffsetYCm,
        scale: b.scale
      };
      return true;
    }

    return false;
  }

  handleShirtPointerMove(e) {
    if (!this.shirtSimulationMode || !this.cachedShirtBounds) return false;

    const rect = this.canvas.getBoundingClientRect();
    const cX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const cY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    const b = this.cachedShirtBounds;

    if (this.shirtDragState) {
      const s = this.shirtDragState;

      if (s.mode === "move") {
        const dxCm = (cX - s.startX) / s.scale;
        const dyCm = (cY - s.startY) / s.scale;
        DTFState.imageEngine.shirtOffsetXCm = Math.max(-28, Math.min(28, s.origOffsetX + dxCm));
        DTFState.imageEngine.shirtOffsetYCm = Math.max(0, Math.min(55, s.origOffsetY + dyCm));
        this.render();
        return true;
      }

      if (s.mode === "resize") {
        let deltaW_cm = 0;
        if (s.handle === "br") {
          deltaW_cm = ((cX - s.startX) / s.scale);
        } else if (s.handle === "bl") {
          deltaW_cm = ((s.startX - cX) / s.scale);
        } else if (s.handle === "tr") {
          deltaW_cm = ((cX - s.startX) / s.scale);
        } else if (s.handle === "tl") {
          deltaW_cm = ((s.startX - cX) / s.scale);
        }

        const newW = Math.max(6.0, Math.min(55.0, s.origW + deltaW_cm));
        this.setPrintDimensionCm(newW, null, DTFState.imageEngine.lockPrintAspectRatio);
        return true;
      }
    }

    // Feedback visual do cursor
    const handleHitDist = 18 * (b.renderScale || 1.0);
    const isBr = Math.hypot(cX - (b.pX + b.pW), cY - (b.pY + b.pH)) <= handleHitDist;
    const isTl = Math.hypot(cX - b.pX, cY - b.pY) <= handleHitDist;
    const isTr = Math.hypot(cX - (b.pX + b.pW), cY - b.pY) <= handleHitDist;
    const isBl = Math.hypot(cX - b.pX, cY - (b.pY + b.pH)) <= handleHitDist;

    if (isBr || isTl) {
      this.canvas.style.cursor = "nwse-resize";
    } else if (isTr || isBl) {
      this.canvas.style.cursor = "nesw-resize";
    } else if (cX >= b.pX && cX <= b.pX + b.pW && cY >= b.pY && cY <= b.pY + b.pH) {
      this.canvas.style.cursor = "grab";
    } else {
      this.canvas.style.cursor = "";
    }

    return false;
  }

  handleShirtPointerUp() {
    if (this.shirtDragState) {
      this.shirtDragState = null;
      if (this.canvas) this.canvas.style.cursor = "";
    }
  }

  // =========================================================================
  // RENDERIZAÇÃO TÉCNICA DA CAMISETA COM MEDIDAS EXATAS
  // =========================================================================
  renderShirtSimulationMode(ctx, backingW, backingH, shirtData, totalSpanW_cm, totalSpanH_cm, renderScale = 1.0) {
    ctx.clearRect(0, 0, backingW, backingH);

    const shirtW_cm = shirtData.shirtWidthCm || 52.0;
    const shirtH_cm = shirtData.shirtHeightCm || 70.0;
    const sleeveL_cm = shirtData.sleeveLengthCm || 21.0;

    const scale = (backingW * 0.88) / totalSpanW_cm;
    const cX = backingW / 2;
    const shirtW_px = shirtW_cm * scale;
    const shirtH_px = shirtH_cm * scale;
    const sleeveL_px = sleeveL_cm * scale;
    const sleeveWidth_px = 18.0 * scale;

    const collarTopY = Math.round(backingH * 0.08);
    const shirtBottomY = collarTopY + shirtH_px;
    const shirtLeftX = cX - (shirtW_px / 2);
    const shirtRightX = cX + (shirtW_px / 2);

    const neckW_px = 18.0 * scale;
    const neckDepth_px = 6.2 * scale;
    const shoulderSlopeY = collarTopY + 3.8 * scale;
    const underarmY = collarTopY + 21.5 * scale;
    const collarBottomY = collarTopY + neckDepth_px;

    const sleeveAngle = 0.58; // ~33 graus para baixo
    const sleeveEndX_right = shirtRightX + Math.cos(sleeveAngle) * sleeveL_px;
    const sleeveEndY_right = shoulderSlopeY + Math.sin(sleeveAngle) * sleeveL_px;
    const sleeveBottomX_right = sleeveEndX_right - Math.sin(sleeveAngle) * sleeveWidth_px;
    const sleeveBottomY_right = sleeveEndY_right + Math.cos(sleeveAngle) * sleeveWidth_px;

    const sleeveEndX_left = shirtLeftX - Math.cos(sleeveAngle) * sleeveL_px;
    const sleeveEndY_left = shoulderSlopeY + Math.sin(sleeveAngle) * sleeveL_px;
    const sleeveBottomX_left = sleeveEndX_left + Math.sin(sleeveAngle) * sleeveWidth_px;
    const sleeveBottomY_left = sleeveEndY_left + Math.cos(sleeveAngle) * sleeveWidth_px;

    // 1. Sombra suave sob a camiseta
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 24 * renderScale;
    ctx.shadowOffsetY = 12 * renderScale;

    // Contorno da peça
    ctx.beginPath();
    ctx.moveTo(cX + neckW_px / 2, collarTopY);
    ctx.lineTo(shirtRightX, shoulderSlopeY);
    ctx.lineTo(sleeveEndX_right, sleeveEndY_right);
    ctx.lineTo(sleeveBottomX_right, sleeveBottomY_right);
    ctx.quadraticCurveTo(shirtRightX + 4 * renderScale, underarmY - 4 * renderScale, shirtRightX, underarmY);
    ctx.lineTo(shirtRightX, shirtBottomY);
    ctx.quadraticCurveTo(cX, shirtBottomY + 5 * renderScale, shirtLeftX, shirtBottomY);
    ctx.lineTo(shirtLeftX, underarmY);
    ctx.quadraticCurveTo(shirtLeftX - 4 * renderScale, underarmY - 4 * renderScale, sleeveBottomX_left, sleeveBottomY_left);
    ctx.lineTo(sleeveEndX_left, sleeveEndY_left);
    ctx.lineTo(shirtLeftX, shoulderSlopeY);
    ctx.lineTo(cX - neckW_px / 2, collarTopY);
    ctx.quadraticCurveTo(cX, collarTopY + neckDepth_px * 2, cX + neckW_px / 2, collarTopY);
    ctx.closePath();

    // Cor do Tecido
    const shirtColorName = DTFState.imageEngine.targetShirtColor || "Preta";
    let baseColor = "#121418";
    let lightColor = "#1a1c22";
    let strokeColor = "#2c313d";
    let isDark = true;

    if (shirtColorName === "Branca") {
      baseColor = "#f4f5f8";
      lightColor = "#ffffff";
      strokeColor = "#d2d6df";
      isDark = false;
    } else if (shirtColorName === "Cinza") {
      baseColor = "#636975";
      lightColor = "#777e8c";
      strokeColor = "#494e58";
    } else if (shirtColorName === "Off-White") {
      baseColor = "#ded6c5";
      lightColor = "#eae3d4";
      strokeColor = "#beb49e";
      isDark = false;
    } else if (shirtColorName === "Vermelha") {
      baseColor = "#73121e";
      lightColor = "#8c1927";
      strokeColor = "#520c15";
    }

    const shirtGrad = ctx.createLinearGradient(shirtLeftX, collarTopY, shirtRightX, shirtBottomY);
    shirtGrad.addColorStop(0, lightColor);
    shirtGrad.addColorStop(0.5, baseColor);
    shirtGrad.addColorStop(1, lightColor);
    ctx.fillStyle = shirtGrad;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5 * renderScale;
    ctx.stroke();

    // 2. Interior da gola (meia-lua)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cX, collarTopY + 2 * renderScale, neckW_px * 0.46, neckDepth_px * 0.9, 0, 0, Math.PI);
    ctx.fillStyle = isDark ? "#0a0b0d" : "#dde0e6";
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1 * renderScale;
    ctx.stroke();
    ctx.restore();

    // 3. Ribana da Gola (Collar Band)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cX, collarTopY + neckDepth_px * 0.5, neckW_px * 0.48, neckDepth_px * 0.8, 0, 0, Math.PI);
    ctx.strokeStyle = isDark ? "#282c36" : "#c4c8d2";
    ctx.lineWidth = 3.5 * renderScale;
    ctx.stroke();
    ctx.restore();

    // 4. Costuras e bainhas
    ctx.save();
    ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.15)";
    ctx.lineWidth = 1 * renderScale;
    ctx.setLineDash([3 * renderScale, 2 * renderScale]);

    ctx.beginPath();
    ctx.moveTo(cX + neckW_px / 2, collarTopY + 1 * renderScale);
    ctx.lineTo(shirtRightX, shoulderSlopeY + 1 * renderScale);
    ctx.moveTo(cX - neckW_px / 2, collarTopY + 1 * renderScale);
    ctx.lineTo(shirtLeftX, shoulderSlopeY + 1 * renderScale);

    const hemY = shirtBottomY - (2.5 * scale);
    ctx.moveTo(shirtLeftX + 2, hemY);
    ctx.quadraticCurveTo(cX, hemY + 5 * renderScale, shirtRightX - 2, hemY);
    ctx.stroke();
    ctx.restore();

    // 5. Linha Guia DTF: 4 Dedos da Gola (~7.0 cm)
    const guidelineY = collarBottomY + (7.0 * scale);
    ctx.save();
    ctx.strokeStyle = "rgba(0, 240, 255, 0.45)";
    ctx.lineWidth = 1.2 * renderScale;
    ctx.setLineDash([5 * renderScale, 4 * renderScale]);
    ctx.beginPath();
    ctx.moveTo(shirtLeftX + (shirtW_px * 0.12), guidelineY);
    ctx.lineTo(shirtRightX - (shirtW_px * 0.12), guidelineY);
    ctx.stroke();

    ctx.fillStyle = "rgba(0, 240, 255, 0.85)";
    ctx.font = `600 ${Math.max(10, Math.round(10 * renderScale))}px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("┄┄ ALINHAMENTO DTF: 4 DEDOS DA GOLA (7 CM) ┄┄", cX, guidelineY - (3 * renderScale));
    ctx.restore();

    // 6. Renderização da Estampa na Escala Real
    const printW_cm = DTFState.imageEngine.customWidthCm;
    const printH_cm = DTFState.imageEngine.customHeightCm;
    const pW_px = Math.round(printW_cm * scale);
    const pH_px = Math.round(printH_cm * scale);

    const pX_px = Math.round(cX - (pW_px / 2) + (DTFState.imageEngine.shirtOffsetXCm * scale));
    const pY_px = Math.round(collarBottomY + (DTFState.imageEngine.shirtOffsetYCm * scale));

    if (this.sourceImage && this.loaded) {
      const artBuffer = document.createElement("canvas");
      artBuffer.width = Math.max(1, pW_px);
      artBuffer.height = Math.max(1, pH_px);
      const artCtx = artBuffer.getContext("2d", { willReadFrequently: true });
      this.processArtwork(artCtx, artBuffer.width, artBuffer.height);

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 8 * renderScale;
      ctx.shadowOffsetY = 3 * renderScale;
      ctx.drawImage(artBuffer, pX_px, pY_px, pW_px, pH_px);
      ctx.restore();
    }

    this.cachedShirtBounds = {
      pX: pX_px,
      pY: pY_px,
      pW: pW_px,
      pH: pH_px,
      scale: scale,
      cX: cX,
      collarBottomY: collarBottomY,
      shirtW_cm: shirtW_cm,
      shirtH_cm: shirtH_cm,
      renderScale: renderScale
    };

    // 7. Bounding Box Interativo & Alças
    const coveragePct = Math.round((printW_cm / shirtW_cm) * 100);

    ctx.save();
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 1.6 * renderScale;
    ctx.setLineDash([4 * renderScale, 3 * renderScale]);
    ctx.strokeRect(pX_px, pY_px, pW_px, pH_px);

    const handleSize = 9 * renderScale;
    const handles = [
      { id: "tl", x: pX_px, y: pY_px },
      { id: "tr", x: pX_px + pW_px, y: pY_px },
      { id: "bl", x: pX_px, y: pY_px + pH_px },
      { id: "br", x: pX_px + pW_px, y: pY_px + pH_px },
    ];

    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 2 * renderScale;

    handles.forEach((h) => {
      ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
    });

    // Pill de medidas
    const pillText = `📐 ${printW_cm.toFixed(1)} × ${printH_cm.toFixed(1)} CM  •  ${coveragePct}% DO TÓRAX`;
    ctx.font = `700 ${Math.max(11, Math.round(11.5 * renderScale))}px 'JetBrains Mono', monospace`;
    const textMetrics = ctx.measureText(pillText);
    const pillW = textMetrics.width + (18 * renderScale);
    const pillH = 22 * renderScale;
    const pillX = Math.round(pX_px + (pW_px / 2) - (pillW / 2));
    const pillY = Math.round(pY_px - pillH - (6 * renderScale));

    ctx.fillStyle = "rgba(10, 14, 20, 0.92)";
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 1.2 * renderScale;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 4 * renderScale);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#00f0ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pillText, pX_px + (pW_px / 2), pillY + (pillH / 2));

    const distText = `📏 ${DTFState.imageEngine.shirtOffsetYCm.toFixed(1)} cm da gola`;
    ctx.font = `600 ${Math.max(9, Math.round(9.5 * renderScale))}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = "rgba(255, 184, 0, 0.95)";
    ctx.textAlign = "right";
    ctx.fillText(distText, pX_px - (8 * renderScale), pY_px + (14 * renderScale));

    ctx.restore();

    // 8. Cotas Técnicas (Largura, Altura, Manga)
    this.drawTechnicalDimensions(ctx, {
      shirtLeftX,
      shirtRightX,
      shirtW_cm,
      shirtH_cm,
      collarTopY,
      shirtBottomY,
      sleeveL_cm,
      sleeveEndX_left,
      sleeveEndY_left,
      renderScale
    });
  }

  drawTechnicalDimensions(ctx, opts) {
    const { shirtLeftX, shirtRightX, shirtW_cm, shirtH_cm, collarTopY, shirtBottomY, sleeveL_cm, sleeveEndX_left, sleeveEndY_left, renderScale } = opts;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillStyle = "#00f0ff";
    ctx.lineWidth = 1.2 * renderScale;
    ctx.font = `700 ${Math.max(10, Math.round(11 * renderScale))}px 'JetBrains Mono', monospace`;

    // Cota de Largura (Inferior)
    const arrowY = shirtBottomY + (18 * renderScale);
    ctx.beginPath();
    ctx.moveTo(shirtLeftX, arrowY);
    ctx.lineTo(shirtRightX, arrowY);
    ctx.moveTo(shirtLeftX, arrowY - (5 * renderScale));
    ctx.lineTo(shirtLeftX, arrowY + (5 * renderScale));
    ctx.moveTo(shirtRightX, arrowY - (5 * renderScale));
    ctx.lineTo(shirtRightX, arrowY + (5 * renderScale));
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`⟵  LARGURA REAL: ${shirtW_cm.toFixed(0)} CM  ⟶`, (shirtLeftX + shirtRightX) / 2, arrowY + (4 * renderScale));

    // Cota de Altura (Lateral Direita)
    const arrowX = shirtRightX + (20 * renderScale);
    ctx.beginPath();
    ctx.moveTo(arrowX, collarTopY);
    ctx.lineTo(arrowX, shirtBottomY);
    ctx.moveTo(arrowX - (5 * renderScale), collarTopY);
    ctx.lineTo(arrowX + (5 * renderScale), collarTopY);
    ctx.moveTo(arrowX - (5 * renderScale), shirtBottomY);
    ctx.lineTo(arrowX + (5 * renderScale), shirtBottomY);
    ctx.stroke();

    ctx.save();
    ctx.translate(arrowX + (16 * renderScale), (collarTopY + shirtBottomY) / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`⟵  ALTURA REAL: ${shirtH_cm.toFixed(0)} CM  ⟶`, 0, 0);
    ctx.restore();

    // Cota da Manga
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.font = `600 ${Math.max(9, Math.round(9.5 * renderScale))}px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center";
    ctx.fillText(`Manga: ${sleeveL_cm} cm`, sleeveEndX_left, sleeveEndY_left - (8 * renderScale));

    ctx.restore();
  }

  // =========================================================================
  // PIPELINE GRÁFICO UNIFICADO: PROCESSAMENTO DE IMAGEM & HALFTONE
  // =========================================================================
  processArtwork(targetCtx, w, h, srcImg = null, customSettings = null) {
    const imgSource = srcImg || this.sourceImage;
    if (!imgSource) return;
    const settings = customSettings || (window.DTFState && DTFState.imageEngine ? DTFState.imageEngine : {});

    targetCtx.clearRect(0, 0, w, h);
    targetCtx.drawImage(imgSource, 0, 0, w, h);

    let imgData = targetCtx.getImageData(0, 0, w, h);

    // 1. Denoise / Redução de Ruído
    if ((settings.denoiseStrength || 0) > 0 && window.ImageOps) {
      ImageOps.denoise(imgData, settings.denoiseStrength);
    }

    // 2. Knockout de Preto (Toque Zero na Camiseta Preta)
    if (settings.blackKnockoutEnabled && window.ImageOps) {
      const threshold = settings.knockoutThreshold || 28;
      const feather = settings.knockoutFeather !== undefined ? settings.knockoutFeather : (settings.halftoneEnabled ? 65 : 20);
      ImageOps.blackKnockout(imgData, { threshold, feather });
    }

    // 2.1 Knockout de Branco (Toque Zero na Camiseta Branca)
    if (settings.whiteKnockoutEnabled && window.ImageOps && window.ImageOps.whiteKnockout) {
      const threshold = settings.whiteKnockoutThreshold || 88;
      const feather = settings.whiteKnockoutFeather !== undefined ? settings.whiteKnockoutFeather : 12;
      ImageOps.whiteKnockout(imgData, { threshold, feather });
    }

    // 3. Super-Nitidez (Unsharp Mask)
    if ((settings.unsharpStrength || 0) > 0 && window.ImageOps) {
      ImageOps.unsharp(imgData, settings.unsharpStrength);
    }

    // 4. Realce de Cores & Gama DTF
    if ((settings.vibranceBoost || 0) > 0 && window.ImageOps) {
      ImageOps.vibrance(imgData, settings.vibranceBoost);
    }

    // 5. Novo Motor Halftone Profissional
    if (settings.halftoneEnabled && window.ImageOps) {
      const lpi = settings.halftoneLPI || 45;
      const angle = settings.halftoneAngle || 45;
      const customW = settings.customWidthCm || 32;
      const pxPerCm = w / customW;
      const pitchPx = (pxPerCm * 2.54) / lpi;

      ImageOps.halftone(imgData, {
        pitchPx: Math.max(2.0, pitchPx),
        angleDeg: angle,
        edgeRadius: 2
      });
    }

    targetCtx.putImageData(imgData, 0, 0);
  }

  // =========================================================================
  // RENDERIZAÇÃO REAL NO CANVAS DO WORKBENCH
  // =========================================================================
  render() {
    if (!this.canvas) return;

    // ESTADO VAZIO: Nenhuma estampa carregada ainda
    if (!this.loaded || !this.sourceImage || !this.sourceImage.src || !this.sourceImage.naturalWidth) {
      const cssWidth = DTFState.imageEngine.focusMode ? 960 : 760;
      const cssHeight = 520;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = cssWidth * dpr;
      this.canvas.height = cssHeight * dpr;
      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${cssHeight}px`;

      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // Fundo limpo suave
      ctx.fillStyle = "rgba(12, 14, 18, 0.85)";
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      // Moldura técnica pontilhada
      ctx.strokeStyle = "rgba(0, 240, 255, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(24, 24, cssWidth - 48, cssHeight - 48);
      ctx.setLineDash([]);

      // Ícone e mensagem amigável
      ctx.fillStyle = "rgba(0, 240, 255, 0.9)";
      ctx.font = "42px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📥", cssWidth / 2, cssHeight / 2 - 45);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px 'Outfit', sans-serif";
      ctx.fillText("Nenhuma estampa carregada no momento", cssWidth / 2, cssHeight / 2 + 5);

      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.font = "12px 'JetBrains Mono', monospace";
      ctx.fillText("Arraste sua arte PNG/JPG aqui ou use o botão '➕ Mais' na barra lateral", cssWidth / 2, cssHeight / 2 + 32);

      if (this.viewport) {
        this.viewport.setCanvasCssSize(cssWidth, cssHeight);
      }

      this.updateMetricsUI();
      return;
    }

    const currentZoom = (this.viewport && this.viewport.zoom) || 1.0;
    let renderScale = 1.0;
    if (currentZoom > 1.2) renderScale = Math.min(3.0, currentZoom);

    // 1. RENDERIZAÇÃO NO MODO MOLDE REAL DA CAMISETA
    if (this.shirtSimulationMode) {
      const shirtData = DTFState.getCurrentShirtSizeData();
      const shirtW_cm = shirtData.shirtWidthCm || 52;
      const shirtH_cm = shirtData.shirtHeightCm || 70;
      const sleeveL_cm = shirtData.sleeveLengthCm || 21;

      const totalSpanW_cm = shirtW_cm + (sleeveL_cm * 1.5);
      const totalSpanH_cm = shirtH_cm + 14.0;
      const aspect = totalSpanH_cm / totalSpanW_cm;

      const cssWidth = DTFState.imageEngine.focusMode ? 960 : 780;
      const cssHeight = Math.round(cssWidth * aspect);

      const backingW = Math.round(cssWidth * renderScale);
      const backingH = Math.round(cssHeight * renderScale);

      if (this.canvas.width !== backingW || this.canvas.height !== backingH) {
        this.canvas.width = backingW;
        this.canvas.height = backingH;
      }

      this.renderShirtSimulationMode(this.ctx, backingW, backingH, shirtData, totalSpanW_cm, totalSpanH_cm, renderScale);

      if (this.viewport) {
        this.viewport.setCanvasCssSize(cssWidth, cssHeight);
      }

      this.updateMetricsUI();
      return;
    }

    // 2. RENDERIZAÇÃO NO MODO PADRÃO: ARTE PURA
    const cssWidth = DTFState.imageEngine.focusMode ? 960 : 760;
    const aspect = (this.sourceImage.naturalHeight || 800) / Math.max(this.sourceImage.naturalWidth || 800, 1);
    const cssHeight = Math.round(cssWidth * aspect);

    if (DTFState.imageEngine.halftoneEnabled) renderScale = Math.max(renderScale, 1.5);

    const backingW = Math.round(cssWidth * renderScale);
    const backingH = Math.round(cssHeight * renderScale);

    if (this.canvas.width !== backingW || this.canvas.height !== backingH) {
      this.canvas.width = backingW;
      this.canvas.height = backingH;
    }

    this.processArtwork(this.ctx, backingW, backingH);

    if (this.cropModeActive) {
      this.renderCropOverlay(this.ctx, backingW, backingH);
    }

    if (this.viewport) {
      this.viewport.setCanvasCssSize(cssWidth, cssHeight);
    }

    this.updateMetricsUI();
    this.updateHalftonePitchDisplay();
  }

  // =========================================================================
  // EXPORTAÇÃO DA IMAGEM INDIVIDUAL (PNG, TIFF, PDF) COM DPI REAL EMBUTIDO
  // =========================================================================
  async exportSingleArtwork(format = "PNG") {
    const metrics = this.getDimensionsCurrentDPI();
    const artName = (DTFState.imageEngine.activeArtworkName || "Arte_DTF").replace(/\.[^/.]+$/, "");
    const filename = `${artName}_${DTFState.imageEngine.selectedSize}_${metrics.cmW}x${metrics.cmH}cm_${metrics.dpi}DPI`;

    // Cria um canvas em resolução nativa real de impressão (DPI real configurado, ex: 300 ou 600 DPI)
    const expCanvas = document.createElement("canvas");
    expCanvas.width = metrics.pxW;
    expCanvas.height = metrics.pxH;
    const expCtx = expCanvas.getContext("2d", { willReadFrequently: true });
    expCtx.imageSmoothingEnabled = true;
    expCtx.imageSmoothingQuality = "high";

    // Processa diretamente a imagem fonte em alta definição (NÃO estica o canvas de preview da tela!)
    this.processArtwork(expCtx, expCanvas.width, expCanvas.height);

    if (format === "PNG") {
      if (window.ImageOps && ImageOps.downloadCanvasAsPngWithDpi) {
        await ImageOps.downloadCanvasAsPngWithDpi(expCanvas, filename, metrics.dpi);
      } else {
        const link = document.createElement("a");
        link.download = `${filename}.png`;
        link.href = expCanvas.toDataURL("image/png");
        link.click();
      }
      this.showFeedbackToast(`✅ Imagem PNG exportada a ${metrics.dpi} DPI reais (${metrics.cmW}×${metrics.cmH} cm, ${metrics.pxW}×${metrics.pxH} px)!`);
    } else if (format === "TIFF") {
      this.downloadAsTIFF(expCanvas, filename, metrics.dpi);
    } else if (format === "PDF") {
      this.downloadAsPDF(expCanvas, filename, metrics.cmW, metrics.cmH, metrics.dpi);
    }
  }

  downloadAsTIFF(canvasElement, filename, dpi) {
    // Converte canvas para TIFF binÃ¡rio padrÃ£o
    const w = canvasElement.width;
    const h = canvasElement.height;
    const ctx = canvasElement.getContext("2d");
    const imgData = ctx.getImageData(0, 0, w, h);
    const rgba = imgData.data;

    // Estrutura bÃ¡sica TIFF Little Endian (II) com tag de DPI
    const headerSize = 8;
    const numDirEntries = 13;
    const ifdSize = 2 + numDirEntries * 12 + 4;
    const extraDataSize = 16; // Para guardar os valores de resoluÃ§Ã£o X/Y
    const dataOffset = headerSize + ifdSize + extraDataSize;
    const imageByteCount = w * h * 4;
    const totalSize = dataOffset + imageByteCount;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Header TIFF
    view.setUint16(0, 0x4949, true); // 'II' (Little Endian)
    view.setUint16(2, 42, true);     // VersÃ£o TIFF 42
    view.setUint32(4, 8, true);      // Offset do IFD (8)

    let ifdOffset = 8;
    view.setUint16(ifdOffset, numDirEntries, true);
    ifdOffset += 2;

    const writeTag = (tag, type, count, valOrOffset) => {
      view.setUint16(ifdOffset, tag, true);
      view.setUint16(ifdOffset + 2, type, true);
      view.setUint32(ifdOffset + 4, count, true);
      view.setUint32(ifdOffset + 8, valOrOffset, true);
      ifdOffset += 12;
    };

    const resOffset = headerSize + ifdSize;
    view.setUint32(resOffset, dpi, true);
    view.setUint32(resOffset + 4, 1, true); // XRes = dpi / 1
    view.setUint32(resOffset + 8, dpi, true);
    view.setUint32(resOffset + 12, 1, true); // YRes = dpi / 1

    writeTag(256, 4, 1, w);                // ImageWidth
    writeTag(257, 4, 1, h);                // ImageLength
    writeTag(258, 3, 1, 8);                // BitsPerSample
    writeTag(259, 3, 1, 1);                // Compression: None
    writeTag(262, 3, 1, 2);                // PhotometricInterpretation: RGB
    writeTag(273, 4, 1, dataOffset);       // StripOffsets
    writeTag(277, 3, 1, 4);                // SamplesPerPixel: 4 (RGBA)
    writeTag(278, 4, 1, h);                // RowsPerStrip
    writeTag(279, 4, 1, imageByteCount);   // StripByteCounts
    writeTag(282, 5, 1, resOffset);        // XResolution
    writeTag(283, 5, 1, resOffset + 8);    // YResolution
    writeTag(296, 3, 1, 2);                // ResolutionUnit: 2 (Inch)
    writeTag(338, 3, 1, 2);                // ExtraSamples: 2 (Unassociated alpha)

    view.setUint32(ifdOffset, 0, true);    // Fim do IFD

    // Copia pixels RGBA
    bytes.set(rgba, dataOffset);

    const blob = new Blob([buffer], { type: "image/tiff" });
    const link = document.createElement("a");
    link.download = `${filename}.tif`;
    link.href = URL.createObjectURL(blob);
    link.click();
    alert(`âœ… Imagem TIFF de Alta ResoluÃ§Ã£o exportada com sucesso!\n\nArquivo: ${link.download}\nResoluÃ§Ã£o de ImpressÃ£o: ${dpi} DPI reais\nDimensÃµes: ${w} × ${h} px`);
  }

  downloadAsPDF(canvasElement, filename, widthCm, heightCm, dpi) {
    // Gera documento PDF 1.4 binÃ¡rio padronizado com dimensÃµes fÃ­sicas exatas em pontos (1 cm = 28.3465 pt)
    const ptW = Math.round(widthCm * 28.3465);
    const ptH = Math.round(heightCm * 28.3465);
    const dataUrl = canvasElement.toDataURL("image/jpeg", 0.95);
    const base64Data = dataUrl.split(",")[1];
    const binaryData = atob(base64Data);

    const pdfParts = [];
    pdfParts.push("%PDF-1.4\n");
    pdfParts.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    pdfParts.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    pdfParts.push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW} ${ptH}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
    pdfParts.push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvasElement.width} /Height ${canvasElement.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${binaryData.length} >>\nstream\n`);

    // Converte JPEG binÃ¡rio
    const rawImageBytes = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      rawImageBytes[i] = binaryData.charCodeAt(i);
    }

    const streamEnd = "\nendstream\nendobj\n";
    const contentStream = `q\n${ptW} 0 0 ${ptH} 0 0 cm\n/Im1 Do\nQ\n`;
    const contentObj = `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`;

    const blob = new Blob([
      pdfParts.join(""),
      rawImageBytes,
      streamEnd,
      contentObj,
      "xref\n0 6\n0000000000 65535 f \n",
      "trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n10\n%%EOF"
    ], { type: "application/pdf" });

    const link = document.createElement("a");
    link.download = `${filename}.pdf`;
    link.href = URL.createObjectURL(blob);
    link.click();
    alert(`âœ… Documento PDF de PrÃ©-ImpressÃ£o exportado com sucesso!\n\nArquivo: ${link.download}\nEscala MÃ©trica Calibrada: ${widthCm} × ${heightCm} cm\nDimensÃµes do PDF: ${ptW} × ${ptH} pt`);
  }

  // =========================================================================
  // VISUALIZAÃ‡ÃƒO FOTORREALISTA DA ARTE NA CAMISA (DISPLACEMENT & SHADING ENGINE)
  // =========================================================================
  openQuickMockupModal(shirtColor = "Preta") {
    let modal = document.getElementById("quickMockupModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "quickMockupModal";
      modal.className = "modal-backdrop";
      document.body.appendChild(modal);
    }

    // Estado interno do renderizador de mockup
    this.modalMockupState = {
      shirtColor: shirtColor,
      viewType: "hanger",      // "hanger" (cabide/flat-lay) ou "model" (lifestyle)
      viewSide: "front",       // "front" ou "back"
      placement: "center",     // "center" ou "pocket"
      displacementStrength: 7.5,
      shadingIntensity: 0.85,
      offsetY: 20,             // Inicia 4 dedos abaixo da gola para nÃ£o cortar
      offsetX: 0,
      scalePercent: 100
    };

    modal.style.display = "flex";
    modal.innerHTML = `
      <div class="quick-mockup-dialog glass-panel">
        <div class="mockup-dialog-header">
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div class="header-engine-badge">
              <span class="engine-pulse-dot"></span>
              <strong>MOCKUP FOTORREALISTA // CAMISETA DTF</strong>
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted);">
              Arte: <span class="font-mono" style="color: var(--accent-cyan); font-weight: 600;">${DTFState.imageEngine.activeArtworkName}</span> (${DTFState.imageEngine.selectedSize})
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('quickMockupModal').style.display='none'">âœ• Fechar</button>
        </div>

        <div class="mockup-dialog-body">
          <!-- ÃREA ESQUERDA: VIEWPORT FOTOGRÃFICO DE ALTA FIDELIDADE -->
          <div class="mockup-dialog-canvas-zone">
            <div class="mockup-canvas-wrapper">
              <canvas id="quickShirtMockupCanvas" width="512" height="512"></canvas>
              
              <!-- INDICADOR VISUAL COM LOADER ANIMADO DE PROCESSAMENTO COM IA -->
              <div class="mockup-loader-overlay" id="mockupLoaderOverlay" style="display: none;">
                <div class="loader-spinner-ring"></div>
                <div class="loader-text-box">
                  <span class="loader-title">âš¡ Processando com IA / Deslocamento...</span>
                  <span class="loader-subtitle">Mapeando rugas do tecido & iluminaÃ§Ã£o natural</span>
                </div>
              </div>
            </div>

            <div class="canvas-caption-bar">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="badge badge-purple">100% AlgodÃ£o 30.1 Heavyweight</span>
                <span class="badge badge-cyan" id="badgeMockupModeDisplay">EstÃºdio Cabide</span>
              </div>
              <span class="caption-res font-mono" id="mockupResIndicator">Fotografia Real 1024×1024</span>
            </div>
          </div>

          <!-- ÃREA DIREITA: CONTROLES MODERNOS GLASSMORPHISM / FIGMA STYLE -->
          <div class="mockup-dialog-controls">

            <!-- 1. AMBIENTE / FOTO BASE REAL -->
            <div class="control-section">
              <label class="control-label">Ambiente / Foto Base Real</label>
              <div class="view-toggle-pills">
                <button class="pill-btn ${this.modalMockupState.viewType === 'hanger' ? 'active' : ''}" id="btnMockupHanger">
                  ðŸ‘” Cabide / Flat-lay
                </button>
                <button class="pill-btn ${this.modalMockupState.viewType === 'model' ? 'active' : ''}" id="btnMockupModel">
                  ðŸš¶ Modelo Vestindo
                </button>
              </div>
            </div>

            <!-- 2. LADO DA PEÃ‡A (FRENTE / VERSO) -->
            <div class="control-section">
              <label class="control-label">Lado da PeÃ§a</label>
              <div class="view-toggle-pills">
                <button class="pill-btn ${this.modalMockupState.viewSide === 'front' ? 'active' : ''}" id="btnMockupSideFront">
                  Frente
                </button>
                <button class="pill-btn ${this.modalMockupState.viewSide === 'back' ? 'active' : ''}" id="btnMockupSideBack">
                  Verso (Costas)
                </button>
              </div>
            </div>

            <!-- 3. COLOR SWATCHES (CÃRCULOS COM COR E TEXTURA DA MALHA) -->
            <div class="control-section">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label class="control-label" style="margin-bottom: 0;">Cor da Malha (Textura Natural)</label>
                <span class="swatch-selected-name font-mono" id="swatchSelectedNameDisplay">${this.modalMockupState.shirtColor}</span>
              </div>
              <div class="color-swatches-grid">
                <button class="color-swatch-item ${this.modalMockupState.shirtColor === 'Preta' ? 'active' : ''}" data-color="Preta" title="Preta Streetwear">
                  <span class="swatch-circle" style="background: #111317; border: 1px solid #2b303b;"></span>
                  <span class="swatch-label">Preta</span>
                </button>
                <button class="color-swatch-item ${this.modalMockupState.shirtColor === 'Branca' ? 'active' : ''}" data-color="Branca" title="Branca Neve">
                  <span class="swatch-circle" style="background: #f7f8fa; border: 1px solid #cfd4dc;"></span>
                  <span class="swatch-label">Branca</span>
                </button>
                <button class="color-swatch-item ${this.modalMockupState.shirtColor === 'Cinza' ? 'active' : ''}" data-color="Cinza" title="Cinza Mescla">
                  <span class="swatch-circle" style="background: #6c7380; border: 1px solid #4b5260;"></span>
                  <span class="swatch-label">Cinza</span>
                </button>
                <button class="color-swatch-item ${this.modalMockupState.shirtColor === 'Off-White' ? 'active' : ''}" data-color="Off-White" title="Off-White Bege">
                  <span class="swatch-circle" style="background: #e8e2d5; border: 1px solid #cac0af;"></span>
                  <span class="swatch-label">Off-White</span>
                </button>
                <button class="color-swatch-item ${this.modalMockupState.shirtColor === 'Vermelha' ? 'active' : ''}" data-color="Vermelha" title="Vermelha Carmim">
                  <span class="swatch-circle" style="background: #8e1526; border: 1px solid #5c0e18;"></span>
                  <span class="swatch-label">Vermelha</span>
                </button>
              </div>
            </div>

            <!-- 4. POSICIONAMENTO E REPOSICIONAMENTO DA ESTAMPA -->
            <div class="control-section">
              <label class="control-label">Posicionamento da Estampa</label>
              <div class="view-toggle-pills">
                <button class="pill-btn ${this.modalMockupState.placement === 'center' ? 'active' : ''}" id="btnMockupPlacementCenter">
                  Frente Central (A3)
                </button>
                <button class="pill-btn ${this.modalMockupState.placement === 'pocket' ? 'active' : ''}" id="btnMockupPlacementPocket">
                  Pocket / Peito (Esq)
                </button>
              </div>
            </div>

            <!-- 5. AJUSTE FINO DE ALTURA & ESCALA (REPOSICIONAR) -->
            <div class="control-section">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <label class="control-label" style="margin-bottom: 0;">Ajuste de Altura & Escala</label>
                <div style="display: flex; gap: 4px;">
                  <button class="btn btn-secondary btn-sm" id="btnNudgeUp" style="padding: 2px 7px; font-size: 10px;" title="Subir Estampa">â¬†ï¸ Subir</button>
                  <button class="btn btn-secondary btn-sm" id="btnNudgeDown" style="padding: 2px 7px; font-size: 10px;" title="Descer Estampa">â¬‡ï¸ Descer</button>
                  <button class="btn btn-secondary btn-sm" id="btnResetPos" style="padding: 2px 7px; font-size: 10px;" title="Restaurar padrÃ£o 4 dedos">ðŸŽ¯ 4 Dedos</button>
                </div>
              </div>

              <div class="advanced-sliders-box">
                <div class="slider-row">
                  <div class="slider-header">
                    <span>PosiÃ§Ã£o Vertical Y (Baixar / Subir)</span>
                    <span class="font-mono slider-val" id="valOffsetYDisplay">${this.modalMockupState.offsetY || 0} px</span>
                  </div>
                  <input type="range" id="sliderOffsetY" min="-80" max="140" step="5" value="${this.modalMockupState.offsetY || 0}">
                </div>

                <div class="slider-row" style="margin-top: 6px;">
                  <div class="slider-header">
                    <span>Escala / Tamanho da Estampa</span>
                    <span class="font-mono slider-val" id="valScalePercentDisplay">${this.modalMockupState.scalePercent || 100}%</span>
                  </div>
                  <input type="range" id="sliderScalePercent" min="50" max="140" step="5" value="${this.modalMockupState.scalePercent || 100}">
                </div>
              </div>
            </div>

            <!-- 6. CALIBRAÃ‡ÃƒO DO SHADER FOTORREALISTA -->
            <div class="control-section advanced-sliders-box">
              <div class="slider-row">
                <div class="slider-header">
                  <span>DeformaÃ§Ã£o nas Rugas (Displacement Map)</span>
                  <span class="font-mono slider-val" id="valDisplacementDisplay">7.5 px</span>
                </div>
                <input type="range" id="sliderDisplacement" min="0" max="15" step="0.5" value="7.5">
              </div>

              <div class="slider-row" style="margin-top: 8px;">
                <div class="slider-header">
                  <span>Sombra Natural do Tecido (Multiply Shading)</span>
                  <span class="font-mono slider-val" id="valShadingDisplay">85%</span>
                </div>
                <input type="range" id="sliderShading" min="20" max="100" step="5" value="85">
              </div>
            </div>

            <!-- AÃ‡Ã•ES FINAIS -->
            <div class="mockup-action-buttons">
              <button class="btn btn-primary" id="btnDownloadHDMockup" style="padding: 12px; font-weight: 700;">
                ðŸ“¸ Baixar Mockup HD da Camisa
              </button>
              <button class="btn btn-accent btn-sm" id="btnGoToMarketing">
                ðŸš€ Levar para o MÃ³dulo de Marketing & Redes
              </button>
            </div>

          </div>
        </div>
      </div>
    `;

    this.bindMockupModalEvents();
    this.triggerMockupRenderWithLoader();
  }

  // EVENTOS E BINDINGS DA UI INTERATIVA DO MOCKUP
  bindMockupModalEvents() {
    const s = this.modalMockupState;

    // 1. Tipo de VisualizaÃ§Ã£o: Cabide vs Modelo
    const btnHanger = document.getElementById("btnMockupHanger");
    const btnModel = document.getElementById("btnMockupModel");
    const badgeMode = document.getElementById("badgeMockupModeDisplay");

    if (btnHanger && btnModel) {
      btnHanger.addEventListener("click", () => {
        s.viewType = "hanger";
        btnHanger.classList.add("active");
        btnModel.classList.remove("active");
        if (badgeMode) badgeMode.innerText = "EstÃºdio Cabide";
        this.triggerMockupRenderWithLoader();
      });

      btnModel.addEventListener("click", () => {
        s.viewType = "model";
        btnModel.classList.add("active");
        btnHanger.classList.remove("active");
        if (badgeMode) badgeMode.innerText = "Modelo Streetwear";
        this.triggerMockupRenderWithLoader();
      });
    }

    // 2. Lado da PeÃ§a: Frente vs Costas
    const btnSideFront = document.getElementById("btnMockupSideFront");
    const btnSideBack = document.getElementById("btnMockupSideBack");
    if (btnSideFront && btnSideBack) {
      btnSideFront.addEventListener("click", () => {
        s.viewSide = "front";
        btnSideFront.classList.add("active");
        btnSideBack.classList.remove("active");
        this.triggerMockupRenderWithLoader();
      });

      btnSideBack.addEventListener("click", () => {
        s.viewSide = "back";
        btnSideBack.classList.add("active");
        btnSideFront.classList.remove("active");
        this.triggerMockupRenderWithLoader();
      });
    }

    // 3. Color Swatches
    const swatchItems = document.querySelectorAll(".color-swatch-item");
    const nameDisplay = document.getElementById("swatchSelectedNameDisplay");
    swatchItems.forEach((btn) => {
      btn.addEventListener("click", () => {
        swatchItems.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        s.shirtColor = btn.getAttribute("data-color");
        if (nameDisplay) nameDisplay.innerText = s.shirtColor;
        this.triggerMockupRenderWithLoader();
      });
    });

    // 4. Posicionamento
    const btnPlaceCenter = document.getElementById("btnMockupPlacementCenter");
    const btnPlacePocket = document.getElementById("btnMockupPlacementPocket");
    if (btnPlaceCenter && btnPlacePocket) {
      btnPlaceCenter.addEventListener("click", () => {
        s.placement = "center";
        btnPlaceCenter.classList.add("active");
        btnPlacePocket.classList.remove("active");
        this.triggerMockupRenderWithLoader();
      });

      btnPlacePocket.addEventListener("click", () => {
        s.placement = "pocket";
        btnPlacePocket.classList.add("active");
        btnPlaceCenter.classList.remove("active");
        this.triggerMockupRenderWithLoader();
      });
    }

    // 5. Ajuste fino de Altura e Escala (Reposicionamento)
    const sliderOffY = document.getElementById("sliderOffsetY");
    const valOffY = document.getElementById("valOffsetYDisplay");
    if (sliderOffY && valOffY) {
      sliderOffY.addEventListener("input", (e) => {
        s.offsetY = parseInt(e.target.value, 10);
        valOffY.innerText = `${s.offsetY > 0 ? '+' : ''}${s.offsetY} px`;
        clearTimeout(this._posTimer);
        this._posTimer = setTimeout(() => this.triggerMockupRenderWithLoader(), 100);
      });
    }

    const sliderScale = document.getElementById("sliderScalePercent");
    const valScale = document.getElementById("valScalePercentDisplay");
    if (sliderScale && valScale) {
      sliderScale.addEventListener("input", (e) => {
        s.scalePercent = parseInt(e.target.value, 10);
        valScale.innerText = `${s.scalePercent}%`;
        clearTimeout(this._posTimer);
        this._posTimer = setTimeout(() => this.triggerMockupRenderWithLoader(), 100);
      });
    }

    // BotÃµes Nudge (Subir, Descer e 4 Dedos)
    const btnNudgeUp = document.getElementById("btnNudgeUp");
    if (btnNudgeUp) {
      btnNudgeUp.addEventListener("click", () => {
        s.offsetY = Math.max(-80, (s.offsetY || 0) - 20);
        if (sliderOffY) sliderOffY.value = s.offsetY;
        if (valOffY) valOffY.innerText = `${s.offsetY > 0 ? '+' : ''}${s.offsetY} px`;
        this.triggerMockupRenderWithLoader();
      });
    }

    const btnNudgeDown = document.getElementById("btnNudgeDown");
    if (btnNudgeDown) {
      btnNudgeDown.addEventListener("click", () => {
        s.offsetY = Math.min(140, (s.offsetY || 0) + 20);
        if (sliderOffY) sliderOffY.value = s.offsetY;
        if (valOffY) valOffY.innerText = `${s.offsetY > 0 ? '+' : ''}${s.offsetY} px`;
        this.triggerMockupRenderWithLoader();
      });
    }

    const btnResetPos = document.getElementById("btnResetPos");
    if (btnResetPos) {
      btnResetPos.addEventListener("click", () => {
        s.offsetY = 0;
        s.scalePercent = 100;
        if (sliderOffY) sliderOffY.value = 0;
        if (valOffY) valOffY.innerText = "0 px";
        if (sliderScale) sliderScale.value = 100;
        if (valScale) valScale.innerText = "100%";
        this.triggerMockupRenderWithLoader();
      });
    }

    // 6. Sliders com atualizaÃ§Ã£o responsiva
    const sliderDisp = document.getElementById("sliderDisplacement");
    const valDisp = document.getElementById("valDisplacementDisplay");
    if (sliderDisp && valDisp) {
      sliderDisp.addEventListener("input", (e) => {
        s.displacementStrength = parseFloat(e.target.value);
        valDisp.innerText = `${s.displacementStrength.toFixed(1)} px`;
        clearTimeout(this._dispTimer);
        this._dispTimer = setTimeout(() => this.triggerMockupRenderWithLoader(), 120);
      });
    }

    const sliderShad = document.getElementById("sliderShading");
    const valShad = document.getElementById("valShadingDisplay");
    if (sliderShad && valShad) {
      sliderShad.addEventListener("input", (e) => {
        s.shadingIntensity = parseInt(e.target.value, 10) / 100.0;
        valShad.innerText = `${e.target.value}%`;
        clearTimeout(this._shadTimer);
        this._shadTimer = setTimeout(() => this.triggerMockupRenderWithLoader(), 120);
      });
    }

    // 7. BotÃµes de AÃ§Ã£o
    const btnDownload = document.getElementById("btnDownloadHDMockup");
    if (btnDownload) {
      btnDownload.addEventListener("click", () => {
        this.downloadMockupImage();
      });
    }

    const btnMarketing = document.getElementById("btnGoToMarketing");
    if (btnMarketing) {
      btnMarketing.addEventListener("click", () => {
        const navMarketing = document.getElementById("navItemMarketing");
        if (navMarketing) navMarketing.click();
        const modal = document.getElementById("quickMockupModal");
        if (modal) modal.style.display = "none";
      });
    }
  }

  // RENDERIZAÃ‡ÃƒO ASSÃNCRONA COM FEEDBACK VISUAL DE PROCESSAMENTO IA
  async triggerMockupRenderWithLoader() {
    const loader = document.getElementById("mockupLoaderOverlay");
    const canvas = document.getElementById("quickShirtMockupCanvas");
    if (!canvas) return;

    if (loader) loader.style.display = "flex";

    // Simula tempo hÃ¡ptico de processamento GPU/Shader
    await new Promise((resolve) => setTimeout(resolve, 140));

    if (window.mockupRenderEngine) {
      await window.mockupRenderEngine.renderMockup(canvas, this.canvas, {
        viewType: this.modalMockupState.viewType,
        viewSide: this.modalMockupState.viewSide,
        shirtColor: this.modalMockupState.shirtColor,
        placement: this.modalMockupState.placement,
        displacementStrength: this.modalMockupState.displacementStrength,
        shadingIntensity: this.modalMockupState.shadingIntensity,
        offsetY: this.modalMockupState.offsetY || 0,
        offsetX: this.modalMockupState.offsetX || 0,
        scalePercent: this.modalMockupState.scalePercent || 100
      });
    }

    if (loader) loader.style.display = "none";
  }

  // COMPATIBILIDADE RETROATIVA SE CHAMADO POR OUTRO MÃ“DULO
  async renderShirtMockupOnCanvas(canvasId, shirtColor = "Preta", placement = "center") {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.mockupRenderEngine) return;
    await window.mockupRenderEngine.renderMockup(canvas, this.canvas, {
      shirtColor: shirtColor,
      placement: placement
    });
  }

  // EXPORTAÃ‡ÃƒO HD COM O MOTOR FOTORREALISTA
  async downloadMockupImage() {
    const filename = `Mockup_Realista_${DTFState.imageEngine.activeArtworkName || "DTF"}_${this.modalMockupState.shirtColor}.png`;
    if (window.mockupRenderEngine && this.canvas) {
      await window.mockupRenderEngine.exportHDMockup(this.canvas, filename);
    } else {
      const canvas = document.getElementById("quickShirtMockupCanvas");
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = filename;
      link.href = canvas.toDataURL("image/png");
      link.click();
    }
  }

  // SUPORTE A DRAG & DROP NO VIEWPORT E CANVAS
  setupDragAndDrop() {
    const dropArea = document.querySelector(".canvas-viewport-box");
    const overlay = document.getElementById("canvasDropOverlay");

    if (!dropArea) return;

    ["dragenter", "dragover"].forEach((eventName) => {
      dropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (overlay) overlay.classList.add("active");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (overlay) overlay.classList.remove("active");
      });
    });

    dropArea.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        this.handleMultipleFiles(files);
      }
    });
  }

  handleMultipleFiles(files) {
    Array.from(files).forEach((file) => {
      const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");

      if (isSvg) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const svgContent = event.target.result;
          try {
            // Para arquivos vetoriais SVG, rasterizamos nativamente em Ultra-Resolução (mínimo 4800px)
            // preservando fidelidade cirúrgica de curvas Bézier para impressão DTF a 600 DPI
            let w = 4800;
            let h = 4800;
            const viewBoxMatch = svgContent.match(/viewBox=["']?([0-9.\s,-]+)["']?/i);
            if (viewBoxMatch) {
              const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
              if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
                const aspect = parts[3] / parts[2];
                if (aspect >= 1) {
                  h = 5600;
                  w = Math.round(5600 / aspect);
                } else {
                  w = 5600;
                  h = Math.round(5600 * aspect);
                }
              }
            } else {
              const wMatch = svgContent.match(/\bwidth=["']?([0-9.]+)(?:px)?["']?/i);
              const hMatch = svgContent.match(/\bheight=["']?([0-9.]+)(?:px)?["']?/i);
              if (wMatch && hMatch) {
                const origW = parseFloat(wMatch[1]);
                const origH = parseFloat(hMatch[1]);
                const aspect = origH / origW;
                if (aspect >= 1) {
                  h = 5600;
                  w = Math.round(5600 / aspect);
                } else {
                  w = 5600;
                  h = Math.round(5600 * aspect);
                }
              }
            }

            const renderedCanvas = await ImageOps.rasterizeSvg(svgContent, w, h);
            let finalCanvas = renderedCanvas;
            if (window.ImageOps && ImageOps.trimTransparentCanvas) {
              const trimRes = ImageOps.trimTransparentCanvas(renderedCanvas, 0, 8);
              if (trimRes.wasTrimmed && trimRes.canvas) {
                finalCanvas = trimRes.canvas;
              }
            }

            const dataUrl = finalCanvas.toDataURL("image/png");
            this.addUploadedImage(file, dataUrl, file.name, finalCanvas.width, finalCanvas.height);
            this.showFeedbackToast(`📐 Vetor SVG rasterizado em Ultra-Alta Resolução (${finalCanvas.width}×${finalCanvas.height} px, Nitidez Absoluta)!`);
          } catch (err) {
            console.error("Erro ao rasterizar SVG:", err);
            this.showFeedbackToast("Falha ao abrir SVG vetorial.");
          }
        };
        reader.readAsText(file);
        return;
      }

      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            let finalDataUrl = event.target.result;
            let finalW = img.width;
            let finalH = img.height;

            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0);

            if (window.ImageOps && ImageOps.trimTransparentCanvas) {
              const trimRes = ImageOps.trimTransparentCanvas(c, 0, 8);
              if (trimRes.wasTrimmed && trimRes.box) {
                finalDataUrl = trimRes.canvas.toDataURL("image/png");
                finalW = trimRes.canvas.width;
                finalH = trimRes.canvas.height;
              }
            }

            this.addUploadedImage(file, finalDataUrl, file.name, finalW, finalH);
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // GERA DATAURL COM FUNDO TRANSPARENTE PARA O ROLO DTF (HONRANDO ESCOLHA DE KNOCKOUT E APARANDO BORDAS VAZIAS)
  getCleanTransparentArtworkDataUrl(autoTrim = true, targetDpi = null) {
    if (!this.sourceImage || !this.loaded) return null;

    const dpi = targetDpi || (window.DTFState && DTFState.imageEngine && DTFState.imageEngine.targetDPI) || 600;
    const cmW = (window.DTFState && DTFState.imageEngine && DTFState.imageEngine.customWidthCm) || 28;
    const cmH = (window.DTFState && DTFState.imageEngine && DTFState.imageEngine.customHeightCm) || 35;
    const nativePxW = Math.round((cmW / 2.54) * dpi);
    const nativePxH = Math.round((cmH / 2.54) * dpi);

    const canvasW = Math.max(this.sourceImage.naturalWidth || 1600, nativePxW);
    const canvasH = Math.max(this.sourceImage.naturalHeight || 2000, nativePxH);

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvasW;
    tempCanvas.height = canvasH;
    const tCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    tCtx.imageSmoothingEnabled = true;
    tCtx.imageSmoothingQuality = "high";

    // Processa a arte com o pipeline oficial em resolução nativa ultra-HD
    this.processArtwork(tCtx, tempCanvas.width, tempCanvas.height);

    if (autoTrim && window.ImageOps && ImageOps.trimTransparentCanvas) {
      const trimRes = ImageOps.trimTransparentCanvas(tempCanvas, 0, 8);
      return {
        dataUrl: trimRes.canvas.toDataURL("image/png"),
        box: trimRes.box,
        wasTrimmed: trimRes.wasTrimmed,
        width: trimRes.canvas.width,
        height: trimRes.canvas.height
      };
    }

    return {
      dataUrl: tempCanvas.toDataURL("image/png"),
      box: null,
      wasTrimmed: false,
      width: tempCanvas.width,
      height: tempCanvas.height
    };
  }

  // ENVIAR ESTAMPA TRATADA PARA O ROLO DE 58CM (MÓDULO 2) - ENCAIXA NO ESPAÇO LIVRE CALCULANDO APENAS A PARTE COM ARTE
  pushToGangSheet() {
    if (!this.loaded || !this.sourceImage || !this.sourceImage.src || !this.sourceImage.naturalWidth) {
      this.showFeedbackToast("⚠️ Nenhuma imagem carregada para adicionar ao rolo!");
      return null;
    }
    const activeName = DTFState.imageEngine.activeArtworkName || "Arte";

    // 1. Gera snapshot limpo recortado estritamente à arte visível em DPI Nativo Real
    const cleanArt = this.getCleanTransparentArtworkDataUrl(true);
    if (!cleanArt) return null;

    // 2. Dimensões no rolo: A largura desejada da estampa aplicada estritamente à arte real
    const metrics = this.getDimensionsCurrentDPI();
    const finalW_cm = metrics.hasTransparentBorder ? metrics.contentCmW : metrics.cmW; // A largura desejada da estampa real
    const aspect = cleanArt.height / Math.max(cleanArt.width, 1);
    const finalH_cm = Math.round((finalW_cm * aspect) * 10) / 10;

    const newItem = {
      id: "item_roll_" + Date.now(),
      orderNumber: "PED-" + (110 + Math.floor(Math.random() * 50)),
      customerName: "Cliente Balcão",
      artworkId: DTFState.imageEngine.activeArtworkId,
      artworkName: activeName,
      dataUrl: cleanArt.dataUrl,
      sourceDataUrl: this.sourceImage.src,
      sizeLabel: DTFState.imageEngine.selectedSize,
      shirtColor: DTFState.imageEngine.targetShirtColor,
      widthCm: finalW_cm,
      heightCm: finalH_cm,
      xCm: 0,
      yCm: 0,
      rot: 0,
      isFiller: false,
      cutLabel: `#PED-${Math.floor(100 + Math.random() * 900)} - Tam ${DTFState.imageEngine.selectedSize} - ${DTFState.imageEngine.targetShirtColor}`,
      nativeWidthPx: cleanArt.width,
      nativeHeightPx: cleanArt.height,
      engineSettings: {
        halftoneEnabled: Boolean(DTFState.imageEngine.halftoneEnabled),
        halftoneLPI: DTFState.imageEngine.halftoneLPI || 45,
        halftoneAngle: DTFState.imageEngine.halftoneAngle || 45,
        blackKnockoutEnabled: Boolean(DTFState.imageEngine.blackKnockoutEnabled),
        knockoutThreshold: DTFState.imageEngine.knockoutThreshold || 28,
        knockoutFeather: DTFState.imageEngine.halftoneEnabled ? 65 : 20,
        whiteKnockoutEnabled: Boolean(DTFState.imageEngine.whiteKnockoutEnabled),
        whiteKnockoutThreshold: DTFState.imageEngine.whiteKnockoutThreshold || 88,
        whiteKnockoutFeather: DTFState.imageEngine.whiteKnockoutFeather || 12,
        unsharpStrength: DTFState.imageEngine.unsharpStrength || 0,
        denoiseStrength: DTFState.imageEngine.denoiseStrength || 0,
        vibranceBoost: DTFState.imageEngine.vibranceBoost || 0,
        customWidthCm: finalW_cm,
        customHeightCm: finalH_cm,
        targetDPI: DTFState.imageEngine.targetDPI || 600,
        wasTrimmed: cleanArt.wasTrimmed
      }
    };

    if (window.gangSheetService && typeof window.gangSheetService.addItemAtFreeSpot === "function") {
      const added = window.gangSheetService.addItemAtFreeSpot(newItem);
      if (cleanArt.wasTrimmed && cleanArt.box) {
        this.showFeedbackToast(`📦 Estampa enviada ao Rolo em Alta Resolução (${cleanArt.width}×${cleanArt.height} px)! Economizou ${cleanArt.box.savedAreaPct}% de filme (${finalW_cm}×${finalH_cm} cm).`);
      } else {
        this.showFeedbackToast(`📦 Estampa enviada ao Rolo em Alta Resolução (${cleanArt.width}×${cleanArt.height} px, ${finalW_cm}×${finalH_cm} cm)!`);
      }
      return added;
    } else {
      DTFState.gangSheet.items.push(newItem);
      if (window.gangSheetService) window.gangSheetService.render();
      return newItem;
    }
  }
}

window.ImageEngineService = ImageEngineService;


