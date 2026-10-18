/**
 * LATITUDE DTF COCKPIT - GLOBAL APPLICATION STATE STORE
 * Gerenciador reativo de dados para todos os 5 módulos operacionais.
 */

const DTFState = {
  // Configurações Parametrizáveis da Gráfica e Custos
  settings: {
    dtfMeterCost: 60.0,         // R$ 60,00 por metro linear
    rollUsefulWidthCm: 58.0,    // Boca da Plotter (30cm, 42cm, 58cm, 60cm, 70cm, 120cm)
    safetyCutMarginCm: 1.0,     // 1.0 cm de margem obrigatória entre estampas
    blankShirtCost: 22.50,      // Camiseta lisa Algodão 30.1 Penteado
    packagingCost: 2.80,        // Embalagem + Tag de papelão + Seda
    pressEnergyCost: 0.45,      // Rateio da prensa térmica (2.2 kWh)
    laborHandlingCost: 3.50,    // Mão de obra de corte e prensagem
    fixedExpensesPct: 12.0,     // Aluguel, software, equipe fixa
    cardGatewayTaxPct: 4.99,    // Taxa média de gateway / cartão de crédito
    businessTaxPct: 6.00,       // Imposto Simples Nacional / Anexo II
    targetNetMarginPct: 28.0,   // Margem de lucro líquida alvo (25-30%)
  },

  // Estado do Módulo 1: Tratamento Gráfico Ativo
  imageEngine: {
    targetDPI: 600,            // DPI ajustável (300, 600, 720, 1200, 1440, etc.)
    activeArtworkId: null,
    activeArtworkName: "",
    canvasZoom: 1.0,           // Nível de zoom do canvas (0.25 a 3.0)
    upscaleEnabled: true,
    backgroundRemoved: false,
    blackKnockoutEnabled: false,
    knockoutThreshold: 28,     // 0 a 100
    knockoutFeather: 15,       // 0 a 40
    whiteKnockoutEnabled: false, // Knockout de branco para camisa branca
    whiteKnockoutThreshold: 88,  // 70 a 98 L*
    whiteKnockoutFeather: 12,    // 5 a 30
    cropModeActive: false,       // Modo interativo de corte de estampa
    canvasBgType: "checkerboard", // "checkerboard", "black", "white", "gray", "red", "offwhite", "custom"
    canvasBgColor: "#111317",  // Cor da camiseta para simulação do knockout
    focusMode: false,          // Modo tela ampla / foco do canvas
    halftoneEnabled: false,
    halftoneMode: "dtf-fade",   // "dtf-fade" (indústria DTF), "stochastic" (Floyd-Steinberg HD), "classic" (AM screen)
    halftoneLPI: 45,           // LPI de Halftone (Linhas por polegada: 25, 35, 45, 55, 65, 85)
    halftoneAngle: 45,         // Ângulo da retícula em graus (22.5°, 45°, 75°)
    unsharpStrength: 0,        // Filtro de Super-Nitidez (0 a 100%)
    denoiseStrength: 0,        // Redução de ruído e artefatos JPEG (0 a 100%)
    vibranceBoost: 0,          // Realce de cores e contraste para pigmento DTF (0 a 50%)
    exportFormat: "PNG",       // PNG, TIFF, PDF
    selectedSize: "M",         // PP, P, M, G, GG, XG, Peito, Manga
    targetShirtColor: "Preta", // Preta, Branca, Off-White, Vermelha, Cinza
    activeSupplierId: "reacao", // Fornecedor e modelagem ativa
    shirtSimulationMode: false, // Simulação na medida exata do molde da camiseta
    shirtPlacement: "chest",   // "chest", "pocket", "sleeve", "custom"
    shirtOffsetXCm: 0.0,       // Deslocamento horizontal em cm do centro
    shirtOffsetYCm: 7.0,       // Distância em cm da gola (4 dedos = ~7 cm)
    lockPrintAspectRatio: true,// Manter proporção ao redimensionar
    customWidthCm: 28.0,       // Largura da estampa em cm calibrada para Tam M
    customHeightCm: 37.0,      // Altura da estampa em cm
    // Galeria de Imagens Carregadas pelo Usuário (Inicia vazia para o operador carregar suas próprias artes)
    uploadedImages: [],
  },

  // Base de Fornecedores e Modelagens Cadastradas (Medidas reais da peça + Estampa calibrada)
  suppliers: {
    reacao: {
      id: "reacao",
      name: "Reação Camisetas",
      subtitle: "Tabela Oficial do Fornecedor (100% Algodão Nacional)",
      badge: "Fornecedor Atual",
      sizes: {
        "PP": {
          shirtWidthCm: 46.0,
          shirtHeightCm: 62.0,
          sleeveLengthCm: 18.0,
          defaultPrintWidthCm: 24.0,
          defaultPrintHeightCm: 30.0,
          label: "PP",
          fullLabel: "Tam PP (46×62 cm | Manga 18cm)"
        },
        "P": {
          shirtWidthCm: 50.0,
          shirtHeightCm: 66.0,
          sleeveLengthCm: 19.0,
          defaultPrintWidthCm: 26.0,
          defaultPrintHeightCm: 34.0,
          label: "P",
          fullLabel: "Tam P (50×66 cm | Manga 19cm)"
        },
        "M": {
          shirtWidthCm: 52.0,
          shirtHeightCm: 70.0,
          sleeveLengthCm: 21.0,
          defaultPrintWidthCm: 28.0,
          defaultPrintHeightCm: 37.0,
          label: "M",
          fullLabel: "Tam M (52×70 cm | Manga 21cm)"
        },
        "G": {
          shirtWidthCm: 54.0,
          shirtHeightCm: 74.0,
          sleeveLengthCm: 23.0,
          defaultPrintWidthCm: 30.0,
          defaultPrintHeightCm: 40.0,
          label: "G",
          fullLabel: "Tam G (54×74 cm | Manga 23cm)"
        },
        "GG": {
          shirtWidthCm: 58.0,
          shirtHeightCm: 78.0,
          sleeveLengthCm: 25.0,
          defaultPrintWidthCm: 32.0,
          defaultPrintHeightCm: 44.0,
          label: "GG",
          fullLabel: "Tam GG (58×78 cm | Manga 25cm)"
        },
        "XG": {
          shirtWidthCm: 65.0,
          shirtHeightCm: 81.0,
          sleeveLengthCm: 28.0,
          defaultPrintWidthCm: 35.0,
          defaultPrintHeightCm: 48.0,
          label: "XG",
          fullLabel: "Tam XG (65×81 cm | Manga 28cm)"
        },
        "Peito": {
          shirtWidthCm: 52.0,
          shirtHeightCm: 70.0,
          sleeveLengthCm: 21.0,
          defaultPrintWidthCm: 10.0,
          defaultPrintHeightCm: 10.0,
          label: "Peito",
          fullLabel: "Pocket / Peito (10×10 cm)",
          isPocket: true
        },
        "Manga": {
          shirtWidthCm: 52.0,
          shirtHeightCm: 70.0,
          sleeveLengthCm: 21.0,
          defaultPrintWidthCm: 8.5,
          defaultPrintHeightCm: 18.0,
          label: "Manga",
          fullLabel: "Manga Lateral (8.5×18 cm)",
          isSleeve: true
        }
      }
    },
    latitude_streetwear: {
      id: "latitude_streetwear",
      name: "Latitude Streetwear",
      subtitle: "Modelagem Oversized Heavyweight 260g (Corte Amplo)",
      badge: "Streetwear Boxy",
      sizes: {
        "P": {
          shirtWidthCm: 56.0,
          shirtHeightCm: 73.0,
          sleeveLengthCm: 24.0,
          defaultPrintWidthCm: 30.0,
          defaultPrintHeightCm: 40.0,
          label: "P Oversized",
          fullLabel: "Tam P Oversized (56×73 cm | Manga 24cm)"
        },
        "M": {
          shirtWidthCm: 59.0,
          shirtHeightCm: 76.0,
          sleeveLengthCm: 25.0,
          defaultPrintWidthCm: 32.0,
          defaultPrintHeightCm: 44.0,
          label: "M Oversized",
          fullLabel: "Tam M Oversized (59×76 cm | Manga 25cm)"
        },
        "G": {
          shirtWidthCm: 62.0,
          shirtHeightCm: 79.0,
          sleeveLengthCm: 26.0,
          defaultPrintWidthCm: 35.0,
          defaultPrintHeightCm: 48.0,
          label: "G Oversized",
          fullLabel: "Tam G Oversized (62×79 cm | Manga 26cm)"
        },
        "GG": {
          shirtWidthCm: 66.0,
          shirtHeightCm: 82.0,
          sleeveLengthCm: 27.0,
          defaultPrintWidthCm: 38.0,
          defaultPrintHeightCm: 52.0,
          label: "GG Oversized",
          fullLabel: "Tam GG Oversized (66×82 cm | Manga 27cm)"
        },
        "XG": {
          shirtWidthCm: 70.0,
          shirtHeightCm: 85.0,
          sleeveLengthCm: 29.0,
          defaultPrintWidthCm: 40.0,
          defaultPrintHeightCm: 55.0,
          label: "XG Oversized",
          fullLabel: "Tam XG Oversized (70×85 cm | Manga 29cm)"
        },
        "Peito": {
          shirtWidthCm: 59.0,
          shirtHeightCm: 76.0,
          sleeveLengthCm: 25.0,
          defaultPrintWidthCm: 11.0,
          defaultPrintHeightCm: 11.0,
          label: "Peito",
          fullLabel: "Pocket Oversized (11×11 cm)",
          isPocket: true
        },
        "Manga": {
          shirtWidthCm: 59.0,
          shirtHeightCm: 76.0,
          sleeveLengthCm: 25.0,
          defaultPrintWidthCm: 9.0,
          defaultPrintHeightCm: 20.0,
          label: "Manga",
          fullLabel: "Manga Streetwear (9×20 cm)",
          isSleeve: true
        }
      }
    },
    basica_padrao: {
      id: "basica_padrao",
      name: "Camiseta Básica 30.1",
      subtitle: "Corte Regular Penteado Unissex",
      badge: "Standard Fit",
      sizes: {
        "PP": { shirtWidthCm: 47.0, shirtHeightCm: 65.0, sleeveLengthCm: 19.0, defaultPrintWidthCm: 25.0, defaultPrintHeightCm: 32.0, label: "PP", fullLabel: "Tam PP (47×65 cm)" },
        "P":  { shirtWidthCm: 50.0, shirtHeightCm: 68.0, sleeveLengthCm: 20.0, defaultPrintWidthCm: 26.0, defaultPrintHeightCm: 34.0, label: "P", fullLabel: "Tam P (50×68 cm)" },
        "M":  { shirtWidthCm: 53.0, shirtHeightCm: 71.0, sleeveLengthCm: 22.0, defaultPrintWidthCm: 28.0, defaultPrintHeightCm: 37.0, label: "M", fullLabel: "Tam M (53×71 cm)" },
        "G":  { shirtWidthCm: 56.0, shirtHeightCm: 74.0, sleeveLengthCm: 24.0, defaultPrintWidthCm: 30.0, defaultPrintHeightCm: 40.0, label: "G", fullLabel: "Tam G (56×74 cm)" },
        "GG": { shirtWidthCm: 59.0, shirtHeightCm: 77.0, sleeveLengthCm: 26.0, defaultPrintWidthCm: 32.0, defaultPrintHeightCm: 44.0, label: "GG", fullLabel: "Tam GG (59×77 cm)" },
        "XG": { shirtWidthCm: 63.0, shirtHeightCm: 80.0, sleeveLengthCm: 28.0, defaultPrintWidthCm: 35.0, defaultPrintHeightCm: 48.0, label: "XG", fullLabel: "Tam XG (63×80 cm)" },
        "Peito": { shirtWidthCm: 53.0, shirtHeightCm: 71.0, sleeveLengthCm: 22.0, defaultPrintWidthCm: 10.0, defaultPrintHeightCm: 10.0, label: "Peito", fullLabel: "Pocket (10×10 cm)", isPocket: true },
        "Manga": { shirtWidthCm: 53.0, shirtHeightCm: 71.0, sleeveLengthCm: 22.0, defaultPrintWidthCm: 8.5, defaultPrintHeightCm: 18.0, label: "Manga", fullLabel: "Manga (8.5×18 cm)", isSleeve: true }
      }
    }
  },

  // Retorna o fornecedor ativo atualmente
  getCurrentSupplier() {
    const id = this.imageEngine.activeSupplierId || "reacao";
    return this.suppliers[id] || this.suppliers.reacao;
  },

  // Retorna as medidas da camiseta selecionada do fornecedor ativo
  getCurrentShirtSizeData() {
    const supplier = this.getCurrentSupplier();
    const sizeKey = this.imageEngine.selectedSize || "M";
    return supplier.sizes[sizeKey] || supplier.sizes["M"] || Object.values(supplier.sizes)[0];
  },

  // Grade Dinâmica de Tamanhos DTF com dimensões reais em cm (segue o fornecedor selecionado)
  get sizePresets() {
    const supplier = this.getCurrentSupplier();
    const presets = {};
    Object.entries(supplier.sizes).forEach(([key, val]) => {
      presets[key] = {
        widthCm: val.defaultPrintWidthCm,
        heightCm: val.defaultPrintHeightCm,
        shirtWidthCm: val.shirtWidthCm,
        shirtHeightCm: val.shirtHeightCm,
        sleeveLengthCm: val.sleeveLengthCm,
        label: val.fullLabel || `${key} (${val.defaultPrintWidthCm}×${val.defaultPrintHeightCm} cm)`
      };
    });
    return presets;
  },

  // Estado do Módulo 2: Montador de Rolo (Gang Sheet 58cm)
  gangSheet: {
    rollCode: "ROLO-2026-10-A",
    rollWidthCm: 58.0,
    safetyMarginCm: 1.0,
    zoomLevel: 1.0,
    showCutMarks: true,
    autoFillersActive: false,
    items: [],
    fillerBank: [
      { id: "fil_1", label: "Logo Gola Latitude", widthCm: 6.0, heightCm: 4.0, type: "tag" },
      { id: "fil_2", label: "Mini Sticker Freebie", widthCm: 8.0, heightCm: 5.0, type: "brinde" },
      { id: "fil_3", label: "Logo 5x5 DTF", widthCm: 5.0, heightCm: 5.0, type: "logo" }
    ]
  },

  // Estado do Módulo 4: Produção, Kanban e Lotes
  production: {
    activeBatchFilter: "all",
    orders: [
      {
        id: "ord_101",
        orderNumber: "PED-101",
        customerName: "Rodrigo Sanches",
        customerPhone: "5511987654321",
        shirtColor: "Preta",
        fabricType: "100% Algodão Penteado 30.1",
        size: "M",
        artworkTitle: "Cyber Skull Streetwear",
        status: "prensagem", // aguardando_rolo, recorte, prensagem, enviado
        tempC: 160,
        timeSec: 15,
        peelType: "Cold Peel",
        collarOffsetCm: 7.5,
        trackingCode: "BR9876543210X"
      },
      {
        id: "ord_104",
        orderNumber: "PED-104",
        customerName: "Lucas Mendes",
        customerPhone: "5511999887766",
        shirtColor: "Preta",
        fabricType: "100% Algodão Penteado 30.1",
        size: "M",
        artworkTitle: "Cyber Skull Streetwear",
        status: "aguardando_rolo",
        tempC: 160,
        timeSec: 15,
        peelType: "Cold Peel",
        collarOffsetCm: 7.5,
        trackingCode: "BR1234567890X"
      },
      {
        id: "ord_107",
        orderNumber: "PED-107",
        customerName: "Camila Rocha",
        customerPhone: "5521977665544",
        shirtColor: "Preta",
        fabricType: "100% Algodão Penteado 30.1",
        size: "G",
        artworkTitle: "Neo Tokyo Mecha Typo",
        status: "recorte",
        tempC: 160,
        timeSec: 15,
        peelType: "Cold Peel",
        collarOffsetCm: 8.0,
        trackingCode: "BR4567891230X"
      },
      {
        id: "ord_109",
        orderNumber: "PED-109",
        customerName: "Marcos Paulo",
        customerPhone: "5531988776655",
        shirtColor: "Branca",
        fabricType: "Poliéster / Dry-Fit",
        size: "GG",
        artworkTitle: "Cyber Skull Streetwear",
        status: "prensagem",
        tempC: 145,
        timeSec: 12,
        peelType: "Cold Peel",
        collarOffsetCm: 8.5,
        trackingCode: "BR7891234560X"
      },
      {
        id: "ord_098",
        orderNumber: "PED-098",
        customerName: "Juliana Paes",
        customerPhone: "5541999112233",
        shirtColor: "Off-White",
        fabricType: "100% Algodão Penteado 30.1",
        size: "P",
        artworkTitle: "Latitude Studio Core Logo",
        status: "enviado",
        tempC: 160,
        timeSec: 15,
        peelType: "Cold Peel",
        collarOffsetCm: 6.5,
        trackingCode: "BR3216549870X"
      }
    ],
    pressRecipes: {
      "100% Algodão Penteado 30.1": {
        tempC: 160,
        initialPressSec: 15,
        postPressSec: 5,
        pressure: "Média-Alta (4-5 bar)",
        peel: "Cold Peel (Pelagem 100% Frio)",
        tips: "Esperar a placa de filme esfriar completamente antes de puxar. Pós-prensagem de 5s com teflon para toque mate uniforme."
      },
      "Poliéster / Dry-Fit": {
        tempC: 145,
        initialPressSec: 12,
        postPressSec: 4,
        pressure: "Média (3 bar)",
        peel: "Cold Peel",
        tips: "Temperatura mais baixa para evitar brilho ou termoencolhimento do fio sintético."
      },
      "Moletom 3 Cabos / Felpado": {
        tempC: 165,
        initialPressSec: 18,
        postPressSec: 6,
        pressure: "Alta (5-6 bar)",
        peel: "Cold Peel",
        tips: "Pré-prensar por 6s para achatar as fibras e tirar umidade residual."
      }
    }
  },

  // Estado do Módulo 5: Marketing & Redes Sociais
  marketing: {
    selectedFormat: "1:1", // "1:1" ou "9:16"
    selectedTemplate: "urban_oversized",
    aiVideoActive: false,
    selectedCopyIndex: 0,
    copies: [
      {
        style: "Escassez & Drop Streetwear",
        badge: "🔥 Alta Conversão",
        text: "DROP EXCLUSIVO 01: Quantidade ultra-limitada em malha 30.1 penteada com toque zero DTF. Quando zerar o lote, não haverá reposição. Garanta o seu no link da bio antes que esgote.",
      },
      {
        style: "Foco em Benefício & Toque Zero",
        badge: "💎 Qualidade Premium",
        text: "Você nunca vestiu uma estampa com essa maciez. Graças à nossa tecnologia de Black Knockout no filme térmico, a tinta se funde à fibra sem aquela sensação plastificada pesada. Vista conforto de verdade.",
      },
      {
        style: "Storytelling & Conceito Visual",
        badge: "🎨 Identidade de Marca",
        text: "Direto da cena underground para o seu guarda-roupa. A nova peça Cyber Skull traz o contraste entre o futurismo e a atitude urbana brasileira. Vista a sua autenticidade todos os dias.",
      }
    ],
    hashtags: "#StreetwearBrasil #DTFPrinting #CamisetaSobDemanda #StreetFashion #EstampaToqueZero #ModaMasculina #DropExclusivo #LatitudeStudio",
    scheduleCalendar: [
      { day: "Segunda", time: "18:00", platform: "Instagram Feed", status: "Agendado", format: "1:1" },
      { day: "Terça", time: "12:30", platform: "TikTok Video", status: "Pendente IA", format: "9:16" },
      { day: "Quinta", time: "20:00", platform: "Instagram Reels", status: "Rascunho", format: "9:16" },
      { day: "Sábado", time: "17:00", platform: "Meta Ads Story", status: "Agendado", format: "9:16" }
    ]
  }
};

// Funções utilitárias de escuta de estado
window.DTFState = DTFState;
