/**
 * Maps Lead Extractor Pro - content.js v4.2
 * - Checkpoint automático a cada 5 leads (leads + seenNames)
 * - Pausa/retomada automática por visibilidade da aba
 * - Ação 'resume': retoma extração de onde parou (preserva leads + posição)
 */

let isRunning = false;
let isPaused = false;
let collectedLeads = [];
let lastStatusMessage = '';
let seenNames = new Set();
let modalEl = null;
let currentTipIndex = 0;
let extConfig = { APP_NAME: 'Extractor' };

const PROSPECTING_TIPS = [
  "💡 Dica: Personalize sua primeira abordagem mencionando algo específico do site ou avaliações do cliente.",
  "💡 Dica: O melhor horário para ligar para empresas B2B costuma ser entre 10h e 11h ou 15h e 16h.",
  "💡 Dica: Use o Instagram para validar se a empresa está ativa antes de gastar tempo com uma ligação.",
  "💡 Dica: Foque em resolver um problema rápido (ex: 'vi que seu site está sem certificado SSL') para abrir portas.",
  "💡 Dica: No primeiro contato, peça para falar com o 'responsável pelo marketing' ou 'dono', evite scripts robóticos.",
  "💡 Dica: Liste os benefícios, não as características. O cliente quer saber quanto ele vai lucrar ou economizar.",
  "💡 Dica: Siga a empresa nas redes sociais antes de abordar; isso gera familiaridade quando você citar o nome dela.",
  "💡 Dica: Use o Google Street View para ver o tamanho da fachada da empresa e estimar o porte do cliente."
];

// ── ACTION LOGIC (PORTED FROM V4.3) ──────────────────────

function calcScore(lead) {
  let score = 0;
  if (lead.phone) score += 30;
  if (lead.website) score += 20;
  const reviews = parseInt(lead.reviews) || 0;
  if (reviews >= 10) score += 10;
  if (reviews >= 50) score += 10;
  const rating = parseFloat(lead.rating) || 0;
  if (rating >= 4.0) score += 15;
  if (rating >= 4.5) score += 15;
  return Math.min(score, 100);
}

function isMobile(phone) {
  if (!phone) return false;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) digits = digits.substring(2);
  digits = digits.replace(/^0+/, '');
  return digits.length === 11 && digits[2] === '9';
}

function buildWaLink(phone, leadName) {
  return new Promise(resolve => {
    chrome.storage.local.get(['waMessage'], result => {
      const template = (result.waMessage || '').trim();
      const digits = phone.replace(/\D/g, '');
      const number = (digits.startsWith('55') && digits.length >= 12) ? digits : ('55' + digits.replace(/^0+/, ''));
      const message = template.replace('{nome}', leadName || '');
      const encoded = message ? encodeURIComponent(message) : '';
      resolve(encoded ? `https://wa.me/${number}?text=${encoded}` : `https://wa.me/${number}`);
    });
  });
}

