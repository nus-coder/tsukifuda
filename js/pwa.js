// PWAホーム画面追加プロンプト制御
'use strict';

(() => {
  const DISMISS_KEY = 'tsukifuda-install-dismissed';

  // 却下済みなら何もしない
  if (localStorage.getItem(DISMISS_KEY)) return;

  let deferredPrompt = null;
  const banner = document.getElementById('install-banner');
  const installBtn = document.getElementById('install-btn');
  const dismissBtn = document.getElementById('install-dismiss');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    banner.hidden = false;
    banner.classList.add('is-visible');
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.hidden = true;
    if (outcome === 'dismissed') {
      localStorage.setItem(DISMISS_KEY, '1');
    }
  });

  dismissBtn.addEventListener('click', () => {
    banner.hidden = true;
    localStorage.setItem(DISMISS_KEY, '1');
  });

  // インストール完了後も非表示
  window.addEventListener('appinstalled', () => {
    banner.hidden = true;
    deferredPrompt = null;
  });
})();
