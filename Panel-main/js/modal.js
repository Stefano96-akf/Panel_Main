// ============================================================================
// MODAL MODULE - Modal dialog management with accessibility
// ============================================================================
const Modal = {
  element: null,
  onSave: null,
  focusTrap: null,
  previousActiveElement: null,
  escapeHandler: null,
  currentOptions: null,

  init() {
    Modal.element = document.getElementById('modal');
    Modal.setupEventListeners();
  },

  setupEventListeners() {
    const cancelBtn = document.getElementById('modalCancel');
    const saveBtn = document.getElementById('modalSave');

    // Chiude su OGNI elemento con data-modal-close (backdrop + 'x' dell'header):
    // prima si legava solo il primo match, così la 'x' non funzionava.
    Modal.element.querySelectorAll('[data-modal-close]').forEach((el) =>
      el.addEventListener('click', () => Modal.close())
    );
    cancelBtn?.addEventListener('click', () => Modal.close());
    saveBtn?.addEventListener('click', () => Modal.handleSave());
  },

  open(title, content, onSaveCallback, options) {
    options = options || {};
    Modal.onSave = onSaveCallback;
    Modal.previousActiveElement = document.activeElement;

    const titleEl = Modal.element.querySelector('#modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const saveBtn = document.getElementById('modalSave');

    titleEl.textContent = title;
    bodyEl.innerHTML = content;

    // Bottone di conferma: reset ai default, poi eventuale override per-modale
    // (es. eliminazioni → "Conferma" in stile pericolo, non "Salva").
    if (saveBtn) {
      saveBtn.textContent = options.confirmLabel || 'Salva';
      saveBtn.classList.toggle('btn--danger', !!options.danger);
    }

    Modal.element.setAttribute('aria-hidden', 'false');
    Modal.element.classList.add('show');

    // Setup focus trap
    Modal.setupFocusTrap();

    // Setup ESC key handler (single global listener)
    Modal.setupEscapeHandler();

    // Auto-focus first input or button
    setTimeout(() => {
      const firstInput = bodyEl.querySelector('input, textarea, select');
      firstInput?.focus();
    }, 100);
  },

  setupEscapeHandler() {
    // Remove any existing handler first
    if (Modal.escapeHandler) {
      document.removeEventListener('keydown', Modal.escapeHandler);
    }

    // Create and store new handler
    Modal.escapeHandler = (e) => {
      if (e.key === 'Escape' && Modal.isOpen()) {
        e.preventDefault();
        Modal.close();
      }
    };

    document.addEventListener('keydown', Modal.escapeHandler);
  },

  close() {
    Modal.element.setAttribute('aria-hidden', 'true');
    Modal.element.classList.remove('show');
    Modal.onSave = null;
    Modal.removeFocusTrap();

    // Remove ESC handler
    if (Modal.escapeHandler) {
      document.removeEventListener('keydown', Modal.escapeHandler);
      Modal.escapeHandler = null;
    }

    // Restore previous focus.
    // Cattura l'elemento in una variabile locale PRIMA di azzerare la proprietà:
    // il setTimeout è asincrono e leggerebbe altrimenti un valore già null.
    const toFocus = Modal.previousActiveElement;
    Modal.previousActiveElement = null;
    if (toFocus && typeof toFocus.focus === 'function') {
      setTimeout(() => toFocus.focus(), 100);
    }
  },

  isOpen() {
    return Modal.element.getAttribute('aria-hidden') === 'false';
  },

  handleSave() {
    if (Modal.onSave) {
      try {
        const result = Modal.onSave(document.getElementById('modalBody'));
        if (result !== false) {
          Modal.close();
        }
      } catch (error) {
        console.error('[Modal] Save error:', error);
        Toast.error('Errore durante il salvataggio');
      }
    }
  },

  // Elementi focusabili calcolati ON DEMAND: il contenuto della modale può
  // essere iniettato DOPO l'apertura (es. le checkbox asset), quindi non va
  // memorizzato al momento dell'open. Esclude elementi disabilitati o nascosti.
  getFocusable() {
    const nodes = Modal.element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(nodes).filter(el =>
      !el.disabled && el.offsetParent !== null && el.getAttribute('aria-hidden') !== 'true'
    );
  },

  setupFocusTrap() {
    const focusTrapHandler = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = Modal.getFocusable();
      if (focusable.length === 0) return;
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement || !Modal.element.contains(document.activeElement)) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    Modal.focusTrap = focusTrapHandler;
    Modal.element.addEventListener('keydown', Modal.focusTrap);
  },

  removeFocusTrap() {
    if (Modal.focusTrap) {
      Modal.element.removeEventListener('keydown', Modal.focusTrap);
      Modal.focusTrap = null;
    }
  }
};