const XLSX_MODULE = (() => {
  function escXML(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  return {
    generate(headers, rows, filename) {
      const widths = headers.map((h, i) => {
        let maxLen = String(h).length;
        for (const row of rows) { const len = String(row[i] ?? '').length; if (len > maxLen) maxLen = len; }
        return Math.min(Math.max(Math.round(maxLen * 6.5), 50), 300);
      });
      const columnDefs = widths.map(w => `<Column ss:Width="${w}"/>`).join('');
      const headerCells = headers.map(h => `<Cell ss:StyleID="header"><Data ss:Type="String">${escXML(h)}</Data></Cell>`).join('');
      const dataRows = rows.map(row => `<Row>${row.map(val => `<Cell><Data ss:Type="String">${escXML(val)}</Data></Cell>`).join('')}</Row>`).join('\n');
      const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel"><Styles><Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="11"/><Interior ss:Color="#1a56db" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style></Styles><Worksheet ss:Name="Leads"><Table>${columnDefs}<Row>${headerCells}</Row>${dataRows}</Table></Worksheet></Workbook>`;
      const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'export.xls';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };
})();

async function exportToXLSX() {
  const headers = ['Score', 'Nome', 'Categoria', 'Telefone', 'WhatsApp', 'E-mail', 'Instagram', 'Facebook', 'LinkedIn', 'Twitter', 'YouTube', 'Site', 'Endereço', 'Avaliação', 'Reviews'];
  const rows = await Promise.all(collectedLeads.map(async l => {
    const mobile = isMobile(l.phone);
    const wa = mobile ? await buildWaLink(l.phone, l.name) : '';
    return [calcScore(l), l.name || '', l.category || '', l.phone || '', wa, l.email || '', l.instagram || '', l.facebook || '', l.linkedin || '', l.twitter || '', l.youtube || '', l.website || '', l.address || '', l.rating || '', String(l.reviews || '').replace(/\D/g, '')];
  }));
  XLSX_MODULE.generate(headers, rows, 'leads_maps.xls');
}

async function copyLeadsToClipboard() {
  const headers = ['Score', 'Nome', 'Categoria', 'Telefone', 'WhatsApp', 'E-mail', 'Instagram', 'Facebook', 'LinkedIn', 'Twitter', 'YouTube', 'Site', 'Endereço', 'Avaliação', 'Reviews'];
  let tsv = headers.join('\t') + '\n';
  const rows = await Promise.all(collectedLeads.map(async l => {
    const mobile = isMobile(l.phone);
    const wa = mobile ? await buildWaLink(l.phone, l.name) : '';
    const row = [calcScore(l), l.name || '', l.category || '', l.phone || '', wa, l.email || '', l.instagram || '', l.facebook || '', l.linkedin || '', l.twitter || '', l.youtube || '', l.website || '', l.address || '', l.rating || '', String(l.reviews || '').replace(/\D/g, '')];
    return row.map(v => String(v || '').replace(/[\n\r\t]/g, ' ').trim()).join('\t');
  }));
  tsv += rows.join('\n');
  navigator.clipboard.writeText(tsv.trim()).then(() => {
    const btn = document.getElementById('extractor-btn-copy');
    const oldIcon = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-check-lg" style="color: #38ef7d"></i>';
    setTimeout(() => btn.innerHTML = oldIcon, 2000);
  });
}

function saveToHistory(data) {
  if (!data || data.length === 0) return;
  chrome.storage.local.get(['extractionHistory'], result => {
    const history = result.extractionHistory || [];
    const session = {
      id: Date.now(),
      date: new Date().toLocaleString('pt-BR'),
      leads: data,
      count: data.length
    };
    const updatedHistory = [session, ...history].slice(0, 10);
    chrome.storage.local.set({ extractionHistory: updatedHistory });

    const btn = document.getElementById('extractor-btn-save');
    if (btn) {
      const oldIcon = btn.innerHTML;
      btn.innerHTML = '<i class="bi bi-check-circle-fill" style="color: #38ef7d"></i>';
      setTimeout(() => btn.innerHTML = oldIcon, 2000);
    }
  });
}

async function sendToWebhook(data) {
  chrome.storage.local.get(['webhookUrl'], async result => {
    const url = result.webhookUrl;
    if (!url) {
      alert('Configure a URL do Webhook no painel lateral primeiro.');
      return;
    }
    const btn = document.getElementById('extractor-btn-webhook');
    const oldIcon = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: extConfig.APP_NAME || 'Extractor',
          timestamp: new Date().toISOString(),
          total: data.length,
          leads: await Promise.all(data.map(async l => {
            const mobile = isMobile(l.phone);
            const wa = mobile ? await buildWaLink(l.phone, l.name) : '';
            return {
              name: l.name || '',
              category: l.category || '',
              phone: l.phone || '',
              whatsapp: wa,
              email: l.email || '',
              instagram: l.instagram || '',
              facebook: l.facebook || '',
              linkedin: l.linkedin || '',
              twitter: l.twitter || '',
              youtube: l.youtube || '',
              website: l.website || '',
              address: l.address || '',
              rating: l.rating || '',
              reviews: l.reviews || '',
              score: calcScore(l)
            };
          }))
        })
      });
      if (response.ok) {
        btn.innerHTML = '<i class="bi bi-check-circle-fill" style="color: #38ef7d"></i>';
      } else {
        btn.innerHTML = '<i class="bi bi-exclamation-triangle-fill" style="color: #ff5f6d"></i>';
      }
    } catch (e) {
      btn.innerHTML = '<i class="bi bi-exclamation-triangle-fill" style="color: #ff5f6d"></i>';
    } finally {
      setTimeout(() => btn.innerHTML = oldIcon, 2000);
    }
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sendProgress(message, count) {
  lastStatusMessage = message;
  try {
    const payload = {
      action: 'progress',
      message,
      count,
      leads: collectedLeads,
      isRunning: isRunning
    };
    chrome.runtime.sendMessage(payload);
    updateModalCount(count); // Atualiza modal se existir
  } catch (e) { }
}

