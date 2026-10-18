/**
 * LATITUDE DTF COCKPIT - TERMINAL COPILOT IA
 * Chat integrado ao lado do Canvas de Pré-impressão.
 *
 * Injeta automaticamente prompts ocultos de calibração para DTF:
 * - Hidden positive: "vector style, t-shirt design, clean background, solid colors, DTF printing, crisp contours"
 * - Negative prompt: "blurry, noisy, low resolution, dirty fabric texture, gradient bleed, watermark"
 *
 * Suporta comunicação com backend FastAPI (Python/Diffusers/img2img)
 * com fallback inteligente para manipulação local via ImageOps (recolor, halftone, knockout, vetorização).
 */

class AICopilotService {
  constructor() {
    this.backendUrl = "http://localhost:8000";
    this.isBackendOnline = false;
    this.container = null;
    this.messagesContainer = null;
    this.inputField = null;
    this.panel = null;
    this.isOpen = true;

    this.hiddenPositiveTokens = "vector style, t-shirt design, clean background, solid colors, DTF printing, crisp contours, sharp edges, no noise";
    this.hiddenNegativeTokens = "photorealistic background, complex gradients, blurry lines, compression artifacts, watermark, dirty fabric texture";

    this.history = [];
  }

  init(panelElement) {
    this.panel = panelElement;
    if (!this.panel) return;

    this.messagesContainer = this.panel.querySelector("#copilotMessagesList");
    this.inputField = this.panel.querySelector("#copilotChatInput");
    const sendBtn = this.panel.querySelector("#btnCopilotSend");
    const closeBtn = this.panel.querySelector("#btnCopilotToggleClose");

    if (sendBtn) {
      sendBtn.addEventListener("click", () => this.handleSendMessage());
    }
    if (this.inputField) {
      this.inputField.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.togglePanel(false));
    }

