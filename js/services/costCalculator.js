/**
 * LATITUDE DTF COCKPIT - MÓDULO 3: PRECIFICAÇÃO E CUSTOS (CPV & MARKUP DIVISOR)
 * Cálculos financeiros de precisão por cm², rateio de insumos e markup divisor reverso.
 */

class CostCalculatorService {
  constructor() {
    this.init();
  }

  init() {
    // Inicialização e vinculação de inputs
  }

  // CUSTO DTF POR CENTÍMETRO QUADRADO
  // Rolo útil: 58 cm * 100 cm = 5.800 cm² por metro linear
  getDtfCostPerCm2() {
    const meterCost = DTFState.settings.dtfMeterCost; // R$ 60,00
    const usefulAreaPerMeter = DTFState.settings.rollUsefulWidthCm * 100; // 5.800 cm²
    return meterCost / usefulAreaPerMeter; // ~ R$ 0,0103448 / cm²
  }

  // CÁLCULO DO CPV UNITÁRIO BASEADO NO TAMANHO DA ESTAMPA
  calculateCPV(widthCm = 28.0, heightCm = 35.0) {
    const areaCm2 = widthCm * heightCm;
    const costPerCm2 = this.getDtfCostPerCm2();
    const dtfFractionCost = parseFloat((areaCm2 * costPerCm2).toFixed(2));

    const blankShirt = parseFloat(DTFState.settings.blankShirtCost);
    const packaging = parseFloat(DTFState.settings.packagingCost);
    const pressEnergy = parseFloat(DTFState.settings.pressEnergyCost);
    const labor = parseFloat(DTFState.settings.laborHandlingCost);

    const totalCPV = parseFloat(
      (blankShirt + dtfFractionCost + packaging + pressEnergy + labor).toFixed(2)
    );

    return {
      widthCm,
      heightCm,
      areaCm2,
      dtfFractionCost,
      blankShirt,
      packaging,
      pressEnergy,
      labor,
      totalCPV
    };
  }

  // FÓRMULA DE MARKUP DIVISOR
  // Preço de Venda = CPV / (1 - (D.Fixas% + Cartão% + Impostos% + Margem Líquida%))
  calculatePricing(cpvData) {
    const s = DTFState.settings;
    const fixedPct = s.fixedExpensesPct;
    const cardPct = s.cardGatewayTaxPct;
    const taxPct = s.businessTaxPct;
    const targetNetMarginPct = s.targetNetMarginPct;

    const totalDeductionsPct = fixedPct + cardPct + taxPct + targetNetMarginPct;
    const divisor = (100 - totalDeductionsPct) / 100;

    let suggestedPrice = 0;
    if (divisor > 0) {
      suggestedPrice = parseFloat((cpvData.totalCPV / divisor).toFixed(2));
    } else {
      suggestedPrice = cpvData.totalCPV * 2;
    }

    // Valores nominais deduzidos da venda
    const fixedValue = parseFloat((suggestedPrice * (fixedPct / 100)).toFixed(2));
    const cardValue = parseFloat((suggestedPrice * (cardPct / 100)).toFixed(2));
    const taxValue = parseFloat((suggestedPrice * (taxPct / 100)).toFixed(2));
    const netProfitValue = parseFloat((suggestedPrice * (targetNetMarginPct / 100)).toFixed(2));

    // Lucro Bruto (Preço - CPV)
    const grossProfitValue = parseFloat((suggestedPrice - cpvData.totalCPV).toFixed(2));
    const grossMarginPct = parseFloat(((grossProfitValue / suggestedPrice) * 100).toFixed(1));

    return {
      cpvData,
      divisor: divisor.toFixed(4),
      totalDeductionsPct: totalDeductionsPct.toFixed(2),
      suggestedPrice,
      fixedValue,
      cardValue,
      taxValue,
      netProfitValue,
      grossProfitValue,
      grossMarginPct
    };
  }

  // RENDERIZA A INTERFACE DO MÓDULO 3
  renderUI() {
    const cpv = this.calculateCPV(
      DTFState.imageEngine.customWidthCm,
      DTFState.imageEngine.customHeightCm
    );
    const pricing = this.calculatePricing(cpv);

    // Atualiza valores nas tabelas de custo
    const elDtfFraction = document.getElementById("costDtfFraction");
    const elBlank = document.getElementById("costBlankShirt");
    const elPack = document.getElementById("costPackaging");
    const elPress = document.getElementById("costPressEnergy");
    const elLabor = document.getElementById("costLabor");
    const elTotalCPV = document.getElementById("costTotalCPV");

    if (elDtfFraction) elDtfFraction.textContent = `R$ ${cpv.dtfFractionCost.toFixed(2)}`;
    if (elBlank) elBlank.textContent = `R$ ${cpv.blankShirt.toFixed(2)}`;
    if (elPack) elPack.textContent = `R$ ${cpv.packaging.toFixed(2)}`;
    if (elPress) elPress.textContent = `R$ ${cpv.pressEnergy.toFixed(2)}`;
    if (elLabor) elLabor.textContent = `R$ ${cpv.labor.toFixed(2)}`;
    if (elTotalCPV) elTotalCPV.textContent = `R$ ${cpv.totalCPV.toFixed(2)}`;

    // Atualiza Hero de Preço Sugerido e Markup
    const heroPrice = document.getElementById("suggestedSalePrice");
    const divisorDisplay = document.getElementById("markupDivisorDisplay");
    const netProfitDisplay = document.getElementById("netProfitDisplay");
    const grossMarginDisplay = document.getElementById("grossMarginDisplay");

    if (heroPrice) heroPrice.textContent = `R$ ${pricing.suggestedPrice.toFixed(2)}`;
    if (divisorDisplay) divisorDisplay.textContent = `${pricing.divisor} (Deduções: ${pricing.totalDeductionsPct}%)`;
    if (netProfitDisplay) netProfitDisplay.textContent = `R$ ${pricing.netProfitValue.toFixed(2)} (${DTFState.settings.targetNetMarginPct}%)`;
    if (grossMarginDisplay) grossMarginDisplay.textContent = `R$ ${pricing.grossProfitValue.toFixed(2)} (${pricing.grossMarginPct}%)`;

    // Métricas por cm²
    const cm2CostEl = document.getElementById("metricCm2Cost");
    if (cm2CostEl) cm2CostEl.textContent = `R$ ${this.getDtfCostPerCm2().toFixed(5)} / cm²`;
  }
}

window.CostCalculatorService = CostCalculatorService;