function playSoundNotification() {
  chrome.storage.local.get(['enableSound'], result => {
    if (result.enableSound === false) return; // Permitido se true ou undefined (padrão)

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      oscillator.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.1); // E6

      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.warn('Erro ao reproduzir som:', e);
    }
  });
}

// ── UI UI UI (MODAL FLUTUANTE) ──────────────────────────────

function injectModal() {
  const existing = document.getElementById('extractor-floating-modal');
  if (existing) {
    updateModalUI();
    return;
  }

  const style = document.createElement('style');
  style.innerHTML = `
    #extractor-floating-modal {
      position: fixed;
      top: 100px;
      right: 20px;
      width: 450px;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      color: white;
      z-index: 999999;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
      font-family: 'Poppins', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      user-select: none;
    }
    #extractor-modal-header {
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.05);
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    #extractor-modal-header span {
      font-size: 12px;
      font-weight: 600;
      color: #38bdf8;
      letter-spacing: 0.05em;
    }
    #extractor-modal-content {
      padding: 20px;
      text-align: center;
    }
    #extractor-lead-count {
      font-size: 64px;
      font-weight: 800;
      margin: 10px 0;
      background: linear-gradient(135deg, #38ef7d, #4facfe);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    #extractor-lead-label {
      font-size: 12px;
      color: #94a3b8;
      text-transform: uppercase;
      margin-bottom: 20px;
    }
    #extractor-tip-box {
      background: rgba(56, 189, 248, 0.1);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 20px;
      min-height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: left;
      font-size: 13px;
      line-height: 1.5;
      color: #e2e8f0;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    .extractor-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      justify-content: center;
    }
    .extractor-btn-mini {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: white;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .extractor-btn-mini:hover { background: rgba(255, 255, 255, 0.2); }
    
    #extractor-stop-btn {
      width: 100%;
      background: linear-gradient(135deg, #11998e, #38ef7d); /* Padrao Verde do Painel */
      color: #0d2a1a;
      padding: 12px;
      border-radius: 10px;
      font-weight: 700;
      cursor: pointer;
      transition: filter 0.2s, transform 0.2s;
      font-size: 14px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
      border: none;
      margin-top: 10px;
    }
    #extractor-stop-btn:hover { 
      filter: brightness(1.1);
      transform: translateY(-1px);
    }
    .extractor-action-bar {
      display: flex;
      gap: 6px;
      margin-bottom: 5px;
      justify-content: center;
    }
    .extractor-action-btn {
      flex: 1;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: #1c2333; /* Surface 2 padrao */
      border: 1px solid #2d3748; /* Border padrao */
      color: #e2e8f0;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    }
    
    .extractor-action-btn:hover:not(:disabled) {
      background: #2d3748;
      color: #4facfe;
      border-color: #4facfe;
      transform: translateY(-2px);
    }

    #extractor-btn-resume { color: #4facfe; }
    #extractor-btn-xlsx { color: #4facfe; }
    #extractor-btn-copy { color: #38ef7d; }
    #extractor-btn-save { color: #4facfe; }
    #extractor-btn-webhook { color: #f6a623; }
    #extractor-btn-clear { color: #718096; }
    
    #extractor-btn-clear:hover { color: #ff5f6d; border-color: #ff5f6d; }
    
    .extractor-action-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
      transform: none !important;
    }
    .extractor-action-btn svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }
    [data-extractor-tooltip]:hover::after {
      content: attr(data-extractor-tooltip);
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 8px;
      background: #000;
      color: #fff;
      font-size: 10px;
      border-radius: 4px;
      white-space: nowrap;
      z-index: 1000001;
      margin-bottom: 5px;
    }
    #extractor-close-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 18px;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      margin-left: 10px;
    }
    #extractor-close-btn:hover {
      color: #ff5f6d;
      transform: rotate(90deg);
    }
  `;

  // Injeta Bootstrap Icons se não houver
  if (!document.getElementById('extractor-bi-css')) {
    const link = document.createElement('link');
    link.id = 'extractor-bi-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';
    document.head.appendChild(link);
  }
  document.head.appendChild(style);

  modalEl = document.createElement('div');
  modalEl.id = 'extractor-floating-modal';
  modalEl.innerHTML = `
    <div id="extractor-modal-header">
      <div style="display: flex; align-items: center; gap: 8px;">
        <div id="extractor-status-dot" style="width: 10px; height: 10px; border-radius: 50%; background: #22c55e;"></div>
        <span>${extConfig.APP_NAME}</span>
      </div>
      <button id="extractor-close-btn" title="Fechar Painel"><i class="bi bi-x-lg"></i></button>
    </div>
    <div id="extractor-modal-content">
      <div id="extractor-lead-count">0</div>
      <div id="extractor-lead-label">Leads Capturados</div>
      
      <div id="extractor-tip-box">
        ${PROSPECTING_TIPS[0]}
      </div>
      
      <div class="extractor-controls">
        <button class="extractor-btn-mini" id="extractor-prev-tip">← Anterior</button>
        <button class="extractor-btn-mini" id="extractor-next-tip">Próxima →</button>
      </div>

      <div class="extractor-action-bar">
        <button class="extractor-action-btn" id="extractor-btn-xlsx" title="Exportar Excel"><i class="bi bi-file-earmark-spreadsheet"></i></button>
        <button class="extractor-action-btn" id="extractor-btn-copy" title="Copiar Leads"><i class="bi bi-clipboard-check"></i></button>
        <button class="extractor-action-btn" id="extractor-btn-save" title="Salvar Histórico"><i class="bi bi-database-add"></i></button>
        <button class="extractor-action-btn" id="extractor-btn-webhook" title="Enviar Webhook"><i class="bi bi-rocket-takeoff"></i></button>
        <button class="extractor-action-btn" id="extractor-btn-clear" title="Limpar Tudo"><i class="bi bi-trash3"></i></button>
      </div>

      <button id="extractor-stop-btn">▶ INICIAR EXTRAÇÃO</button>
    </div>
  `;
  document.body.appendChild(modalEl);

  const header = modalEl.querySelector('#extractor-modal-header');
  const closeBtn = modalEl.querySelector('#extractor-close-btn');

  // Close handler
  closeBtn.addEventListener('mousedown', (e) => e.stopPropagation()); // Evita drag ao clicar no fechar
  closeBtn.onclick = () => {
    removeModal();
    isRunning = false; // Opcional: para a extração se fechar? Geralmente sim se é o modal de controle
    chrome.runtime.sendMessage({ action: 'stop_from_modal', leads: collectedLeads });
  };

  let isDragging = false;
  let offsetX, offsetY;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = modalEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    modalEl.style.transition = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    modalEl.style.left = (e.clientX - offsetX) + 'px';
    modalEl.style.top = (e.clientY - offsetY) + 'px';
    modalEl.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  document.getElementById('extractor-prev-tip').onclick = () => {
    currentTipIndex = (currentTipIndex - 1 + PROSPECTING_TIPS.length) % PROSPECTING_TIPS.length;
    document.getElementById('extractor-tip-box').innerText = PROSPECTING_TIPS[currentTipIndex];
  };
  document.getElementById('extractor-next-tip').onclick = () => {
    currentTipIndex = (currentTipIndex + 1) % PROSPECTING_TIPS.length;
    document.getElementById('extractor-tip-box').innerText = PROSPECTING_TIPS[currentTipIndex];
  };

  document.getElementById('extractor-stop-btn').onclick = () => {
    if (isRunning) {
      isRunning = false;
      updateModalUI();
      chrome.runtime.sendMessage({
        action: 'stop_from_modal',
        leads: collectedLeads
      });
    } else {
      const maxLeads = 100; // Padrão
      scrollAndExtract(maxLeads, collectedLeads.length > 0);
    }
  };


  document.getElementById('extractor-btn-xlsx').onclick = () => {
    if (collectedLeads.length === 0) return;
    exportToXLSX();
  };

  document.getElementById('extractor-btn-copy').onclick = () => {
    if (collectedLeads.length === 0) return;
    copyLeadsToClipboard();
  };

  document.getElementById('extractor-btn-save').onclick = () => {
    if (collectedLeads.length === 0) return;
    saveToHistory(collectedLeads);
  };

  document.getElementById('extractor-btn-webhook').onclick = () => {
    if (collectedLeads.length === 0) return;
    sendToWebhook(collectedLeads);
  };

  document.getElementById('extractor-btn-clear').onclick = () => {
    if (confirm('Deseja limpar todos os leads capturados nesta sessão?')) {
      collectedLeads = [];
      seenNames = new Set();
      updateModalCount(0);
      saveCheckpoint();
      sendProgress('🗑 Dados limpos.', 0, true);
      updateModalUI();
    }
  };

  updateActionBarState();
}

