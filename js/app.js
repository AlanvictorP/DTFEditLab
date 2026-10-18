/**
 * LATITUDE DTF COCKPIT - APLICAÇÃO PRINCIPAL (APP.JS)
 * Inicialização dos serviços, roteamento de abas, bindings de eventos e controles.
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Instanciação dos Serviços Especializados
  window.imageEngineService = new ImageEngineService();
  window.gangSheetService = new GangSheetService();
  window.costCalculatorService = new CostCalculatorService();
  window.productionService = new ProductionService();
  window.marketingService = new MarketingService();
  window.aiCopilotService = new AICopilotService();

  // 2. Vinculação dos Canvases aos Serviços
  const artCanvas = document.getElementById("artEngineCanvas");
  if (artCanvas) {
    window.imageEngineService.setCanvas(artCanvas);
  }

  const rollCanvas = document.getElementById("rollFilmCanvas");
  if (rollCanvas) {
    window.gangSheetService.setCanvas(rollCanvas);
  }

  const copilotPanel = document.getElementById("copilotChatPanel");
  if (copilotPanel) {
    window.aiCopilotService.init(copilotPanel);
  }

  // 3. Inicialização dos Módulos UI
  setupSidebarCollapse();
  setupCollapsibleToolBlocks();
  setupNavigationTabs();
  setupImageEngineControls();
  setupGangSheetControls();
  setupCostControls();
  setupMarketingControls();

  // Render inicial das tabelas e do Kanban
  window.costCalculatorService.renderUI();
  window.productionService.renderKanban();
  window.marketingService.renderMockupCanvas();
  window.marketingService.renderCopywriterUI();
  window.imageEngineService.renderSupplierSizeButtons();
  window.imageEngineService.updateShirtControlsUI();

  console.log("🚀 Latitude DTF Operational Cockpit iniciado com sucesso.");
});

// SIDEBAR RETRÁTIL (ícones apenas quando recolhida) - persiste em localStorage
function setupSidebarCollapse() {
  const container = document.querySelector(".app-container");
  const btn = document.getElementById("btnSidebarCollapse");
  if (!container || !btn) return;

  const apply = (collapsed, persist) => {
    container.classList.toggle("sidebar-collapsed", collapsed);
    btn.setAttribute("aria-label", collapsed ? "Expandir menu lateral" : "Recolher menu lateral");
    if (persist) {
      try { localStorage.setItem("latitude.sidebarCollapsed", collapsed ? "1" : "0"); } catch (e) { /* ignore */ }
    }
    // Após a transição, os canvases precisam reencaixar na nova largura
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
      if (window.imageEngineService && window.imageEngineService.viewport) {
        window.imageEngineService.viewport.onContainerResized();
      }
    }, 280);
  };

  let saved = false;
  try { saved = localStorage.getItem("latitude.sidebarCollapsed") === "1"; } catch (e) { /* ignore */ }
  apply(saved, false);

  btn.addEventListener("click", () => apply(!container.classList.contains("sidebar-collapsed"), true));
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      btn.click();
    }
  });
}

// NAVEGAÇÃO ENTRE MÓDULOS (SIDEBAR)
function setupNavigationTabs() {
  const navItems = document.querySelectorAll(".nav-item[data-tab]");
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const targetTab = item.getAttribute("data-tab");

      // Atualiza classe ativa na sidebar
      navItems.forEach((n) => n.classList.remove("active"));
      item.classList.add("active");

      // Alterna exibição dos módulos
      document.querySelectorAll(".module-pane").forEach((pane) => {
        pane.classList.remove("active");
      });

      const activePane = document.getElementById(targetTab);
      if (activePane) {
        activePane.classList.add("active");
      }

      // Re-renderizações pontuais ao abrir a aba
      if (targetTab === "module-gang-sheet") {
        // Mesa interativa: apenas redesenha (não reorganiza o que o usuário posicionou)
        window.gangSheetService.render();
        window.gangSheetService.refreshLayout && window.gangSheetService.refreshLayout();
      } else if (targetTab === "module-pricing") {
        window.costCalculatorService.renderUI();
      } else if (targetTab === "module-production") {
        window.productionService.renderKanban();
      } else if (targetTab === "module-marketing") {
        window.marketingService.renderMockupCanvas();
      }
    });
  });
}

