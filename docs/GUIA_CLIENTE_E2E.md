# LeadsBooster — Guia Rápido do Cliente (Início ao Fim)

Bem-vindo(a)! Em ~15 minutos sua operação de prospecção estará rodando no piloto automático. Siga os passos na ordem — cada um destrava o próximo.

---

## Etapa 1 — Sua identidade (2 min)

**Menu → Conta → Identidade da Empresa**

Preencha:
- **Nome da empresa** (aparece nas mensagens que os leads recebem)
- **Nome do agente IA** (ex: "Cléo", "Max", "Ana")
- **Logo** e **cor primária**

> ⚠️ Se você pular esta etapa, os leads vão receber mensagens assinadas como "IA assistente" de "nossa empresa". Preencha antes de disparar qualquer coisa.

---

## Etapa 2 — Conectar seus canais (5 min)

### 2.1 WhatsApp (obrigatório)
**Menu → Integrações → Conectar WhatsApp**
1. Clique em **Novo Chip** → escolha um nome (ex: `chip-comercial`)
2. Escaneie o QR Code com o WhatsApp do celular que vai disparar
3. Defina o **limite diário** (recomendado começar com 20/dia por 7 dias — aquecimento)
4. Repita pra cada chip adicional (multi-chip é permitido no seu plano)

### 2.2 LinkedIn (opcional, plano Pro+)
**Menu → Conta → APIs → Unipile**
1. Cole sua API Key da Unipile
2. Vá em **Menu → Integrações → LinkedIn** e conecte sua conta
3. Ative o toggle **"Cadência automática de DMs"**

### 2.3 Google Calendar (recomendado)
**Menu → Integrações → Google Calendar & Meet**
- Autorize com sua conta Google → a IA vai agendar reuniões com link Meet automaticamente

### 2.4 E-mail (opcional, plano Agency+)
**Menu → Conta → APIs → Unipile** (mesma Key do LinkedIn)
- No dashboard da Unipile, conecte seu Gmail/Outlook
- Isso libera **Menu → Canais → Disparo E-mail**

---

## Etapa 3 — Ensinar a IA sobre seu negócio (3 min)

**Menu → IA → Treinar IA**

### Aba 🧭 Negócio
- **O que você vende** (2-3 frases diretas, sem jargão)
- **Ticket médio** e **público-alvo**
- **Diferencial** (por que escolher você)

### Aba 📚 Knowledge Pack
- **ICP** (Ideal Customer Profile): cargo, tamanho de empresa, setor
- **Perguntas SPIN** (a IA já traz um banco padrão — ajuste às suas dores)
- **Clientes referência**: 3-5 casos com nome + resultado
- **Value propositions**: 3 benefícios concretos

> 💡 Quanto melhor o Knowledge Pack, mais afiada fica a IA nas conversas de qualificação.

---

## Etapa 4 — Prospectar leads (5 min)

Escolha o canal que faz sentido pro seu negócio:

| Canal | Menu | Quando usar |
|---|---|---|
| **Google Maps** | Prospecção → Google Maps | Negócios locais (restaurantes, clínicas, escritórios) |
| **LinkedIn** | Prospecção → Buscas → LinkedIn | B2B corporativo (decisores, gerentes, C-level) |
| **Instagram** | Prospecção → Buscas → Instagram | Infoprodutores, e-commerce, criadores |
| **CNPJ** | Prospecção → Buscas → CNPJ | Consulta por razão social ou CNPJ direto |
| **Prospecção Automática** | Prospecção → Automação | Pipeline completo: Maps → CNPJ → Sócios no LinkedIn/IG |

**Fluxo padrão recomendado:**
1. Rode uma busca no canal escolhido
2. Vá em **Prospecção → Meus Leads** e revise os resultados
3. Clique em **Enriquecer com Dados4U** pra pegar celular + e-mail real (opcional, mas dobra a taxa de resposta)

---

## Etapa 5 — Disparar com IA (2 min)

