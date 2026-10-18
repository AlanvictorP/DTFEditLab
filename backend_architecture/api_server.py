"""
LATITUDE DTF COCKPIT - API REST FASTAPI MULTI-TENANT
Servidor de microsserviços para tratamento gráfico, auto-nesting, AI Redraw e Terminal Copilot.
"""

import os
import sys

# Garante que o diretório backend_architecture esteja no sys.path mesmo ao executar do root
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from fastapi import FastAPI, Header, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import base64
import io
from PIL import Image

app = FastAPI(
    title="Latitude DTF Operational Cockpit - API Server",
    version="3.4.0",
    description="Backend Multi-Tenant de processamento de imagem, halftone industrial, auto-nesting e IA."
)

# CORS habilitado para integração fluida com o front-end
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RedrawRequest(BaseModel):
    image_data: str
    denoising_strength: Optional[float] = 0.35
    prompt_suffix: Optional[str] = "vector style, clean background, DTF printing"
    extra_instructions: Optional[str] = ""

class VectorizeRequest(BaseModel):
    image_data: str
    n_colors: Optional[int] = 12
    trap_px: Optional[float] = 1.5
    lineart_luma_thresh: Optional[float] = 38.0

class CopilotRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = ""
    active_image_id: Optional[str] = None
    image_data: Optional[str] = None
    conversation_history: Optional[List[Dict[str, Any]]] = None

@app.get("/health")
def health_check():
    """Endpoint de checagem de integridade consumido pelo frontend e monitor de status."""
    return {
        "status": "online",
        "service": "Latitude DTF Autonomous AI Agent & Vision Engine",
        "version": "4.0.0",
        "agent_tools_ready": True,
        "multi_tenant_ready": True
    }

@app.post("/api/v1/ai/redraw")
@app.post("/api/v1/ai/redraw_advanced")
async def ai_redraw_advanced(req: RedrawRequest, x_tenant_id: Optional[str] = Header(None)):
    """
    Botão 'Redesenho IA': Executa o pipeline generativo em duas etapas:
    1. Etapa A: GPT-4o Vision extrai estilo, paleta, assunto e efeitos.
    2. Etapa B: Preenchimento do template serigráfico profissional para silk/DTF.
    3. Etapa C: Geração em altíssima definição (Flux.1 / DALL-E 3).
    """
    try:
        from ai_agent_pipeline import DTFAgentCopilot
        result = await DTFAgentCopilot.execute_redesenhar_tool(
            image_url=req.image_data,
            extra_instructions=req.extra_instructions or ""
        )

        return {
            "success": True,
            "imageUrl": result["imageUrl"],
            "vision_data": result.get("vision"),
            "prompt": result.get("prompt"),
            "engine": result.get("engine"),
            "tenant_id": x_tenant_id or "default"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/ai/copilot")
async def ai_copilot(req: CopilotRequest, x_tenant_id: Optional[str] = Header(None)):
    """
    Copilot DTF com Tool Calling Autônomo:
    - Se a mensagem for técnica/consultiva: responde naturalmente em Markdown sem forçar ferramentas.
    - Se a mensagem pedir manipulação/redesenho: aciona a tool 'redesenhar_estampa_avancado' e retorna o resultado.
    """
    try:
        from ai_agent_pipeline import DTFAgentCopilot
        agent_res = await DTFAgentCopilot.process_user_turn(
            user_prompt=req.prompt,
            active_image_url=req.image_data,
            conversation_history=req.conversation_history
        )

        return {
            "success": True,
            "message": agent_res["message"],
            "tool_called": agent_res.get("tool_called"),
            "imageUrl": agent_res.get("imageUrl"),
            "vision_data": agent_res.get("vision_data"),
            "generated_prompt": agent_res.get("generated_prompt"),
            "tenant_id": x_tenant_id or "default"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/vectorize")
async def vectorize_dtf(req: VectorizeRequest, x_tenant_id: Optional[str] = Header(None)):
    """
    Endpoint profissional de vetorização para vestuário DTF:
    Executa o pipeline 'Outline & Layered Trapping' com separação semântica,
    dilatação morfológica sob o lineart e ordenação hierárquica de Z-Index.
    """
    try:
        header, b64data = req.image_data.split(",", 1) if "," in req.image_data else ("", req.image_data)
        img_bytes = base64.b64decode(b64data)
        pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")

        from image_pipeline import DTFGraphicPipeline
        result = DTFGraphicPipeline.vectorize_outline_trapping(
            image=pil_img,
            n_colors=req.n_colors or 12,
            trap_px=req.trap_px or 1.5,
            lineart_luma_thresh=req.lineart_luma_thresh or 38.0
        )

        return {
            "success": True,
            "svg": result["svg"],
            "width": result["width"],
            "height": result["height"],
            "trap_px": result["trap_px"],
            "layers_count": result["layers_count"],
            "palette_count": result["palette_count"],
            "tenant_id": x_tenant_id or "default"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

