# ARQUITETURA TÉCNICA DO COCKPIT OPERACIONAL DTF
## SaaS B2B Fechado - Marca de Camisetas Sob Demanda (Impressão Terceirizada)

---

### 1. VISÃO GERAL DA ARQUITETURA

O sistema foi desenhado para desacoplar a interface operacional de alta responsividade (Frontend Cockpit) do pipeline pesado de renderização gráfica vetorial/raster em 300 DPI (Backend Image Engine), garantindo máxima eficiência de custos e escalabilidade.

```
+-----------------------------------------------------------------------------------+
|                           FRONTEND COCKPIT (B2B SaaS)                             |
|  - Next.js 14 (App Router) / Vanilla SPA Workstation                              |
|  - Canvas 2D / WebGL Hardware-Accelerated Viewport (Rolo 58cm & Gabarito)         |
|  - Design System Dark Mode (Adobe CC / Figma Style)                               |
|  - Web Workers para Pré-Cálculo de Nesting & Preview Client-side                  |
+----------------------------------------+------------------------------------------+
                                         | REST / WebSocket API
                                         v
+-----------------------------------------------------------------------------------+
|                             API GATEWAY / ORCHESTRATOR                            |
|  - FastAPI (Python 3.11) assíncrono com Uvicorn                                    |
|  - Autenticação JWT B2B, RBAC (Operador Prensa, Designer, Gerente)                |
|  - Validação Pydantic v2 & Rate Limiting                                          |
+-------------------+--------------------+--------------------+---------------------+
                    |                    |                    |
                    v                    v                    v
+-----------------------+ +-----------------------+ +-----------------------+
|  REDIS (Fila Celery)  | | POSTGRESQL 16 (Dados) | | S3 / MINIO (Storage)  |
|  - Fila de Imagem     | | - Pedidos e Itens     | | - Artes originais     |
|  - Fila de Export 300D| | - Metadados de Rolo   | | - TIFF/PNG de 300 DPI |
|  - Cache de Nesting   | | - Fichas de Prensa    | | - Mockups e Vídeos    |
+-----------+-----------+ +-----------------------+ +-----------------------+
            |
            v
+-----------------------------------------------------------------------------------+
|                         CELERY IMAGE PROCESSING WORKERS                           |
|  - Libvips / Pillow-SIMD: Renderização ultra-rápida de arquivos gigantes (58x200cm)|
|  - Rembg (ONNX Runtime / U2Net): Remoção de fundo em GPU/CPU otimizada            |
|  - OpenCV & NumPy: Algoritmo de Black Knockout e Dithered Halftone               |
|  - Rectpack: Algoritmo Guillotine 2D Bin Packing com margens de corte de 1cm      |
|  - Image-to-Video: Conectores para APIs externas (Kling AI, Runway Gen-3)         |
+-----------------------------------------------------------------------------------+
```

---

### 2. ESCOLHA DE STACK E JUSTIFICATIVAS TÉCNICAS

1. **Frontend (Next.js 14 + Canvas 2D / Web Workers)**:
   - *Por quê*: Permite renderizar em tempo real um rolo de gang sheet que pode atingir 5 metros lineares sem travar a thread principal da UI. Os cálculos de 2D packing e pré-visualização de knockout rodam em Web Workers.
   - *UX Adobe/Figma*: Visual escuro de precisão com réguas milimétricas/centimétricas, zoom/pan suave e feedback visual imediato.

2. **Backend Engine (Python 3.11 + FastAPI + Libvips + OpenCV + NumPy)**:
   - *Por quê*: Node.js consome memória excessiva ao manipular buffers rasterizados de 300 DPI (um rolo de 58cm x 200cm a 300 DPI gera um bitmap de ~6850 x 23622 pixels, mais de 600 MB descompactado em RAM). Libvips e NumPy processam isso por streaming de chunks de memória com altíssima performance.
   - *Rembg + ONNX Runtime*: Remoção de fundo local sem custo recorrente de API paga por estampa.

3. **Fila Assíncrona (Celery + Redis)**:
   - *Por quê*: A exportação final de um arquivo TIFF/PNG de 300 DPI para a gráfica leva entre 3 e 15 segundos. Isso não pode bloquear requisições HTTP da API. O operador submete a montagem e é notificado via WebSocket quando o link de download direto estiver pronto.

4. **Banco de Dados (PostgreSQL 16 Multi-Tenant)**:
   - Arquitetura Multi-Tenant isolada por `tenant_id` em todas as tabelas transacionais (`graphic_assets`, `orders`, `gang_rolls`, `cost_settings`, `press_recipes`), com índices dedicados e suporte B2B SaaS para múltiplas estamparias e gráficas terceirizadas.

---

### 3. MODELO DE DADOS RELACIONAL (POSTGRESQL MULTI-TENANT)

```sql
-- Principais Tabelas:
0. tenants (estamparias/marcas clientes no modelo SaaS Multi-Tenant)
1. orders (pedidos vinculados ao tenant_id)
2. graphic_assets (artes originais e tratadas com metadados até 2400 DPI)
3. order_items (itens de estampa com dimensão em cm, cor da camisa e receita de prensa)
4. gang_rolls (rolos de impressão terceirizada com boca da plotter configurável)
5. roll_items (posicionamento livre X, Y, rotação 90° e bounding box 2D anti-colisão)
6. press_recipes (parâmetros de prensagem por tecido com isolamento por tenant)
7. cost_settings (parâmetros de metro linear, custo por cm² e markup divisor)
8. marketing_campaigns (mockups com displacement map e cronograma de postagens)
```

---

### 4. PIPELINE DO NOVO MOTOR GRÁFICO & MESA INTERATIVA

1. **Tratamento Gráfico Separado (Anime vs. Knockout)**:
   - *Apenas Remover Fundo*: Remove o background (Rembg/IA) mantendo 100% dos traços pretos e cores sólidas intactos, garantindo cobertura total de tinta branca por baixo para estampas de Anime/Mangá.
   - *Knockout para Camisa Preta*: Zera o canal preto com rampa de suavização para que a malha preta substitua a tinta, dando toque zero e economizando tinta.

2. **Restauração IA & Vetorização**:
   - *Vetorizar (SVG)*: Extração algorítmica de curvas de contorno (paths escaláveis sem perda de resolução).
   - *Redesenho IA (AI Redraw)*: Modelo img2img (denoise 0.3-0.4) para reconstruir linhas borradas e eliminar pixelização.
   - *Terminal Copilot IA*: Injeção automática de prompts ocultos calibrados para DTF (`vector style, t-shirt design, clean background, solid colors, DTF printing`).

3. **Novo Motor Halftone Profissional (Fiel ao Photoshop)**:
   - Isolação de luminosidade/transparência em espaço Lab.
   - Aplicação de retícula AM em micropontos circulares apenas em gradientes e sombras, mantendo cores sólidas e contornos 100% nítidos.
   - Controles limpos de Frequência (LPI) e Ângulo com preview instantâneo.

4. **Mesa de Montagem Interativa (Gang Sheet)**:
   - Boca da plotter configurável (30cm, 42cm, 58cm, 60cm, 70cm, 120cm) com altura dinâmica que expande conforme as artes são alocadas.
   - Drag & Drop com Detecção de Colisão 2D Bounding Box (AABB): uma estampa nunca pode ser solta em cima de outra.
   - Rotação livre em passos de 90° com reposicionamento automático no melhor espaço livre.
   - Guias de corte ultrafinas (0.75px) com interruptor global (Exibir/Ocultar Guias de Corte) para aproveitamento máximo do filme.

