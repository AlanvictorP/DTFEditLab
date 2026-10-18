"""
LATITUDE DTF COCKPIT - ENGINE DE PROCESSAMENTO DE IMAGEM & GANG SHEET (PYTHON / FASTAPI / OPENCV)
Implementação de referência para os microsserviços de pré-impressão e auto-nesting.
"""

import io
import math
from typing import List, Dict, Any, Tuple
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import cv2

# ==============================================================================
# 1. TRATAMENTO GRÁFICO (ENGINE DE PRÉ-IMPRESSÃO)
# ==============================================================================

class ImageEngineService:
    DPI = 300
    INCH_TO_CM = 2.54

    @classmethod
    def cm_to_px(cls, cm: float) -> int:
        """Converte dimensão física em centímetros para pixels a 300 DPI reais."""
        return int(round((cm / cls.INCH_TO_CM) * cls.DPI))

    @classmethod
    def px_to_cm(cls, px: int) -> float:
        """Converte pixels a 300 DPI para centímetros físicos."""
        return round((px / cls.DPI) * cls.INCH_TO_CM, 2)

    @classmethod
    def apply_black_knockout(cls, pil_image: Image.Image, threshold: int = 25, feather: int = 15) -> Image.Image:
        """
        Zera o canal preto da estampa quando a camiseta alvo for preta.
        Economiza tinta branca e deixa a estampa com toque zero/suave.
        """
        img_rgba = pil_image.convert("RGBA")
        arr = np.array(img_rgba)
        
        r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
        
        # Cálculo de Luminância Relativa padrão ITU-R BT.601
        luminance = 0.299 * r + 0.587 * g + 0.114 * b
        
        # Máscara de eliminação suave do preto
        # Pixels abaixo do threshold viram transparentes
        alpha_factor = np.clip((luminance - threshold) / max(feather, 1), 0.0, 1.0)
        
        new_alpha = (a.astype(float) * alpha_factor).astype(np.uint8)
        arr[:, :, 3] = new_alpha
        
        return Image.fromarray(arr, mode="RGBA")

    @classmethod
    def apply_halftone_dot_matrix(cls, pil_image: Image.Image, dot_size: int = 6, angle: float = 45.0) -> Image.Image:
        """
        Converte degradês e sombras em micropontos (Halftone / Meio-Tom DTF),
        evitando faixas duras no filme e proporcionando toque agradável.
        """
        # Converte para escala de cinza para medir intensidade de meio-tom
        gray = pil_image.convert("L")
        orig_rgba = pil_image.convert("RGBA")
        
        w, h = pil_image.size
        # Canvas de saída
        halftone_canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(halftone_canvas)
        
        gray_arr = np.array(gray)
        orig_arr = np.array(orig_rgba)
        
        step = dot_size
        for y in range(0, h, step):
            for x in range(0, w, step):
                # Região do ponto
                box_y = min(y + step // 2, h - 1)
                box_x = min(x + step // 2, w - 1)
                
                alpha_sample = orig_arr[box_y, box_x, 3]
                if alpha_sample < 20:
                    continue  # Já transparente
                
                luma = gray_arr[box_y, box_x]
                # Raio do ponto proporcional à intensidade da cor
                radius = int((1.0 - (luma / 255.0)) * (step / 2.0))
                
                if radius > 0:
                    color = tuple(orig_arr[box_y, box_x])
                    draw.ellipse(
                        [x + step // 2 - radius, y + step // 2 - radius,
                         x + step // 2 + radius, y + step // 2 + radius],
                        fill=color
                    )
                    
        return halftone_canvas

# ==============================================================================
# 2. MONTADOR DE ROLO (2D BIN PACKING / AUTO GANG SHEET)
# ==============================================================================

class GangSheetService:
    ROLL_WIDTH_CM = 58.0
    SAFETY_MARGIN_CM = 1.0  # 1 cm de margem obrigatória entre estampas

    @classmethod
    def calculate_pack(cls, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Algoritmo Guillotine 2D Bin Packing com ordenação Best-Fit Decreasing.
        Respeita margem de 1cm de corte e calcula o comprimento total do rolo terceirizado.
        """
        # Ordena itens por altura decrescente
        sorted_items = sorted(items, key=lambda x: (x["height_cm"], x["width_cm"]), reverse=True)
        
        current_x = cls.SAFETY_MARGIN_CM
        current_y = cls.SAFETY_MARGIN_CM
        line_height = 0.0
        
        placements = []
        
        for item in sorted_items:
            w = item["width_cm"]
            h = item["height_cm"]
            
            # Testa se cabe na linha horizontal atual (58 cm)
            if (current_x + w + cls.SAFETY_MARGIN_CM) > cls.ROLL_WIDTH_CM:
                # Quebra para próxima linha
                current_x = cls.SAFETY_MARGIN_CM
                current_y += line_height + cls.SAFETY_MARGIN_CM
                line_height = 0.0
                
            placements.append({
                "id": item["id"],
                "order_number": item.get("order_number", "AVULSO"),
                "size_label": item.get("size_label", "M"),
                "shirt_color": item.get("shirt_color", "Preta"),
                "x_cm": round(current_x, 2),
                "y_cm": round(current_y, 2),
                "width_cm": w,
                "height_cm": h,
                "cut_mark_label": f"#{item.get('order_number', '101')} - Tam {item.get('size_label', 'M')} - {item.get('shirt_color', 'Preta')}"
            })
            
            current_x += w + cls.SAFETY_MARGIN_CM
            if h > line_height:
                line_height = h
                
        total_length_cm = round(current_y + line_height + cls.SAFETY_MARGIN_CM, 2)
        total_roll_area_cm2 = cls.ROLL_WIDTH_CM * total_length_cm
        printed_area_cm2 = sum(item["width_cm"] * item["height_cm"] for item in sorted_items)
        utilization_rate = round((printed_area_cm2 / max(total_roll_area_cm2, 1.0)) * 100, 1)
        
        return {
            "roll_width_cm": cls.ROLL_WIDTH_CM,
            "total_length_cm": total_length_cm,
            "utilization_rate_pct": utilization_rate,
            "placements": placements
        }
