/**
 * LATITUDE DTF COCKPIT - MÓDULO 4: PRODUÇÃO, PRENSA E LOGÍSTICA
 * Kanban de produção, Ficha de Prensagem (Receitas), Lote Inteligente,
 * Gabarito Virtual em cm, QR Code de lavagem e despacho via WhatsApp.
 */

class ProductionService {
  constructor() {
    this.selectedOrderId = "ord_101";
  }

  // RENDERIZA O QUADRO KANBAN COMPLETO
  renderKanban() {
    const columns = [
      { key: "aguardando_rolo", label: "1. Aguardando Rolo", color: "badge-cyan" },
      { key: "recorte", label: "2. Recorte DTF", color: "badge-amber" },
      { key: "prensagem", label: "3. Prensagem Térmica", color: "badge-purple" },
      { key: "enviado", label: "4. Enviado / Concluído", color: "badge-green" }
    ];

    const kanbanEl = document.getElementById("kanbanBoardContainer");
    if (!kanbanEl) return;

    let html = "";
    columns.forEach((col) => {
      const ordersInCol = DTFState.production.orders.filter((ord) => {
        if (DTFState.production.activeBatchFilter !== "all") {
          // Filtro por temperatura / tecido
          if (col.key === "prensagem" && ord.fabricType !== DTFState.production.activeBatchFilter) {
            return false;
          }
        }
        return ord.status === col.key;
      });

      html += `
        <div class="kanban-column">
          <div class="kanban-col-header">
            <span>${col.label}</span>
            <span class="badge ${col.color}">${ordersInCol.length}</span>
          </div>
          <div class="kanban-col-cards">
            ${ordersInCol.map((ord) => this.renderCardHTML(ord, col.key)).join("")}
          </div>
        </div>
      `;
    });

    kanbanEl.innerHTML = html;
    this.renderSelectedOrderDetails();
  }

  renderCardHTML(ord, currentStage) {
    return `
      <div class="kanban-card ${ord.id === this.selectedOrderId ? 'selected-card' : ''}" onclick="window.productionService.selectOrder('${ord.id}')">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="color: var(--accent-cyan); font-size: 13px;">${ord.orderNumber}</strong>
          <span class="badge ${ord.shirtColor === 'Preta' ? 'badge-purple' : 'badge-cyan'}">${ord.size} • ${ord.shirtColor}</span>
        </div>
        <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
          ${ord.customerName}
        </div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">
          Arte: ${ord.artworkTitle}
        </div>
        <div style="font-size: 10px; color: var(--text-muted); background: var(--bg-surface-elevated); padding: 4px 6px; border-radius: 4px; margin-bottom: 10px;">
          🔥 ${ord.tempC}°C | ${ord.timeSec}s | ${ord.peelType}
        </div>
        <div style="display: flex; gap: 4px; justify-content: flex-end;">
          ${currentStage !== 'aguardando_rolo' ? `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.productionService.moveOrder('${ord.id}', -1)" title="Fase anterior">◀</button>` : ''}
          ${currentStage !== 'enviado' ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); window.productionService.moveOrder('${ord.id}', 1)" title="Avançar fase">Avançar ▶</button>` : ''}
        </div>
      </div>
    `;
  }

  selectOrder(orderId) {
    this.selectedOrderId = orderId;
    this.renderKanban();
    this.renderSelectedOrderDetails();
  }

  moveOrder(orderId, direction) {
    const stages = ["aguardando_rolo", "recorte", "prensagem", "enviado"];
    const ord = DTFState.production.orders.find((o) => o.id === orderId);
    if (!ord) return;

    const currentIdx = stages.indexOf(ord.status);
    const nextIdx = currentIdx + direction;
    if (nextIdx >= 0 && nextIdx < stages.length) {
      ord.status = stages[nextIdx];
      this.renderKanban();
    }
  }

  // FICHA DE PRENSAGEM E GABARITO VIRTUAL
  renderSelectedOrderDetails() {
    const ord = DTFState.production.orders.find((o) => o.id === this.selectedOrderId) || DTFState.production.orders[0];
    if (!ord) return;

    // Atualiza Ficha de Receita Técnica
    const recipe = DTFState.production.pressRecipes[ord.fabricType] || DTFState.production.pressRecipes["100% Algodão Penteado 30.1"];
    
    const recipeBox = document.getElementById("pressRecipeDetails");
    if (recipeBox) {
      recipeBox.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px;">
          <div class="metric-stat-card">
            <span class="label">Temperatura</span>
            <div style="font-size: 20px; font-weight: 800; color: var(--accent-amber);">${recipe.tempC}°C</div>
          </div>
          <div class="metric-stat-card">
            <span class="label">Tempo Prensa</span>
            <div style="font-size: 20px; font-weight: 800; color: var(--accent-cyan);">${recipe.initialPressSec}s + ${recipe.postPressSec}s</div>
          </div>
          <div class="metric-stat-card">
            <span class="label">Pelagem (Peel)</span>
            <div style="font-size: 15px; font-weight: 700; color: var(--accent-purple-light);">${recipe.peel}</div>
          </div>
        </div>
        <div style="font-size: 11.5px; color: var(--text-secondary); background: var(--bg-card); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
          💡 <strong>Recomendação do Operador:</strong> ${recipe.tips}
        </div>
      `;
    }

    // Atualiza Gabarito Virtual
    this.renderVirtualPlacementGuide(ord);

