// ============================================================================
// VALIDATORS MODULE - Form validation
// ============================================================================
const Validators = {
  isNotEmpty(value) {
    return value && value.trim().length > 0;
  },

  // Accetta SOLO http/https: new URL() da solo considera valido anche
  // `javascript:`, `data:`, `vbscript:` → potenziale XSS quando il valore
  // finisce in un attributo href.
  isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  },

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  validateClient(name, link) {
    if (!Validators.isNotEmpty(name)) {
      return { valid: false, error: 'Attributo richiesto' };
    }
    if (!Validators.isNotEmpty(link)) {
      return { valid: false, error: 'Link richiesto' };
    }
    if (!Validators.isValidUrl(link)) {
      return { valid: false, error: 'Il link deve iniziare con http:// o https://' };
    }
    return { valid: true };
  },

  validateNote(text) {
    if (!Validators.isNotEmpty(text)) {
      return { valid: false, error: 'Nota non può essere vuota' };
    }
    return { valid: true };
  },

  validateTask(text) {
    if (!Validators.isNotEmpty(text)) {
      return { valid: false, error: 'Task non può essere vuota' };
    }
    return { valid: true };
  }
};

