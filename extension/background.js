/**
 * background.js v4.3
 * - Abre o Side Panel ao clicar no ícone da extensão
 * - Retransmite mensagens de progresso do content.js para o painel
 */

// Configurações de URL do Google Maps
const MAPS_URLS = [
  'google.com/maps',
  'google.com.br/maps',
  'google.com.ar/maps',
  'google.cl/maps',
  'google.com.mx/maps',
  'google.com.co/maps',
  'google.es/maps'
];

function isGoogleMaps(url) {
  if (!url) return false;
  return MAPS_URLS.some(mUrl => url.includes(mUrl));
}

// Ao instalar, desabilita o painel globalmente e configura as abas abertas
chrome.runtime.onInstalled.addListener(async () => {
  // Desabilita globalmente por padrão
  await chrome.sidePanel.setOptions({ enabled: false });

  // Desabilita a abertura automática ao clicar (controlaremos via onClicked)
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  // Verifica abas já abertas
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    await updateSidePanelForTab(tab.id, tab.url);
  }
});

// Monitora atualizações de URL nas abas
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    await updateSidePanelForTab(tabId, tab.url || changeInfo.url);
  }
});

// Monitora troca de abas para garantir estado correto
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await updateSidePanelForTab(tab.id, tab.url);
  } catch (e) { }
});

/**
 * Habilita ou desabilita o painel lateral dependendo do URL
 */
async function updateSidePanelForTab(tabId, url) {
  if (isGoogleMaps(url)) {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: true
    });
  } else {
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    });
  }
}

// Abre o side panel ao clicar no ícone
chrome.action.onClicked.addListener((tab) => {
  const isMaps = isGoogleMaps(tab.url);

  // 1. Habilita imediatamente (sem await para não perder o gesto do usuário)
  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'sidepanel.html',
    enabled: true
  }, () => {
    // 2. Abre o painel (precisa ser chamado logo após o clique)
    chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
      console.error('Erro ao abrir sidepanel:', err);
    });
  });

  // 3. Se não for Maps, redireciona
  if (!isMaps) {
    chrome.tabs.update(tab.id, { url: 'https://www.google.com/maps' });
  }
});

// Retransmite progresso do content.js para o side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'progress') {
    chrome.runtime.sendMessage(msg).catch(() => { });
  }
  if (msg.action === 'stop_from_modal') {
    chrome.runtime.sendMessage({ action: 'stop' }).catch(() => { });
  }
  if (msg.action === 'getLastProgress') {
    sendResponse({ message: '', count: 0 });
  }

  if (msg.action === 'enrich_lead' && msg.url) {
    enrichLead(msg.url).then(sendResponse);
    return true; // async
  }
});

/**
 * Busca o site em background (para evitar CORS) e extrai redes sociais e e-mail.
 */
async function enrichLead(url) {
  const result = { facebook: '', instagram: '', linkedin: '', twitter: '', email: '' };
  if (!url) return result;

  try {
    const target = url.startsWith('http') ? url : `https://${url}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const response = await fetch(target, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return result;
    const html = await response.text();

    // Regex para Redes Sociais
    const fb = html.match(/facebook\.com\/([a-zA-Z0-9.\-_]+)/i);
    const ig = html.match(/instagram\.com\/([a-zA-Z0-9.\-_]+)/i);
    const li = html.match(/linkedin\.com\/(?:company|in)\/([a-zA-Z0-9.\-_]+)/i);
    const tw = html.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9.\-_]+)/i);
    const yt = html.match(/(?:youtube\.com\/(?:@|channel\/|user\/|c\/)|youtu\.be\/)([a-zA-Z0-9.\-_]+)/i);

    // Regex para E-mail (básico mas funcional para scraping de site)
    const email = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

    if (fb) result.facebook = `https://www.facebook.com/${fb[1]}`;
    if (ig) result.instagram = `https://www.instagram.com/${ig[1]}`;
    if (li) result.linkedin = `https://www.linkedin.com/company/${li[1]}`;
    if (tw) result.twitter = `https://twitter.com/${tw[1]}`;
    if (yt) result.youtube = yt[0].includes('http') ? yt[0] : `https://www.youtube.com/${yt[1]}`;
    if (email) result.email = email[0].toLowerCase();

  } catch (e) {
    console.error('[Background] Erro ao enriquecer lead:', e);
  }
  return result;
}