function updateModalUI() {
  const modal = document.getElementById('extractor-floating-modal');
  if (!modal) return;

  const isEnabled = collectedLeads.length > 0;

  // Atualiza botões da barra de ações
  const buttons = ['xlsx', 'copy', 'save', 'webhook', 'clear'];
  buttons.forEach(id => {
    const btn = modal.querySelector(`#extractor-btn-${id}`);
    if (btn) btn.disabled = isRunning || !isEnabled;
  });

  const resumeBtn = modal.querySelector('#extractor-btn-resume');
  if (resumeBtn) resumeBtn.disabled = isRunning || collectedLeads.length === 0;

  // Atualiza botão de Parar/Status
  const stopBtn = modal.querySelector('#extractor-stop-btn');
  const dot = modal.querySelector('#extractor-status-dot');

  if (stopBtn) {
    if (isRunning) {
      stopBtn.innerText = '■ PARAR EXTRAÇÃO';
      stopBtn.style.background = 'linear-gradient(135deg, #ff5f6d, #ffc371)';
      stopBtn.style.color = '#1a0f00';
      if (dot) dot.style.background = '#22c55e'; // Verde
    } else {
      stopBtn.innerText = collectedLeads.length > 0 ? '▶ RETOMAR EXTRAÇÃO' : '▶ INICIAR EXTRAÇÃO';
      stopBtn.style.background = 'linear-gradient(135deg, #38ef7d, #11998e)';
      stopBtn.style.color = '#1a0f00';
      if (dot) dot.style.background = '#64748b'; // Cinza
    }
  }
}

