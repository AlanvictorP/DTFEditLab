/**
 * LATITUDE DTF COCKPIT - REALISTIC MOCKUP RENDER ENGINE
 * Computação Gráfica: Mapeamento de Deslocamento (Displacement Map),
 * Shading Overlay (Multiply/Soft-Light), Grain DTF e Bounding Boxes Fotográficas.
 */

class MockupRenderEngine {
  constructor() {
    this.tshirtImages = {
      black_hanger: "assets/tshirt_black.jpg",
      white_hanger: "assets/tshirt_white.jpg",
      black_model: "assets/tshirt_model.jpg",
      black_hanger_back: "assets/tshirt_hanger_back_black.jpg",
      white_hanger_back: "assets/tshirt_hanger_back_white.jpg",
      black_model_back: "assets/tshirt_model_back.jpg"
    };

    this.loadedImages = {};
    this.cachedDisplacementMaps = {};
    this.isRendering = false;

    // Bounding boxes calibradas em pixels sobre as fotos reais de 1024x1024
    // Valores ajustados com margem de segurança de 4 dedos abaixo da gola
    this.viewConfigs = {
      hanger: {
        center: { x: 312, y: 345, w: 400, h: 440 },
        pocket: { x: 535, y: 350, w: 130, h: 130 },
        back:   { x: 312, y: 285, w: 400, h: 490 }
      },
      model: {
        center: { x: 340, y: 355, w: 340, h: 410 },
        pocket: { x: 520, y: 350, w: 120, h: 125 },
        back:   { x: 325, y: 245, w: 370, h: 460 }
      }
    };

    // Parâmetros de renderização fotorrealista
    this.params = {
      displacementStrength: 7.5, // Pixels de deformação nas dobras
      shadingIntensity: 0.85,    // Multiplicação de sombras naturais
      dtfGrainAmount: 5.0,       // Ruído tátil da tinta térmica
      viewType: "hanger",        // "hanger" ou "model"
      viewSide: "front",         // "front" ou "back"
      shirtColor: "Preta",       // "Preta", "Branca", "Cinza", "Off-White", "Vermelha"
      placement: "center",       // "center" ou "pocket"
      offsetY: 0,                // Ajuste vertical interativo (-100 a +150 px)
      offsetX: 0,                // Ajuste horizontal interativo (-100 a +100 px)
      scalePercent: 100          // Escala da estampa (50% a 150%)
    };

    this.preloadPhotos();
  }

  // PRÉ-CARREGAMENTO DAS FOTOGRAFIAS REAIS
  preloadPhotos() {
    Object.entries(this.tshirtImages).forEach(([key, src]) => {
      const img = new Image();
      if (window.location.protocol.startsWith("http")) {
        img.crossOrigin = "anonymous";
      }
      this.loadedImages[key] = img;
      img.onload = () => {
        this.loadedImages[key] = img;
      };
      img.onerror = () => {
        console.warn("Aviso ao carregar foto da malha:", src);
      };
      img.src = src;
    });
  }

  // ALGORITMO MATEMÁTICO DE MAPEAMENTO DE DESLOCAMENTO (DISPLACEMENT MAP)
  // Calcula o gradiente de luminância (Sobel 3x3) e desloca os pixels da estampa
  applyDisplacementMap(artworkCtx, fabricCtx, w, h, strength = 7.5) {
    try {
      const artImageData = artworkCtx.getImageData(0, 0, w, h);
      const fabricImageData = fabricCtx.getImageData(0, 0, w, h);

      const artData = artImageData.data;
      const fabricData = fabricImageData.data;

      // Buffer de saída para os pixels deslocados
      const outputImageData = artworkCtx.createImageData(w, h);
      const outData = outputImageData.data;

      // Converte a foto do tecido em mapa de altura (luminância ITU-R BT.601)
      const heightMap = new Float32Array(w * h);
      for (let i = 0; i < fabricData.length; i += 4) {
        // Normalizado de 0.0 a 1.0
        heightMap[i / 4] = (0.299 * fabricData[i] + 0.587 * fabricData[i + 1] + 0.114 * fabricData[i + 2]) / 255.0;
      }

      // Aplica o filtro de deformação elástica (vetor normal aproximado à dobra)
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;

          // Gradiente horizontal e vertical de luminância das dobras
          const dx = (heightMap[idx + 1] - heightMap[idx - 1]) * 0.5;
          const dy = (heightMap[idx + w] - heightMap[idx - w]) * 0.5;

          // Deslocamento dos pixels
          const sourceX = Math.round(x + dx * strength);
          const sourceY = Math.round(y + dy * strength);

          if (sourceX >= 0 && sourceX < w && sourceY >= 0 && sourceY < h) {
            const srcIdx = (sourceY * w + sourceX) * 4;
            const targetIdx = (y * w + x) * 4;

            outData[targetIdx]     = artData[srcIdx];
            outData[targetIdx + 1] = artData[srcIdx + 1];
            outData[targetIdx + 2] = artData[srcIdx + 2];
            outData[targetIdx + 3] = artData[srcIdx + 3];
          }
        }
      }

