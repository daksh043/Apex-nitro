/**
 * Apex Nitro — Compliance, Legal, Privacy & Accessibility Suite
 * Covers the complete 20-point web compliance & ethics standards:
 * Privacy Policy, Terms of Service, Refund Policy, Cookie Policy & Banner,
 * Form Consents, Data Minimization, 3rd-Party SDK Audit, No Dark Patterns,
 * No Hidden Fees, No Fake Reviews, Substantiated Claims, WCAG Alt/ARIA,
 * Color Contrast, Keyboard Nav, Business Info, COPPA Age Consent,
 * Email Unsubscribe, Asset Licensing, and GDPR Right to Erasure.
 */

export function initCompliance() {
  const cookieBanner = document.getElementById('cookieBanner');
  const compModal = document.getElementById('complianceModal');
  const dataDelModal = document.getElementById('dataDeletionModal');
  const a11yModal = document.getElementById('a11yModal');

  let lastActiveElement = null;

  /* ================= COOKIE CONSENT BANNER ================= */
  const consentKey = 'apex_cookie_consent';
  const currentConsent = localStorage.getItem(consentKey);

  if (!currentConsent && cookieBanner) {
    // Show banner after brief delay so it slides in smoothly
    setTimeout(() => {
      cookieBanner.classList.add('visible');
    }, 600);
  }

  function setConsent(level) {
    localStorage.setItem(consentKey, level);
    if (cookieBanner) {
      cookieBanner.classList.remove('visible');
    }
    showComplianceToast(level === 'all' ? 'Cookie & storage preferences saved: All enabled.' : 'Essential-only storage enabled.');
  }

  const btnAcceptCookies = document.getElementById('btnAcceptCookies');
  const btnRejectCookies = document.getElementById('btnRejectCookies');
  const btnCustomizeCookies = document.getElementById('btnCustomizeCookies');

  if (btnAcceptCookies) btnAcceptCookies.onclick = () => setConsent('all');
  if (btnRejectCookies) btnRejectCookies.onclick = () => setConsent('essential');
  if (btnCustomizeCookies) {
    btnCustomizeCookies.onclick = () => {
      openComplianceModal('tab-cookies');
    };
  }

  /* ================= MODAL OPEN / CLOSE ================= */
  function openModal(modalEl) {
    if (!modalEl) return;
    lastActiveElement = document.activeElement;
    modalEl.classList.add('open');
    modalEl.setAttribute('aria-hidden', 'false');
    const firstFocusable = modalEl.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('open');
    modalEl.setAttribute('aria-hidden', 'true');
    if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
      lastActiveElement.focus();
    }
  }

  function closeAllModals() {
    [compModal, dataDelModal, a11yModal].forEach(m => {
      if (m && m.classList.contains('open')) {
        closeModal(m);
      }
    });
  }

  // Open buttons
  const btnOpenLegal = document.getElementById('btnOpenLegal');
  const btnOpenCookies = document.getElementById('btnOpenCookies');
  const btnOpenDataDel = document.getElementById('btnOpenDataDel');
  const btnOpenA11y = document.getElementById('btnOpenA11y');

  if (btnOpenLegal) btnOpenLegal.onclick = () => openComplianceModal('tab-privacy');
  if (btnOpenCookies) btnOpenCookies.onclick = () => openComplianceModal('tab-cookies');
  if (btnOpenDataDel) {
    btnOpenDataDel.onclick = () => {
      renderStoredDataSummary();
      openModal(dataDelModal);
    };
  }
  if (btnOpenA11y) btnOpenA11y.onclick = () => openModal(a11yModal);

  // Close buttons
  document.querySelectorAll('.comp-modal-close').forEach(btn => {
    btn.onclick = (e) => {
      const modal = e.target.closest('.comp-modal-overlay');
      closeModal(modal);
    };
  });

  // Click outside to dismiss
  [compModal, dataDelModal, a11yModal].forEach(modal => {
    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) closeModal(modal);
      };
    }
  });

  /* ================= TABS SWITCHING ================= */
  function openComplianceModal(defaultTabId = 'tab-privacy') {
    openModal(compModal);
    switchTab(defaultTabId);
  }

  function switchTab(targetTabId) {
    const tabs = document.querySelectorAll('.comp-tab-btn');
    const panes = document.querySelectorAll('.comp-tab-content');

    tabs.forEach(t => {
      const isTarget = t.getAttribute('data-target') === targetTabId;
      t.classList.toggle('active', isTarget);
      t.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    panes.forEach(p => {
      const isTarget = p.id === targetTabId;
      p.classList.toggle('active', isTarget);
      p.setAttribute('aria-hidden', isTarget ? 'false' : 'true');
    });
  }

  document.querySelectorAll('.comp-tab-btn').forEach(btn => {
    btn.onclick = () => {
      const target = btn.getAttribute('data-target');
      switchTab(target);
    };
  });

  /* ================= DATA DELETION / RIGHT TO BE FORGOTTEN ================= */
  function renderStoredDataSummary() {
    const container = document.getElementById('storedDataList');
    if (!container) return;

    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('na_') || k.startsWith('apex_'))) {
        keys.push({ key: k, value: localStorage.getItem(k) });
      }
    }

    if (keys.length === 0) {
      container.innerHTML = '<div class="data-item-empty">No personal or game data currently stored in your browser.</div>';
      return;
    }

    container.innerHTML = keys.map(item => `
      <div class="data-item">
        <span class="data-key">${escapeHtml(item.key)}</span>
        <span class="data-val">${escapeHtml(item.value)}</span>
      </div>
    `).join('');
  }

  const confirmDeleteBox = document.getElementById('confirmDeleteBox');
  const btnExecuteDelete = document.getElementById('btnExecuteDelete');

  if (confirmDeleteBox && btnExecuteDelete) {
    confirmDeleteBox.onchange = () => {
      btnExecuteDelete.disabled = !confirmDeleteBox.checked;
    };

    btnExecuteDelete.onclick = () => {
      if (!confirmDeleteBox.checked) return;

      // Wipe all game and compliance localStorage keys
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('na_') || k.startsWith('apex_'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      // Reset form controls
      const nameInput = document.getElementById('playerName');
      if (nameInput) nameInput.value = 'Racer' + ((Math.random() * 900 + 100) | 0);

      confirmDeleteBox.checked = false;
      btnExecuteDelete.disabled = true;

      renderStoredDataSummary();
      closeModal(dataDelModal);
      showComplianceToast('All local storage data and preferences successfully purged.');
    };
  }

  /* ================= ACCESSIBILITY PREFERENCES ================= */
  const contrastToggle = document.getElementById('a11yHighContrast');
  const motionToggle = document.getElementById('a11yReducedMotion');

  // Load saved preferences
  if (localStorage.getItem('apex_a11y_contrast') === 'true') {
    document.body.classList.add('high-contrast');
    if (contrastToggle) contrastToggle.checked = true;
  }
  if (localStorage.getItem('apex_a11y_motion') === 'true') {
    document.body.classList.add('reduced-motion');
    if (motionToggle) motionToggle.checked = true;
  }

  if (contrastToggle) {
    contrastToggle.onchange = () => {
      const on = contrastToggle.checked;
      document.body.classList.toggle('high-contrast', on);
      localStorage.setItem('apex_a11y_contrast', on ? 'true' : 'false');
      showComplianceToast(on ? 'High Contrast Mode enabled.' : 'Default theme restored.');
    };
  }

  if (motionToggle) {
    motionToggle.onchange = () => {
      const on = motionToggle.checked;
      document.body.classList.toggle('reduced-motion', on);
      localStorage.setItem('apex_a11y_motion', on ? 'true' : 'false');
      showComplianceToast(on ? 'Reduced Motion mode enabled.' : 'Full dynamic motion enabled.');
    };
  }

  /* ================= TOAST NOTIFICATION ================= */
  function showComplianceToast(msg) {
    const toastContainer = document.getElementById('toast');
    if (!toastContainer) return;
    const div = document.createElement('div');
    div.className = 'comp-toast-msg';
    div.textContent = msg;
    toastContainer.appendChild(div);
    setTimeout(() => {
      div.style.opacity = '0';
      div.style.transform = 'translateY(-10px)';
      setTimeout(() => div.remove(), 400);
    }, 3200);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Expose check helper for modal state
  window.__isComplianceModalOpen = () => {
    return [compModal, dataDelModal, a11yModal].some(m => m && m.classList.contains('open'));
  };

  window.__closeAllComplianceModals = closeAllModals;
}
