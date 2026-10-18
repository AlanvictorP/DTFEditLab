/**
 * LATITUDE DTF COCKPIT - VECTOR STUDIO SERVICE
 * Estúdio de Vetorização Avançada e Refinamento em Curvas Bézier Interativas.
 * Inspirado nas melhores ferramentas profissionais (Vectorizer.ai, Vector Magic).
 *
 * Oferece:
 * - Comparação Split / Wipe Interativo em Tempo Real (Original Bitmap vs Vetor SVG)
 * - Super Zoom & Pan no visualizador de curvas
 * - Perfis de 1 Clique (Streetwear, Logo Geométrico, Silhueta DTF, HQ)
 * - Paleta Dinâmica de Cores com Edição, Fusão e Knockout de Cores
 * - Ajuste Fino de Cantos, Tolerância Bézier, Suavidade e Limpeza de Franjas
 * - Exportação SVG Puro e Injeção Direta em Alta Definição no Canvas do Cockpit
 */

class VectorStudioService {
  constructor() {
    this.session = null;
    this.sourceCanvas = null;
    this.activeSvg = "";
    this.activeStats = null;
    this.activePalette = [];
    this.viewMode = "split"; // "split", "vector", "original"
    this.splitPercent = 50;  // 0% a 100% no wipe slider
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.isDraggingSplit = false;
    this.panStart = { x: 0, y: 0 };
    this.isSpacePressed = false;
    this.modalEl = null;

    this.activePreset = "streetwear";

    this.presets = {
      streetwear: {
        id: "streetwear",
        name: "Streetwear / Estamparia",
        desc: "Contornos limpos, cores sólidas vivas e eliminação de franjas para DTF",
        params: {
          colors: 16,
          autoColors: false,
          detailBias: 0.45,
          corners: 65,
          smooth: 0.8,
          tolerance: 0.85,
          denoise: 1,
          minArea: 10,
          fringe: true,
          fringeTol: 11,
          excludeBlack: true,
          blackThreshold: 24,
          excludeWhite: false
        }
      },
      logo: {
        id: "logo",
        name: "Logotipo / Geométrico",
        desc: "Cantos vivos de 90 graus, linhas perfeitamente retas e alta precisão",
        params: {
          colors: 8,
          autoColors: false,
          detailBias: 0.25,
          corners: 95,
          smooth: 0.4,
          tolerance: 0.55,
          denoise: 0,
          minArea: 6,
          fringe: true,
          fringeTol: 12,
          excludeBlack: false,
          excludeWhite: false
        }
      },
      silhouette: {
        id: "silhouette",
        name: "Silhueta / Alto Contraste",
        desc: "Poucas cores sólidas com corte agressivo de fundo para camisas escuras",
        params: {
          colors: 3,
          autoColors: false,
          detailBias: 0.15,
          corners: 75,
          smooth: 0.9,
          tolerance: 0.8,
          denoise: 2,
          minArea: 25,
          fringe: true,
          fringeTol: 14,
          excludeBlack: true,
          blackThreshold: 35,
          excludeWhite: false
        }
      },
      complex: {
        id: "complex",
        name: "HQ / Arte Complexa",
        desc: "Preserva riqueza tonal, detalhes finos e degradês simulados",
        params: {
          colors: 24,
          autoColors: false,
          detailBias: 0.85,
          corners: 55,
          smooth: 0.75,
          tolerance: 0.7,
          denoise: 1,
          minArea: 4,
          fringe: true,
          fringeTol: 9,
          excludeBlack: false,
          excludeWhite: false
        }
      }
    };
  }

  /**
   * Abre o estúdio de vetorização carregando a arte atual do Image Engine
   */
  open(sourceCanvasOrImage = null) {
    let source = sourceCanvasOrImage;
    if (!source && window.imageEngineService && window.imageEngineService.canvas) {
      source = window.imageEngineService.canvas;
    }
    if (!source) {
      if (window.imageEngineService) {
        window.imageEngineService.showFeedbackToast("Nenhuma arte disponível para vetorização.");
      }
      return;
    }

    this.sourceCanvas = source;
    this.createOrShowModal();
    this.initSessionWithPreset(this.activePreset);
  }

  /**
   * Cria o container modal no DOM caso ainda não exista
   */
  createOrShowModal() {
    let modal = document.getElementById("vectorStudioModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "vectorStudioModal";
      modal.className = "vector-studio-overlay";
      modal.innerHTML = this.renderModalTemplate();
      document.body.appendChild(modal);
      this.attachEventListeners(modal);
    }

    this.modalEl = modal;
    modal.classList.add("active");
    document.body.classList.add("modal-open");

    // Reset de transformações de navegação
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.splitPercent = 50;
    this.updateViewportTransform();
  }

