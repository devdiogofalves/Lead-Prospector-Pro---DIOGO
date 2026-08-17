// ── CONFIGURAÇÕES WHITE LABEL ──────────────────────────────────
const PANEL_CONFIG = window.EXT_CONFIG || {};

let leads = [];
let isRunning = false;
let activeFilter = 'all';
let currentPage = 1;
const PAGE_SIZE = 10;

const btnControl = document.getElementById('btnControl');
const btnResume = document.getElementById('btnResume');
const btnXLSX = document.getElementById('btnXLSX');
const btnCopy = document.getElementById('btnCopy');
const btnClear = document.getElementById('btnClear');
const btnSave = document.getElementById('btnSave');
const btnWebhook = document.getElementById('btnWebhook');
const webhookUrlEl = document.getElementById('webhookUrl');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statTotal = document.getElementById('statTotal');
const statPhone = document.getElementById('statPhone');
const statSite = document.getElementById('statSite');
const leadsList = document.getElementById('leadsList');
const maxLeadsEl = document.getElementById('maxLeads');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const waMessageEl = document.getElementById('waMessage');
const statHeroBadge = document.getElementById('statHeroBadge');

// History Elements
const btnHistoryToggle = document.getElementById('btnHistoryToggle');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');
const btnClearHistory = document.getElementById('btnClearHistory');
const historyCountEl = document.getElementById('historyCount');

const btnConfigToggle = document.getElementById('btnConfigToggle');
const configSection = document.getElementById('configSection');

// ── VERSÃO E NOME ───────────────────────────────────────────
const manifestData = chrome.runtime.getManifest();
const appVersionEl = document.getElementById('appVersion');
if (appVersionEl) appVersionEl.textContent = `v${manifestData.version}`;

const topbarTitle = document.querySelector('.topbar-title');
if (topbarTitle) topbarTitle.textContent = PANEL_CONFIG.APP_NAME;

// ── SISTEMA DE ATUALIZAÇÃO ──────────────────────────────────
async function checkForUpdates() {
  if (!PANEL_CONFIG.UPDATE_CHECK_ENABLED) return;
  console.log('[UpdateCheck] Iniciando verificação...');

  try {
    const res = await fetch(PANEL_CONFIG.UPDATE_CHECK_URL, {
      method: 'POST', // Webhooks geralmente preferem POST
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_version', current_version: chrome.runtime.getManifest().version })
    });

    console.log('[UpdateCheck] Status Resposta:', res.status);
    if (!res.ok) return;
    let data = await res.json();
    console.log('[UpdateCheck] Dados Recebidos:', data);

    // Se a resposta for um array, pega o primeiro item
    if (Array.isArray(data) && data.length > 0) {
      data = data[0];
      console.log('[UpdateCheck] Extraído do Array:', data);
    }

    const localVersion = chrome.runtime.getManifest().version;
    console.log('[UpdateCheck] Versão Local:', localVersion);
    console.log('[UpdateCheck] Versão Remota:', data.version);

    // Compara versões (ex: 4.2.0 < 4.3.0)
    const isNewer = data.version && data.version.localeCompare(localVersion, undefined, { numeric: true, sensitivity: 'base' }) > 0;
    console.log('[UpdateCheck] É mais nova?', isNewer);

    if (isNewer) {
      const banner = document.getElementById('updateBanner');
      console.log('[UpdateCheck] Elemento Banner Encontrado:', !!banner);
      if (banner) {
        banner.style.display = 'block';
        banner.innerHTML = `🚀 Nova versão ${data.version} disponível! Clique para atualizar`;
        banner.onclick = () => window.open(PANEL_CONFIG.UPDATE_DOWNLOAD_URL || data.download_url, '_blank');
      }
    }
  } catch (e) {
    console.warn('[UpdateCheck] Erro ao verificar atualizações:', e);
  }
}

// Inicia verificação
checkForUpdates();

// ── UTILITÁRIOS ──────────────────────────────────────────────

function setStatus(html, type = 'idle') {
  statusText.innerHTML = html;
  statusDot.className = 'status-dot ' + (type === 'running' ? 'running' : type === 'done' ? 'done' : type === 'error' ? 'error' : '');
}

function updateStats() {
  const uniqueLeads = leads.filter(l => !l.isDuplicate);
  const total = uniqueLeads.length;

  statTotal.textContent = total;
  statPhone.textContent = uniqueLeads.filter(l => l.phone).length;
  statSite.textContent = uniqueLeads.filter(l => l.website).length;
  document.getElementById('fCountAll').textContent = total;

  // Re-dispara animação no número hero
  statTotal.style.animation = 'none';
  requestAnimationFrame(() => { statTotal.style.animation = ''; });

  // Salva leads preventivamente (beforeunload é instável em sidepanels)
  chrome.storage.local.set({ savedLeads: leads });

  // Atualiza badge se não estiver extraindo
  if (!isRunning && statHeroBadge) {
    statHeroBadge.textContent = total > 0 ? 'Finalizado' : 'Pronto';
  }
}

function updateProgress(count) {
  const max = parseInt(maxLeadsEl.value) || 50;
  progressBar.style.width = Math.min((count / max) * 100, 100) + '%';
  progressWrap.style.display = 'block';
}

