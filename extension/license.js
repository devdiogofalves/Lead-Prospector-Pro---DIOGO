/**
 * license.js — Maps Lead Pro (online / Lovable Cloud)
 * Valida MPL-XXXXXXXX contra a edge function extension-license.
 */
(function () {
  const CFG = window.EXT_CONFIG || {};
  const STORAGE_KEY = CFG.LICENSE_STORAGE_KEY || 'mpl_license_key';
  const DEVICE_KEY  = CFG.LICENSE_DEVICE_KEY  || 'mpl_device_fingerprint';
  const LAST_KEY    = CFG.LICENSE_LAST_VALIDATED_KEY || 'mpl_last_validated_at';
  const PREFIX      = (CFG.LICENSE_PREFIX || 'MPL').toUpperCase();
  const KEY_REGEX   = new RegExp(`^${PREFIX}-[A-Z0-9]{8}$`);
  const VALIDATE_URL = `${(CFG.LICENSE_API_BASE || '').replace(/\/$/, '')}${CFG.LICENSE_VALIDATE_PATH || '/extension-license'}`;

  const overlay   = document.getElementById('licenseOverlay');
  const input     = document.getElementById('licenseEmail');
  const button    = document.getElementById('licenseBtn');
  const msg       = document.getElementById('licenseMsg');
  const appNameEl = document.getElementById('licenseAppName');

  if (appNameEl) appNameEl.textContent = CFG.APP_NAME || 'Maps Lead Pro';
  if (input) {
    input.type = 'text';
    input.placeholder = `${PREFIX}-XXXXXXXX`;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 12;
    input.style.textTransform = 'uppercase';
    input.style.letterSpacing = '1px';
    const label = input.previousElementSibling;
    if (label && label.tagName === 'LABEL') label.textContent = 'Sua chave de licença';
  }
  if (button) button.textContent = 'Ativar extensão';

  function showMsg(text, color = '#718096') {
    if (msg) { msg.textContent = text; msg.style.color = color; }
  }
  function showOverlay() { if (overlay) overlay.style.display = 'flex'; }
  function hideOverlay() { if (overlay) overlay.style.display = 'none'; }

  async function getDeviceId() {
    return new Promise(resolve => {
      chrome.storage.local.get([DEVICE_KEY], r => {
        let id = r[DEVICE_KEY];
        if (!id) {
          id = `mpl-${(crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
          chrome.storage.local.set({ [DEVICE_KEY]: id });
        }
        resolve(id);
      });
    });
  }

  async function validateOnline(licenseKey) {
    const device_id = await getDeviceId();
    try {
      const res = await fetch(VALIDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: licenseKey,
          device_id,
          device_info: navigator.userAgent
        })
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok && data && data.valid === true, data };
    } catch (e) {
      return { ok: false, data: { error: String(e) } };
    }
  }

  function unlockApp(licenseKey) {
    hideOverlay();
    const footer = document.querySelector('.footer');
    if (footer && licenseKey && licenseKey !== 'LICENSE_DISABLED') {
      footer.innerHTML = `✅ Licença: <strong style="color:#38ef7d">${licenseKey}</strong>
        &nbsp;·&nbsp;<span id="logoutBtn" style="cursor:pointer;color:#718096;text-decoration:underline">Sair</span>`;
      const logout = document.getElementById('logoutBtn');
      if (logout) logout.addEventListener('click', () => {
        chrome.storage.local.remove([STORAGE_KEY, LAST_KEY], () => location.reload());
      });
    }
  }

  async function handleActivate() {
    if (!input) return;
    const licenseKey = input.value.trim().toUpperCase();
    if (!KEY_REGEX.test(licenseKey)) {
      showMsg(`Digite uma chave válida no formato ${PREFIX}-XXXXXXXX.`, '#ff5f6d');
      return;
    }
    showMsg('🔐 Validando...', '#4facfe');
    const { ok, data } = await validateOnline(licenseKey);
    if (!ok) {
      showMsg(`❌ ${(data && data.error) || 'Chave inválida'}`, '#ff5f6d');
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEY]: licenseKey, [LAST_KEY]: Date.now() });
    showMsg('✅ Licença confirmada!', '#38ef7d');
    setTimeout(() => unlockApp(licenseKey), 500);
  }

  if (CFG.LICENSE_ENABLED === false) {
    unlockApp('LICENSE_DISABLED');
    return;
  }

  if (button) button.addEventListener('click', handleActivate);
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') handleActivate(); });

  chrome.storage.local.get([STORAGE_KEY], result => {
    const saved = String(result[STORAGE_KEY] || '').trim().toUpperCase();
    if (saved && KEY_REGEX.test(saved)) {
      if (input) input.value = saved;
      unlockApp(saved);
    } else {
      showOverlay();
    }
  });
})();