      artworkCtx.putImageData(outputImageData, 0, 0);
    } catch (err) {
      console.warn("Displacement map fallback (segurança de canvas):", err);
    }
  }

  // ALGORITMO DE SHADING OVERLAY (MULTIPLICAÇÃO DE SOMBRAS E BRILHO DO ALGODÃO)
  applyRealisticShading(targetCtx, fabricCtx, w, h, intensity = 0.85, isDarkShirt = true) {
    try {
      const artImageData = targetCtx.getImageData(0, 0, w, h);
      const fabricImageData = fabricCtx.getImageData(0, 0, w, h);

      const art = artImageData.data;
      const fabric = fabricImageData.data;

      // Calcula a média de luminosidade da área para normalizar
      let totalLuma = 0;
      let count = 0;
      for (let i = 0; i < fabric.length; i += 16) {
        totalLuma += (0.299 * fabric[i] + 0.587 * fabric[i + 1] + 0.114 * fabric[i + 2]);
        count++;
      }
      const avgLuma = count > 0 ? (totalLuma / count) : 128.0;

      for (let i = 0; i < art.length; i += 4) {
        const alpha = art[i + 3];
        if (alpha === 0) continue;

        const fR = fabric[i];
        const fG = fabric[i + 1];
        const fB = fabric[i + 2];
        const fLuma = 0.299 * fR + 0.587 * fG + 0.114 * fB;

        // Fator de sombra relativo: menor que 1.0 escurece (rugas), maior que 1.0 ilumina
        const shadowRatio = fLuma / Math.max(avgLuma, 1.0);
        const factor = 1.0 + (shadowRatio - 1.0) * intensity;

        // Adiciona leve ruído tátil de granulação DTF (película impressa no algodão)
        const grain = (Math.random() - 0.5) * this.params.dtfGrainAmount;

        art[i]     = Math.min(255, Math.max(0, Math.round(art[i] * factor + grain)));
        art[i + 1] = Math.min(255, Math.max(0, Math.round(art[i + 1] * factor + grain)));
        art[i + 2] = Math.min(255, Math.max(0, Math.round(art[i + 2] * factor + grain)));
        // Leve fusão de transparência (98.5% opacidade) para o tecido respirar
        art[i + 3] = Math.round(alpha * 0.985);
      }

      targetCtx.putImageData(artImageData, 0, 0);
    } catch (err) {
      console.warn("Shading overlay fallback:", err);
      targetCtx.globalAlpha = 0.985;
    }
  }

  // OBTÉM A BASE FOTOGRÁFICA ADEQUADA COM SUPORTE A FRENTE E VERSO
  getPhotoBaseKey() {
    const isBack = this.params.viewSide === "back";

    if (this.params.viewType === "model") {
      return isBack ? "black_model_back" : "black_model";
    }

    const isWhiteOrOff = (this.params.shirtColor === "Branca" || this.params.shirtColor === "Off-White");
    if (isWhiteOrOff) {
      return isBack ? "white_hanger_back" : "white_hanger";
    }

    return isBack ? "black_hanger_back" : "black_hanger";
  }

  // RENDERIZAÇÃO COMPLETA FOTORREALISTA NO CANVAS PRINCIPAL
  async renderMockup(canvasElement, sourceArtworkCanvas, options = {}) {
    Object.assign(this.params, options);

    if (!canvasElement) return;
    const ctx = canvasElement.getContext("2d");
    const w = canvasElement.width;
    const h = canvasElement.height;

    const baseKey = this.getPhotoBaseKey();
    let basePhoto = this.loadedImages[baseKey];

    // Aguarda carregar com timeout de segurança (máx 500ms)
    if (!basePhoto || !basePhoto.complete || basePhoto.naturalWidth === 0) {
      await new Promise((resolve) => {
        let attempts = 0;
        const check = setInterval(() => {
          attempts++;
          const candidate = this.loadedImages[baseKey];
          if ((candidate && candidate.complete && candidate.naturalWidth > 0) || attempts > 10) {
            clearInterval(check);
            basePhoto = (candidate && candidate.naturalWidth > 0) ? candidate : null;
            resolve();
          }
        }, 50);
      });
    }

    // 1. Desenha a foto real da camiseta em estúdio (ou fallback estilizado de alta qualidade)
    ctx.clearRect(0, 0, w, h);
    if (basePhoto && basePhoto.naturalWidth > 0) {
      ctx.drawImage(basePhoto, 0, 0, w, h);
    } else {
      // Fallback de estúdio fotográfico texturizado
      const grad = ctx.createRadialGradient(w/2, h/2, 20, w/2, h/2, w);
      grad.addColorStop(0, "#1c1f2b");
      grad.addColorStop(1, "#0a0c10");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Aplica Color Tinting fotográfico se a cor for diferente da foto base
    this.applyColorTinting(ctx, w, h);

    // 3. Obtém a bounding box da área útil calibrada para esta foto
    let config = this.viewConfigs[this.params.viewType][this.params.placement];
    if (this.params.viewSide === "back" && this.viewConfigs[this.params.viewType].back) {
      config = this.viewConfigs[this.params.viewType].back;
    }
    if (!sourceArtworkCanvas || !config) return;

    // Escala para as dimensões do canvas de destino
    const scaleX = w / 1024;
    const scaleY = h / 1024;

    // Aplicação dos ajustes interativos de escala e offset (reposicionamento)
    const userScale = (this.params.scalePercent || 100) / 100.0;
    const userOffsetX = (this.params.offsetX || 0) * scaleX;
    const userOffsetY = (this.params.offsetY || 0) * scaleY;

    const boxW = Math.max(20, Math.round(config.w * scaleX * userScale));
    const boxH = Math.max(20, Math.round(config.h * scaleY * userScale));

    // Centraliza o redimensionamento a partir do centro da bounding box
    const centerX = (config.x + config.w / 2) * scaleX + userOffsetX;
    const centerY = (config.y + config.h / 2) * scaleY + userOffsetY;
    const boxX = Math.round(centerX - boxW / 2);
    const boxY = Math.round(centerY - boxH / 2);

    // 4. Cria buffers offscreen para a estampa e para a foto de fundo na mesma região
    const offArtCanvas = document.createElement("canvas");
    offArtCanvas.width = boxW;
    offArtCanvas.height = boxH;
    const offArtCtx = offArtCanvas.getContext("2d");

    // Mantém aspecto da estampa dentro da bounding box
    const artAspect = sourceArtworkCanvas.height / Math.max(sourceArtworkCanvas.width, 1);
    let targetW = boxW;
    let targetH = Math.round(boxW * artAspect);

    if (targetH > boxH) {
      targetH = boxH;
      targetW = Math.round(boxH / artAspect);
    }

    const innerOffsetX = Math.round((boxW - targetW) / 2);
    const innerOffsetY = Math.round((boxH - targetH) / 2);

    offArtCtx.clearRect(0, 0, boxW, boxH);
    offArtCtx.drawImage(sourceArtworkCanvas, innerOffsetX, innerOffsetY, targetW, targetH);

    // Buffer da foto da camiseta na mesma bounding box (para calcular o relevo de dobras)
    const offFabricCanvas = document.createElement("canvas");
    offFabricCanvas.width = boxW;
    offFabricCanvas.height = boxH;
    const offFabricCtx = offFabricCanvas.getContext("2d");

    offFabricCtx.drawImage(basePhoto, boxX, boxY, boxW, boxH, 0, 0, boxW, boxH);

    // 5. Executa o Mapeamento de Deslocamento (Displacement Mapping)
    this.applyDisplacementMap(offArtCtx, offFabricCtx, boxW, boxH, this.params.displacementStrength);

    // 6. Executa a Multiplicação de Sombras Naturais (Shading Overlay)
    const isDarkShirt = (this.params.shirtColor !== "Branca" && this.params.shirtColor !== "Off-White");
    this.applyRealisticShading(offArtCtx, offFabricCtx, boxW, boxH, this.params.shadingIntensity, isDarkShirt);

    // 7. Renderiza a estampa deformada sobre a camiseta
    ctx.drawImage(offArtCanvas, boxX, boxY, boxW, boxH);
  }

  // EXPORTAÇÃO HD EM RESOLUÇÃO REAL 1024x1024 FOTOGRÁFICA
  async exportHDMockup(sourceArtworkCanvas, filename = "Mockup_DTF_Fotorealista.png") {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = 1024;
    exportCanvas.height = 1024;
    await this.renderMockup(exportCanvas, sourceArtworkCanvas, this.params);

    const link = document.createElement("a");
    link.download = filename;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }

  // COLOR TINTING COM PRESERVAÇÃO DE SOMBRAS E TEXTURAS
  applyColorTinting(ctx, w, h) {
    const color = this.params.shirtColor;
    if (color === "Preta" || color === "Branca") return;

    ctx.save();
    if (color === "Cinza") {
      // Tom mescla frio
      ctx.fillStyle = "rgba(100, 110, 125, 0.45)";
      ctx.globalCompositeOperation = "color";
      ctx.fillRect(0, 0, w, h);
    } else if (color === "Off-White") {
      // Tom creme suave
      ctx.fillStyle = "rgba(245, 235, 220, 0.25)";
      ctx.globalCompositeOperation = "multiply";
      ctx.fillRect(0, 0, w, h);
    } else if (color === "Vermelha") {
      // Vermelho carmim streetwear
      ctx.fillStyle = "rgba(160, 20, 35, 0.55)";
      ctx.globalCompositeOperation = "multiply";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }
}

window.MockupRenderEngine = MockupRenderEngine;
window.mockupRenderEngine = new MockupRenderEngine();