// Mantendo compatibilidade com código que chama o nome antigo
function updateActionBarState() { updateModalUI(); }

function updateModalCount(count) {
  const el = document.getElementById('extractor-lead-count');
  if (el) el.innerText = count;
}

function removeModal() {
  const el = document.getElementById('extractor-floating-modal');
  if (el) el.remove();
}


/** Aguarda enquanto pausado (aba oculta). */
async function waitWhilePaused() {
  if (!isPaused) return;
  while (isPaused) await sleep(300);
}

/**
 * Checkpoint: salva leads coletados E nomes já visitados no storage.
 * Isso permite retomar de onde parou sem re-extrair leads já capturados.
 */
function saveCheckpoint() {
  try {
    chrome.storage.local.set({
      savedLeads: collectedLeads,
      seenNamesArr: [...seenNames]   // Set → Array para serialização
    });
  } catch (e) { }
}

/** Pausa/retomada automática por visibilidade. */
document.addEventListener('visibilitychange', () => {
  if (!isRunning) return;
  if (document.hidden) {
    isPaused = true;
    saveCheckpoint(); // salva estado completo imediatamente ao pausar
    sendProgress(`⏸ Pausado — aba em segundo plano. (${collectedLeads.length} leads salvos)`, collectedLeads.length);
  } else {
    isPaused = false;
    sendProgress(`▶ Retomando extração... ${collectedLeads.length} leads capturados.`, collectedLeads.length);
  }
});

// ── DOM HELPERS ──────────────────────────────────────────────

