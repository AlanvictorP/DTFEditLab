/**
 * LATITUDE DTF COCKPIT - MÓDULO 5: MARKETING, IA E REDES SOCIAIS
 * Engine de Vídeo IA em 60 FPS com 5 Tendências Virais Chamativas (Kling/Runway),
 * Copywriter IA de conversão em 3 estilos e Agendador de postagens.
 */

class MarketingService {
  constructor() {
    this.activeTrend = "streetwear";
    this.isPlaying = false;
    this.animFrameId = null;
    this.startTime = null;
    this.durationSec = 5.0; // Ciclo de 5 segundos de vídeo em loop

    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d");
    this.baseCached = false;

    // Metadados das tendências virais
    this.trendsData = {
      streetwear: {
        title: "Streetwear Drop",
        tag: "Em Alta no TikTok",
        desc: "Glitch, Neon & Zoom Trap 130 BPM",
        badgeClass: "badge-purple"
      },
      lifestyle: {
        title: "Modelo Urbano",
        tag: "Lookbook Viral",
        desc: "Passarela, Movimento & Iluminação",
        badgeClass: "badge-cyan"
      },
      macro: {
        title: "Macro Zoom 4K",
        tag: "Toque Zero DTF",
        desc: "Textura do Algodão em Super Close-up",
        badgeClass: "badge-green"
      },
      spin360: {
        title: "Vitrine 360°",
        tag: "E-Commerce 3D",
        desc: "Spin Tridimensional Studio",
        badgeClass: "badge-cyan"
      },
      heatpress: {
        title: "Prensa Térmica",
        tag: "Antes & Depois",
        desc: "Vapor, Calor e Revelação Peel",
        badgeClass: "badge-amber"
      }
    };
  }

  // CONFIGURAÇÃO DO FORMATO (1:1 FEED OU 9:16 STORIES/REELS)
  setFormat(formatStr) {
    DTFState.marketing.selectedFormat = formatStr;
    const frame = document.getElementById("mockupFrameContainer");
    const btn11 = document.getElementById("btnFormat11");
    const btn916 = document.getElementById("btnFormat916");

    if (frame) {
      if (formatStr === "9:16") {
        frame.classList.add("stories-mode");
      } else {
        frame.classList.remove("stories-mode");
      }
    }

    if (btn11 && btn916) {
      btn11.classList.toggle("active", formatStr === "1:1");
      btn916.classList.toggle("active", formatStr === "9:16");
    }

    this.baseCached = false;
    if (this.isPlaying) {
      this.cacheBaseFrame().then(() => {});
    } else {
      this.renderMockupCanvas();
    }
  }