function showNotification(count) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Extração Concluída!',
    message: `Capturamos ${count} leads com sucesso no Google Maps.`,
    priority: 2
  });
}

// ── DEDUPLICAÇÃO ─────────────────────────────────────────────

/**
 * Marca cada lead com `isDuplicate: true` se o número de telefone
 * já apareceu antes na lista. O primeiro é considerado original.
 */
function markDuplicates() {
  const seen = new Set();
  leads.forEach(l => {
    if (!l.phone) { l.isDuplicate = false; return; }
    const key = l.phone.replace(/\D/g, '');
    if (seen.has(key)) {
      l.isDuplicate = true;
    } else {
      seen.add(key);
      l.isDuplicate = false;
    }
  });
}

// ── SCORE DO LEAD (0–100) ────────────────────────────────────

function calcScore(lead) {
  let score = 0;
  if (lead.phone) score += 30;  // tem telefone
  if (lead.website) score += 20;  // tem site
  const reviews = parseInt(lead.reviews) || 0;
  if (reviews >= 10) score += 10;
  if (reviews >= 50) score += 10; // acumulativo até +20
  const rating = parseFloat(lead.rating) || 0;
  if (rating >= 4.0) score += 15;
  if (rating >= 4.5) score += 15; // acumulativo até +30
  return Math.min(score, 100);
}

function scoreColor(score) {
  if (score >= 75) return '#38ef7d';  // verde
  if (score >= 45) return '#f6a623';  // amarelo/ouro
  return '#ff5f6d';                    // vermelho
}

// ── RATING VISUAL ─────────────────────────────────────────────

function renderStars(rating) {
  const val = parseFloat(rating) || 0;
  if (!val) return '';
  const full = Math.floor(val);
  const half = val - full >= 0.3 && val - full < 0.8 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    '★'.repeat(full) +
    (half ? '½' : '') +
    '☆'.repeat(empty)
  );
}

// ── WHATSAPP ─────────────────────────────────────────────────

function formatWaNumber(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  const clean = digits.replace(/^0+/, '');
  return '55' + clean;
}

function buildWaLink(phone, leadName) {
  const number = formatWaNumber(phone);
  const template = (waMessageEl?.value || '').trim();
  const message = template.replace('{nome}', leadName || '');
  const encoded = message ? encodeURIComponent(message) : '';
  const url = encoded
    ? `https://wa.me/${number}?text=${encoded}`
    : `https://wa.me/${number}`;
  return url;
}

const WA_ICON_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15
    -.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475
    -.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52
    .149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207
    -.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372
    -.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2
    5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085
    1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.122.554 4.118 1.527 5.845L0 24l6.321-1.507
    A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.794 9.794
    0 01-5.003-1.374l-.36-.213-3.724.978.995-3.63-.234-.373A9.775 9.775 0 012.182 12
    C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388
    9.818-9.818 9.818z"/>
