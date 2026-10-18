"""
LATITUDE DTF COCKPIT - VETORIZADOR PROFISSIONAL COM OUTLINE & LAYERED TRAPPING
Pipeline morfológico para estampas têxteis e vestuário DTF (Direct to Film).

Fluxo rigoroso de 4 fases:
1. SEPARAÇÃO SEMÂNTICA (Color Quantization & Layering via K-Means / CIE-Lab)
   - [Z-0] Base Fills (Cores de preenchimento sólidas)
   - [Z-1] Shadows & Highlights (Sombras, meios-tons e brilhos)
   - [Z-2] Lineart (Contornos pretos e linhas de fechamento)
2. APLICAÇÃO DE TRAPPING (Sobreposição / Bleed Morfológico)
   - Dilatação morfológica (1 a 2px) sob a camada de Lineart
   - Sangria controlada para eliminar gaps brancos na impressão DTF
3. PRIORIDADE DE RENDERIZAÇÃO (Z-Index / Layer Order em SVG)
   - Montagem hierárquica Z-0 -> Z-1 -> Z-2
4. TRATAMENTO DE BORDAS & EXPANSÃO DE TRAÇOS (Bézier Smoothing & Solid Fills)
   - Eliminação de bicos pontiagudos (stroke-linejoin="round", stroke-linecap="round")
   - Conversão integral de contornos em caminhos de preenchimento sólido (fill-rule="evenodd")
"""

import os
import math
import numpy as np
import cv2
import svgwrite
from PIL import Image
from typing import List, Dict, Tuple, Optional, Any