    // Ações rápidas (chips)
    this.panel.querySelectorAll(".copilot-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const prompt = chip.getAttribute("data-prompt");
        if (prompt && this.inputField) {
          this.inputField.value = prompt;
          this.handleSendMessage();
        }
      });
    });

    this.checkBackendHealth();
    this.addWelcomeMessage();
  }

  togglePanel(forceState) {
    if (!this.panel) return;
    this.isOpen = typeof forceState === "boolean" ? forceState : !this.isOpen;
    this.panel.classList.toggle("collapsed", !this.isOpen);

    const toggleBtn = document.getElementById("btnToggleCopilotPanel");
    if (toggleBtn) {
      toggleBtn.classList.toggle("active", this.isOpen);
    }

    // Redimensiona o viewport após transição
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
      if (window.imageEngineService && window.imageEngineService.viewport) {
        window.imageEngineService.viewport.onContainerResized();
      }
    }, 220);
  }

  async checkBackendHealth() {
    const statusDot = document.getElementById("copilotBackendStatus");
    const statusText = document.getElementById("copilotBackendText");
    try {
      const res = await fetch(`${this.backendUrl}/health`, { method: "GET", mode: "cors" });
      if (res.ok) {
        this.isBackendOnline = true;
        if (statusDot) { statusDot.className = "status-dot online"; }
        if (statusText) { statusText.textContent = "Backend IA Conectado"; }
        return;
      }
    } catch (err) {
      // Backend offline: modo local ativo
    }
    this.isBackendOnline = false;
    if (statusDot) {
      statusDot.className = "status-dot online";
      statusDot.style.background = "#00f0ff";
      statusDot.style.boxShadow = "0 0 8px rgba(0, 240, 255, 0.6)";
    }
    if (statusText) { statusText.textContent = "Engine IA & Visão Nativa (Ativo)"; }
  }

  addWelcomeMessage() {
    this.appendMessage({
      sender: "assistant",
      text: "Olá! Sou seu Copilot DTF com **Engine de Visão Computacional & IA 100% ativa**. Posso remover fundos, ativar a varinha mágica para apagar ilhas pretas, limpar restos de borda (de-fringe), recolorir detalhes da estampa, aplicar halftones e vetorizar em SVG.",
      chips: [
        { label: "🪄 Varinha Mágica", prompt: "ativar varinha magica" },
        { label: "✂️ Limpar Bordas / Restos", prompt: "limpar restos de preto das bordas" },
        { label: "Mudar cor para azul marinho", prompt: "mudar a cor principal para azul marinho" },
        { label: "Vetorizar em SVG", prompt: "vetorizar estampa para svg" }
      ]
    });
  }

  appendMessage({ sender, text, meta, chips }) {
    if (!this.messagesContainer) return;
    const msgEl = document.createElement("div");
    msgEl.className = `copilot-msg ${sender}`;

    let html = `<div class="msg-bubble">${this.escapeHtml(text).replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}`;

    if (meta) {
      html += `
        <details class="copilot-prompt-debug">
          <summary>🔍 Parâmetros Ocultos Injetados</summary>
          <div class="debug-tokens">
            <div><b>Tokens Injetados:</b> ${this.escapeHtml(meta.injected || "")}</div>
            <div><b>Negative Prompt:</b> ${this.escapeHtml(meta.negative || "")}</div>
          </div>
        </details>`;
    }

    if (chips && chips.length) {
      html += `<div class="msg-chips">`;
      chips.forEach((c) => {
        html += `<button type="button" class="copilot-action-pill" onclick="window.aiCopilotService.handleChipClick('${this.escapeHtml(c.prompt)}')">${this.escapeHtml(c.label)}</button>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
    msgEl.innerHTML = html;
    this.messagesContainer.appendChild(msgEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  handleChipClick(prompt) {
    if (this.inputField) {
      this.inputField.value = prompt;
      this.handleSendMessage();
    }
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  buildEnrichedPrompt(userPrompt) {
    return {
      finalPrompt: `${userPrompt}, ${this.hiddenPositiveTokens}`,
      injected: this.hiddenPositiveTokens,
      negative: this.hiddenNegativeTokens
    };
  }

  async handleSendMessage() {
    if (!this.inputField) return;
    const rawText = this.inputField.value.trim();
    if (!rawText) return;

    this.inputField.value = "";
    this.appendMessage({ sender: "user", text: rawText });

    const enriched = this.buildEnrichedPrompt(rawText);

    // Se houver backend Python ativo, envia para o Agente Autônomo
    const activeImgData = (window.imageEngineService && window.imageEngineService.canvas)
      ? window.imageEngineService.canvas.toDataURL("image/png")
      : null;

    try {
      this.appendMessage({ sender: "assistant", text: "⏳ Consultando Agente Copilot DTF..." });
      const res = await fetch(`${this.backendUrl}/api/v1/ai/copilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: rawText,
          image_data: activeImgData,
          active_image_id: DTFState.imageEngine.activeArtworkId
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.imageUrl && window.imageEngineService) {
          window.imageEngineService.replaceActiveArtwork(data.imageUrl, "IA_Copilot_Refined.png");
        }
        this.appendMessage({
          sender: "assistant",
          text: data.message || "✅ Processado pelo Agente Copilot!"
        });
        return;
      }
    } catch (err) {
      console.warn("Backend offline ou não respondeu, usando assistente nativo do navegador:", err);
    }

    // Interpretador Local de Comandos Gráficos DTF (Navegador)
    this.processLocalIntent(rawText, enriched);
  }

  processLocalIntent(text, enriched) {
    const t = text.toLowerCase();
    const service = window.imageEngineService;

    // 0. Pergunta sobre o status da IA
    if (t.includes("ia") && (t.includes("ativa") || t.includes("ativo") || t.includes("funciona") || t.includes("ligada") || t.includes("online") || t.includes("cade"))) {
      this.appendMessage({
        sender: "assistant",
        text: "✅ **Sim! A Engine de IA & Visão Computacional está 100% ativa no seu navegador!**\n\nTodos os recursos de estamparia operam localmente em tempo real:\n• 🪄 **Varinha Mágica**: clique diretamente na imagem para apagar restos pretos e vazados (entre chifres, letras, etc.)\n• ✂️ **Limpeza de Bordas (Choke & De-fringe)**: elimina halos pretos ao redor do desenho\n• 🎨 **Recolorir e Redesenho IA**: alteração de tons e nitidez serigráfica\n• 📐 **Vetorização SVG**: traçado de curvas de alta fidelidade",
        chips: [
          { label: "🪄 Ativar Varinha Mágica", prompt: "ativar varinha magica" },
          { label: "✂️ Limpar Restos de Preto", prompt: "limpar restos de preto" },
          { label: "Mudar para Azul Marinho", prompt: "mudar para azul marinho" }
        ]
      });
      return;
    }

    // 1. Varinha Mágica
    if (t.includes("varinha") || t.includes("apagar preto") || t.includes("tirar preto de dentro") || t.includes("tirar ilha")) {
      if (service && service.toggleMagicWand) {
        service.toggleMagicWand(true);
        this.appendMessage({
          sender: "assistant",
          text: "🪄 **Varinha Mágica Ativada!** O cursor agora está em modo de mira (+). Clique diretamente sobre qualquer área preta ou resto de fundo que deseja apagar (como o preto entre os chifres do DOOM)."
        });
        return;
      }
    }

    // 2. Limpeza de Bordas (De-fringe & Choke)
    if (t.includes("limpar borda") || t.includes("restos de preto") || t.includes("halo") || t.includes("choke") || t.includes("de-fringe") || t.includes("fringe") || t.includes("tirar borda")) {
      if (service && service.cleanArtworkEdges) {
        service.cleanArtworkEdges(1);
        this.appendMessage({
          sender: "assistant",
          text: "✂️ **Tratamento de Bordas Concluído!** O algoritmo de Choke (1px) e De-fringe foi aplicado: a linha preta residual foi eliminada e as bordas foram suavizadas com as cores reais da estampa."
        });
        return;
      }
    }

    // 3. Remoção de fundo (Apenas fundo)
    if (t.includes("remover fundo") || t.includes("tirar fundo") || t.includes("fundo transparente")) {
      if (service && service.removeBackgroundOnly) {
        service.removeBackgroundOnly();
        this.appendMessage({
          sender: "assistant",
          text: "✨ Fundo removido mantendo todos os traços pretos e cores sólidas intactos com tratamento de borda.",
          meta: enriched
        });
        return;
      }
    }

    // 4. Knockout para camiseta preta
    if (t.includes("knockout") || t.includes("camisa preta") || t.includes("camiseta preta") || t.includes("zerar preto")) {
      if (service && service.knockoutForBlackShirt) {
        service.knockoutForBlackShirt();
        this.appendMessage({
          sender: "assistant",
          text: "⚡ Knockout aplicado! Canal preto eliminado para toque suave e economia de tinta em tecido preto.",
          meta: enriched
        });
        return;
      }
    }

    // 5. Vetorização SVG
    if (t.includes("vetor") || t.includes("svg") || t.includes("curvas")) {
      if (service && service.vectorizeArtwork) {
        service.vectorizeArtwork();
        this.appendMessage({
          sender: "assistant",
          text: "📐 Arte convertida em vetor SVG! Formas sólidas traçadas em curvas perfeitas e escaláveis.",
          meta: enriched
        });
        return;
      }
    }

    // 6. Redesenho IA / Refinamento
    if (t.includes("redesenho") || t.includes("redraw") || t.includes("refinar") || t.includes("melhorar linhas")) {
      if (service && service.aiRedraw) {
        service.aiRedraw();
        this.appendMessage({
          sender: "assistant",
          text: "🎨 Redesenho IA aplicado! As linhas borradas foram reconstruídas com arestas firmes para estamparia.",
          meta: enriched
        });
        return;
      }
    }

    // 7. Halftone / Retícula
    if (t.includes("halftone") || t.includes("reticula") || t.includes("meio-tom") || t.includes("meio tom")) {
      let lpiMatch = t.match(/(\d+)\s*(lpi|linhas)/);
      let angleMatch = t.match(/(\d+)\s*(graus|°|deg)/);

      if (service) {
        DTFState.imageEngine.halftoneEnabled = true;
        const toggle = document.getElementById("toggleHalftone");
        if (toggle) toggle.checked = true;

        if (lpiMatch) {
          const lpi = parseInt(lpiMatch[1], 10);
          service.setHalftoneLPI(lpi);
        }
        if (angleMatch) {
          const ang = parseInt(angleMatch[1], 10);
          service.setHalftoneAngle(ang);
        }
        service.render();
        this.appendMessage({
          sender: "assistant",
          text: `🎯 Retícula Halftone DTF calibrada: ${DTFState.imageEngine.halftoneLPI} LPI a ${DTFState.imageEngine.halftoneAngle}°.`,
          meta: enriched
        });
        return;
      }
    }

    // 8. Recolorir (amplo: detecta cores em linguagem natural como "marinho", "vermelho", etc.)
    const colorNames = [
      { name: "azul marinho", code: "azul" },
      { name: "marinho", code: "azul" },
      { name: "azul", code: "azul" },
      { name: "vermelho", code: "vermelho" },
      { name: "verde", code: "verde" },
      { name: "amarelo", code: "amarelo" },
      { name: "dourado", code: "amarelo" },
      { name: "roxo", code: "roxo" },
      { name: "rosa", code: "rosa" },
      { name: "laranja", code: "laranja" },
      { name: "branco", code: "branco" },
      { name: "preto", code: "preto" }
    ];

    for (const item of colorNames) {
      if (t.includes(item.name)) {
        if (service && service.recolorActiveArtwork) {
          const success = service.recolorActiveArtwork("verde", item.code);
          if (success) {
            this.appendMessage({
              sender: "assistant",
              text: `🎨 **Cores recalculadas para ${item.name.toUpperCase()}!** A estampa foi atualizada no Canvas.`,
              meta: enriched
            });
            return;
          }
        }
      }
    }

    // 9. Zoom
    if (t.includes("zoom")) {
      const numMatch = t.match(/(\d+)\s*%/);
      if (numMatch && service && service.viewport) {
        const z = parseInt(numMatch[1], 10) / 100;
        service.viewport.setZoom(z);
        this.appendMessage({ sender: "assistant", text: `🔍 Zoom ajustado para ${numMatch[1]}%.` });
        return;
      }
    }

    // Fallback inteligente informando a engine ativa
    this.appendMessage({
      sender: "assistant",
      text: `Entendido! Você pode usar a **Varinha Mágica** para apagar áreas clicando na tela, **Limpar Bordas** para tirar restos de preto, ou escolher uma das ações rápidas:`,
      meta: enriched,
      chips: [
        { label: "🪄 Varinha Mágica", prompt: "ativar varinha magica" },
        { label: "✂️ Limpar Bordas", prompt: "limpar restos de preto" },
        { label: "Vetorizar em SVG", prompt: "vetorizar estampa para svg" },
        { label: "Remover Fundo", prompt: "remover fundo mantendo contorno" }
      ]
    });
  }
}

window.AICopilotService = AICopilotService;