    // Atualiza QR Code de Lavagem
    this.renderWashingQRCode(ord);
  }

  // RENDERIZAÇÃO DO GABARITO VIRTUAL COM RÉGUA EM CM
  renderVirtualPlacementGuide(ord) {
    const guideCanvas = document.getElementById("virtualGuideCanvas");
    if (!guideCanvas) return;
    const ctx = guideCanvas.getContext("2d");

    ctx.clearRect(0, 0, 320, 380);

    // Desenha silhueta da camiseta
    ctx.fillStyle = ord.shirtColor === "Preta" ? "#12141c" : (ord.shirtColor === "Branca" ? "#e2e8f0" : "#d8d0c5");
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;

    // Forma simples e elegante de camiseta streetwear
    ctx.beginPath();
    ctx.moveTo(110, 30); // Gola esquerda
    ctx.quadraticCurveTo(160, 55, 210, 30); // Curva da gola
    ctx.lineTo(290, 85); // Ombro direito
    ctx.lineTo(260, 140); // Manga direita
    ctx.lineTo(230, 125); // Axila direita
    ctx.lineTo(230, 350); // Barra lateral direita
    ctx.lineTo(90, 350);  // Barra inferior
    ctx.lineTo(90, 125);  // Barra lateral esquerda
    ctx.lineTo(60, 140);  // Axila esquerda
    ctx.lineTo(30, 85);   // Manga esquerda
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Régua de distância da gola (Offset em cm)
    const collarCm = ord.collarOffsetCm || 7.5;
    const collarY = 55;
    const printY = collarY + collarCm * 9; // Escala visual

    // Linha pontilhada da distância da gola
    ctx.save();
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(160, collarY);
    ctx.lineTo(160, printY);
    ctx.stroke();
    ctx.restore();

    // Rótulo da medida
    ctx.fillStyle = "#00f0ff";
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.fillText(`↔ ${collarCm} cm (4 dedos)`, 170, collarY + (printY - collarY) / 2);

    // Retângulo da estampa posicionada
    ctx.fillStyle = "rgba(0, 240, 255, 0.2)";
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 2;
    ctx.fillRect(115, printY, 90, 115);
    ctx.strokeRect(115, printY, 90, 115);

    // Texto da estampa
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ESTAMPA CENTRAL", 160, printY + 55);
    ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillText(`${ord.size} | ALINHAR AXILAS`, 160, printY + 70);
    ctx.textAlign = "start";
  }

  // GERAÇÃO DE QR CODE SVG PARA INSTRUÇÕES DE LAVAGEM
  renderWashingQRCode(ord) {
    const qrContainer = document.getElementById("washingQrContainer");
    if (!qrContainer) return;

    // Gera um código QR estilizado vetorial em SVG
    qrContainer.innerHTML = `
      <div style="display: flex; align-items: center; gap: 14px;">
        <svg width="74" height="74" viewBox="0 0 100 100" style="background: white; padding: 6px; border-radius: 6px;">
          <!-- SVG QR Code pattern -->
          <rect x="10" y="10" width="25" height="25" fill="#000"/>
          <rect x="15" y="15" width="15" height="15" fill="#fff"/>
          <rect x="18" y="18" width="9" height="9" fill="#000"/>
          <rect x="65" y="10" width="25" height="25" fill="#000"/>
          <rect x="70" y="15" width="15" height="15" fill="#fff"/>
          <rect x="73" y="18" width="9" height="9" fill="#000"/>
          <rect x="10" y="65" width="25" height="25" fill="#000"/>
          <rect x="15" y="70" width="15" height="15" fill="#fff"/>
          <rect x="18" y="73" width="9" height="9" fill="#000"/>
          <rect x="42" y="12" width="10" height="25" fill="#000"/>
          <rect x="40" y="45" width="20" height="18" fill="#000"/>
          <rect x="68" y="45" width="18" height="15" fill="#000"/>
          <rect x="45" y="70" width="22" height="18" fill="#000"/>
          <rect x="72" y="72" width="16" height="16" fill="#000"/>
        </svg>
        <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4;">
          <strong style="color: var(--text-primary);">QR Code de Cuidados DTF (#${ord.orderNumber})</strong><br>
          • Lavar sempre do avesso com água fria.<br>
          • Secar à sombra (não usar secadora quente).<br>
          • <strong>NUNCA</strong> passar ferro diretamente sobre a estampa.
        </div>
      </div>
    `;
  }

  // DESPACHO E WHATSAPP COM RASTREIO
  sendWhatsAppTracking(orderId) {
    const ord = DTFState.production.orders.find((o) => o.id === orderId) || DTFState.production.orders[0];
    const msg = encodeURIComponent(
      `Olá ${ord.customerName}! 🚀 Sua camiseta Latitude exclusiva (${ord.artworkTitle} - Tam ${ord.size}) foi prensada com perfeição e já foi despachada!\n\n📦 Código de Rastreio: ${ord.trackingCode}\n\nObrigado por apoiar nossa marca!`
    );
    const waUrl = `https://wa.me/${ord.customerPhone}?text=${msg}`;
    window.open(waUrl, "_blank");
  }

  // FILTRO INTELIGENTE DE LOTES (AGRUPAMENTO POR TEMPERATURA / TECIDO)
  setBatchFilter(filterVal) {
    DTFState.production.activeBatchFilter = filterVal;
    this.renderKanban();
  }
}

window.ProductionService = ProductionService;
