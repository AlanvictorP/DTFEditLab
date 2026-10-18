import sys
import asyncio
import base64
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append("backend_architecture")
from ai_agent_pipeline import DTFAgentCopilot, AdvancedRedrawPipeline

async def run_agent_tests():
    print("=== TESTANDO AGENTE AUTÔNOMO COPILOT DTF ===")
    
    # 1. Pergunta técnica / consultiva (NÃO deve acionar tools)
    q_tech = "Qual a temperatura e tempo ideal para prensar DTF em algodão?"
    res_tech = await DTFAgentCopilot.process_user_turn(q_tech)
    print("\n1. Pergunta Técnica:")
    print(f"Tool acionada: {res_tech.get('tool_called')} (Esperado: None)")
    print(f"Resposta: {res_tech['message'][:120]}...")
    assert res_tech.get("tool_called") is None, "Erro: tool não deveria ser forçada em perguntas técnicas!"

    # 2. Pedido de Redesenho (DEVE acionar redesenhar_estampa_avancado)
    with open("scratch/test_input.png", "rb") as f:
        b64_img = "data:image/png;base64," + base64.b64encode(f.read()).decode("utf-8")

    q_redraw = "Por favor, redesenhe esta estampa em alta resolução com cores chapadas e contornos pretos para serigrafia."
    res_redraw = await DTFAgentCopilot.process_user_turn(q_redraw, active_image_url=b64_img)
    print("\n2. Pedido de Redesenho com Tool Calling:")
    print(f"Tool acionada: {res_redraw.get('tool_called')}")
    print(f"Imagem gerada: {res_redraw.get('imageUrl') is not None}")
    print(f"Visão Estilo (R1): {res_redraw.get('vision_data', {}).get('R1')}")
    print(f"Visão Paleta (R2): {res_redraw.get('vision_data', {}).get('R2')}")
    print(f"Mensagem do Agente: {res_redraw['message'][:120]}...")

    assert res_redraw.get("tool_called") == "redesenhar_estampa_avancado", "Erro: tool redesenhar_estampa_avancado deveria ter sido chamada!"
    assert res_redraw.get("imageUrl") is not None, "Erro: imagem não gerada!"

    print("\n✅ TODOS OS TESTES DO AGENTE PASSARAM COM SUCESSO!")

if __name__ == "__main__":
    asyncio.run(run_agent_tests())