// CONTROLES DO MÓDULO 1: TRATAMENTO GRÁFICO
function setupImageEngineControls() {
  // Upload de arquivo via input
  const handleUploadInput = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      window.imageEngineService.handleMultipleFiles(files);
    }
  };

  const fileInput = document.getElementById("imageFileInput");
  if (fileInput) {
    fileInput.addEventListener("change", handleUploadInput);
  }

  const fileInputMulti = document.getElementById("imageFileInputMulti");
  if (fileInputMulti) {
    fileInputMulti.addEventListener("change", handleUploadInput);
  }

  // Presets de DPI (300, 600, 720, 1200, 1440, 2400)
  document.querySelectorAll(".dpi-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dpi = btn.getAttribute("data-dpi");
      window.imageEngineService.setDPI(dpi);
    });
  });

  // Slider de DPI customizado (150 a 4800 DPI)
  const sliderDpi = document.getElementById("sliderCustomDpi");
  if (sliderDpi) {
    sliderDpi.addEventListener("input", (e) => {
      window.imageEngineService.setDPI(e.target.value);
    });
  }

  // Grade de Tamanhos
  document.querySelectorAll(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".size-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const presetKey = btn.getAttribute("data-size");
      window.imageEngineService.setSizePreset(presetKey);
      window.costCalculatorService.renderUI();
    });
  });

  // Knockout de Preto
  const knockoutToggle = document.getElementById("toggleBlackKnockout");
  const knockoutThreshold = document.getElementById("sliderKnockoutThreshold");
  const thresholdValDisplay = document.getElementById("knockoutThresholdVal");

  if (knockoutToggle) {
    knockoutToggle.addEventListener("change", (e) => {
      DTFState.imageEngine.blackKnockoutEnabled = e.target.checked;
      window.imageEngineService.render();
    });
  }

  if (knockoutThreshold) {
    knockoutThreshold.addEventListener("input", (e) => {
      DTFState.imageEngine.knockoutThreshold = parseInt(e.target.value, 10);
      if (thresholdValDisplay) thresholdValDisplay.textContent = e.target.value;
      window.imageEngineService.render();
    });
  }

  // Knockout de Branco (Camiseta Branca)
  const whiteKnockoutToggle = document.getElementById("toggleWhiteKnockout");
  if (whiteKnockoutToggle) {
    whiteKnockoutToggle.addEventListener("change", (e) => {
      DTFState.imageEngine.whiteKnockoutEnabled = e.target.checked;
      window.imageEngineService.render();
    });
  }

  // Tolerância de Remoção de Fundo
  const sliderBgTol = document.getElementById("sliderBgRemovalTolerance");
  if (sliderBgTol) {
    sliderBgTol.addEventListener("input", (e) => {
      window.imageEngineService.setBgTolerance(e.target.value);
    });
  }

  // Checkbox de Ilhas / Vazados de Fundo
  const toggleIslands = document.getElementById("toggleBgIncludeIslands");
  if (toggleIslands) {
    toggleIslands.addEventListener("change", (e) => {
      window.imageEngineService.setIncludeIslands(e.target.checked);
    });
  }

  // Halftone LPI
  const halftoneToggle = document.getElementById("toggleHalftone");
  const badgeHalftone = document.getElementById("badgeHalftoneStatus");

  if (halftoneToggle) {
    halftoneToggle.addEventListener("change", (e) => {
      DTFState.imageEngine.halftoneEnabled = e.target.checked;
      if (badgeHalftone) {
        badgeHalftone.textContent = e.target.checked ? "Ativo" : "Desativado";
        badgeHalftone.className = e.target.checked ? "badge badge-cyan" : "badge badge-purple";
      }
      window.imageEngineService.render();
    });
  }

  // Presets de LPI (25, 35, 45, 55, 65, 85)
  document.querySelectorAll(".lpi-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lpi = btn.getAttribute("data-lpi");
      window.imageEngineService.setHalftoneLPI(lpi);
    });
  });

  // Slider de LPI (10 a 100 LPI)
  const sliderLpi = document.getElementById("sliderHalftoneLPI");
  if (sliderLpi) {
    sliderLpi.addEventListener("input", (e) => {
      window.imageEngineService.setHalftoneLPI(e.target.value);
    });
  }

  // Slider de Ângulo de Halftone (0° a 90°)
  const sliderAngle = document.getElementById("sliderHalftoneAngle");
  if (sliderAngle) {
    sliderAngle.addEventListener("input", (e) => {
      window.imageEngineService.setHalftoneAngle(e.target.value);
    });
  }

  // Cor da camiseta alvo
  const shirtColorSelect = document.getElementById("selectTargetShirtColor");
  if (shirtColorSelect) {
    shirtColorSelect.addEventListener("change", (e) => {
      DTFState.imageEngine.targetShirtColor = e.target.value;
      const colorMap = { "Preta": "black", "Branca": "white", "Cinza": "gray", "Off-White": "offwhite", "Vermelha": "red" };
      if (colorMap[e.target.value] && DTFState.imageEngine.canvasBgType !== "checkerboard") {
        window.imageEngineService.setCanvasBackground(colorMap[e.target.value]);
      }
      window.imageEngineService.render();
    });
  }

  // Botão: Adicionar ao Rolo do Módulo 2
  const btnPushRoll = document.getElementById("btnPushToGangSheet");
  if (btnPushRoll) {
    btnPushRoll.addEventListener("click", () => {
      const item = window.imageEngineService.pushToGangSheet();
      if (!item) {
        alert("⚠️ Nenhuma imagem carregada no momento. Arraste ou selecione uma imagem para adicionar ao rolo.");
        return;
      }
      alert(`✅ Estampa adicionada ao Rolo de ${DTFState.gangSheet.rollWidthCm}cm com sucesso!\n\nArte: ${item.cutLabel}\nDimensões: ${item.widthCm} × ${item.heightCm} cm\nImagem renderizada fielmente no rolo de impressão.`);
    });
  }
}