**Menu → WhatsApp → Disparo Humanizado**

1. Selecione os leads que quer contatar (checkbox)
2. Clique em **Gerar Prévia** → a IA cria uma abertura SPIN personalizada por lead
3. Revise 2-3 pra sentir o tom → ajuste o prompt em Treinar IA se precisar
4. Clique em **Enfileirar**

**O que acontece automaticamente:**
- ⏱️ Envios espaçados 45-180s (parece humano)
- 🎯 Rotação entre seus chips (respeitando limite diário)
- ⌨️ Indicador "digitando..." antes de cada msg
- 🔄 Warm-up automático em chips novos (10/25/50/limite)

---

## Etapa 6 — Qualificar respostas (automático)

Quando o lead responder:

1. **Menu → WhatsApp → Qualificação & Conversas** → aparece em tempo real
2. A IA aplica **SPIN Selling** (Situação → Problema → Implicação → Necessidade), 1 pergunta por vez
3. Quando o lead demonstra intenção real de agendar, a IA:
   - Cria evento no Google Calendar com link Meet
   - Notifica o grupo de handoff configurado
   - Move o card pra "Reunião Agendada" no Pipeline

**Configurar handoff:**
**Menu → WhatsApp → Qualificação & Conversas → aba Configurar**
- Cole o JID do grupo WhatsApp onde a equipe comercial recebe os leads quentes
- Ajuste o `buffer_seconds` (default 30s — tempo pra IA agrupar respostas antes de responder)

---

## Etapa 7 — Cadência LinkedIn (se ativou na Etapa 2.2)

**Menu → LinkedIn → LinkedIn DM**

Como funciona:
1. Leads capturados vão pra `nota_conexao`
2. Worker roda **9h-18h BRT dias úteis**, máx 20 ações/dia (anti-ban)
3. Fluxo: **Convite** (D+0) → *aguarda aceite* → **1ª msg** → **Follow-up D+7** → **Implicação D+14** → **Encerramento D+21**
4. Contatos que falham 3x são pausados automaticamente com o motivo (você pode retomar manualmente)

> ✋ Nunca sobe pra 20/dia de cara. Comece com 5-10/dia na 1ª semana.

---

## Etapa 8 — Acompanhar tudo

| Onde | O que ver |
|---|---|
| **Dashboard** | Métricas gerais: leads capturados, disparos, qualificados |
| **Pipeline CRM** | Cards por estágio (Novo → Contactado → Qualificado → Reunião → Fechado) |
| **Follow-ups** | Cadência automática D+7/D+14/D+21 pra quem não respondeu |
| **Saúde** | Painel operacional: fila de disparos, chips ativos, latência |

---

## Regras de ouro (não pule)

1. **Aquecimento é sagrado.** Chip novo → 10 msgs no dia 1, 25 no dia 3, 50 no dia 7. Pular = ban.
2. **Nunca copie/cole o mesmo template.** A IA já personaliza — deixe ela trabalhar.
3. **Responda "não" com respeito.** A IA já faz isso; não sobreponha manualmente.
4. **LinkedIn ≠ WhatsApp.** LinkedIn é mais sensível a spam. Confie no limite de 20/dia.
5. **Handoff em até 15min.** Lead quente esfria rápido. Configure o grupo WhatsApp e responda.

---

## Se algo não funcionar

| Sintoma | Onde olhar |
|---|---|
| Chip caiu / QR expirou | Integrações → WhatsApp → **Reconectar** |
| Disparo não sai | Saúde → Fila (verificar `pending` vs `running`) |
| IA responde estranho | Treinar IA → melhorar Knowledge Pack |
| LinkedIn pausou lead | LinkedIn DM → filtrar por `failed` → ver motivo → retomar |
| Reunião não agendou | Integrações → Google Calendar → **Reconectar** |

**Suporte:** Menu → Suporte → abra um ticket com print + ID do lead.

---

Boa prospecção! 🚀
