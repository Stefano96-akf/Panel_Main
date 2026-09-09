/**
 * PANEL - Logica applicativa (100% client-side)
 *
 * La logica dell'app è organizzata in moduli "object literal" (const NomeModulo = {…}),
 * uno per file sotto js/, caricati in ordine da app.html con <script src> classici —
 * nessun ES module, nessun bundler, nessun build step. Essendo classic script,
 * condividono lo stesso scope globale: i moduli si vedono tra loro per nome.
 *
 * Ordine di caricamento (vedi app.html):
 *   storage → validators → utils → clients(+groups) → assets → notes →
 *   tasks(+boards) → appointments → dashboard → toast → modal → dom →
 *   ui → sidebar → alertdialog → main (init su DOMContentLoaded)
 *
 * Questo file: STORAGE — persistenza dati (localStorage / sessionStorage).
 */

// ============================================================================
// STORAGE MODULE - Pure data persistence
// ============================================================================
const Storage = {
  keys: {
    clients: 'panel_clients',
    notes: 'panel_notes',
    tasks: 'panel_tasks',
    appointments: 'panel_appointments',
    assets: 'panel_assets',
    groups: 'panel_groups',
    boards: 'panel_boards',
    currentBoard: 'panel_current_board',
    darkMode: 'panel_dark_mode',
    layoutExpanded: 'panel_layout_expanded',
    sidebarCollapsed: 'panlink_sidebar_collapsed',
  },

  // Chiavi dei DATI (contenuti utente). Quando Supabase è attivo, la fonte è il
  // cloud: qui teniamo solo una cache di SESSIONE (sessionStorage), che sparisce
  // a scheda chiusa e al logout — nessun dato utente resta persistito nel
  // browser. In modalità locale (senza Supabase) restano in localStorage per
  // non perderli a scheda chiusa. Preferenze e token di login restano sempre in
  // localStorage.
  dataKeys: [
    'panel_clients', 'panel_notes', 'panel_tasks', 'panel_appointments',
    'panel_assets', 'panel_groups', 'panel_boards', 'panel_current_board'
  ],

  _cloud() { return typeof window !== 'undefined' && !!window.sb; },
  _backend(key) {
    if (Storage._cloud() && Storage.dataKeys.indexOf(key) !== -1) {
      try { if (window.sessionStorage) return window.sessionStorage; } catch (e) {}
    }
    return window.localStorage;
  },

  get(key, defaultValue = []) {
    try {
      const item = Storage._backend(key).getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`[Storage] Error reading ${key}:`, error);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      Storage._backend(key).setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`[Storage] Error writing ${key}:`, error);
      return false;
    }
  },

  remove(key) {
    try {
      Storage._backend(key).removeItem(key);
      return true;
    } catch (error) {
      console.error(`[Storage] Error removing ${key}:`, error);
      return false;
    }
  },

  clear() {
    try {
      Object.values(Storage.keys).forEach(key => Storage.remove(key));
      return true;
    } catch (error) {
      console.error('[Storage] Error clearing:', error);
      return false;
    }
  },

  // Cancella TUTTI i dati utente da entrambe le memorie (usato al logout)
  clearData() {
    Storage.dataKeys.forEach(k => {
      try { window.localStorage.removeItem(k); } catch (e) {}
      try { if (window.sessionStorage) window.sessionStorage.removeItem(k); } catch (e) {}
    });
  },

  // Migrazione una-tantum: in modalità cloud sposta gli eventuali dati rimasti
  // in localStorage (versioni precedenti) nella cache di sessione, poi ripulisce
  // localStorage così nessun contenuto utente resta persistito nel browser.
  migrateToSession() {
    if (!Storage._cloud()) return;
    try { if (!window.sessionStorage) return; } catch (e) { return; }
    Storage.dataKeys.forEach(k => {
      try {
        const ls = window.localStorage.getItem(k);
        if (ls != null) {
          if (window.sessionStorage.getItem(k) == null) window.sessionStorage.setItem(k, ls);
          window.localStorage.removeItem(k);
        }
      } catch (e) {}
    });
  }
};