class DTFOutlineTrappingVectorizer:
    """
    Engine de Vetorização de Alta Fidelidade com Trapping Morfológico para DTF.
    Substitui vetorizadores genéricos ingênuos por um pipeline que emula o fluxo
    de separação de cores e trapping de um designer profissional de serigrafia/DTF.
    """

    def __init__(
        self,
        n_colors: int = 12,
        trap_px: float = 1.5,
        lineart_luma_thresh: float = 38.0,
        curve_smoothness: float = 0.28,
        corner_threshold_deg: float = 75.0,
        min_area_px: int = 6,
        simplify_epsilon_factor: float = 0.0016
    ):
        """
        :param n_colors: Quantidade de centros de cor para quantização K-Means.
        :param trap_px: Raio em pixels do bleed / trapping sob o lineart (1.0 a 2.5px).
        :param lineart_luma_thresh: Limiar de luminosidade Lab (0-100) para classificar Lineart.
        :param curve_smoothness: Fator de curvatura Bézier (0.1 a 0.4).
        :param corner_threshold_deg: Ângulo mínimo para preservar cantos pontiagudos intencionais.
        :param min_area_px: Área mínima em pixels para descartar ruído isolado.
        :param simplify_epsilon_factor: Fator de simplificação Douglas-Peucker relativo ao perímetro.
        """
        self.n_colors = max(3, n_colors)
        self.trap_px = max(0.5, trap_px)
        self.lineart_luma_thresh = lineart_luma_thresh
        self.curve_smoothness = curve_smoothness
        self.corner_threshold_deg = corner_threshold_deg
        self.min_area_px = min_area_px
        self.simplify_epsilon_factor = simplify_epsilon_factor

    # =========================================================================
    # FASE 1: SEPARAÇÃO SEMÂNTICA (Color Quantization & Layering)
    # =========================================================================

    def quantize_and_segment(
        self,
        img_rgba: np.ndarray
    ) -> Dict[str, Any]:
        """
        Segmenta a imagem em espaço CIE-Lab e agrupa os clusters nas 3 camadas lógicas:
        - Lineart (Z-2)
        - Shadows & Highlights (Z-1)
        - Base Colors (Z-0)
        """
        h, w = img_rgba.shape[:2]
        alpha = img_rgba[:, :, 3]
        fg_mask = alpha > 40

        if not np.any(fg_mask):
            return {
                "layers": {"base": [], "shadows": [], "lineart": []},
                "lineart_mask": np.zeros((h, w), dtype=np.uint8),
                "fg_mask": fg_mask,
                "palette": []
            }

        fg_rgb = img_rgba[fg_mask, :3].reshape(-1, 3)
        if len(fg_rgb) < 3:
            return {
                "layers": {"base": [], "shadows": [], "lineart": []},
                "lineart_mask": np.zeros((h, w), dtype=np.uint8),
                "fg_mask": fg_mask.astype(np.uint8) * 255,
                "palette": []
            }
        
        # Converte para espaço perceptual Lab para clustering fisiologicamente uniforme
        fg_lab = cv2.cvtColor(fg_rgb.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)

        # K-Means clustering com K-Means++
        k = min(self.n_colors, len(fg_rgb))
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.1)
        compactness, labels, centers_lab = cv2.kmeans(
            fg_lab, k, None, criteria, 5, cv2.KMEANS_PP_CENTERS
        )

        centers_lab = centers_lab.reshape(-1, 1, 3).astype(np.uint8)
        centers_rgb = cv2.cvtColor(centers_lab, cv2.COLOR_LAB2RGB).reshape(-1, 3)

        # Mapa de labels para toda a imagem (-1 para fundo transparente)
        label_map = np.full((h, w), -1, dtype=np.int32)
        label_map[fg_mask] = labels.flatten()

        # Classificação dos clusters
        clusters = []
        for i in range(k):
            mask_i = (label_map == i).astype(np.uint8) * 255
            pixel_count = int(np.sum(mask_i > 0))
            if pixel_count < self.min_area_px:
                continue

            r, g, b = int(centers_rgb[i][0]), int(centers_rgb[i][1]), int(centers_rgb[i][2])
            hex_color = f"#{r:02x}{g:02x}{b:02x}"
            
            # Medição de luminosidade perceptiva e L* do Lab
            l_lab = float(centers_lab[i][0][0]) * (100.0 / 255.0)  # 0 a 100
            luma_srgb = 0.299 * r + 0.587 * g + 0.114 * b

            clusters.append({
                "id": i,
                "rgb": (r, g, b),
                "hex": hex_color,
                "l_lab": l_lab,
                "luma": luma_srgb,
                "count": pixel_count,
                "mask": mask_i
            })

        if not clusters:
            return {
                "layers": {"base": [], "shadows": [], "lineart": []},
                "lineart_mask": np.zeros((h, w), dtype=np.uint8),
                "fg_mask": fg_mask,
                "palette": []
            }

        # Identificação da camada de Lineart:
        # Pega os tons mais escuros (L* < lineart_luma_thresh).
        # Se nenhum cluster for tão escuro, elege o mais escuro como contorno.
        clusters.sort(key=lambda c: c["l_lab"])
        
        lineart_clusters = []
        other_clusters = []

        for c in clusters:
            if c["l_lab"] <= self.lineart_luma_thresh or c["luma"] < 45.0:
                lineart_clusters.append(c)
            else:
                other_clusters.append(c)

        # Garante que sempre exista pelo menos uma camada de contorno/topo
        if not lineart_clusters and clusters:
            lineart_clusters.append(clusters[0])
            other_clusters = clusters[1:]

        # Constrói a máscara unificada de Lineart
        lineart_mask = np.zeros((h, w), dtype=np.uint8)
        for lc in lineart_clusters:
            lineart_mask = cv2.bitwise_or(lineart_mask, lc["mask"])

        # Separa os demais clusters entre Base e Sombras/Brilhos
        # Sombras: tons escuros intermediários (L* < 58) ou brilhos intensos de realce (L* > 92)
        # Base: cores médias dominantes da ilustração
        shadows_clusters = []
        base_clusters = []

        for c in other_clusters:
            if c["l_lab"] < 58.0 or c["l_lab"] > 92.0:
                shadows_clusters.append(c)
            else:
                base_clusters.append(c)

        # Se todos ficaram em uma só categoria, equilibra
        if not base_clusters and shadows_clusters:
            base_clusters = shadows_clusters
            shadows_clusters = []

        return {
            "layers": {
                "base": base_clusters,
                "shadows": shadows_clusters,
                "lineart": lineart_clusters
            },
            "lineart_mask": lineart_mask,
            "fg_mask": fg_mask.astype(np.uint8) * 255,
            "palette": clusters
        }

    # =========================================================================
    # FASE 2: APLICAÇÃO DE TRAPPING (Sobreposição / Bleed Morfológico)
    # =========================================================================

    def apply_trapping(
        self,
        segmentation: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Aplica sangria morfológica (Morphological Dilation) nas camadas Base e Sombras.
        As cores sólidas 'sangram' 1 a 2px exatamente para baixo do contorno Lineart,
        eliminando frestas brancas causadas por imperfeições mecânicas da impressora DTF.
        """
        lineart_mask = segmentation["lineart_mask"]
        fg_mask = segmentation["fg_mask"]

        # Cria elemento estruturante elíptico para dilatação perfeitamente isotrópica
        k_radius = max(1, int(round(self.trap_px)))
        k_size = 2 * k_radius + 1
        trap_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))

        # Kernel menor de 1px para bleed entre Base e Sombra
        small_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

        trapped_layers = {
            "base": [],
            "shadows": [],
            "lineart": []
        }

        # 1. Trapping na Camada de Cores Base (Z-0)
        # As bases sangram por baixo do Lineart e ligeiramente sob as sombras
        for cluster in segmentation["layers"]["base"]:
            orig_mask = cluster["mask"]
            dilated = cv2.dilate(orig_mask, trap_kernel)
            
            # Sangra estritamente sob o Lineart e não vaza para fora da arte
            bleed_under_lineart = cv2.bitwise_and(dilated, lineart_mask)
            trapped_mask = cv2.bitwise_or(orig_mask, bleed_under_lineart)
            
            # Garante que não ultrapasse os limites da estampa (canal alfa original)
            trapped_mask = cv2.bitwise_and(trapped_mask, fg_mask)

            trapped_layers["base"].append({
                **cluster,
                "trapped_mask": trapped_mask
            })

        # 2. Trapping na Camada de Sombras e Meios-Tons (Z-1)
        # As sombras sangram também por baixo do Lineart
        for cluster in segmentation["layers"]["shadows"]:
            orig_mask = cluster["mask"]
            dilated = cv2.dilate(orig_mask, trap_kernel)
            
            bleed_under_lineart = cv2.bitwise_and(dilated, lineart_mask)
            trapped_mask = cv2.bitwise_or(orig_mask, bleed_under_lineart)
            trapped_mask = cv2.bitwise_and(trapped_mask, fg_mask)

            trapped_layers["shadows"].append({
                **cluster,
                "trapped_mask": trapped_mask
            })

        # 3. Camada de Lineart (Z-2)
        # O contorno preto permanece limpo, com morfologia original suavizada
        for cluster in segmentation["layers"]["lineart"]:
            # Suave remoção de ruídos isolados na linha
            cleaned = cv2.morphologyEx(cluster["mask"], cv2.MORPH_OPEN, small_kernel)
            trapped_layers["lineart"].append({
                **cluster,
                "trapped_mask": cleaned
            })

        return trapped_layers

    # =========================================================================
    # FASE 4: TRATAMENTO DE BORDAS & EXPANSÃO DE TRAÇOS (Bézier & Solid Fills)
    # =========================================================================

    def _mask_to_compound_paths(
        self,
        mask: np.ndarray
    ) -> List[str]:
        """
        Extrai contornos com hierarquia 2-level (RETR_CCOMP), simplifica via Douglas-Peucker,
        aplica suavização por curvas Bézier cúbicas sem gerar bicos pontiagudos, e
        retorna definições de caminho SVG composto ('d') compatíveis com fill-rule='evenodd'.
        """
        # Suavização preliminar de micro-pixels
        blurred = cv2.medianBlur(mask, 3)
        _, thresh = cv2.threshold(blurred, 127, 255, cv2.THRESH_BINARY)

        contours, hierarchy = cv2.findContours(
            thresh, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE
        )

        if hierarchy is None or len(contours) == 0:
            return []

        hierarchy = hierarchy[0]
        svg_path_strings = []

        # Agrupa contornos externos e seus respectivos buracos internos
        for i, h in enumerate(hierarchy):
            parent_idx = h[3]
            # Processa somente contornos externos raiz (parent == -1)
            if parent_idx != -1:
                continue

            cnt_outer = contours[i]
            area_outer = cv2.contourArea(cnt_outer)
            if area_outer < self.min_area_px:
                continue

            # Simplifica contorno externo
            outer_d = self._contour_to_bezier_subpath(cnt_outer)
            if not outer_d:
                continue

            compound_d = [outer_d]

            # Encontra todos os buracos (child contours) pertencentes a este contorno
            child_idx = h[2]
            while child_idx != -1:
                cnt_hole = contours[child_idx]
                area_hole = cv2.contourArea(cnt_hole)
                if area_hole >= (self.min_area_px / 2):
                    hole_d = self._contour_to_bezier_subpath(cnt_hole)
                    if hole_d:
                        compound_d.append(hole_d)
                child_idx = hierarchy[child_idx][0]

            svg_path_strings.append(" ".join(compound_d))

        return svg_path_strings

    def _contour_to_bezier_subpath(self, contour: np.ndarray) -> str:
        """
        Converte um contorno OpenCV em um sub-caminho SVG suavizado com curvas Bézier cúbicas (C),
        preservando cantos vivos angulares e evitando agulhas/bicos pontiagudos.
        """
        arc_len = cv2.arcLength(contour, True)
        epsilon = max(0.5, self.simplify_epsilon_factor * arc_len)
        approx = cv2.approxPolyDP(contour, epsilon, True)

        pts = approx.reshape(-1, 2)
        n = len(pts)

        if n < 3:
            return ""

        # Detecção de cantos vivos (Sharp Corners) com base no desvio angular
        is_corner = [False] * n
        for i in range(n):
            p_prev = pts[(i - 1) % n]
            p_curr = pts[i]
            p_next = pts[(i + 1) % n]

            v1 = p_prev - p_curr
            v2 = p_next - p_curr

            norm1 = np.linalg.norm(v1)
            norm2 = np.linalg.norm(v2)

            if norm1 > 1e-4 and norm2 > 1e-4:
                cos_ang = np.dot(v1, v2) / (norm1 * norm2)
                cos_ang = np.clip(cos_ang, -1.0, 1.0)
                angle_deg = math.degrees(math.acos(cos_ang))
                # Ângulo agudo pronunciado
                if angle_deg < (180.0 - self.corner_threshold_deg):
                    is_corner[i] = True

        # Geração do comando SVG com interpolação Bézier cúbica suave
        commands = [f"M {pts[0][0]:.2f},{pts[0][1]:.2f}"]
        tension = self.curve_smoothness

        for i in range(n):
            p0 = pts[(i - 1) % n]
            p1 = pts[i]
            p2 = pts[(i + 1) % n]
            p3 = pts[(i + 2) % n]

            corner_at_p1 = is_corner[i]
            corner_at_p2 = is_corner[(i + 1) % n]

            # Se qualquer uma das pontas for um canto vivo, conecta com reta direta (L)
            # para evitar pontas distorcidas ou bicos mal calculados
            if corner_at_p1 or corner_at_p2 or n < 5:
                commands.append(f"L {p2[0]:.2f},{p2[1]:.2f}")
            else:
                # Tangentes suaves Catmull-Rom para Bézier Cúbica
                cp1_x = p1[0] + (p2[0] - p0[0]) * tension
                cp1_y = p1[1] + (p2[1] - p0[1]) * tension

                cp2_x = p2[0] - (p3[0] - p1[0]) * tension
                cp2_y = p2[1] - (p3[1] - p1[1]) * tension

                commands.append(
                    f"C {cp1_x:.2f},{cp1_y:.2f} {cp2_x:.2f},{cp2_y:.2f} {p2[0]:.2f},{p2[1]:.2f}"
                )

        commands.append("Z")
        return " ".join(commands)

    # =========================================================================
    # FASE 3: PRIORIDADE DE RENDERIZAÇÃO (Z-Index / Layer Order em SVG)
    # =========================================================================

    def render_svg(
        self,
        trapped_layers: Dict[str, Any],
        width: int,
        height: int,
        output_filepath: Optional[str] = None
    ) -> str:
        """
        Monta o documento SVG na ordem estrita de Z-Index:
        [Z-0] Base Fills (Cores de preenchimento dilatadas)
        [Z-1] Shadows & Highlights (Sombras e realces)
        [Z-2] Lineart (Contornos fechando a arte por cima de todas as sangrias)

        Garante:
        - stroke-linejoin="round"
        - stroke-linecap="round"
        - stroke-miterlimit="2"
        - Todos os traços expandidos para caminhos de preenchimento sólido (fill-rule="evenodd")
        """
        dwg = svgwrite.Drawing(
            filename=output_filepath,
            size=(f"{width}px", f"{height}px"),
            viewBox=f"0 0 {width} {height}",
            debug=False
        )

        # Metadados e Definições de Estilo Global DTF
        dwg["xmlns"] = "http://www.w3.org/2000/svg"
        dwg["data-engine"] = "Latitude DTF Outline & Layered Trapping Vectorizer v4.0"
        dwg["data-trapping-radius-px"] = str(self.trap_px)

        style_block = dwg.style(
            """
            .dtf-path {
                stroke-linejoin: round !important;
                stroke-linecap: round !important;
                stroke-miterlimit: 2 !important;
            }
            .dtf-solid-fill {
                fill-rule: evenodd;
                stroke: none;
            }
            """
        )
        dwg.defs.add(style_block)

        # Ordem obrigatória de montagem do designer DTF
        layer_specs = [
            ("layer_0_base_fills", "0", "Cores de Preenchimento Dilatadas (Z-0)", trapped_layers["base"]),
            ("layer_1_shadows_highlights", "1", "Sombras e Meios-Tons (Z-1)", trapped_layers["shadows"]),
            ("layer_2_lineart", "2", "Contornos e Lineart Escura (Z-2)", trapped_layers["lineart"])
        ]

        total_paths = 0

        for group_id, z_idx, label, clusters in layer_specs:
            layer_group = dwg.g(id=group_id)
            layer_group["data-layer-label"] = label
            layer_group["data-z-index"] = z_idx
            layer_group["stroke-linejoin"] = "round"
            layer_group["stroke-linecap"] = "round"
            layer_group["stroke-miterlimit"] = "2"

            for cluster in clusters:
                mask = cluster["trapped_mask"]
                color_hex = cluster["hex"]

                path_strings = self._mask_to_compound_paths(mask)
                if not path_strings:
                    continue

                cluster_group = dwg.g(
                    id=f"{group_id}_{cluster['id']}_{color_hex.replace('#', '')}",
                    fill=color_hex
                )

                for d in path_strings:
                    # Todos os caminhos são 100% sólidos com fill-rule="evenodd",
                    # expandidos para suportar rasterizadores RIP DTF sem perda de linhas finas
                    path_elem = dwg.path(
                        d=d,
                        fill=color_hex,
                        stroke="none",
                        fill_rule="evenodd",
                        class_="dtf-path dtf-solid-fill"
                    )
                    cluster_group.add(path_elem)
                    total_paths += 1

                layer_group.add(cluster_group)

            dwg.add(layer_group)

        svg_xml = dwg.tostring()

        if output_filepath:
            os.makedirs(os.path.dirname(os.path.abspath(output_filepath)), exist_ok=True)
            with open(output_filepath, "w", encoding="utf-8") as f:
                f.write(svg_xml)

        return svg_xml

    # =========================================================================
    # PIPELINE COMPLETO INTEGRADO
    # =========================================================================

    def vectorize_image(
        self,
        input_image: Image.Image,
        output_svg_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executa o pipeline completo de vetorização:
        1. Quantização & Separação Semântica
        2. Aplicação de Trapping Morfológico
        3. Suavização de Bordas e Eliminação de Bicos
        4. Renderização SVG Hierárquica Z-0 -> Z-1 -> Z-2 com Traços Expandidos
        """
        img_rgba = np.array(input_image.convert("RGBA"))
        h, w = img_rgba.shape[:2]

        # 1. Separação Semântica
        segmentation = self.quantize_and_segment(img_rgba)

        # 2. Trapping Morfológico
        trapped_layers = self.apply_trapping(segmentation)

        # 3. Renderização SVG Z-Indexed
        svg_content = self.render_svg(trapped_layers, w, h, output_svg_path)

        return {
            "success": True,
            "width": w,
            "height": h,
            "trap_px": self.trap_px,
            "palette_count": len(segmentation["palette"]),
            "layers_count": {
                "base": len(trapped_layers["base"]),
                "shadows": len(trapped_layers["shadows"]),
                "lineart": len(trapped_layers["lineart"])
            },
            "svg": svg_content
        }


# =============================================================================
# FUNÇÃO CONVENIÊNCIA DE ENTRADA
# =============================================================================

def vectorize_dtf_with_trapping(
    image_input,
    output_svg_path: Optional[str] = None,
    n_colors: int = 12,
    trap_px: float = 1.5,
    lineart_luma_thresh: float = 38.0
) -> Dict[str, Any]:
    """
    Função pública de alto nível pronta para consumo pelo ImagePipeline e API FastAPI.
    Aceita arquivo caminho (str), PIL.Image ou NumPy array RGBA.
    """
    if isinstance(image_input, str):
        pil_img = Image.open(image_input)
    elif isinstance(image_input, np.ndarray):
        pil_img = Image.fromarray(image_input)
    else:
        pil_img = image_input

    engine = DTFOutlineTrappingVectorizer(
        n_colors=n_colors,
        trap_px=trap_px,
        lineart_luma_thresh=lineart_luma_thresh
    )

    return engine.vectorize_image(pil_img, output_svg_path)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(
        description="Latitude DTF Cockpit - Vetorizador Profissional com Outline & Layered Trapping"
    )
    parser.add_argument("--input", "-i", type=str, default="scratch/test_input.png", help="Caminho da imagem de entrada (PNG/JPG)")
    parser.add_argument("--output", "-o", type=str, default="scratch/vectorized_cli.svg", help="Caminho de saída do arquivo SVG")
    parser.add_argument("--colors", "-c", type=int, default=12, help="Número de cores para quantização K-Means (padrão: 12)")
    parser.add_argument("--trap", "-t", type=float, default=1.5, help="Raio de trapping em pixels sob o lineart (padrão: 1.5)")
    parser.add_argument("--lineart-thresh", type=float, default=38.0, help="Limiar de luminosidade Lab para isolar contornos (padrão: 38.0)")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Arquivo de entrada não encontrado: {args.input}")
        print("Executando validação de demonstração sintética...")
        import test_vectorizer
        test_vectorizer.run_validation()
    else:
        print(f"=== LATITUDE DTF OUTLINE & LAYERED TRAPPING ===")
        print(f"Processando imagem: {args.input}")
        print(f"Configurações: cores={args.colors}, trap_px={args.trap}px, lineart_thresh={args.lineart_thresh}")
        
        res = vectorize_dtf_with_trapping(
            args.input,
            output_svg_path=args.output,
            n_colors=args.colors,
            trap_px=args.trap,
            lineart_luma_thresh=args.lineart_thresh
        )
        
        print("\nVetorização concluída com sucesso!")
        print(f"Dimensões: {res['width']}x{res['height']}")
        print(f"Paleta de Cores: {res['palette_count']} cores")
        print(f"Camadas Z-Index:")
        print(f"  [Z-0] Base Fills (Dilatadas): {res['layers_count']['base']} clusters")
        print(f"  [Z-1] Sombras & Realces:       {res['layers_count']['shadows']} clusters")
        print(f"  [Z-2] Lineart (Contornos):    {res['layers_count']['lineart']} clusters")
        print(f"\nArquivo SVG salvo em: {os.path.abspath(args.output)}")
        print(f"Tamanho do arquivo: {os.path.getsize(args.output)} bytes")