// CONTROLES DO MÓDULO 2: MONTADOR DE ROLO
function setupGangSheetControls() {
  // Presets de Boca da Plotter (30, 42, 58, 60, 70, 120 cm)
  document.querySelectorAll(".plotter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = btn.getAttribute("data-width");
      window.gangSheetService.setPlotterMouthWidth(w);
    });
  });

  // Input customizado de Boca da Plotter
  const inputPlotterW = document.getElementById("inputCustomPlotterWidth");
  if (inputPlotterW) {
    inputPlotterW.addEventListener("input", (e) => {
      window.gangSheetService.setPlotterMouthWidth(e.target.value);
    });
  }

  // Auto Trim Roll Items
  const btnTrimRoll = document.getElementById("btnAutoTrimRollItems");
  if (btnTrimRoll) {
    btnTrimRoll.addEventListener("click", () => {
      window.gangSheetService.autoTrimAllItems();
    });
  }

  // Auto Nesting
  const btnNesting = document.getElementById("btnRunAutoNesting");
  if (btnNesting) {
    btnNesting.addEventListener("click", () => {
      window.gangSheetService.runAutoNesting(true);
    });
  }

  // Otimizador de Sobras (Fillers)
  const btnFillers = document.getElementById("btnToggleFillers");
  if (btnFillers) {
    btnFillers.addEventListener("click", () => {
      window.gangSheetService.toggleFillers();
      btnFillers.textContent = DTFState.gangSheet.autoFillersActive
        ? "Remover Fillers de Sobra"
        : "✨ Preencher Sobras com Fillers";
    });
  }

  // Toggle Marcas de Corte
  const toggleCutMarks = document.getElementById("toggleShowCutMarks");
  if (toggleCutMarks) {
    toggleCutMarks.addEventListener("change", (e) => {
      DTFState.gangSheet.showCutMarks = e.target.checked;
      window.gangSheetService.render();
    });
  }

  // Folga mínima entre artes (cm)
  const inputGap = document.getElementById("inputRollGapCm");
  if (inputGap) {
    inputGap.addEventListener("input", (e) => {
      window.gangSheetService.setGap(e.target.value);
    });
  }

  // Botões da Mesa Interativa: Girar, Desfazer e Zoom
  const btnRotate = document.getElementById("btnRollRotate");
  if (btnRotate) {
    btnRotate.addEventListener("click", () => window.gangSheetService.rotateSelected());
  }

  const btnUndo = document.getElementById("btnRollUndo");
  if (btnUndo) {
    btnUndo.addEventListener("click", () => window.gangSheetService.undo());
  }

  const btnZoomIn = document.getElementById("btnRollZoomIn");
  if (btnZoomIn) {
    btnZoomIn.addEventListener("click", () => {
      window.gangSheetService.setScale(window.gangSheetService.scale * 1.25);
    });
  }

  const btnZoomOut = document.getElementById("btnRollZoomOut");
  if (btnZoomOut) {
    btnZoomOut.addEventListener("click", () => {
      window.gangSheetService.setScale(window.gangSheetService.scale / 1.25);
    });
  }

  const btnZoomFit = document.getElementById("btnRollZoomFit");
  if (btnZoomFit) {
    btnZoomFit.addEventListener("click", () => {
      window.gangSheetService.fitWidth();
    });
  }
}