  // SELEÇÃO DE TENDÊNCIA DE VÍDEO
  setTrend(trendKey) {
    if (!this.trendsData[trendKey]) return;
    this.activeTrend = trendKey;

    // Atualiza botões visuais
    document.querySelectorAll(".trend-card-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-trend") === trendKey);
    });

    const info = this.trendsData[trendKey];
    const tagEl = document.getElementById("badgeTrendTag");
    const hudName = document.getElementById("hudActiveModelName");

    if (tagEl) {
      tagEl.textContent = info.tag;
      tagEl.className = `badge ${info.badgeClass}`;
    }
    if (hudName) {
      hudName.textContent = `TENDÊNCIA: ${info.title.toUpperCase()}`;
    }

    // Se não estiver rodando vídeo, re-renderiza preview estático
    if (!this.isPlaying) {
      this.renderMockupCanvas();
    }
  }

  // CACHE DO FRAME BASE FOTORREALISTA PARA ANIMAÇÃO A 60 FPS
  async cacheBaseFrame() {
    const isStories = DTFState.marketing.selectedFormat === "9:16";
    const w = isStories ? 360 : 440;
    const h = isStories ? 640 : 440;

    this.offscreenCanvas.width = w;
    this.offscreenCanvas.height = h;

    const artCanvas = window.imageEngineService ? window.imageEngineService.canvas : null;

    if (window.mockupRenderEngine && artCanvas) {
      // Usa modelo se lifestyle ou se stories, caso contrário hanger
      const view = (this.activeTrend === "lifestyle" || isStories) ? "model" : "hanger";
      await window.mockupRenderEngine.renderMockup(this.offscreenCanvas, artCanvas, {
        viewType: view,
        shirtColor: "Preta",
        placement: "center",
        displacementStrength: 6.5,
        shadingIntensity: 0.85,
        offsetY: 0,
        scalePercent: 100
      });
      this.baseCached = true;
    }
  }

  // RENDERIZAÇÃO ESTÁTICA
  async renderMockupCanvas() {
    const canvas = document.getElementById("mockupCanvas");
    if (!canvas) return;

    await this.cacheBaseFrame();

    canvas.width = this.offscreenCanvas.width;
    canvas.height = this.offscreenCanvas.height;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.offscreenCanvas, 0, 0);

    // Indicador estático
    ctx.fillStyle = "rgba(0, 240, 255, 0.85)";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    const isStories = DTFState.marketing.selectedFormat === "9:16";
    ctx.fillText(isStories ? "Stories (9:16) • Pronto para Vídeo IA" : "Feed (1:1) • Pronto para Vídeo IA", 14, 24);
  }

  // CONTROLE PLAY / PAUSE DO VÍDEO IA
  async toggleAiVideo() {
    if (this.isPlaying) {
      this.stopAiVideo();
    } else {
      await this.startAiVideo();
    }
  }

  async startAiVideo() {
    const btn = document.getElementById("btnToggleAiVideo");
    const statusPill = document.getElementById("aiVideoStatusBadge");
    const hud = document.getElementById("videoTimelineHud");

    if (btn) btn.innerHTML = "⏹ Pausar Vídeo IA";
    if (statusPill) {
      statusPill.textContent = "Reproduzindo Animação 60 FPS";
      statusPill.className = "badge badge-purple";
    }
    if (hud) hud.style.display = "block";

    // Garante que o frame base foi cacheado
    if (!this.baseCached) {
      await this.cacheBaseFrame();
    }

    this.isPlaying = true;
    this.startTime = null;

    const animateLoop = (timestamp) => {
      if (!this.isPlaying) return;
      if (!this.startTime) this.startTime = timestamp;

      const elapsedSec = (timestamp - this.startTime) / 1000.0;
      const progress = (elapsedSec % this.durationSec) / this.durationSec;

      this.renderTrendFrame(progress, elapsedSec);
      this.updateTimelineUI(progress, elapsedSec);

      this.animFrameId = requestAnimationFrame(animateLoop);
    };

    this.animFrameId = requestAnimationFrame(animateLoop);
  }

  stopAiVideo() {
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    const btn = document.getElementById("btnToggleAiVideo");
    const statusPill = document.getElementById("aiVideoStatusBadge");
    const hud = document.getElementById("videoTimelineHud");

    if (btn) btn.innerHTML = "▶ Iniciar Vídeo IA (Kling / Runway)";
    if (statusPill) {
      statusPill.textContent = "Mockup Estático";
      statusPill.className = "badge badge-cyan";
    }
    if (hud) hud.style.display = "none";

    this.renderMockupCanvas();
  }

  // RENDERIZAÇÃO GRÁFICA DE CADA TENDÊNCIA A 60 FPS
  renderTrendFrame(progress, elapsed) {
    const canvas = document.getElementById("mockupCanvas");
    if (!canvas || !this.offscreenCanvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.save();

    // 1. ANIMAÇÕES ESPECÍFICAS DE CADA TENDÊNCIA
    if (this.activeTrend === "streetwear") {
      // Zoom rítmico no beat da batida trap (130 BPM)
      const beat = Math.sin(progress * Math.PI * 8);
      const zoom = 1.0 + Math.max(0, beat) * 0.05 + Math.sin(progress * Math.PI * 2) * 0.02;

      ctx.translate(w / 2, h / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-w / 2, -h / 2);

      // Desenha base
      ctx.drawImage(this.offscreenCanvas, 0, 0);

      // Glitch Chromatic Aberration periódico
      if (Math.sin(elapsed * 12) > 0.85) {
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = "rgba(0, 240, 255, 0.12)";
        ctx.drawImage(this.offscreenCanvas, -4, 0);
        ctx.fillStyle = "rgba(255, 0, 85, 0.12)";
        ctx.drawImage(this.offscreenCanvas, 4, 0);
        ctx.globalCompositeOperation = "source-over";
      }

      // Scanline laser ciano em movimento
      const scanY = (progress * h * 1.5) % h;
      ctx.fillStyle = "rgba(0, 240, 255, 0.15)";
      ctx.fillRect(0, scanY, w, 2);

    } else if (this.activeTrend === "lifestyle") {
      // Câmera fluida cinematográfica acompanhando o movimento do modelo
      const panX = Math.sin(progress * Math.PI * 2) * 9;
      const panY = Math.cos(progress * Math.PI * 2) * 4;
      const breathe = 1.0 + Math.sin(progress * Math.PI * 2) * 0.02;

      ctx.translate(w / 2 + panX, h / 2 + panY);
      ctx.scale(breathe, breathe);
      ctx.translate(-w / 2, -h / 2);

      ctx.drawImage(this.offscreenCanvas, 0, 0);

      // Feixe de luz de estúdio deslizando suavemente
      const lightX = ((progress * 1.6) - 0.3) * w;
      const lightGrad = ctx.createLinearGradient(lightX - 80, 0, lightX + 80, h);
      lightGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      lightGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.07)");
      lightGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = lightGrad;
      ctx.fillRect(0, 0, w, h);

    } else if (this.activeTrend === "macro") {
      // Push-in cinematográfico contínuo até os detalhes da estampa e trama
      const zoom = 1.0 + Math.sin(progress * Math.PI) * 0.75;
      const focusY = h * 0.42;

      ctx.translate(w / 2, focusY);
      ctx.scale(zoom, zoom);
      ctx.translate(-w / 2, -focusY);

      ctx.drawImage(this.offscreenCanvas, 0, 0);

      // Retículo de foco de câmera cinematográfica
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
      ctx.lineWidth = 1;
      const cx = w / 2;
      const cy = h * 0.42;
      ctx.strokeRect(cx - 50, cy - 50, 100, 100);
      ctx.fillStyle = "rgba(0, 240, 255, 0.8)";
      ctx.font = "8px 'JetBrains Mono', monospace";
      ctx.fillText("4K MACRO • 50MM F/1.4", cx - 45, cy - 55);

    } else if (this.activeTrend === "spin360") {
      // Giro dimensional da camiseta
      const angle = progress * Math.PI * 2;
      const spinScale = Math.cos(angle);

      ctx.translate(w / 2, h / 2);
      ctx.scale(Math.abs(spinScale) > 0.08 ? spinScale : 0.08, 1.0);
      ctx.translate(-w / 2, -h / 2);

      ctx.drawImage(this.offscreenCanvas, 0, 0);

    } else if (this.activeTrend === "heatpress") {
      // Efeito antes / depois de prensagem térmica
      ctx.drawImage(this.offscreenCanvas, 0, 0);

      if (progress < 0.45) {
        // Fase 1: Calor térmico na chapa
        const heatPulse = 0.25 + Math.sin(progress * 20) * 0.15;
        ctx.fillStyle = `rgba(245, 158, 11, ${heatPulse})`;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText("⚡ PRENSAGEM TÉRMICA: 160°C (15s)", w / 2, 60);
      } else if (progress < 0.55) {
        // Fase 2: Flash branco de revelação do Hot Peel
        const flashAlpha = 1.0 - (progress - 0.45) * 10;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, flashAlpha)})`;
        ctx.fillRect(0, 0, w, h);
      } else {
        // Fase 3: Estampa com nitidez e partículas de acabamento
        ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
        ctx.font = "bold 10.5px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText("✨ FILME DTF PUXADO: TOQUE ZERO", w / 2, 60);
      }
    }

    ctx.restore();

    // 2. OVERLAYS GLOBAIS DE VÍDEO (HUD, SOUNDWAVE E METADADOS)
    this.renderVideoHUDOverlay(ctx, w, h, progress, elapsed);
  }

  // OVERLAY COM VISUAL DE VÍDEO PROFISSIONAL
  renderVideoHUDOverlay(ctx, w, h, progress, elapsed) {
    // Soundwave dinâmico simulando batida de áudio
    ctx.fillStyle = "rgba(0, 240, 255, 0.75)";
    const waveCount = 14;
    const startX = 14;
    const startY = h - 18;

    for (let i = 0; i < waveCount; i++) {
      const barH = Math.sin(elapsed * 8 + i * 0.8) * 8 + 10;
      ctx.fillRect(startX + i * 4, startY - barH, 2.5, barH);
    }

    // Marca d'água de IA
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText("KLING GEN-3 • RUNWAY MOTION", w - 12, h - 14);
  }

  // ATUALIZAÇÃO DA TIMELINE E TEXTOS NO HUD
  updateTimelineUI(progress, elapsed) {
    const bar = document.getElementById("videoProgressBarFill");
    const timecode = document.getElementById("hudTimecodeDisplay");

    if (bar) {
      bar.style.width = `${(progress * 100).toFixed(1)}%`;
    }
    if (timecode) {
      const currentSec = (elapsed % this.durationSec);
      const s = Math.floor(currentSec);
      const ms = Math.floor((currentSec - s) * 100);
      timecode.textContent = `00:0${s}.${ms.toString().padStart(2, '0')} / 00:05.00`;
    }
  }

  // DOWNLOAD DO FRAME ATUAL EM HD
  downloadHDMarketingAsset() {
    const canvas = document.getElementById("mockupCanvas");
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `Marketing_${this.activeTrend}_DTF_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // COPYWRITER IA (3 ESTILOS DE COPY)
  renderCopywriterUI() {
    const container = document.getElementById("copywriterOptionsContainer");
    if (!container) return;

    container.innerHTML = DTFState.marketing.copies
      .map(
        (c, idx) => `
      <div class="copy-card ${idx === DTFState.marketing.selectedCopyIndex ? 'selected' : ''}" onclick="window.marketingService.selectCopy(${idx})">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="color: var(--text-primary); font-size: 13px;">${c.style}</strong>
          <span class="badge ${idx === 0 ? 'badge-amber' : (idx === 1 ? 'badge-cyan' : 'badge-purple')}">${c.badge}</span>
        </div>
        <p style="color: var(--text-secondary); line-height: 1.45; margin-bottom: 10px;">${c.text}</p>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.marketingService.copyToClipboard(${idx})">📋 Copiar Legenda</button>
      </div>
    `
      )
      .join("");

    const hashBox = document.getElementById("hashtagsDisplay");
    if (hashBox) {
      hashBox.textContent = DTFState.marketing.hashtags;
    }

    this.renderScheduleCalendar();
  }

  selectCopy(idx) {
    DTFState.marketing.selectedCopyIndex = idx;
    this.renderCopywriterUI();
  }

  copyToClipboard(idx) {
    const copy = DTFState.marketing.copies[idx];
    const fullText = `${copy.text}\n\n${DTFState.marketing.hashtags}`;
    navigator.clipboard.writeText(fullText).then(() => {
      alert("✅ Legenda e hashtags copiadas com sucesso para a área de transferência!");
    });
  }

  // CALENDÁRIO VISUAL DE AGENDAMENTO
  renderScheduleCalendar() {
    const calEl = document.getElementById("scheduleCalendarContainer");
    if (!calEl) return;

    calEl.innerHTML = DTFState.marketing.scheduleCalendar
      .map(
        (slot) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-card); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 12px; margin-bottom: 6px;">
        <div>
          <strong style="color: var(--text-primary);">${slot.day} às ${slot.time}</strong>
          <div style="color: var(--text-muted); font-size: 10.5px;">${slot.platform} (${slot.format})</div>
        </div>
        <span class="badge ${slot.status === 'Agendado' ? 'badge-green' : (slot.status === 'Pendente IA' ? 'badge-amber' : 'badge-purple')}">${slot.status}</span>
      </div>
    `
      )
      .join("");
  }
}

window.MarketingService = MarketingService;
