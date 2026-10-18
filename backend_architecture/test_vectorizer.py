"""
Test script to validate the Outline & Layered Trapping Vectorizer in Python.
"""
import os
import cv2
import numpy as np
from PIL import Image
from vectorizer_trapping import DTFOutlineTrappingVectorizer, vectorize_dtf_with_trapping

def create_synthetic_dtf_test_graphic(width=600, height=600):
    """
    Creates a realistic streetwear/apparel graphic with:
    - Black lineart outline
    - Base fills (red, yellow)
    - Shadows & highlights
    - Transparent background
    """
    img = np.zeros((height, width, 4), dtype=np.uint8)
    
    # 1. Base shape: Red shield / skull base
    cv2.circle(img, (300, 300), 200, (230, 45, 45, 255), -1)
    
    # 2. Base yellow crest
    pts_yellow = np.array([[200, 220], [400, 220], [350, 360], [250, 360]], np.int32)
    cv2.fillPoly(img, [pts_yellow], (245, 210, 20, 255))
    
    # 3. Shadows (darker red / maroon shadow on lower half of circle)
    pts_shadow = np.array([[120, 330], [480, 330], [440, 440], [160, 440]], np.int32)
    cv2.fillPoly(img, [pts_shadow], (130, 20, 25, 255))
    
    # 4. Highlight (white/cream gloss)
    pts_hl = np.array([[250, 140], [350, 140], [330, 170], [270, 170]], np.int32)
    cv2.fillPoly(img, [pts_hl], (250, 250, 240, 255))
    
    # 5. Crisp Black Lineart / Contornos (outer border, internal dividers, eyes)
    # Outer border
    cv2.circle(img, (300, 300), 200, (15, 15, 18, 255), 14)
    # Dividers
    cv2.polylines(img, [pts_yellow], isClosed=True, color=(15, 15, 18, 255), thickness=10)
    # Cutout eye holes
    cv2.circle(img, (240, 280), 28, (15, 15, 18, 255), -1)
    cv2.circle(img, (360, 280), 28, (15, 15, 18, 255), -1)
    # Center divider
    cv2.line(img, (300, 100), (300, 490), (15, 15, 18, 255), 8)
    
    return img

def run_validation():
    print("=== TESTANDO VETORIZADOR DTF COM OUTLINE & LAYERED TRAPPING ===")
    img_arr = create_synthetic_dtf_test_graphic(600, 600)
    pil_img = Image.fromarray(img_arr)
    
    out_svg_path = "scratch/vectorized_trapped.svg"
    res = vectorize_dtf_with_trapping(
        pil_img,
        output_svg_path=out_svg_path,
        n_colors=8,
        trap_px=2.0
    )
    
    print("Vetorização concluída!")
    print(f"Sucesso: {res['success']}")
    print(f"Dimensões: {res['width']}x{res['height']}")
    print(f"Raio de Trapping: {res['trap_px']}px")
    print(f"Cores identificadas: {res['palette_count']}")
    print(f"Distribuição de camadas: {res['layers_count']}")
    print(f"Arquivo gerado: {out_svg_path} ({os.path.getsize(out_svg_path)} bytes)")
    
    # Verificação de conformidade do SVG
    with open(out_svg_path, "r", encoding="utf-8") as f:
        svg_content = f.read()
        
    assert 'id="layer_0_base_fills"' in svg_content, "Camada Z-0 (Base Fills) ausente!"
    assert 'id="layer_1_shadows_highlights"' in svg_content, "Camada Z-1 (Shadows) ausente!"
    assert 'id="layer_2_lineart"' in svg_content, "Camada Z-2 (Lineart) ausente!"
    assert 'stroke-linejoin="round"' in svg_content, "stroke-linejoin round ausente!"
    assert 'stroke-linecap="round"' in svg_content, "stroke-linecap round ausente!"
    assert 'fill-rule="evenodd"' in svg_content, "fill-rule evenodd ausente!"
    
    # Valida ordem de Z-index no arquivo
    idx_0 = svg_content.index('id="layer_0_base_fills"')
    idx_1 = svg_content.index('id="layer_1_shadows_highlights"')
    idx_2 = svg_content.index('id="layer_2_lineart"')
    assert idx_0 < idx_1 < idx_2, "Ordem de Z-Index incorreta! Deve ser Z-0 -> Z-1 -> Z-2"
    print("Ordem de Z-Index validada com perfeição: Z-0 (Base) -> Z-1 (Sombras) -> Z-2 (Lineart)")

if __name__ == "__main__":
    run_validation()