  close() {
    if (this.modalEl) {
      this.modalEl.classList.remove("active");
    }
    document.body.classList.remove("modal-open");
  }

  /**
   * Renderiza a casca HTML do Vector Studio
   */
  renderModalTemplate() {
    return `
      <div class="vector-studio-window">
        <!-- HEADER SUPERIOR -->
        <header class="vector-studio-header">
          <div class="vector-brand-group">
            <span class="vector-logo-badge">⚡</span>
            <div>
              <div class="vector-title-row">
                <h2>Vector AI Studio</h2>
                <span class="vector-pill-tag">Bézier Sub-Pixel Engine</span>
              </div>
              <p class="vector-subtitle">Vetorização e Refinamento de Alta Fidelidade para DTF & Silk-Screen</p>
            </div>
          </div>

          <!-- STATUS LIVE -->
          <div class="vector-header-stats" id="vectorLiveStatsBadge">
            <span class="v-stat-item"><strong>Carregando...</strong></span>
          </div>

          <div class="vector-header-actions">
            <button type="button" class="btn-icon-subtle" onclick="window.vectorStudioService.close()" title="Fechar Estúdio (Esc)">✕</button>
          </div>
        </header>

        <!-- CORPO PRINCIPAL -->
        <div class="vector-studio-body">
          
          <!-- LADO ESQUERDO: VIEWPORT COMPARATIVO INTERATIVO -->
          <div class="vector-viewport-container" id="vectorViewportContainer">
            
            <!-- Barra de ferramentas flutuante do Viewport -->
            <div class="vector-viewport-toolbar">
              <div class="vector-view-modes">
                <button type="button" class="v-mode-btn active" data-mode="split" onclick="window.vectorStudioService.setViewMode('split')">
                  ✂️ Split (Dividido)
                </button>
                <button type="button" class="v-mode-btn" data-mode="vector" onclick="window.vectorStudioService.setViewMode('vector')">
                  📐 Apenas Vetor
                </button>
                <button type="button" class="v-mode-btn" data-mode="original" onclick="window.vectorStudioService.setViewMode('original')">
                  🖼️ Apenas Original
                </button>
              </div>

              <div class="vector-zoom-controls">
                <button type="button" class="v-zoom-btn" onclick="window.vectorStudioService.adjustZoom(-0.25)" title="Reduzir Zoom (-)">−</button>
                <span class="v-zoom-value" id="vectorZoomDisplay">100%</span>
                <button type="button" class="v-zoom-btn" onclick="window.vectorStudioService.adjustZoom(+0.25)" title="Aumentar Zoom (+)">+</button>
                <button type="button" class="v-zoom-btn" onclick="window.vectorStudioService.fitZoom()" title="Ajustar à Área (F)">Ajustar</button>
                <button type="button" class="v-zoom-btn" onclick="window.vectorStudioService.resetZoom()" title="Tamanho Real 100% (1)">1:1</button>
              </div>
            </div>

            <!-- Camada de Exibição / Comparador -->
            <div class="vector-canvas-stage checkerboard-bg" id="vectorCanvasStage">
              <div class="vector-art-wrapper" id="vectorArtWrapper">
                
                <!-- Camada 1: Original Bitmap -->
                <div class="vector-layer vector-layer-original" id="vectorLayerOriginal">
                  <canvas id="vectorSourceCanvasDisplay"></canvas>
                </div>

                <!-- Camada 2: Vetor SVG Renderizado -->
                <div class="vector-layer vector-layer-svg" id="vectorLayerSvg">
                  <div id="vectorSvgMount"></div>
                </div>

                <!-- Divisor Interativo (Wipe Slider) -->
                <div class="vector-split-divider" id="vectorSplitDivider" style="left: 50%;">
                  <div class="vector-split-handle" title="Arraste para comparar Original vs Vetor">
                    <span>❮ ❯</span>
                  </div>
                </div>

              </div>
            </div>

            <!-- Dica de Rodapé do Viewport -->
            <div class="vector-viewport-footer-hint">
              <span>💡 Dica: Segure <strong>Barra de Espaço</strong> para alternar instantaneamente com o original • Use a rodinha do mouse para dar zoom</span>
            </div>

          </div>

          <!-- LADO DIREITO: PAINEL DE CONTROLES E REFINAMENTO -->
          <aside class="vector-sidebar-controls">
            
            <!-- 1. PRESETS DE 1 CLIQUE -->
            <div class="v-tool-section">
              <div class="v-section-title">
                <span>⚡ Perfil de Vetorização</span>
              </div>
              <div class="v-presets-grid">
                <button type="button" class="v-preset-card active" data-preset="streetwear" onclick="window.vectorStudioService.applyPreset('streetwear')">
                  <strong>👕 Streetwear DTF</strong>
                  <small>Cores vivas & traços limpos</small>
                </button>
                <button type="button" class="v-preset-card" data-preset="logo" onclick="window.vectorStudioService.applyPreset('logo')">
                  <strong>🏷️ Logotipo</strong>
                  <small>Cantos retos e geometria</small>
                </button>
                <button type="button" class="v-preset-card" data-preset="silhouette" onclick="window.vectorStudioService.applyPreset('silhouette')">
                  <strong>✒️ Silhueta</strong>
                  <small>Alto contraste / Knockout</small>
                </button>
                <button type="button" class="v-preset-card" data-preset="complex" onclick="window.vectorStudioService.applyPreset('complex')">
                  <strong>🎨 Arte HQ</strong>
                  <small>Máxima fidelidade tonal</small>
                </button>
              </div>
            </div>

            <!-- 2. PALETA DE CORES & GERENCIAMENTO -->
            <div class="v-tool-section">
              <div class="v-section-title">
                <span>🎨 Paleta de Cores do Vetor</span>
                <span class="v-section-badge" id="vPaletteCountBadge">16 Cores</span>
              </div>

              <div class="v-control-group">
                <div class="v-control-label">
                  <span>Quantidade de Cores Alvo:</span>
                  <span class="font-mono v-val" id="vColorsDisplay">16</span>
                </div>
                <input type="range" id="vSliderColors" min="2" max="32" step="1" value="16" oninput="window.vectorStudioService.onColorSliderChange(this.value)">
              </div>

              <div class="v-checkbox-row">
                <label>
                  <input type="checkbox" id="vChkAutoColors" onchange="window.vectorStudioService.onAutoColorsChange(this.checked)">
                  <span>Detectar Cores Automaticamente (Sem limite fixo)</span>
                </label>
              </div>

              <!-- Lista de Swatches Interativos -->
              <div class="v-palette-swatches-container">
                <div class="v-swatches-header">
                  <small>Cores Detectadas (Clique para editar, mesclar ou apagar):</small>
                  <div class="v-undo-redo-mini">
                    <button type="button" class="btn-xs" id="vBtnUndo" onclick="window.vectorStudioService.undo()" title="Desfazer alteração de cor" disabled>↩ Desfazer</button>
                    <button type="button" class="btn-xs" id="vBtnRedo" onclick="window.vectorStudioService.redo()" title="Refazer alteração de cor" disabled>↪</button>
                  </div>
                </div>
                <div class="v-swatches-grid" id="vSwatchesGridContainer">
                  <!-- Injetado dinamicamente -->
                </div>
              </div>
            </div>

            <!-- 3. GEOMETRIA, CANTOS E CURVAS BÉZIER -->
            <div class="v-tool-section">
              <div class="v-section-title">
                <span>📐 Curvas Bézier & Geometria</span>
              </div>

              <!-- Nitidez dos Cantos -->
              <div class="v-control-group">
                <div class="v-control-label">
                  <span>Nitidez dos Cantos (Cantos Vivos):</span>
                  <span class="font-mono v-val" id="vCornersDisplay">65%</span>
                </div>
                <input type="range" id="vSliderCorners" min="0" max="100" step="5" value="65" oninput="window.vectorStudioService.onParamChange('corners', parseFloat(this.value), 'vCornersDisplay', '%')">
              </div>

              <!-- Suavidade das Curvas -->
              <div class="v-control-group">
                <div class="v-control-label">
                  <span>Suavidade das Curvas (Anti-Serrilhado):</span>
                  <span class="font-mono v-val" id="vSmoothDisplay">0.8 px</span>
                </div>
                <input type="range" id="vSliderSmooth" min="0.2" max="2.0" step="0.1" value="0.8" oninput="window.vectorStudioService.onParamChange('smooth', parseFloat(this.value), 'vSmoothDisplay', ' px')">
              </div>

              <!-- Tolerância / Fidelidade de Curva -->
              <div class="v-control-group">
                <div class="v-control-label">
                  <span>Precisão de Ajuste (Tolerância Bézier):</span>
                  <span class="font-mono v-val" id="vToleranceDisplay">0.85 px</span>
                </div>
                <input type="range" id="vSliderTolerance" min="0.3" max="2.0" step="0.05" value="0.85" oninput="window.vectorStudioService.onParamChange('tolerance', parseFloat(this.value), 'vToleranceDisplay', ' px')">
              </div>

              <!-- Nível de Detalhe -->
              <div class="v-control-group">
                <div class="v-control-label">
                  <span>Nível de Detalhe (Bias para Cores Raras):</span>
                  <span class="font-mono v-val" id="vDetailBiasDisplay">45%</span>
                </div>
                <input type="range" id="vSliderDetailBias" min="0.0" max="1.0" step="0.05" value="0.45" oninput="window.vectorStudioService.onParamChange('detailBias', parseFloat(this.value), 'vDetailBiasDisplay', '%', 100)">
              </div>
            </div>

            <!-- 4. LIMPEZA & KNOCKOUT DTF -->
            <div class="v-tool-section">
              <div class="v-section-title">
                <span>🧹 Limpeza de Ruído & Fundo DTF</span>
              </div>

              <div class="v-checkbox-row">
                <label>
                  <input type="checkbox" id="vChkDeFringe" checked onchange="window.vectorStudioService.onParamChange('fringe', this.checked)">
                  <span>Remover Franja de Antialiasing (Bordas Limpas)</span>
                </label>
              </div>

              <!-- Despeckle / Área Mínima -->
              <div class="v-control-group">
                <div class="v-control-label">
                  <span>Limpeza de Manchas (Despeckle):</span>
                  <span class="font-mono v-val" id="vMinAreaDisplay">10 px²</span>
                </div>
                <input type="range" id="vSliderMinArea" min="0" max="50" step="2" value="10" oninput="window.vectorStudioService.onParamChange('minArea', parseInt(this.value, 10), 'vMinAreaDisplay', ' px²')">
              </div>

              <!-- Knockout Preto -->
              <div class="v-checkbox-row">
                <label>
                  <input type="checkbox" id="vChkExcludeBlack" checked onchange="window.vectorStudioService.onParamChange('excludeBlack', this.checked)">
                  <span>⚡ Knockout de Fundo Preto (Camiseta Preta)</span>
                </label>
              </div>

              <!-- Knockout Branco -->
              <div class="v-checkbox-row">
                <label>
                  <input type="checkbox" id="vChkExcludeWhite" onchange="window.vectorStudioService.onParamChange('excludeWhite', this.checked)">
                  <span>⚪ Knockout de Fundo Branco (Camiseta Branca)</span>
                </label>
              </div>
            </div>

            <!-- 5. AÇÕES DE SAÍDA E EXPORTAÇÃO -->
            <div class="v-footer-actions">
              <button type="button" class="btn btn-accent btn-block v-btn-primary" onclick="window.vectorStudioService.applyToCockpit()">
                🎯 Aplicar no Cockpit (Alta Resolução)
              </button>
              
              <div class="v-dual-actions">
                <button type="button" class="btn btn-secondary" onclick="window.vectorStudioService.downloadSvg()" title="Baixar arquivo SVG com curvas puras e infinitamente escaláveis">
                  📥 Baixar SVG (.svg)
                </button>
                <button type="button" class="btn btn-secondary" onclick="window.vectorStudioService.saveAsNewArtwork()" title="Salvar como nova imagem na galeria sem sobrescrever a original">
                  ➕ Nova Imagem
                </button>
              </div>

              <button type="button" class="btn btn-subtle btn-sm btn-block" onclick="window.vectorStudioService.reprocessCurrentSession()" style="margin-top: 4px;">
                🔄 Reprocessar / Refinar Agora
              </button>
            </div>

          </aside>

        </div>
      </div>
    `;
  }

