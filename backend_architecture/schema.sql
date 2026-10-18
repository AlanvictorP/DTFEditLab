-- ============================================================================
-- COCKPIT OPERACIONAL LATITUDE DTF - SCHEMA DE BANCO DE DADOS (POSTGRESQL 16)
-- ARQUITETURA MULTI-TENANT ROBUSTA (Campos tenant_id e Isolamento B2B)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. TABELA DE TENANTS (MULTI-TENANT SAAS / ESTAMPARIAS & GRÁFICAS)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(60) UNIQUE NOT NULL,            -- ex: 'latitude-matriz', 'estampa-express'
    legal_name VARCHAR(200) NOT NULL,
    trade_name VARCHAR(150) NOT NULL,
    cnpj VARCHAR(20),
    plan VARCHAR(40) DEFAULT 'pro_production',   -- 'starter', 'pro_production', 'enterprise'
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- 1. TABELA DE ATIVOS GRÁFICOS (Engine de Imagem Ultra-DPI)
CREATE TABLE graphic_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_url TEXT NOT NULL,
    processed_url TEXT,
    vector_svg_url TEXT,
    original_width_px INT NOT NULL,
    original_height_px INT NOT NULL,
    dpi INT DEFAULT 600,
    has_background_removed BOOLEAN DEFAULT FALSE,
    has_black_knockout BOOLEAN DEFAULT FALSE,
    knockout_threshold INT DEFAULT 28,
    has_halftone BOOLEAN DEFAULT FALSE,
    halftone_lpi INT DEFAULT 45,
    halftone_angle INT DEFAULT 45,
    bounding_box_cm_width NUMERIC(6, 2) NOT NULL,
    bounding_box_cm_height NUMERIC(6, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_graphic_assets_tenant ON graphic_assets(tenant_id);

-- 2. TABELA DE PEDIDOS
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(30),
    status VARCHAR(50) DEFAULT 'aguardando_rolo', -- 'aguardando_rolo', 'recorte', 'prensagem', 'enviado'
    target_delivery_date DATE,
    shipping_tracking_code VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_tenant_order_number UNIQUE(tenant_id, order_number)
);

CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_status ON orders(tenant_id, status);

-- 3. ITENS DO PEDIDO (Estampas vinculadas às peças)
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    graphic_asset_id UUID REFERENCES graphic_assets(id),
    size_label VARCHAR(10) NOT NULL, -- 'P', 'M', 'G', 'GG', 'Peito', 'Manga'
    shirt_color VARCHAR(50) NOT NULL DEFAULT 'Preta',
    fabric_type VARCHAR(50) NOT NULL DEFAULT 'Algodão 30.1',
    print_width_cm NUMERIC(6, 2) NOT NULL,
    print_height_cm NUMERIC(6, 2) NOT NULL,
    print_placement VARCHAR(50) DEFAULT 'Frente Central',
    collar_offset_cm NUMERIC(4, 1) DEFAULT 7.5,
    allocated_to_roll BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_order_items_tenant ON order_items(tenant_id);

-- 4. ROLOS DE GANG SHEET (Boca da Plotter configurável, ex: 58cm, 60cm, 70cm, 120cm)
CREATE TABLE gang_rolls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    roll_code VARCHAR(50) NOT NULL, -- Ex: 'ROLO-2026-10-A'
    roll_width_cm NUMERIC(6, 2) DEFAULT 58.00,
    total_length_cm NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    linear_cost_per_meter NUMERIC(10, 2) NOT NULL DEFAULT 60.00,
    total_roll_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    utilization_rate_pct NUMERIC(5, 2) DEFAULT 0.00,
    safety_margin_cm NUMERIC(4, 2) DEFAULT 0.30,
    status VARCHAR(50) DEFAULT 'em_montagem', -- 'em_montagem', 'enviado_grafica', 'recebido', 'concluido'
    export_highres_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_tenant_roll_code UNIQUE(tenant_id, roll_code)
);

CREATE INDEX idx_gang_rolls_tenant ON gang_rolls(tenant_id);