// CONTROLES DO MÓDULO 3: PRECIFICAÇÃO E CUSTOS
function setupCostControls() {
  const inputMeterCost = document.getElementById("inputDtfMeterCost");
  const inputBlankCost = document.getElementById("inputBlankShirtCost");
  const sliderNetMargin = document.getElementById("sliderNetMargin");
  const netMarginDisplay = document.getElementById("netMarginValDisplay");

  if (inputMeterCost) {
    inputMeterCost.addEventListener("input", (e) => {
      DTFState.settings.dtfMeterCost = parseFloat(e.target.value) || 0;
      window.costCalculatorService.renderUI();
      window.gangSheetService.runAutoNesting();
    });
  }

  if (inputBlankCost) {
    inputBlankCost.addEventListener("input", (e) => {
      DTFState.settings.blankShirtCost = parseFloat(e.target.value) || 0;
      window.costCalculatorService.renderUI();
    });
  }

  if (sliderNetMargin) {
    sliderNetMargin.addEventListener("input", (e) => {
      DTFState.settings.targetNetMarginPct = parseFloat(e.target.value);
      if (netMarginDisplay) netMarginDisplay.textContent = `${e.target.value}%`;
      window.costCalculatorService.renderUI();
    });
  }
}

// CONTROLES DO MÓDULO 5: MARKETING & IA
function setupMarketingControls() {
  const btn11 = document.getElementById("btnFormat11");
  const btn916 = document.getElementById("btnFormat916");
  const btnAiVideo = document.getElementById("btnToggleAiVideo");
  const btnDownloadMarketing = document.getElementById("btnDownloadMarketingAsset");

  if (btn11) {
    btn11.addEventListener("click", () => window.marketingService.setFormat("1:1"));
  }
  if (btn916) {
    btn916.addEventListener("click", () => window.marketingService.setFormat("9:16"));
  }
  if (btnAiVideo) {
    btnAiVideo.addEventListener("click", () => window.marketingService.toggleAiVideo());
  }
  if (btnDownloadMarketing) {
    btnDownloadMarketing.addEventListener("click", () => window.marketingService.downloadHDMarketingAsset());
  }

  // Seletores de Tendências Chamativas
  document.querySelectorAll(".trend-card-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const trend = btn.getAttribute("data-trend");
      window.marketingService.setTrend(trend);
    });
  });
}

// CONTROLE DE SESSÕES RETRÁTEIS / MINIMIZÁVEIS DO MENU DIREITO
function setupCollapsibleToolBlocks() {
  const blocks = document.querySelectorAll(".tool-block");
  let savedCollapsed = [];
  try {
    savedCollapsed = JSON.parse(localStorage.getItem("latitude.collapsedBlocks") || "[]");
  } catch (e) {
    savedCollapsed = [];
  }

  blocks.forEach((block, index) => {
    const id = block.id || `toolBlock_${index}`;
    if (!block.id) block.id = id;

    const header = block.querySelector(".tool-block-header");
    if (!header) return;

    // Garante que o chevron exista no cabeçalho
    if (!header.querySelector(".tool-block-chevron")) {
      const chevron = document.createElement("span");
      chevron.className = "tool-block-chevron";
      chevron.innerHTML = "▾";
      chevron.title = "Minimizar / Expandir Sessão";
      header.appendChild(chevron);
    }

    // Restaura o estado recolhido do localStorage
    if (savedCollapsed.includes(id)) {
      block.classList.add("collapsed");
    }

    // Toggle ao clicar no cabeçalho
    header.addEventListener("click", (e) => {
      // Ignora clique se for em botão, input, select ou label dentro do cabeçalho
      if (e.target.closest("button:not(.tool-block-chevron), input, select, label")) {
        return;
      }
      block.classList.toggle("collapsed");

      // Salva a lista de blocos recolhidos no localStorage
      const currentlyCollapsed = Array.from(document.querySelectorAll(".tool-block.collapsed")).map((b) => b.id);
      try {
        localStorage.setItem("latitude.collapsedBlocks", JSON.stringify(currentlyCollapsed));
      } catch (err) { /* ignore */ }
    });
  });

  // Função global acessível via botão "Alternar Todos"
  window.toggleAllToolBlocks = function (forceCollapse = null) {
    const activeModule = document.querySelector(".module-pane.active") || document;
    const activeBlocks = activeModule.querySelectorAll(".tool-block");
    if (!activeBlocks.length) return;

    const anyExpanded = Array.from(activeBlocks).some((b) => !b.classList.contains("collapsed"));
    const shouldCollapse = forceCollapse !== null ? forceCollapse : anyExpanded;

    activeBlocks.forEach((b) => b.classList.toggle("collapsed", shouldCollapse));

    const currentlyCollapsed = Array.from(document.querySelectorAll(".tool-block.collapsed")).map((b) => b.id);
    try {
      localStorage.setItem("latitude.collapsedBlocks", JSON.stringify(currentlyCollapsed));
    } catch (err) { /* ignore */ }
  };
}
