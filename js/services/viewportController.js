/**
 * LATITUDE DTF COCKPIT - VIEWPORT CONTROLLER
 * Zoom (10% - 1000%) com foco no cursor + Pan com clique direto no canvas,
 * botão do meio ou Espaço + arrastar, além de recentralização instantânea.
 */
class CanvasViewportController {
  constructor(viewportEl, canvasEl, options = {}) {
    this.viewport = viewportEl;
    this.canvas = canvasEl;
    this.minZoom = options.minZoom || 0.1;
    this.maxZoom = options.maxZoom || 10;
    this.onChange = options.onChange || (() => {});
    this.onSettle = options.onSettle || (() => {});

    this.zoom = 1;
    this.tx = 0;
    this.ty = 0;
    this.cssW = canvasEl.clientWidth || 800;
    this.cssH = canvasEl.clientHeight || 800;
    this.userMoved = false;
    this.spaceDown = false;
    this.panning = false;
    this._settleTimer = null;
    this._last = { x: 0, y: 0 };
    this._hasMoved = false;

    this.viewport.classList.add("vp-active");
    this.canvas.classList.add("vp-canvas");
    this._bind();
  }

  _bind() {
    const vp = this.viewport;

    // Zoom com a roda do mouse centralizado no ponteiro
    vp.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      this.zoomAt(e.clientX, e.clientY, this.zoom * factor);
    }, { passive: false });

    // Pan: permite clique com botão esquerdo (0) direto na área do canvas/viewport,
    // ou botão do meio (1), ou qualquer botão com Espaço pressionado
    vp.addEventListener("pointerdown", (e) => {
      // Ignora cliques em botões, controles de zoom flutuantes ou inputs
      if (e.target.closest("button, input, select, textarea, a, .canvas-zoom-floating-bar, .dropzone-overlay, .crop-floating-bar")) {
        return;
      }

      // Se o Modo de Corte estiver ativo e o clique for botão esquerdo sobre o canvas (sem Espaço)
      if (window.imageEngineService && window.imageEngineService.cropModeActive && e.button === 0 && !this.spaceDown) {
        const cropHandled = window.imageEngineService.handleCropPointerDown(e);
        if (cropHandled) {
          e.preventDefault();
          return;
        }
      }

      // Se a Simulação em Medida Real da Camiseta estiver ativa e o clique for botão esquerdo sobre o canvas (sem Espaço)
      if (window.imageEngineService && window.imageEngineService.shirtSimulationMode && e.button === 0 && !this.spaceDown) {
        const handled = window.imageEngineService.handleShirtPointerDown(e);
        if (handled) {
          e.preventDefault();
          return;
        }
      }

      // Se a Varinha Mágica estiver ativa e o clique for botão esquerdo sobre o canvas (sem Espaço)
      if (window.imageEngineService && window.imageEngineService.magicWandActive && e.button === 0 && !this.spaceDown) {
        const rect = this.canvas.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          e.preventDefault();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;
          const scaleX = this.canvas.width / rect.width;
          const scaleY = this.canvas.height / rect.height;
          const imgX = Math.round(clickX * scaleX);
          const imgY = Math.round(clickY * scaleY);
          window.imageEngineService.applyMagicWand(imgX, imgY);
          return;
        }
      }

      // Permite botão esquerdo (0) ou botão do meio (1)
      if (e.button !== 0 && e.button !== 1 && !this.spaceDown) return;

      e.preventDefault();
      this.panning = true;
      this._hasMoved = false;
      this._last = { x: e.clientX, y: e.clientY };
      try { vp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      vp.classList.add("vp-panning");
    });

    vp.addEventListener("pointermove", (e) => {
      // Notifica o modo de corte da imagem
      if (window.imageEngineService && window.imageEngineService.cropModeActive) {
        const activeCropDrag = window.imageEngineService.handleCropPointerMove(e);
        if (activeCropDrag) return;
      }

      // Notifica o motor de simulação de molde da camiseta para cursores e arraste
      if (window.imageEngineService && window.imageEngineService.shirtSimulationMode) {
        const activeDrag = window.imageEngineService.handleShirtPointerMove(e);
        if (activeDrag) return;
      }

      if (!this.panning) return;
      const dx = e.clientX - this._last.x;
      const dy = e.clientY - this._last.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        this._hasMoved = true;
      }
      this.tx += dx;
      this.ty += dy;
      this._last = { x: e.clientX, y: e.clientY };
      this.userMoved = true;
      this._apply();
    });

    const end = (e) => {
      if (window.imageEngineService && window.imageEngineService.cropModeActive) {
        window.imageEngineService.handleCropPointerUp(e);
      }
      if (window.imageEngineService && window.imageEngineService.shirtSimulationMode) {
        window.imageEngineService.handleShirtPointerUp(e);
      }
      if (!this.panning) return;
      this.panning = false;
      vp.classList.remove("vp-panning");
      try { vp.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    };
    vp.addEventListener("pointerup", end);
    vp.addEventListener("pointercancel", end);

    // Previne comportamento padrão do clique do meio (auto-scroll)
    vp.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
    vp.addEventListener("auxclick", (e) => { if (e.button === 1) e.preventDefault(); });

    // Duplo clique na área do canvas centraliza a imagem
    vp.addEventListener("dblclick", (e) => {
      if (e.target.closest("button, input, select, textarea, a, .canvas-zoom-floating-bar, .crop-floating-bar")) return;
      this.centerImage(false);
    });

    const isTyping = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

    // Atalhos de teclado: Espaço (arraste), C (centralizar), F (ajustar), W (varinha mágica), X (cortar), Ctrl+Z (desfazer), Enter/Esc (corte)
    document.addEventListener("keydown", (e) => {
      if (isTyping(e.target) || !this._isVisible()) return;

      if (window.imageEngineService && window.imageEngineService.cropModeActive) {
        if (e.key === "Enter") {
          e.preventDefault();
          window.imageEngineService.applyCrop();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          window.imageEngineService.cancelCrop();
          return;
        }
      }

      if (e.code === "Space") {
        this.spaceDown = true;
        vp.classList.add("vp-space");
        e.preventDefault();
      } else if (e.key === "c" || e.key === "C") {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.centerImage(false);
        }
      } else if (e.key === "f" || e.key === "F") {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.fit(24);
        }
      } else if (e.key === "x" || e.key === "X") {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (window.imageEngineService) {
            window.imageEngineService.toggleCropMode();
          }
        }
      } else if (e.key === "w" || e.key === "W") {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (window.imageEngineService) {
            window.imageEngineService.toggleMagicWand();
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (window.imageEngineService) {
          window.imageEngineService.undoLastAction();
        }
      }
    });

    document.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.spaceDown = false;
        vp.classList.remove("vp-space");
      }
    });

    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this.onContainerResized());
      this._ro.observe(vp);
    }
  }

  _isVisible() {
    return this.viewport.offsetParent !== null;
  }

  /** Informa o tamanho CSS (px de layout) do canvas; mantém o centro se o usuário já navegou. */
  setCanvasCssSize(w, h) {
    this.cssW = w;
    this.cssH = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (!this.userMoved) this.fit(); else this._apply();
  }

  onContainerResized() {
    if (!this._isVisible()) return;
    if (!this.userMoved) this.fit(); else this._apply();
  }

  /** Ajusta o canvas para caber 100% visível na janela do viewport com margem de segurança */
  fit(padding = 24) {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    if (!vw || !vh) return;
    const z = Math.min((vw - padding * 2) / this.cssW, (vh - padding * 2) / this.cssH);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, z));
    this.tx = (vw - this.cssW * this.zoom) / 2;
    this.ty = (vh - this.cssH * this.zoom) / 2;
    this.userMoved = false;
    this._apply();
  }

  /**
   * Traz a imagem exatamente para o centro geométrico do viewport.
   * Se fitZoom for true, recalcula também o melhor nível de zoom para caber na tela.
   */
  centerImage(fitZoom = false) {
    if (fitZoom) {
      return this.fit(24);
    }
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    if (!vw || !vh) return;
    this.tx = (vw - this.cssW * this.zoom) / 2;
    this.ty = (vh - this.cssH * this.zoom) / 2;
    this.userMoved = false;
    this._apply();
  }

  /** Zoom em fator (1 = 100% do tamanho CSS), centralizado no cursor ou no centro. */
  zoomAt(clientX, clientY, newZoom) {
    newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, newZoom));
    const rect = this.viewport.getBoundingClientRect();
    const px = (clientX === undefined ? rect.left + rect.width / 2 : clientX) - rect.left;
    const py = (clientY === undefined ? rect.top + rect.height / 2 : clientY) - rect.top;
    const k = newZoom / this.zoom;
    this.tx = px - (px - this.tx) * k;
    this.ty = py - (py - this.ty) * k;
    this.zoom = newZoom;
    this.userMoved = true;
    this._apply();
  }

  setZoom(z) {
    this.zoomAt(undefined, undefined, z);
  }

  _apply() {
    this.canvas.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.zoom})`;
    this.onChange(this.zoom);
    clearTimeout(this._settleTimer);
    this._settleTimer = setTimeout(() => this.onSettle(this.zoom), 180);
  }
}

window.CanvasViewportController = CanvasViewportController;