-- 5. POSICIONAMENTO DOS ITENS NO ROLO (Interactive Table / Bounding Box 2D Placements)
CREATE TABLE roll_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    gang_roll_id UUID REFERENCES gang_rolls(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    is_filler BOOLEAN DEFAULT FALSE,
    filler_description VARCHAR(100),
    pos_x_cm NUMERIC(6, 2) NOT NULL,
    pos_y_cm NUMERIC(6, 2) NOT NULL,
    width_cm NUMERIC(6, 2) NOT NULL,
    height_cm NUMERIC(6, 2) NOT NULL,
    rotation_deg INT DEFAULT 0, -- 0, 90, 180, 270
    cut_tag_text VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_roll_items_tenant ON roll_items(tenant_id);
CREATE INDEX idx_roll_items_roll ON roll_items(gang_roll_id);

-- 6. RECEITAS TÉCNICAS DE PRENSAGEM
CREATE TABLE press_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fabric_type VARCHAR(50) NOT NULL,
    recommended_temp_c INT NOT NULL, -- Ex: 160
    initial_press_sec INT NOT NULL,  -- Ex: 15
    post_press_sec INT NOT NULL,     -- Ex: 5
    pressure_rating VARCHAR(30) DEFAULT 'Média-Alta (4-5 bar)',
    peel_type VARCHAR(30) NOT NULL DEFAULT 'Cold Peel',
    notes TEXT,
    CONSTRAINT uq_tenant_fabric UNIQUE(tenant_id, fabric_type)
);

CREATE INDEX idx_press_recipes_tenant ON press_recipes(tenant_id);

-- 7. PARÂMETROS GLOBAIS DE CUSTO & MARKUP DIVISOR (Metro Linear & Custo por CM²)
CREATE TABLE cost_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    dtf_linear_meter_cost NUMERIC(10, 2) DEFAULT 60.00,
    roll_width_cm NUMERIC(6, 2) DEFAULT 58.00,
    blank_shirt_cost NUMERIC(10, 2) DEFAULT 22.50,
    packaging_unit_cost NUMERIC(10, 2) DEFAULT 2.80,
    press_kwh_cost NUMERIC(10, 2) DEFAULT 0.95,
    press_power_kw NUMERIC(4, 2) DEFAULT 2.2,
    press_cycles_per_hour INT DEFAULT 35,
    fixed_expenses_pct NUMERIC(5, 2) DEFAULT 12.00,
    card_gateway_tax_pct NUMERIC(5, 2) DEFAULT 4.99,
    business_tax_pct NUMERIC(5, 2) DEFAULT 6.00,
    target_net_profit_pct NUMERIC(5, 2) DEFAULT 28.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. CAMPANHAS DE MARKETING E MOCKUPS IA (Displacement Map & Copywriting)
CREATE TABLE marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id),
    mockup_format VARCHAR(20) NOT NULL, -- '1:1' ou '9:16'
    template_name VARCHAR(100) NOT NULL,
    rendered_image_url TEXT NOT NULL,
    ai_video_status VARCHAR(50) DEFAULT 'pronto',
    ai_video_url TEXT,
    caption_scarcity TEXT,
    caption_benefit TEXT,
    caption_storytelling TEXT,
    hashtags TEXT,
    scheduled_for TIMESTAMP WITH TIME ZONE,
    published_status VARCHAR(50) DEFAULT 'rascunho'
);

CREATE INDEX idx_marketing_tenant ON marketing_campaigns(tenant_id);

-- SEED MULTI-TENANT INICIAL (LATITUDE MATRIZ)
INSERT INTO tenants (id, slug, legal_name, trade_name, cnpj, plan)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'latitude-matriz',
    'Latitude Confecções e Estamparia Digital LTDA',
    'Latitude DTF Studio',
    '12.345.678/0001-90',
    'pro_production'
);

-- SEED DE RECEITAS DE PRENSAGEM PARA O TENANT PADRÃO
INSERT INTO press_recipes (tenant_id, fabric_type, recommended_temp_c, initial_press_sec, post_press_sec, pressure_rating, peel_type, notes)
VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '100% Algodão Penteado 30.1', 160, 15, 5, 'Média-Alta (4-5 bar)', 'Cold Peel', 'Aguardar resfriamento total para pelagem limpa. Segundo ciclo com papel teflon para toque mate.'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Poliéster / Dry-Fit', 145, 12, 4, 'Média (3 bar)', 'Cold Peel', 'Temperatura reduzida para evitar queima ou brilho no tecido sintético.'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Moletom 3 Cabos / Felpado', 165, 18, 5, 'Alta (5-6 bar)', 'Cold Peel', 'Pré-prensagem de 6s para eliminar umidade da fibra grossa.');

-- SEED DE CUSTOS PARA O TENANT PADRÃO (R$ 60,00 / metro de 58cm = R$ 0,01034 / cm²)
INSERT INTO cost_settings (tenant_id, dtf_linear_meter_cost, roll_width_cm, blank_shirt_cost)
VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 60.00, 58.00, 22.50);