function waitForElement(selector, timeout = 6000) {
  return new Promise(resolve => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const obs = new MutationObserver(() => {
      const f = document.querySelector(selector);
      if (f) { obs.disconnect(); resolve(f); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
  });
}

function queryText(...sels) {
  for (const s of sels) {
    try { const e = document.querySelector(s); if (e?.innerText?.trim()) return e.innerText.trim(); } catch (e) { }
  }
  return '';
}

function formatUrl(parsedUrl) {
  const host = parsedUrl.hostname.replace(/^www\./, '');
  const path = parsedUrl.pathname.replace(/\/$/, ''); // remove barra final
  // Preserva o path se for significativo (não vazio e não só "/")
  if (path && path !== '/') {
    return host + path;
  }
  return host;
}

function cleanWebsiteUrl(url) {
  if (!url) return '';
  try {
    if (url.startsWith('/aclk') || url.includes('/aclk?')) {
      const full = url.startsWith('http') ? url : window.location.origin + url;
      const params = new URL(full).searchParams;
      const adurl = params.get('adurl');
      if (adurl && adurl.startsWith('http')) return formatUrl(new URL(adurl));
      const q = params.get('q');
      if (q && q.startsWith('http')) return formatUrl(new URL(q));
      return '';
    }
    if (url.startsWith('http')) return formatUrl(new URL(url));
  } catch (e) { }
  return url.replace(/^https?:\/\/(www\.)?/, '').split('?')[0].replace(/\/$/, '');
}


// ── EXTRAÇÃO DE DETALHES ─────────────────────────────────────

async function extractDetailFromOpenCard(expectedName) {
  // Aguarda o painel mostrar o h1 correspondente ao card clicado
  const maxWait = 9000;
  const start = Date.now();
  const expKey = (expectedName || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);
  while (Date.now() - start < maxWait) {
    const h1 = document.querySelector('h1.DUwDvf, h1[class*="fontHeadline"]');
    if (h1 && h1.innerText.trim()) {
      if (!expKey || h1.innerText.toLowerCase().replace(/[^a-z0-9]/g, '').includes(expKey)) break;
    }
    await sleep(300);
  }
  await sleep(700); // aguarda carregamento dos campos secundários (site, phone...)
  const d = {};
  try {
    d.name = queryText('h1.DUwDvf', 'h1[class*="fontHeadline"]', '[role="main"] h1');
    d.category = queryText('button.DkEaL', '[jsaction*="category"] button', '.fontBodyMedium button');
    d.rating = queryText('.fontDisplayLarge', 'span.ceNzKf', '[class*="fontDisplay"]', '.F7nice span:first-child');
    // Rating via aria-label se as classes não funcionarem
    if (!d.rating) {
      const ratingBtn = document.querySelector('button[aria-label*="estrela"], button[aria-label*="star"], [aria-label*="Classificação"]');
      if (ratingBtn) {
        const m = (ratingBtn.getAttribute('aria-label') || '').match(/(\d[.,]\d)/);
        if (m) d.rating = m[1];
      }
    }

    // Reviews: tenta ler o número do aria-label do botão (ex: "233 avaliações")
    const reviewBtn = document.querySelector(
      'button[aria-label*="avalia"], button[aria-label*="review"], [jsaction*="reviewChart"], [jsaction*="review"]'
    );
    if (reviewBtn) {
      const ariaLabel = reviewBtn.getAttribute('aria-label') || '';
      const m = ariaLabel.match(/(\d[\d.,]*)/);
      if (m) d.reviews = m[1].replace(/\./g, '').replace(',', '');
    }
    // Fallback via seletores de texto caso o aria-label não tenha o número
    if (!d.reviews) {
      let rawReviews = queryText(
        'span[aria-label*="avalia"]',
        'button[aria-label*="avalia"] span',
        '.F7nice span:last-child',
        '.UY7F9',
        'span.UY7F9'
      );
      if (rawReviews) {
        // Remove parênteses, pontos, vírgulas e qualquer texto, sobrando só os números
        d.reviews = rawReviews.replace(/\D/g, '');
      }
    }
    d.address = queryText('[data-item-id="address"] .Io6YTe', '[data-item-id="address"] .fontBodyMedium', 'button[data-item-id="address"] .fontBodyMedium');
    if (!d.address) {
      const btn = document.querySelector('button[data-item-id="address"]');
      if (btn) d.address = (btn.getAttribute('aria-label') || '').replace(/^Endereço:\s*/i, '');
    }
    const phoneEl = document.querySelector('[data-item-id^="phone:tel:"],[data-item-id^="phone:"],button[aria-label*="Ligar"],a[href^="tel:"]');
    if (phoneEl) {
      const id = phoneEl.getAttribute('data-item-id') || '';
      const m = id.match(/tel:(\+?[\d\s\-().]+)/);
      if (m) { d.phone = m[1].replace(/\D/g, '').replace(/^0+/, ''); }
      else {
        const href = phoneEl.getAttribute('href') || '';
        if (href.startsWith('tel:')) {
          d.phone = href.replace('tel:', '').replace(/\D/g, '').replace(/^0+/, '');
        } else {
          const rawPhone = queryText('[data-item-id^="phone:"] .Io6YTe', '[data-item-id^="phone:"] .fontBodyMedium');
          d.phone = rawPhone ? rawPhone.replace(/\D/g, '').replace(/^0+/, '') : '';
        }
      }
    }
    // Site: busca FORA do feed/lista lateral (o feed é a coluna de resultados)
    // document.querySelector pega o primeiro — que pode ser o card estático do feed
    const feed = document.querySelector('div[role="feed"]');
    let siteEl = null;
    for (const sel of [
      'a[data-item-id="authority"]',
      'a[aria-label*="Site"]',
      'a[aria-label*="site"]',
      'a[aria-label*="Web"]'
    ]) {
      const candidates = document.querySelectorAll(sel);
      for (const el of candidates) {
        if (!feed || !feed.contains(el)) { siteEl = el; break; }
      }
      if (siteEl) break;
    }
    if (siteEl) {
      const rawHref = siteEl.getAttribute('href') || '';
      const ariaLabel = siteEl.getAttribute('aria-label') || '';
      const visibleText = siteEl.querySelector('.Io6YTe,.fontBodyMedium')?.innerText?.trim() || '';

      if (rawHref && !rawHref.includes('/aclk') && !rawHref.includes('google.')) {
        // ✅ Caso normal: href tem a URL real completa (inclui path de perfis)
        d.website = cleanWebsiteUrl(rawHref);
      } else if (rawHref.includes('/aclk') || rawHref.includes('google.')) {
        // Redirect do Google — tenta extrair URL real dos parâmetros
        d.website = cleanWebsiteUrl(rawHref);
      } else {
        // Sem href: usa texto visível ou aria-label como fallback
        const ariaMatch = ariaLabel.match(/(?:Site|Website|Web|Ir para)[^:]*:\s*(.+)/i);
        if (ariaMatch) d.website = ariaMatch[1].trim();
        else if (visibleText && !visibleText.includes('google')) d.website = visibleText;
      }

      if (d.website && (d.website.includes('google.') || d.website.includes('/aclk'))) {
        d.website = '';
      }
    }
    // d.hours = queryText('.o0Svhf', 'span[aria-label*="Fechado"]', 'span[aria-label*="Aberto"]');
  } catch (e) { console.warn('[LeadExtractor]', e); }
  return d;
}

async function closeDetailPanel() {
  const btn = document.querySelector('button[aria-label="Voltar"],button[aria-label="Back"],button[jsaction*="back"],button.hYBOP');
  if (btn) btn.click();
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  await sleep(800);
}

async function scrollSidebarToLoadMore() {
  const panelCandidates = [
    'div.m6QErb.DxyBCb',
    'div.m6QErb.WQBznd',
    'div.m6QErb[aria-label]',
    'div[role="feed"]',
    'div.m6QErb'
  ];
  for (const sel of panelCandidates) {
    const el = document.querySelector(sel);
    if (el) {
      el.scrollBy(0, 3000);
      el.scrollTop = el.scrollHeight;
      await sleep(300);
    }
  }
  const cards = document.querySelectorAll('a.hfpxzc');
  if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'end', behavior: 'smooth' });
  await sleep(2500); // espera carregamento de DOM extras
}