</svg>`;

// ── RENDER LEADS ─────────────────────────────────────────────

function getFilteredLeads() {
  // Duplicados são sempre excluídos da visualização
  const unique = leads.filter(l => !l.isDuplicate);
  switch (activeFilter) {
    case 'phone': return unique.filter(l => l.phone);
    case 'site': return unique.filter(l => l.website);
    case 'nocontact': return unique.filter(l => !l.phone && !l.website);
    default: return unique;
  }
}

function isMobile(phone) {
  if (!phone) return false;
  // Remove TUDO que não for dígito
  let digits = String(phone).replace(/\D/g, '');

  // Remove prefixo internacional 55 se houver (considerando o 9º dígito)
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.substring(2);
  }

  // Remove ZEROS à esquerda (pode ser um ou mais)
  digits = digits.replace(/^0+/, '');

  // Brasil: DDD (2 dígitos) + 9 + 8 dígitos do número = 11 total.
  // O terceiro dígito (índice 2) precisa ser o 9.
  return digits.length === 11 && digits[2] === '9';
}

function renderLeads() {
  const filtered = getFilteredLeads();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  // Atualiza filtros ativos
  document.querySelectorAll('.filter-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.filter === activeFilter)
  );

  // Contagens dos filtros
  const unique = leads.filter(l => !l.isDuplicate);
  document.getElementById('fCountAll').textContent = unique.length;
  document.getElementById('fCountPhone').textContent = unique.filter(l => l.phone).length;
  document.getElementById('fCountSite').textContent = unique.filter(l => l.website).length;
  document.getElementById('fCountNone').textContent = unique.filter(l => !l.phone && !l.website).length;

  if (!filtered.length) {
    leadsList.innerHTML = leads.length
      ? `<div class="empty-state"><div class="icon">🔍</div>Nenhum lead neste filtro.</div>`
      : `<div class="empty-state"><div class="icon">🗺️</div>Nenhum lead ainda.</div>`;
    document.getElementById('pagination').style.display = 'none';
    return;
  }

  // Fatia da página atual
  const start = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(start, start + PAGE_SIZE);

  leadsList.innerHTML = paginated.map((l, i) => {
    const globalIdx = start + i + 1;
    const score = calcScore(l);
    const sColor = scoreColor(score);
    const stars = renderStars(l.rating);
    const mobile = isMobile(l.phone);
    const waUrl = (l.phone && mobile) ? buildWaLink(l.phone, l.name) : null;
    let site = l.website || '';
    if (site && !site.startsWith('http')) site = 'https://' + site;

    return `
    <div class="lead-item">
      <div class="lead-top">
        <div class="lead-name-wrap">
          <div class="lead-name">${l.name || '—'}</div>
          <div class="lead-meta">
            ${stars ? `<span class="lead-stars">${stars}</span>` : ''}
            <span>${l.category || ''}</span>
            ${l.isDuplicate ? `<span class="badge-dupe">DUPLICADO</span>` : ''}
          </div>
        </div>
        <div class="lead-score-badge" style="color:${sColor};border-color:${sColor}44">${score}</div>
      </div>

      <div class="lead-bottom">
        <div class="lead-phone"><i class="bi bi-telephone"></i> ${l.phone || 'Sem Telefone'}</div>
        <div class="action-btns">
          ${l.website ? `<a class="action-btn site" href="${site}" target="_blank" data-tooltip="Abrir Site"><i class="bi bi-globe"></i></a>` : ''}
          ${l.email ? `<a class="action-btn email" href="mailto:${l.email}" data-tooltip="Enviar E-mail"><i class="bi bi-envelope-fill"></i></a>` : ''}
          ${l.instagram ? `<a class="action-btn instagram" href="${l.instagram}" target="_blank" data-tooltip="Instagram"><i class="bi bi-instagram"></i></a>` : ''}
          ${l.facebook ? `<a class="action-btn facebook" href="${l.facebook}" target="_blank" data-tooltip="Facebook"><i class="bi bi-facebook"></i></a>` : ''}
          ${l.linkedin ? `<a class="action-btn linkedin" href="${l.linkedin}" target="_blank" data-tooltip="LinkedIn"><i class="bi bi-linkedin"></i></a>` : ''}
          ${l.twitter ? `<a class="action-btn twitter" href="${l.twitter}" target="_blank" data-tooltip="Twitter/X"><i class="bi bi-twitter-x"></i></a>` : ''}
          ${l.youtube ? `<a class="action-btn youtube" href="${l.youtube}" target="_blank" data-tooltip="YouTube"><i class="bi bi-youtube"></i></a>` : ''}
          ${waUrl ? `<a class="action-btn wa" href="${waUrl}" target="_blank" data-tooltip="WhatsApp"><i class="bi bi-whatsapp"></i></a>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  // Controles de paginação
  const pg = document.getElementById('pagination');
  pg.style.display = totalPages > 1 ? 'flex' : 'none';
  document.getElementById('pgInfo').textContent = `${currentPage} / ${totalPages}`;
  document.getElementById('pgPrev').disabled = currentPage <= 1;
  document.getElementById('pgNext').disabled = currentPage >= totalPages;
}

// ── ESTADO DE EXECUÇÃO ───────────────────────────────────────

function setRunningState(running) {
  isRunning = running;

  if (btnControl) {
    if (running) {
      btnControl.className = 'btn-control stop';
      btnControl.innerHTML = '<i class="bi bi-stop-fill"></i> <span>Parar Extração</span>';
    } else {
      btnControl.className = 'btn-control start';
      const label = leads.length > 0 ? 'Retomar Extração' : 'Iniciar Extração';
      btnControl.innerHTML = `<i class="bi bi-play-fill"></i> <span>${label}</span>`;
    }
  }

  if (btnResume) btnResume.style.display = 'none'; // Agora o botão principal faz os dois
  btnXLSX.disabled = running || !leads.length;
  btnCopy.disabled = running || !leads.length;
  btnSave.disabled = running || !leads.length;
  btnWebhook.disabled = running || !leads.length;
  btnClear.disabled = running || !leads.length;
  maxLeadsEl.disabled = running;
  if (statHeroBadge) {
    if (running) {
      statHeroBadge.textContent = 'Extraindo...';
      statHeroBadge.style.color = '#4facfe';
      statHeroBadge.style.borderColor = 'rgba(79,172,254,.4)';
      statHeroBadge.style.background = 'rgba(79,172,254,.12)';
    } else {
      const total = leads.length;
      statHeroBadge.textContent = total > 0 ? 'Finalizado' : 'Pronto';
      statHeroBadge.style.color = '';
      statHeroBadge.style.borderColor = '';
      statHeroBadge.style.background = '';
    }
  }
}

// ── XLSX ─────────────────────────────────────────────────────

function exportXLSX(leadsToExport = leads) {
  const headers = ['Score', 'Nome', 'Categoria', 'Telefone', 'WhatsApp', 'E-mail', 'Instagram', 'Facebook', 'LinkedIn', 'Twitter', 'YouTube', 'Site', 'Endereço', 'Avaliação', 'Reviews'];
  const uniqueLeads = leadsToExport.filter(l => !l.isDuplicate);
  const rows = uniqueLeads.map(l => {
    let site = l.website || '';
    if (site && !site.startsWith('http')) site = 'https://' + site;

    const mobile = isMobile(l.phone);

    return [
      calcScore(l),
      l.name || '',
      l.category || '',
      l.phone || '',
      (l.phone && mobile) ? buildWaLink(l.phone, l.name) : '',
      l.email || '',
      l.instagram || '',
      l.facebook || '',
      l.linkedin || '',
      l.twitter || '',
      l.youtube || '',
      site,
      l.address || '',
      l.rating || '',
      String(l.reviews || '').replace(/\D/g, '')
    ];
  });
  XLSXWriter.generate(headers, rows, 'leads_maps.xls');
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(leads, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'leads_maps.json' });
  a.click();
}

function copyToSheets() {
  const headers = ['Score', 'Nome', 'Categoria', 'Telefone', 'WhatsApp', 'E-mail', 'Instagram', 'Facebook', 'LinkedIn', 'Twitter', 'YouTube', 'Site', 'Endereço', 'Avaliação', 'Reviews'];
  const uniqueLeads = leads.filter(l => !l.isDuplicate);

  let tsv = headers.join('\t') + '\n';

  uniqueLeads.forEach(l => {
    const mobile = isMobile(l.phone);
    let site = l.website || '';
    if (site && !site.startsWith('http')) site = 'https://' + site;

    const row = [
      calcScore(l),
      l.name || '',
      l.category || '',
      l.phone || '',
      (l.phone && mobile) ? buildWaLink(l.phone, l.name) : '',
      l.email || '',
      l.instagram || '',
      l.facebook || '',
      l.linkedin || '',
      l.twitter || '',
      l.youtube || '',
      site,
      l.address || '',
      l.rating || '',
      String(l.reviews || '').replace(/\D/g, '')
    ];

    // Sanitização agressiva: remove quebras, tabs e caracteres de controle invisíveis
    const cleanRow = row.map(v => {
      if (v == null) return '';
      return String(v)
        .replace(/[\n\r\t]/g, ' ')           // Troca quebras/tabs por espaço
        .replace(/\u00A0/g, ' ')             // Troca non-breaking space por espaço comum
        .replace(/·/g, '-')                   // Troca o ponto médio por hífen para evitar quadrados
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove caracteres de controle ASCI/Unicode
        .trim();
    });
    tsv += cleanRow.join('\t') + '\n';
  });

  // tsv.trim() garante que não haja uma linha vazia no final da colagem
  navigator.clipboard.writeText(tsv.trim()).then(() => {
    const oldHtml = btnCopy.innerHTML;
    btnCopy.innerHTML = '<i class="bi bi-check-all"></i>';
    btnCopy.style.borderColor = '#34a853';
    btnCopy.style.color = '#34a853';
    setTimeout(() => {
      btnCopy.innerHTML = oldHtml;
      btnCopy.style.borderColor = '';
      btnCopy.style.color = '';
    }, 2000);
  }).catch(err => {
    alert('Erro ao copiar: ' + err);
  });
}

// ── COMUNICAÇÃO ──────────────────────────────────────────────

async function getCurrentTab() {
  // Tenta na janela atual primeiro
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.match(/google\.[^/]+\/maps/)) return tab;

  // Fallback: Procura em todas as janelas por uma aba ativa que seja do Maps
  const allActiveTabs = await chrome.tabs.query({ active: true });
  const mapsTab = allActiveTabs.find(t => t.url?.match(/google\.[^/]+\/maps/));
  return mapsTab || tab; // Retorna a do Maps ou a original se não achar
}

async function pingContent(tabId) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { action: 'ping' }, res => {
      resolve(!chrome.runtime.lastError && res?.pong);
    });
  });
}

async function ensureContentScript(tab) {
  const alive = await pingContent(tab.id);
  if (!alive) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── EVENTOS ──────────────────────────────────────────────────

// Filtros
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    renderLeads();
  });
});


// ── VERIFICAÇÃO DE LICENÇA ────────────────────────────────────

const LICENSE_STORAGE_KEY = PANEL_CONFIG.LICENSE_STORAGE_KEY || 'mpl_license_key';
const LICENSE_DEVICE_KEY = PANEL_CONFIG.LICENSE_DEVICE_KEY || 'mpl_device_fingerprint';
const LICENSE_LAST_VALIDATED_KEY = PANEL_CONFIG.LICENSE_LAST_VALIDATED_KEY || 'mpl_last_validated_at';
const LICENSE_PREFIX = (PANEL_CONFIG.LICENSE_PREFIX || 'MPL').toUpperCase();
const LICENSE_KEY_REGEX = new RegExp(`^${LICENSE_PREFIX}-[A-F0-9]{8}$`);
const LICENSE_VALIDATE_URL = `${(PANEL_CONFIG.LICENSE_API_BASE || '').replace(/\/$/, '')}${PANEL_CONFIG.LICENSE_VALIDATE_PATH || '/extension-license'}`;
const LICENSE_REVALIDATE_AFTER_MS = Number(PANEL_CONFIG.REVALIDATE_AFTER_MS) || (6 * 60 * 60 * 1000);

function getStoredValue(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function setStoredValue(values) {
  return new Promise(resolve => chrome.storage.local.set(values, resolve));
}

function removeStoredValue(keys) {
  return new Promise(resolve => chrome.storage.local.remove(keys, resolve));
}

async function getOrCreateLicenseFingerprint() {
  const result = await getStoredValue([LICENSE_DEVICE_KEY]);
  let fingerprint = result[LICENSE_DEVICE_KEY];
  if (!fingerprint) {
    const randomId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    fingerprint = `mpl-${randomId}`;
    await setStoredValue({ [LICENSE_DEVICE_KEY]: fingerprint });
  }
  return fingerprint;
}

async function validateStoredLicense(licenseKey) {
  const deviceFingerprint = await getOrCreateLicenseFingerprint();
  const res = await fetch(LICENSE_VALIDATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'validate',
      licenseKey,
      deviceFingerprint,
      deviceName: `MPL · ${navigator.platform || ''} · ${(navigator.userAgent || '').slice(0, 80)}`,
      browserInfo: navigator.userAgent
    })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function verifyLicenseBeforeAction() {
  if (PANEL_CONFIG.LICENSE_ENABLED === false) return true;
  const result = await getStoredValue([LICENSE_STORAGE_KEY, LICENSE_LAST_VALIDATED_KEY, 'licenseEmail']);
  const storedKey = String(result[LICENSE_STORAGE_KEY] || '').trim().toUpperCase();
  const legacyKey = String(result.licenseEmail || '').trim().toUpperCase();
  const licenseKey = LICENSE_KEY_REGEX.test(storedKey) ? storedKey : (LICENSE_KEY_REGEX.test(legacyKey) ? legacyKey : '');

  if (!licenseKey) return false;

  if (licenseKey !== storedKey) {
    await setStoredValue({ [LICENSE_STORAGE_KEY]: licenseKey });
  }

  const lastValidated = Number(result[LICENSE_LAST_VALIDATED_KEY] || 0);
  if (lastValidated && (Date.now() - lastValidated) < LICENSE_REVALIDATE_AFTER_MS) return true;

  try {
    const { ok, data } = await validateStoredLicense(licenseKey);
    const isValid = ok && data && data.valid === true;
    if (isValid) {
      await setStoredValue({ [LICENSE_LAST_VALIDATED_KEY]: Date.now() });
      return true;
    }
    await removeStoredValue([LICENSE_STORAGE_KEY, LICENSE_LAST_VALIDATED_KEY, 'licenseEmail']);
    return false;
  } catch {
    return Boolean(lastValidated); // Falha de rede: libera apenas se já validou antes
  }
}

async function handleStart() {
  checkForUpdates(); // Verifica se há atualização ao tentar iniciar

  if (isRunning) {
    handleStop();
    return;
  }

  const isResuming = leads.length > 0;

  if (!isResuming) {
    // Se for um novo começo, limpa o contador visual
    updateProgress(0);
  }

  // Permite mudar o comportamento: se o usuário clicar em "Limpar" antes, ele vira "Iniciar"
  // Caso contrário, ele sempre retoma.

  const tab = await getCurrentTab();
  if (!tab.url?.match(/google\.[^/]+\/maps/)) {
    setStatus('❌ Abra o Google Maps e faça uma busca primeiro.', 'error');
    return;
  }
  // Verifica licença antes de iniciar
  setStatus('🔐 Verificando licença...', 'running');
  const licensed = await verifyLicenseBeforeAction();
  if (!licensed) {
    setStatus('❌ Licença expirada ou inválida. Verifique seu acesso.', 'error');
    return;
  }
  if (!isResuming) {
    leads = [];
    renderLeads();
    updateStats();
    updateProgress(0);
  }
  setRunningState(true);
  setStatus('🔄 Injetando extrator...', 'running');

  try {
    await ensureContentScript(tab);
    setStatus(isResuming ? '🔄 Retomando extração...' : '🚀 Extração iniciada!', 'running');
    const maxLeads = parseInt(maxLeadsEl.value) || 50;
    const payload = {
      action: isResuming ? 'resume' : 'start',
      maxLeads,
      config: PANEL_CONFIG
    };
    if (isResuming) {
      payload.leads = leads;
      payload.seenNamesArr = leads.map(l => l.name);
    }
    chrome.tabs.sendMessage(tab.id, payload, res => {
      if (chrome.runtime.lastError) {
        setStatus('❌ Erro de comunicação com a aba.', 'error');
        setRunningState(false); return;
      }
      if (res?.leads) {
        leads = res.leads;
        markDuplicates();
        renderLeads();
        updateStats();
        updateProgress(leads.length);
      }
      setStatus(`🎉 Concluído! <strong>${leads.length}</strong> leads únicos capturados.`, 'done');
      showNotification(leads.length);
      setRunningState(false);
    });
  } catch (err) {
    setStatus('❌ Erro: ' + err.message, 'error');
    setRunningState(false);
  }
}

async function handleStop() {
  const tab = await getCurrentTab();
  chrome.tabs.sendMessage(tab.id, { action: 'stop' }, res => {
    if (res?.leads) {
      leads = res.leads;
      markDuplicates();
      renderLeads();
      updateStats();
    }
    setStatus(`⏹ Parado. <strong>${leads.length}</strong> leads únicos.`, 'done');
    setRunningState(false);
  });
}

btnControl.addEventListener('click', () => {
  if (!isRunning) {
    handleStart();
  } else {
    handleStop();
  }
});

btnXLSX.addEventListener('click', async () => {
  setStatus('🔐 Verificando licença...', 'running');
  const licensed = await verifyLicenseBeforeAction();
  if (!licensed) {
    setStatus('❌ Licença expirada ou inválida. Verifique seu acesso.', 'error');
    return;
  }
  setStatus('', 'idle');
  exportXLSX();
});

btnResume.addEventListener('click', async () => {
  const tab = await getCurrentTab();
  if (!tab.url?.match(/google\.[^/]+\/maps/)) {
    setStatus('❌ Abra o Google Maps na mesma busca anterior e tente novamente.', 'error');
    return;
  }
  // Verifica licença antes de retomar
  setStatus('🔐 Verificando licença...', 'running');
  const licensed = await verifyLicenseBeforeAction();
  if (!licensed) {
    setStatus('❌ Licença expirada ou inválida. Verifique seu acesso.', 'error');
    return;
  }

  setRunningState(true);
  setStatus('🔄 Retomando extração...', 'running');
  try {
    await ensureContentScript(tab);
    const maxLeads = parseInt(maxLeadsEl.value) || 50;
    chrome.tabs.sendMessage(tab.id, { action: 'resume', maxLeads, config: PANEL_CONFIG }, res => {
      if (chrome.runtime.lastError) {
        setStatus('❌ Erro de comunicação com a aba.', 'error');
        setRunningState(false); return;
      }
      if (res?.leads) {
        leads = res.leads;
        markDuplicates();
        renderLeads();
        updateStats();
        updateProgress(leads.length);
      }
      setStatus(`🎉 Concluído! <strong>${leads.length}</strong> leads únicos capturados.`, 'done');
      showNotification(leads.length);
      setRunningState(false);
    });
  } catch (err) {
    setStatus('❌ Erro: ' + err.message, 'error');
    setRunningState(false);
  }
});

btnClear.addEventListener('click', () => {
  leads = []; activeFilter = 'all'; renderLeads(); updateStats();
  progressWrap.style.display = 'none';
  setStatus('Pronto. Faça uma busca e clique em <strong>Iniciar</strong>.', 'idle');
  btnXLSX.disabled = btnClear.disabled = btnResume.disabled = btnCopy.disabled = btnSave.disabled = btnWebhook.disabled = true;

  // Reseta estado visual do copiar
  btnCopy.style.borderColor = '';
  btnCopy.style.color = '';

  chrome.storage.local.remove(['savedLeads', 'seenNamesArr']);
  setRunningState(false); // Força atualização do rótulo para "Iniciar Extração"
});

btnCopy.addEventListener('click', async () => {
  setStatus('🔐 Verificando licença...', 'running');
  const licensed = await verifyLicenseBeforeAction();
  if (!licensed) {
    setStatus('❌ Licença expirada ou inválida. Verifique seu acesso.', 'error');
    return;
  }
  setStatus('', 'idle');
  copyToSheets();
});

btnSave.addEventListener('click', async () => {
  if (leads.length === 0) return;
  setStatus('🔐 Verificando licença...', 'running');
  const licensed = await verifyLicenseBeforeAction();
  if (!licensed) {
    setStatus('❌ Licença expirada ou inválida. Verifique seu acesso.', 'error');
    return;
  }
  setStatus('', 'idle');
  saveToHistory([...leads]);

  // Feedback visual no botão
  const oldHtml = btnSave.innerHTML;
  btnSave.innerHTML = '<i class="bi bi-check-circle-fill"></i>';
  btnSave.style.borderColor = '#38ef7d';
  btnSave.style.color = '#38ef7d';
  setTimeout(() => {
    btnSave.innerHTML = oldHtml;
    btnSave.style.borderColor = '';
    btnSave.style.color = '';
  }, 2000);
});

btnWebhook.addEventListener('click', async () => {
  const manualUrl = (webhookUrlEl?.value || '').trim();
  const defaultUrl = `${(PANEL_CONFIG.LICENSE_API_BASE || '').replace(/\/$/, '')}${PANEL_CONFIG.LICENSE_WEBHOOK_PATH || '/webhook-maps-extension'}`;
  const url = manualUrl || defaultUrl;
  if (leads.length === 0) return;

  setStatus('🔐 Verificando licença...', 'running');
  const licensed = await verifyLicenseBeforeAction();
  if (!licensed) {
    setStatus('❌ Licença expirada ou inválida. Verifique seu acesso.', 'error');
    return;
  }

  setStatus('📤 Enviando para o painel...', 'running');
  try {
    const license_key = String(((await new Promise(r => chrome.storage.local.get([LICENSE_STORAGE_KEY], r)))[LICENSE_STORAGE_KEY] || '')).trim().toUpperCase();
    const device_id = await getOrCreateLicenseFingerprint();
    const mappedLeads = leads.filter(l => !l.isDuplicate).map(l => ({
      nome_empresa: l.name || '',
      telefone: l.phone || '',
      site: l.website || '',
      endereco: l.address || '',
      rating: l.rating || null,
      reviews: l.reviews || null,
      categoria: l.category || '',
      email: l.email || '',
      instagram: l.instagram || '',
      facebook: l.facebook || '',
      linkedin: l.linkedin || '',
    }));
    const isPanelEndpoint = !manualUrl;
    const payload = isPanelEndpoint
      ? { license_key, device_id, leads: mappedLeads }
      : {
          source: PANEL_CONFIG.APP_NAME,
          timestamp: new Date().toISOString(),
          total: leads.length,
          leads: leads.filter(l => !l.isDuplicate).map(l => {
          // Garante a ordem dos campos no JSON
          return {
            name: l.name || '',
            category: l.category || '',
            phone: l.phone || '',
            whatsapp: (l.phone && isMobile(l.phone)) ? buildWaLink(l.phone, l.name) : '',
            email: l.email || '',
            instagram: l.instagram || '',
            facebook: l.facebook || '',
            linkedin: l.linkedin || '',
            twitter: l.twitter || '',
            youtube: l.youtube || '',
            website: l.website || (l.website ? (l.website.startsWith('http') ? l.website : 'https://' + l.website) : ''),
            address: l.address || '',
            rating: l.rating || '',
            reviews: l.reviews || '',
            score: calcScore(l)
          };
          })
        };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      setStatus('✅ Leads enviados com sucesso!', 'done');
      const oldHtml = btnWebhook.innerHTML;
      btnWebhook.innerHTML = '<i class="bi bi-check-circle-fill"></i>';
      btnWebhook.style.borderColor = '#38ef7d';
      btnWebhook.style.color = '#38ef7d';
      setTimeout(() => {
        btnWebhook.innerHTML = oldHtml;
        btnWebhook.style.borderColor = '';
        btnWebhook.style.color = '';
      }, 2000);
    } else {
      throw new Error(`Erro HTTP: ${response.status}`);
    }
  } catch (err) {
    setStatus('❌ Erro ao enviar: ' + err.message, 'error');
  }
});

// Salva mensagem WA e Webhook URL ao alterar
waMessageEl?.addEventListener('change', () => {
  chrome.storage.local.set({ waMessage: waMessageEl.value });
});

webhookUrlEl?.addEventListener('change', () => {
  chrome.storage.local.set({ webhookUrl: webhookUrlEl.value });
});

// ── PROGRESSO EM TEMPO REAL ──────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'progress') {
    if (isRunning !== msg.isRunning) {
      setRunningState(msg.isRunning);
    }
    setStatus(msg.message, isRunning ? 'running' : 'done');
    updateProgress(msg.count);

    if (msg.leads) {
      leads = msg.leads;
      markDuplicates();
      renderLeads();
      updateStats();
    }
  }

  if (msg.action === 'stop' || msg.action === 'stop_from_modal') {
    setRunningState(false);
    if (msg.leads) {
      leads = msg.leads;
      markDuplicates();
      renderLeads();
      updateStats();
    }
    setStatus('⏹ Parado.', 'done');
  }

  if (msg.action === 'clear') {
    leads = [];
    activeFilter = 'all';
    renderLeads();
    updateStats();
    setRunningState(false);
    setStatus('Pronto.', 'idle');
  }
});

// Atualiza o histórico em tempo real quando alterado (ex: pelo modal)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.extractionHistory) {
    renderHistory();
  }
});

// ── SESSÃO PERSISTIDA ────────────────────────────────────────

chrome.storage.local.get(['savedLeads', 'waMessage', 'webhookUrl'], async result => {
  if (result.savedLeads?.length) {
    leads = result.savedLeads;
    markDuplicates();
    renderLeads();
    updateStats();

    // Default state
    setRunningState(false);
    updateProgress(leads.length);
    setStatus(`📋 <strong>${leads.length}</strong> leads da sessão anterior.`, 'done');

    // Sync with content script if it's running
    const tab = await getCurrentTab();
    if (tab && tab.url?.match(/google\.[^/]+\/maps/)) {
      chrome.tabs.sendMessage(tab.id, { action: 'ping' }, res => {
        if (!chrome.runtime.lastError && res?.pong) {
          // Sincroniza leads e estado de execução
          if (res.leads && res.leads.length > 0) {
            leads = res.leads;
            markDuplicates();
            renderLeads();
            updateStats();
          }
          if (res.lastMessage) {
            setStatus(res.lastMessage, res.isRunning ? 'running' : 'done');
          }
          if (res.count !== undefined) {
            updateProgress(res.count);
          }
          if (res.isRunning) {
            setRunningState(true);
          } else {
            setRunningState(false);
          }
        }
      });
    }
  }
  if (waMessageEl && result.waMessage !== undefined) {
    waMessageEl.value = result.waMessage;
  }
  if (webhookUrlEl && result.webhookUrl !== undefined) {
    webhookUrlEl.value = result.webhookUrl;
  }
});

window.addEventListener('beforeunload', () => {
  chrome.storage.local.set({ savedLeads: leads });
});

// ── PAGINAÇÃO ─────────────────────────────────────────────────

document.getElementById('pgPrev').addEventListener('click', () => {
  if (currentPage > 1) { currentPage--; renderLeads(); }
});

document.getElementById('pgNext').addEventListener('click', () => {
  currentPage++; renderLeads();
});

// Reset para página 1 ao trocar filtro
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    currentPage = 1;
    renderLeads();
  });
});

// ── HISTORY LOGIC ─────────────────────────────────────────────

function saveToHistory(leadsToSave) {
  if (!leadsToSave || leadsToSave.length === 0) return;

  chrome.storage.local.get(['extractionHistory'], result => {
    const history = result.extractionHistory || [];
    const newSession = {
      id: Date.now(),
      date: new Date().toLocaleString('pt-BR'),
      leads: leadsToSave,
      count: leadsToSave.length
    };

    // Mantém apenas as últimas 10 sessões
    const updatedHistory = [newSession, ...history].slice(0, 10);
    chrome.storage.local.set({ extractionHistory: updatedHistory }, () => {
      renderHistory();
    });
  });
}

function renderHistory() {
  chrome.storage.local.get(['extractionHistory'], result => {
    const history = result.extractionHistory || [];

    // Atualiza o contador de sessões
    if (historyCountEl) {
      historyCountEl.textContent = `${history.length} / 10`;
    }

    if (history.length === 0) {
      historyList.innerHTML = `<div class="empty-state" style="padding: 10px 0; font-size: 10px;">Nenhuma sessão salva.</div>`;
      return;
    }

    historyList.innerHTML = history.map(session => `
      <div class="history-item" data-id="${session.id}">
        <div class="history-item-info">
          <div class="history-item-date">${session.date}</div>
          <div class="history-item-count">${session.count} leads</div>
        </div>
        <div class="history-actions">
          <button class="btn-hist-action btn-hist-restore" data-tooltip="Restaurar esta sessão">
            <i class="bi bi-arrow-up-circle"></i>
          </button>
          <button class="btn-hist-action btn-hist-export" data-tooltip="Exportar para Excel">
            <i class="bi bi-download"></i>
          </button>
          <button class="btn-hist-action btn-hist-delete" data-tooltip="Excluir do histórico">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `).join('');

    // Eventos restore/delete
    historyList.querySelectorAll('.btn-hist-restore').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.history-item').dataset.id;
        restoreSession(id);
      });
    });

    historyList.querySelectorAll('.btn-hist-export').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.history-item').dataset.id;
        exportHistorySession(id);
      });
    });

    historyList.querySelectorAll('.btn-hist-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.history-item').dataset.id;
        deleteHistoryItem(id);
      });
    });
  });
}

function restoreSession(id) {
  chrome.storage.local.get(['extractionHistory'], result => {
    const history = result.extractionHistory || [];
    const session = history.find(s => String(s.id) === String(id));

    if (session && confirm(`Deseja restaurar a sessão do dia ${session.date} com ${session.count} leads?`)) {
      leads = session.leads;
      markDuplicates();
      activeFilter = 'all';
      currentPage = 1;

      renderLeads();
      updateStats();
      updateProgress(leads.length);
      setRunningState(false);
      setStatus(`📋 Sessão restaurada: <strong>${leads.length}</strong> leads.`, 'done');

      // Salva no storage principal para persistência imediata
      chrome.storage.local.set({ savedLeads: leads });

      // Fecha seção histórico após restaurar
      btnHistoryToggle.click();
    }
  });
}

function exportHistorySession(id) {
  chrome.storage.local.get(['extractionHistory'], result => {
    const history = result.extractionHistory || [];
    const session = history.find(s => String(s.id) === String(id));
    if (session) {
      exportXLSX(session.leads);
    }
  });
}

function deleteHistoryItem(id) {
  chrome.storage.local.get(['extractionHistory'], result => {
    const history = result.extractionHistory || [];
    const updatedHistory = history.filter(s => String(s.id) !== String(id));
    chrome.storage.local.set({ extractionHistory: updatedHistory }, () => {
      renderHistory();
    });
  });
}

btnHistoryToggle.addEventListener('click', () => {
  const isOpen = historySection.style.display === 'block';
  // Fecha configurações se estiver aberto
  if (!isOpen) configSection.style.display = 'none';
  btnConfigToggle?.classList.remove('active');

  historySection.style.display = isOpen ? 'none' : 'block';
  btnHistoryToggle.classList.toggle('active', !isOpen);
  if (!isOpen) renderHistory();
});

btnConfigToggle?.addEventListener('click', () => {
  const isOpen = configSection.style.display === 'block';
  // Fecha histórico se estiver aberto
  if (!isOpen) historySection.style.display = 'none';
  btnHistoryToggle?.classList.remove('active');

  configSection.style.display = isOpen ? 'none' : 'block';
  btnConfigToggle.classList.toggle('active', !isOpen);
});

btnClearHistory.addEventListener('click', () => {
  if (confirm('Deseja apagar todo o histórico de extração?')) {
    chrome.storage.local.set({ extractionHistory: [] }, () => {
      renderHistory();
    });
  }
});

// Abrir Extractor CRM Dashboard
document.getElementById('whatsapp-crm-card')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('whatsapp.html') });
});

// Inicializa histórico
renderHistory();