  /**
   * Conecta ouvintes de eventos para atalhos de teclado, zoom, pan e arraste do divisor de comparação
   */
  attachEventListeners(modal) {
    // Tecla ESC para fechar, Espaço para alternar original, F para fit, 1 para 100%
    window.addEventListener("keydown", (e) => {
      if (!modal.classList.contains("active")) return;
      if (e.key === "Escape") {
        this.close();
      } else if (e.code === "Space" && !this.isSpacePressed && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        this.isSpacePressed = true;
        this.setQuickOriginalPeek(true);
      } else if ((e.key === "f" || e.key === "F") && document.activeElement.tagName !== "INPUT") {
        this.fitZoom();
      } else if (e.key === "1" && document.activeElement.tagName !== "INPUT") {
        this.resetZoom();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (!modal.classList.contains("active")) return;
      if (e.code === "Space") {
        this.isSpacePressed = false;
        this.setQuickOriginalPeek(false);
      }
    });

    // Arraste do divisor de comparação (Split Slider)
    const divider = modal.querySelector("#vectorSplitDivider");
    const stage = modal.querySelector("#vectorCanvasStage");

    const onPointerMove = (e) => {
      if (this.isDraggingSplit && stage) {
        const rect = stage.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        if (clientX) {
          const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
          this.setSplitPercent(pct);
        }
      } else if (this.isPanning) {
        const dx = e.clientX - this.panStart.x;
        const dy = e.clientY - this.panStart.y;
        this.panX += dx;
        this.panY += dy;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.updateViewportTransform();
      }
    };

    const onPointerUp = () => {
      this.isDraggingSplit = false;
      this.isPanning = false;
      if (stage) stage.classList.remove("is-panning");
    };

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchmove", onPointerMove, { passive: true });
    window.addEventListener("touchend", onPointerUp);

    if (divider) {
      divider.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.isDraggingSplit = true;
      });
      divider.addEventListener("touchstart", (e) => {
        this.isDraggingSplit = true;
      }, { passive: true });
    }