// ── LOOP PRINCIPAL ───────────────────────────────────────────

/**
 * @param {number} maxLeads      Limite máximo de leads
 * @param {boolean} isResuming   Se true, mantém collectedLeads e seenNames atuais (retomada)
 */
async function scrollAndExtract(maxLeads = 100, isResuming = false) {
  isRunning = true;
  isPaused = false;
  injectModal(); // Mostra o modal ao iniciar

  if (!isResuming) {
    collectedLeads = [];
    seenNames = new Set();
    sendProgress('🔍 Procurando lista de resultados...', 0);
  } else {
    // Sincroniza seenNames com o que já foi coletado para evitar re-abrir
    if (!seenNames || seenNames.size === 0) {
      seenNames = new Set();
      collectedLeads.forEach(l => {
        if (l.name) seenNames.add(l.name.trim().toLowerCase());
        // Se tivermos um ID único no futuro, adicionamos aqui também
      });
    }
    sendProgress(`🔄 Retomando de ${collectedLeads.length} leads salvos...`, collectedLeads.length);
  }

  const feedEl = await waitForElement('div[role="feed"]', 6000);
  if (!feedEl) {
    sendProgress('❌ Lista não encontrada. Faça uma busca primeiro.', 0);
    isRunning = false;
    return [];
  }

  if (!isResuming) {
    sendProgress('✅ Iniciando extração!', 0);
    await sleep(500);
  }

  let noNewRounds = 0;

  while (isRunning && collectedLeads.length < maxLeads) {

    await waitWhilePaused();
    if (!isRunning) break;

    const cards = document.querySelectorAll('a.hfpxzc');
    let added = 0;

    for (const card of cards) {
      if (!isRunning || collectedLeads.length >= maxLeads) break;

      await waitWhilePaused();
      if (!isRunning) break;

      const name = card.getAttribute('aria-label') || '';
      const href = card.getAttribute('href') || '';

      // Tenta extrair um ID único da URL (o trecho !1s0x...:0x...)
      const placeIdMatch = href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
      const placeId = placeIdMatch ? placeIdMatch[1] : null;

      // Chave única: PlaceID se houver, senão nome normalizado
      const nameKey = name.trim().toLowerCase();
      const uniqueKey = placeId || nameKey;

      // Ignora elementos de UI do Maps que não são leads reais
      const UI_LABELS = /^(resultados|results|atualizar|update|mais resultados|load more)/i;

      if (!name || UI_LABELS.test(name.trim()) || seenNames.has(uniqueKey) || (placeId && seenNames.has(nameKey))) continue;

      seenNames.add(uniqueKey);
      if (placeId) seenNames.add(nameKey); // garante ambos para legado
      added++;

      sendProgress(`🔍 Abrindo: ${name}`, collectedLeads.length);
      card.scrollIntoView({ block: 'center' });
      await sleep(300);
      card.click();

      const detail = await extractDetailFromOpenCard(name);
      if (!detail.name) detail.name = name;

      // Enriquecimento: se tiver site, busca redes sociais e e-mail via background
      if (detail.website) {
        sendProgress(`🌐 Enriquecendo: ${detail.name}`, collectedLeads.length);
        const enriched = await new Promise(r => {
          chrome.runtime.sendMessage({ action: 'enrich_lead', url: detail.website }, r);
        });
        if (enriched) Object.assign(detail, enriched);
      }

      if (detail.name && (detail.phone || detail.website)) {
        // Verifica se o TELEFONE já existe (se tiver telefone)
        let isDuplicatePhone = false;
        if (detail.phone) {
          const cleanPhone = detail.phone.replace(/\D/g, '');
          isDuplicatePhone = collectedLeads.some(l => l.phone && l.phone.replace(/\D/g, '') === cleanPhone);
        }

        if (!isDuplicatePhone) {
          collectedLeads.unshift(detail);
          // Envia leads apenas quando um novo é adicionado
          sendProgress(`✅ ${collectedLeads.length} leads | ${detail.name}`, collectedLeads.length, true);
          saveCheckpoint();
        } else {
          sendProgress(`⏩ Ignorado (Duplicado): ${detail.name}`, collectedLeads.length, false);
        }
      }
      await closeDetailPanel();
      await sleep(600);
    }

    if (document.querySelector('.HlvSq,span.HlvSq')) {
      sendProgress('✔️ Fim da lista.', collectedLeads.length);
      break;
    }

    if (added === 0) {
      noNewRounds++;
      if (noNewRounds >= 10) { sendProgress('✔️ Sem mais resultados.', collectedLeads.length, true); break; }
      sendProgress(`⏳ Carregando mais... (${noNewRounds}/10)`, collectedLeads.length, false);
      await sleep(1000); // fôlego extra
    } else {
      noNewRounds = 0;
    }

    await scrollSidebarToLoadMore();
  }

  saveCheckpoint(); // checkpoint final
  isRunning = false;
  updateModalUI();
  sendProgress(`🎉 Concluído! ${collectedLeads.length} leads capturados.`, collectedLeads.length);
  return collectedLeads;
}

// ── MENSAGENS ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.config) extConfig = msg.config;

  if (msg.action === 'start') {
    scrollAndExtract(msg.maxLeads || 100, false)
      .then(leads => sendResponse({ success: true, leads }));
    return true;
  }

  if (msg.action === 'resume') {
    // Se recebeu os leads diretamente, usa eles (evita erro de storage vazio)
    if (msg.leads && msg.leads.length > 0) {
      collectedLeads = msg.leads;
      seenNames = new Set(msg.seenNamesArr || msg.leads.map(l => l.name));
      scrollAndExtract(msg.maxLeads || 100, true);
      sendResponse({ success: true, leads: collectedLeads });
    } else {
      // Fallback: Carrega checkpoint salvo e retoma
      chrome.storage.local.get(['savedLeads', 'seenNamesArr'], result => {
        collectedLeads = result.savedLeads || [];
        seenNames = new Set(result.seenNamesArr || []);
        scrollAndExtract(msg.maxLeads || 100, true);
        sendResponse({ success: true, leads: collectedLeads });
      });
    }
    return true;
  }

  if (msg.action === 'stop') {
    isRunning = false;
    isPaused = false;
    saveCheckpoint();
    updateModalUI();
    sendResponse({ stopped: true, leads: collectedLeads });
    return true;
  }

  if (msg.action === 'clear') {
    collectedLeads = [];
    seenNames = new Set();
    updateModalCount(0);
    updateModalUI();
    sendResponse({ success: true });
    return true;
  }

  if (msg.action === 'getLeads') { sendResponse({ leads: collectedLeads }); return true; }

  if (msg.action === 'ping') {
    sendResponse({
      pong: true,
      isRunning,
      leads: collectedLeads,
      count: collectedLeads.length,
      lastMessage: lastStatusMessage
    });
    return true;
  }
});