    // Pan no stage (Botão do Meio ou Botão Esquerdo com Espaço)
    if (stage) {
      stage.addEventListener("mousedown", (e) => {
        if (e.target.closest("#vectorSplitDivider")) return;
        if (e.button === 1 || (e.button === 0 && this.isSpacePressed)) {
          e.preventDefault();
          this.isPanning = true;
          this.panStart = { x: e.clientX, y: e.clientY };
          stage.classList.add("is-panning");
        }
      });

      // Zoom na rodinha do mouse
      stage.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        this.adjustZoom(delta);
      }, { passive: false });
    }
  }

  /**
   * Inicializa uma sessão com um dos presets recomendados
   */
  initSessionWithPreset(presetKey) {
    const preset = this.presets[presetKey] || this.presets.streetwear;
    this.activePreset = presetKey;

    if (!window.VectorEngine || !window.VectorEngine.Session) {
      console.error("VectorEngine não encontrado em window.");
      return;
    }

    // Atualiza botões ativos de preset
    if (this.modalEl) {
      this.modalEl.querySelectorAll(".v-preset-card").forEach((card) => {
        card.classList.toggle("active", card.getAttribute("data-preset") === presetKey);
      });
    }

    // Cria sessão do VectorEngine
    const initialParams = { ...preset.params, maxSide: 1200 };
    this.session = new window.VectorEngine.Session(this.sourceCanvas, initialParams);

    // Sincroniza sliders da UI
    this.syncControlsUIFromParams(initialParams);

    // Renderiza canvas original na camada 1
    this.renderSourceBitmapDisplay();

    // Executa vetorização
    this.runVectorization();
  }

  applyPreset(presetKey) {
    this.initSessionWithPreset(presetKey);
  }

  /**
   * Sincroniza os sliders e displays com os valores atuais
   */
  syncControlsUIFromParams(p) {
    if (!this.modalEl) return;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    const setChk = (id, checked) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!checked;
    };
    const setText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    setVal("vSliderColors", p.colors || 16);
    setText("vColorsDisplay", p.colors || 16);
    setChk("vChkAutoColors", p.autoColors);

    setVal("vSliderCorners", p.corners !== undefined ? p.corners : 60);
    setText("vCornersDisplay", (p.corners !== undefined ? p.corners : 60) + "%");

    setVal("vSliderSmooth", p.smooth || 0.8);
    setText("vSmoothDisplay", (p.smooth || 0.8).toFixed(1) + " px");

    setVal("vSliderTolerance", p.tolerance || 0.85);
    setText("vToleranceDisplay", (p.tolerance || 0.85).toFixed(2) + " px");

    const biasPct = Math.round((p.detailBias !== undefined ? p.detailBias : 0.45) * 100);
    setVal("vSliderDetailBias", p.detailBias || 0.45);
    setText("vDetailBiasDisplay", biasPct + "%");

    setChk("vChkDeFringe", p.fringe !== false);
    setVal("vSliderMinArea", p.minArea || 10);
    setText("vMinAreaDisplay", (p.minArea || 10) + " px²");

    setChk("vChkExcludeBlack", p.excludeBlack);
    setChk("vChkExcludeWhite", p.excludeWhite);
  }

  /**
   * Desenha a imagem original no canvas display do estúdio
   */
  renderSourceBitmapDisplay() {
    const canvas = document.getElementById("vectorSourceCanvasDisplay");
    const wrapper = document.getElementById("vectorArtWrapper");
    if (!canvas || !this.sourceCanvas) return;

    const w = this.sourceCanvas.naturalWidth || this.sourceCanvas.width || 800;
    const h = this.sourceCanvas.naturalHeight || this.sourceCanvas.height || 800;
    canvas.width = w;
    canvas.height = h;

    if (wrapper) {
      wrapper.style.aspectRatio = `${w} / ${h}`;
    }

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.sourceCanvas, 0, 0, w, h);
  }

  /**
   * Executa a passagem de vetorização e atualiza o DOM com o SVG gerado
   */
  runVectorization() {
    if (!this.session) return;

    const t0 = performance.now();
    const statsBadge = document.getElementById("vectorLiveStatsBadge");
    if (statsBadge) {
      statsBadge.innerHTML = `<span class="v-stat-item pulse">⏳ Vetorizando curvas Bézier com algoritmo sub-pixel...</span>`;
    }

    setTimeout(() => {
      try {
        const result = this.session.run();
        const elapsed = Math.round(performance.now() - t0);

        this.activeSvg = result.svg;
        this.activeStats = result.stats;
        this.activePalette = result.palette || [];

        // Monta o SVG no container
        const mount = document.getElementById("vectorSvgMount");
        if (mount) {
          mount.innerHTML = result.svg;
          const svgEl = mount.querySelector("svg");
          if (svgEl) {
            svgEl.style.width = "100%";
            svgEl.style.height = "100%";
            svgEl.style.display = "block";
          }
        }

        // Atualiza Stats no cabeçalho
        if (statsBadge) {
          const kb = (result.stats.bytes ? (result.stats.bytes / 1024).toFixed(1) : ((result.svg.length) / 1024).toFixed(1));
          statsBadge.innerHTML = `
            <span class="v-stat-item">✨ <strong>${result.stats.paths}</strong> caminhos</span>
            <span class="v-stat-item">📐 <strong>${result.stats.nodes || result.stats.points || 0}</strong> nós Bézier</span>
            <span class="v-stat-item">🎨 <strong>${result.stats.colors}</strong> cores</span>
            <span class="v-stat-item">💾 <strong>${kb} KB</strong></span>
            <span class="v-stat-item font-mono" style="color: var(--accent-cyan);">⚡ ${elapsed} ms</span>
          `;
        }

        // Renderiza swatches interativos de cor
        this.renderPaletteSwatches();

        // Atualiza estados de desfazer/refazer
        this.updateUndoRedoButtons();

        // Garante aplicação do modo de visualização e split
        this.applyViewMode();
      } catch (err) {
        console.error("Falha na vetorização:", err);
        if (statsBadge) {
          statsBadge.innerHTML = `<span class="v-stat-item" style="color: #ff4466;">❌ Erro ao vetorizar imagem</span>`;
        }
      }
    }, 20);
  }

  /**
   * Renderiza a grade de swatches interativos de cor
   */
  renderPaletteSwatches() {
    const container = document.getElementById("vSwatchesGridContainer");
    const badge = document.getElementById("vPaletteCountBadge");
    if (!container) return;

    if (badge) {
      badge.textContent = `${this.activePalette.length} Cores Ativas`;
    }

    if (!this.activePalette || this.activePalette.length === 0) {
      container.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); padding: 8px;">Nenhuma cor gerada</div>`;
      return;
    }

    // Calcula área total
    const totalCount = this.activePalette.reduce((acc, c) => acc + (c.count || 0), 0) || 1;

    container.innerHTML = this.activePalette.map((item, idx) => {
      const hex = item.hex || window.VectorEngine.rgbToHex(item.r, item.g, item.b);
      const pct = Math.round(((item.count || 0) / totalCount) * 100);
      return `
        <div class="v-swatch-item" data-index="${idx}">
          <div class="v-swatch-color" style="background-color: ${hex};" title="Clique para editar este tom">
            <input type="color" value="${hex}" class="v-swatch-color-picker" onchange="window.vectorStudioService.editColor(${idx}, this.value)">
          </div>
          <div class="v-swatch-info">
            <strong class="font-mono">${hex.toUpperCase()}</strong>
            <small>${pct}% da estampa</small>
          </div>
          <div class="v-swatch-actions">
            <button type="button" class="v-swatch-btn" onclick="window.vectorStudioService.removeColor(${idx})" title="Tornar esta cor transparente (Knockout)">
              🚫
            </button>
            <button type="button" class="v-swatch-btn" onclick="window.vectorStudioService.mergeWithClosest(${idx})" title="Mesclar com tom mais próximo">
              🔗
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  /**
   * Altera cor de um índice da paleta
   */
  editColor(idx, newHex) {
    if (!this.session) return;
    this.session.addEdit({ t: "color", idx, hex: newHex });
    this.runVectorization();
  }

  /**
   * Torna transparente um índice da paleta
   */
  removeColor(idx) {
    if (!this.session) return;
    this.session.addEdit({ t: "remove", idx });
    this.runVectorization();
  }

  /**
   * Mescla cor com o tom mais próximo existente na paleta
   */
  mergeWithClosest(idx) {
    if (!this.session || this.activePalette.length <= 1) return;
    const target = this.activePalette[idx];
    if (!target) return;

    let closestIdx = -1;
    let minDist = Infinity;

    this.activePalette.forEach((c, i) => {
      if (i === idx) return;
      const dr = c.r - target.r;
      const dg = c.g - target.g;
      const db = c.b - target.b;
      const d = dr * dr + dg * dg + db * db;
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    });

    if (closestIdx >= 0) {
      this.session.addEdit({ t: "merge", from: idx, to: closestIdx });
      this.runVectorization();
    }
  }

  undo() {
    if (this.session && this.session.undo()) {
      this.runVectorization();
    }
  }

  redo() {
    if (this.session && this.session.redo()) {
      this.runVectorization();
    }
  }

  updateUndoRedoButtons() {
    const btnUndo = document.getElementById("vBtnUndo");
    const btnRedo = document.getElementById("vBtnRedo");
    if (btnUndo && this.session) {
      btnUndo.disabled = !this.session.canUndo();
    }
    if (btnRedo && this.session) {
      btnRedo.disabled = !this.session.canRedo();
    }
  }

  // =========================================================================
  // HANDLERS DE ALTERAÇÃO DE PARÂMETROS
  // =========================================================================
  onColorSliderChange(val) {
    const n = parseInt(val, 10);
    const display = document.getElementById("vColorsDisplay");
    if (display) display.textContent = n;

    if (this.session) {
      this.session.setParams({ colors: n, autoColors: false });
      const chk = document.getElementById("vChkAutoColors");
      if (chk) chk.checked = false;
      this.runVectorization();
    }
  }

  onAutoColorsChange(checked) {
    if (this.session) {
      this.session.setParams({ autoColors: checked });
      this.runVectorization();
    }
  }

  onParamChange(paramName, val, displayId = null, suffix = "", multiplier = 1) {
    if (displayId) {
      const display = document.getElementById(displayId);
      if (display) {
        display.textContent = typeof val === "number" ? Math.round(val * multiplier) + suffix : String(val);
      }
    }

    if (this.session) {
      const patch = {};
      patch[paramName] = val;
      this.session.setParams(patch);
      this.runVectorization();
    }
  }

  reprocessCurrentSession() {
    if (this.session) {
      this.session.reset();
      this.runVectorization();
    }
  }

  // =========================================================================
  // MODOS DE VISUALIZAÇÃO E SPLIT WIPE
  // =========================================================================
  setViewMode(mode) {
    this.viewMode = mode;
    if (this.modalEl) {
      this.modalEl.querySelectorAll(".v-mode-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-mode") === mode);
      });
    }
    this.applyViewMode();
  }

  setSplitPercent(pct) {
    this.splitPercent = Math.max(0, Math.min(100, pct));
    this.applyViewMode();
  }

  setQuickOriginalPeek(isPeek) {
    const originalLayer = document.getElementById("vectorLayerOriginal");
    const svgLayer = document.getElementById("vectorLayerSvg");
    const divider = document.getElementById("vectorSplitDivider");

    if (isPeek) {
      if (originalLayer) originalLayer.style.clipPath = "none";
      if (svgLayer) svgLayer.style.opacity = "0";
      if (divider) divider.style.display = "none";
    } else {
      if (svgLayer) svgLayer.style.opacity = "1";
      this.applyViewMode();
    }
  }

  applyViewMode() {
    const originalLayer = document.getElementById("vectorLayerOriginal");
    const svgLayer = document.getElementById("vectorLayerSvg");
    const divider = document.getElementById("vectorSplitDivider");
    if (!originalLayer || !svgLayer) return;

    if (this.viewMode === "split") {
      const p = this.splitPercent;
      // Esquerda: Original / Direita: Vetor
      originalLayer.style.clipPath = `polygon(0 0, ${p}% 0, ${p}% 100%, 0 100%)`;
      originalLayer.style.opacity = "1";
      svgLayer.style.clipPath = `polygon(${p}% 0, 100% 0, 100% 100%, ${p}% 100%)`;
      svgLayer.style.opacity = "1";
      if (divider) {
        divider.style.display = "block";
        divider.style.left = `${p}%`;
      }
    } else if (this.viewMode === "vector") {
      originalLayer.style.opacity = "0";
      svgLayer.style.clipPath = "none";
      svgLayer.style.opacity = "1";
      if (divider) divider.style.display = "none";
    } else if (this.viewMode === "original") {
      originalLayer.style.clipPath = "none";
      originalLayer.style.opacity = "1";
      svgLayer.style.opacity = "0";
      if (divider) divider.style.display = "none";
    }
  }

  // =========================================================================
  // ZOOM & PAN
  // =========================================================================
  adjustZoom(delta) {
    this.zoom = Math.max(0.2, Math.min(8.0, Math.round((this.zoom + delta) * 100) / 100));
    this.updateViewportTransform();
  }

  resetZoom() {
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.updateViewportTransform();
  }

  fitZoom() {
    const stage = document.getElementById("vectorCanvasStage");
    const wrapper = document.getElementById("vectorArtWrapper");
    if (!stage || !wrapper) return;

    const sW = stage.clientWidth - 40;
    const sH = stage.clientHeight - 40;
    const aW = this.sourceCanvas.width || 800;
    const aH = this.sourceCanvas.height || 800;

    const scale = Math.min(sW / aW, sH / aH, 1.0);
    this.zoom = Math.max(0.2, Math.round(scale * 100) / 100);
    this.panX = 0;
    this.panY = 0;
    this.updateViewportTransform();
  }

  updateViewportTransform() {
    const wrapper = document.getElementById("vectorArtWrapper");
    const display = document.getElementById("vectorZoomDisplay");

    if (display) {
      display.textContent = `${Math.round(this.zoom * 100)}%`;
    }

    if (wrapper) {
      wrapper.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }
  }

  // =========================================================================
  // AÇÕES DE EXPORTAÇÃO E INTEGRAÇÃO COM COCKPIT
  // =========================================================================
  /**
   * Baixa o arquivo SVG direto com curvas Bézier puras
   */
  downloadSvg() {
    if (!this.activeSvg) return;

    const blob = new Blob([this.activeSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const name = (DTFState.imageEngine.activeArtworkName || "Arte").replace(/\.[^/.]+$/, "");
    link.download = `${name}_Vetor_Curvas.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);

    if (window.imageEngineService) {
      window.imageEngineService.showFeedbackToast("📥 SVG Vetorial puro baixado com sucesso!");
    }
  }

  /**
   * Rasteriza o vetor em altíssima definição (ex: 600 DPI) e substitui no Cockpit Módulo 1
   */
  async applyToCockpit() {
    if (!this.activeSvg) return;

    try {
      const statsBadge = document.getElementById("vectorLiveStatsBadge");
      if (statsBadge) {
        statsBadge.innerHTML = `<span class="v-stat-item pulse" style="color: var(--accent-cyan);">🚀 Renderizando vetor em Ultra-DPI para estamparia...</span>`;
      }

      const dpi = DTFState.imageEngine.targetDPI || 600;
      const targetW = Math.max(3600, Math.round((DTFState.imageEngine.customWidthCm / 2.54) * dpi));
      const targetH = Math.max(3600, Math.round((DTFState.imageEngine.customHeightCm / 2.54) * dpi));

      // Rasteriza SVG em Ultra-Alta Resolução diretamente das curvas Bézier
      const renderedCanvas = await window.ImageOps.rasterizeSvg(this.activeSvg, targetW, targetH);
      const dataUrl = renderedCanvas.toDataURL("image/png");

      if (window.imageEngineService) {
        window.imageEngineService.saveToHistory();
        window.imageEngineService.replaceActiveArtwork(dataUrl, "Arte_Vetorizada_AltaDef.png");
        window.imageEngineService.showFeedbackToast(`✅ Arte Vetorizada com Sucesso! ${this.activeStats.paths} curvas Bézier em ${targetW}×${targetH} px.`);
      }

      this.close();
    } catch (err) {
      console.error("Erro ao aplicar vetor:", err);
      if (window.imageEngineService) {
        window.imageEngineService.showFeedbackToast("Erro ao rasterizar SVG para o cockpit.");
      }
    }
  }

  /**
   * Salva como uma nova versão na galeria de uploads do usuário (sem sobrescrever a original)
   */
  async saveAsNewArtwork() {
    if (!this.activeSvg) return;

    try {
      const dpi = DTFState.imageEngine.targetDPI || 600;
      const targetW = Math.max(3600, Math.round((DTFState.imageEngine.customWidthCm / 2.54) * dpi));
      const targetH = Math.max(3600, Math.round((DTFState.imageEngine.customHeightCm / 2.54) * dpi));
      const renderedCanvas = await window.ImageOps.rasterizeSvg(this.activeSvg, targetW, targetH);
      const dataUrl = renderedCanvas.toDataURL("image/png");

      const newId = "art_vector_" + Date.now();
      const newName = `Vetor_${(DTFState.imageEngine.activeArtworkName || "Arte").replace(/\.[^/.]+$/, "")}.png`;

      const newEntry = {
        id: newId,
        name: newName,
        dataUrl: dataUrl,
        widthPx: renderedCanvas.width,
        heightPx: renderedCanvas.height,
        sizeFormatted: "Vetor SVG",
        loadedAt: "Vetorizado Agora"
      };

      DTFState.imageEngine.uploadedImages.unshift(newEntry);
      DTFState.imageEngine.activeArtworkId = newId;
      DTFState.imageEngine.activeArtworkName = newName;

      if (window.imageEngineService) {
        window.imageEngineService.sourceImage.src = dataUrl;
        window.imageEngineService.renderUploadedGalleryUI();
        window.imageEngineService.showFeedbackToast(`✨ Nova versão vetorizada salva na galeria: ${newName}`);
      }

      this.close();
    } catch (err) {
      console.error("Erro ao salvar nova imagem:", err);
    }
  }
}

window.VectorStudioService = VectorStudioService;
window.vectorStudioService = new VectorStudioService();
