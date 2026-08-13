/**
 * PANEL - APP.JS
 * Modern SaaS Dashboard (100% Client-side)
 * 
 * Architecture:
 * - Storage: LocalStorage management
 * - Clients, Notes, Tasks, Appointments: Data logic
 * - DOM: Rendering logic
 * - UI: User interactions
 * - Modal: Modal management with accessibility
 * - Toast: Toast notifications
 * - DarkMode: Theme switching
 * - Validators: Form validation
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
    darkMode: 'panel_dark_mode',
    layoutExpanded: 'panel_layout_expanded',
    sidebarCollapsed: 'panlink_sidebar_collapsed',
  },

  get(key, defaultValue = []) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`[Storage] Error reading ${key}:`, error);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`[Storage] Error writing ${key}:`, error);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
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
  }
};

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

// ============================================================================
// UTILS MODULE - Helper functions
// ============================================================================
const Utils = {
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text || '').replace(/[&<>"']/g, m => map[m]);
  },

  // Ritorna l'URL solo se ha schema http/https, altrimenti stringa vuota.
  // Difesa in profondità per link `javascript:`/`data:` eventualmente già
  // presenti in localStorage (salvati prima della validazione più stretta).
  safeUrl(url) {
    try {
      const parsed = new URL(url);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? url : '';
    } catch {
      return '';
    }
  },

  generateId() {
    return Date.now() + Math.random().toString(36).substr(2, 9);
  },

  debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  formatDate(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('it-IT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  },

  formatDateShort(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('it-IT');
    } catch {
      return isoString;
    }
  },

  csvEscape(value) {
    const escaped = String(value || '').replace(/"/g, '""');
    return `"${escaped}"`;
  },

  arrayToCsv(rows, headers) {
    const headerLine = headers.map(h => Utils.csvEscape(h)).join(',');
    const dataLines = rows.map(row =>
      headers.map(h => Utils.csvEscape(row[h])).join(',')
    );
    return [headerLine, ...dataLines].join('\r\n');
  },

  downloadCsv(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  getCurrentDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
};

// ============================================================================
// CLIENTS MODULE - Client management
// ============================================================================
const Clients = {
  normalize(client = {}) {
    return {
      ...client,
      id: client.id || Utils.generateId(),
      nome: client.nome || client.name || '',
      link: client.link || '',
      assets: Array.isArray(client.assets) ? client.assets : [],
      createdAt: client.createdAt || new Date().toISOString()
    };
  },

  getAll() {
    const clients = Storage.get(Storage.keys.clients, []);
    return clients.map(Clients.normalize);
  },

  save(clientsList) {
    return Storage.set(Storage.keys.clients, clientsList.map(Clients.normalize));
  },

  add(nome, link, assets = []) {
    const clients = Clients.getAll();
    const newClient = {
      id: Utils.generateId(),
      nome,
      link,
      assets: assets || [],
      createdAt: new Date().toISOString()
    };
    clients.unshift(newClient);
    Clients.save(clients);
    return newClient;
  },

  update(id, nome, link, assets = []) {
    const clients = Clients.getAll();
    const index = clients.findIndex(c => c.id === id);
    if (index === -1) return false;
    clients[index] = { ...clients[index], nome, link, assets: assets || [] };
    Clients.save(clients);
    return true;
  },

  delete(id) {
    const clients = Clients.getAll();
    const filtered = clients.filter(c => c.id !== id);
    Clients.save(filtered);
    return true;
  },

  search(query) {
    const clients = Clients.getAll();
    const q = (query || '').toLowerCase();
    return clients.filter(c =>
      (c.nome || '').toLowerCase().includes(q) ||
      (c.link || '').toLowerCase().includes(q)
    );
  },

  toCSV() {
    const clients = Clients.getAll();
    const rows = clients.map(c => ({
      Nome: c.nome,
      Link: c.link,
      'Data creazione': Utils.formatDate(c.createdAt)
    }));
    return Utils.arrayToCsv(rows, ['Nome', 'Link', 'Data creazione']);
  }
};

// ============================================================================
// ASSETS MODULE - Asset management (riutilizzabili per elementi)
// ============================================================================
const Assets = {
  getAll() {
    return Storage.get(Storage.keys.assets, []);
  },

  getById(id) {
    return Assets.getAll().find(asset => asset.id === id);
  },

  getByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    return Assets.getAll().filter(asset => ids.includes(asset.id));
  },

  save(asset) {
    const assets = Assets.getAll();
    const name = (asset?.name || '').trim();
    const description = (asset?.description || '').trim();

    if (!name) {
      return { success: false, error: 'Il nome asset e obbligatorio' };
    }

    const duplicate = assets.find(a =>
      (a.name || '').toLowerCase() === name.toLowerCase() && a.id !== asset?.id
    );
    if (duplicate) {
      return { success: false, error: 'Asset con questo nome esiste gia' };
    }

    const payload = {
      id: asset?.id || Utils.generateId(),
      name,
      description,
      createdAt: asset?.createdAt || new Date().toISOString()
    };

    const index = assets.findIndex(a => a.id === payload.id);
    if (index === -1) {
      assets.push(payload);
    } else {
      assets[index] = payload;
    }

    assets.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    Storage.set(Storage.keys.assets, assets);
    return { success: true, asset: payload };
  },

  add(name, description = '') {
    return Assets.save({ name, description });
  },

  getLinkedCount(id) {
    return Clients.getAll().filter(client => (client.assets || []).includes(id)).length;
  },

  delete(id) {
    const filteredAssets = Assets.getAll().filter(asset => asset.id !== id);
    Storage.set(Storage.keys.assets, filteredAssets);

    const clients = Clients.getAll().map(client => ({
      ...client,
      assets: (client.assets || []).filter(assetId => assetId !== id)
    }));
    Clients.save(clients);

    return true;
  },

  renderList(container) {
    if (!container) return;

    const assets = Assets.getAll();
    container.innerHTML = '';

    if (assets.length === 0) {
      container.innerHTML = `
        <div class="assets-list__empty">
          <p>Nessun asset creato</p>
          <p style="font-size: var(--font-size-xs); margin-top: var(--spacing-sm);">Crea il primo asset dal bottone sopra</p>
        </div>
      `;
      return;
    }

    assets.forEach(asset => {
      const linkedCount = Assets.getLinkedCount(asset.id);
      const card = document.createElement('article');
      card.className = 'asset-item asset-card';
      card.innerHTML = `
        <div class="asset-item__info">
          <div class="asset-item__name">${Utils.escapeHtml(asset.name)}</div>
          <div class="asset-item__desc">${Utils.escapeHtml(asset.description || 'Nessuna descrizione')}</div>
          <div class="asset-item__meta">Collegato a ${linkedCount} ${linkedCount === 1 ? 'elemento' : 'elementi'}</div>
        </div>
        <div class="asset-item__actions">
          <button class="asset-item__action-btn" title="Modifica" data-edit-asset="${asset.id}">
            <i class="fa-solid fa-pen"></i>
            
          </button>
          <button class="asset-item__action-btn asset-item__action-btn--delete" title="Elimina" data-delete-asset="${asset.id}">
            <i class="fa-solid fa-trash"></i>
            
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  },

  renderSelection(container, selectedIds = []) {
    if (!container) return;

    const assets = Assets.getAll();
    if (assets.length === 0) {
      container.innerHTML = `
        <div class="assets-empty-state">
          <p class="assets-empty-state__text">Nessun asset disponibile.</p>
          <p class="assets-empty-state__text">Crea un asset prima di associarlo.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="asset-selection-list" role="group" aria-label="Asset disponibili">
        ${assets.map(asset => `
          <label class="asset-selection-item" for="asset-check-${asset.id}">
            <input
              type="checkbox"
              id="asset-check-${asset.id}"
              class="asset-selection-checkbox"
              value="${asset.id}"
              ${selectedIds.includes(asset.id) ? 'checked' : ''}
            >
            <span class="asset-selection-custom" aria-hidden="true"></span>
            <span class="asset-selection-content">
              <span class="asset-selection-name">${Utils.escapeHtml(asset.name)}</span>
              ${asset.description ? `<span class="asset-selection-desc">${Utils.escapeHtml(asset.description)}</span>` : ''}
            </span>
          </label>
        `).join('')}
      </div>
    `;
  }
};

// ============================================================================
// NOTES MODULE - Notes management
// ============================================================================
const Notes = {
  getAll() {
    return Storage.get(Storage.keys.notes, []);
  },

  save(notesList) {
    return Storage.set(Storage.keys.notes, notesList);
  },

  add(text) {
    const notes = Notes.getAll();
    const newNote = {
      id: Utils.generateId(),
      text,
      createdAt: new Date().toISOString()
    };
    notes.unshift(newNote);
    Notes.save(notes);
    return newNote;
  },

  delete(id) {
    const notes = Notes.getAll();
    const filtered = notes.filter(n => n.id !== id);
    Notes.save(filtered);
    return true;
  },

  toCSV() {
    const notes = Notes.getAll();
    const rows = notes.map(n => ({
      Nota: n.text,
      'Data creazione': Utils.formatDate(n.createdAt)
    }));
    return Utils.arrayToCsv(rows, ['Nota', 'Data creazione']);
  }
};

// ============================================================================
// TASKS MODULE - Task management
// ============================================================================
const Tasks = {
  // Colonne della bacheca Kanban, in ordine
  statuses: ['todo', 'doing', 'done'],

  // Normalizza un task garantendo `status` e mantenendo `completed` sincronizzato
  // per retro-compatibilita con i record salvati prima della bacheca.
  normalize(task = {}) {
    const status = Tasks.statuses.includes(task.status)
      ? task.status
      : (task.completed ? 'done' : 'todo');
    return {
      ...task,
      id: task.id || Utils.generateId(),
      text: task.text || '',
      status,
      completed: status === 'done',
      createdAt: task.createdAt || new Date().toISOString()
    };
  },

  getAll() {
    return Storage.get(Storage.keys.tasks, []).map(Tasks.normalize);
  },

  save(tasksList) {
    return Storage.set(Storage.keys.tasks, tasksList.map(Tasks.normalize));
  },

  add(text, status = 'todo') {
    const tasks = Tasks.getAll();
    const newTask = Tasks.normalize({
      id: Utils.generateId(),
      text,
      status,
      createdAt: new Date().toISOString()
    });
    tasks.unshift(newTask);
    Tasks.save(tasks);
    return newTask;
  },

  toggle(id) {
    const tasks = Tasks.getAll();
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.status = task.status === 'done' ? 'todo' : 'done';
      task.completed = task.status === 'done';
      Tasks.save(tasks);
    }
    return true;
  },

  // Sposta un task in una colonna della bacheca
  setStatus(id, status) {
    if (!Tasks.statuses.includes(status)) return false;
    const tasks = Tasks.getAll();
    const task = tasks.find(t => t.id === id);
    if (!task) return false;
    if (task.status === status) return false;
    task.status = status;
    task.completed = status === 'done';
    Tasks.save(tasks);
    return true;
  },

  // Sposta un task alla colonna adiacente (dir = -1 sinistra, +1 destra)
  moveByOffset(id, dir) {
    const tasks = Tasks.getAll();
    const task = tasks.find(t => t.id === id);
    if (!task) return false;
    const current = Tasks.statuses.indexOf(task.status);
    const next = current + dir;
    if (next < 0 || next >= Tasks.statuses.length) return false;
    return Tasks.setStatus(id, Tasks.statuses[next]);
  },

  getByStatus(status) {
    return Tasks.getAll().filter(t => t.status === status);
  },

  delete(id) {
    const tasks = Tasks.getAll();
    const filtered = tasks.filter(t => t.id !== id);
    Tasks.save(filtered);
    return true;
  },

  update(id, text) {
    const tasks = Tasks.getAll();
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.text = text;
      Tasks.save(tasks);
    }
    return true;
  }
};

// ============================================================================
// APPOINTMENTS MODULE - Appointments management
// ============================================================================
const Appointments = {
  getAll() {
    return Storage.get(Storage.keys.appointments, []);
  },

  save(appointmentsList) {
    return Storage.set(Storage.keys.appointments, appointmentsList);
  },

  add(date, description, type = 'remote') {
    const appointments = Appointments.getAll();
    const newAppt = {
      id: Utils.generateId(),
      date,
      description,
      type,
      completed: false,
      createdAt: new Date().toISOString()
    };
    appointments.unshift(newAppt);
    Appointments.save(appointments);
    return newAppt;
  },

  toggle(id) {
    const appointments = Appointments.getAll();
    const appt = appointments.find(a => a.id === id);
    if (appt) {
      appt.completed = !appt.completed;
      Appointments.save(appointments);
    }
    return true;
  },

  delete(id) {
    const appointments = Appointments.getAll();
    const filtered = appointments.filter(a => a.id !== id);
    Appointments.save(filtered);
    return true;
  },

  getByType(type) {
    return Appointments.getAll()
      .filter(a => a.type === type)
      .sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
      });
  }
};

// ============================================================================
// TOAST MODULE - Notifications
// ============================================================================
const Toast = {
  container: null,

  init() {
    Toast.container = document.getElementById('toastContainer');
  },

  show(message, type = 'success', duration = 3000) {
    if (!Toast.container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    
    const iconMap = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };

    toast.innerHTML = `
      <span class="toast__icon">
        <i class="fa-solid ${iconMap[type] || iconMap.info}"></i>
      </span>
      <span class="toast__message">${Utils.escapeHtml(message)}</span>
      <button class="toast__close" aria-label="Chiudi notifica">
        <i class="fa-solid fa-times"></i>
      </button>
    `;

    const closeBtn = toast.querySelector('.toast__close');
    closeBtn.addEventListener('click', () => {
      toast.remove();
    });

    Toast.container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        toast.remove();
      }, duration);
    }
  },

  success(message) { Toast.show(message, 'success'); },
  error(message) { Toast.show(message, 'error'); },
  warning(message) { Toast.show(message, 'warning'); },
  info(message) { Toast.show(message, 'info'); }
};

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

// ============================================================================
// DOM MODULE - Rendering functions
// ============================================================================
const DOM = {
  // Cache DOM references
  clientsList: document.getElementById('clientsList'),
  notesList: document.getElementById('notesList'),
  tasksList: document.getElementById('tasksList'),
  appointmentsRemote: document.getElementById('appointmentsRemote'),
  appointmentsOnsite: document.getElementById('appointmentsOnsite'),
  clientSearch: document.getElementById('clientSearch'),

  // Clients rendering
  renderClients(clients = null) {
    const list = clients || Clients.getAll();
    DOM.clientsList.innerHTML = '';

    if (list.length === 0) {
      DOM.clientsList.innerHTML = `
        <div class="clients-list__empty">
          <div class="clients-list__empty-icon">
            <i class="fa-solid fa-inbox"></i>
          </div>
          <p>Nessun elemento</p>
        </div>
      `;
      return;
    }

    list.forEach(client => {
      const item = DOM.createClientElement(client);
      DOM.clientsList.appendChild(item);
    });
  },
  createClientElement(client) {
    const div = document.createElement('div');
    div.className = 'client-item';
    const assetBadgesHtml = client.assets && client.assets.length > 0 ? `
      <div class="asset-badges">
        ${Assets.getByIds(client.assets).map(asset => `<span class="asset-badge">${Utils.escapeHtml(asset.name)}</span>`).join('')}
      </div>
    ` : '';
    const safeLink = Utils.safeUrl(client.link);
    const nameCell = safeLink
      ? `<a href="${Utils.escapeHtml(safeLink)}"
             target="_blank"
             rel="noopener noreferrer"
             class="client-item__name">
          ${Utils.escapeHtml(client.nome)}
        </a>`
      : `<span class="client-item__name client-item__name--unsafe"
             title="Link non valido o non sicuro">
          ${Utils.escapeHtml(client.nome)}
        </span>`;
    div.innerHTML = `
      <div class="client-item__info">
        ${nameCell}
        <div class="client-item__date">${Utils.formatDate(client.createdAt)}</div>
        ${assetBadgesHtml}
      </div>
      <div class="client-item__actions">
        <button class="client-item__action-btn" title="Apri link"
                data-open-client="${client.id}" ${safeLink ? '' : 'disabled'}>
          <i class="fa-solid fa-up-right-from-square"></i>
        </button>
        <button class="client-item__action-btn" title="Modifica"
                data-edit-client="${client.id}">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="client-item__action-btn client-item__action-btn--delete" title="Elimina"
                data-delete-client="${client.id}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;

    return div;
  },

  // Notes rendering
  renderNotes() {
    const notes = Notes.getAll();
    DOM.notesList.innerHTML = '';

    if (notes.length === 0) {
      DOM.notesList.innerHTML = `
        <div class="notes-list__empty">
          <p>Nessuna nota ancora</p>
        </div>
      `;
      return;
    }

    notes.forEach(note => {
      const li = document.createElement('li');
      li.className = 'note-item';
      li.innerHTML = `
        <div class="note-item__content">
          <div class="note-item__text">${Utils.escapeHtml(note.text)}</div>
          <div class="note-item__date">${Utils.formatDate(note.createdAt)}</div>
        </div>
        <button class="note-item__delete" title="Elimina nota" data-delete-note="${note.id}">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;
      DOM.notesList.appendChild(li);
    });
  },

  // Tasks rendering (lista semplice). Aggiorna sempre anche la bacheca Kanban.
  renderTasks() {
    const tasks = Tasks.getAll();
    DOM.tasksList.innerHTML = '';

    if (tasks.length === 0) {
      DOM.tasksList.innerHTML = `
        <div class="tasks-list__empty">
          <p>Nessuna attività ancora</p>
        </div>
      `;
    } else {
      tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'task-item--completed' : ''}`;
        li.innerHTML = `
          <input type="checkbox"  class="task-item__checkbox"
                 data-toggle-task="${task.id}"
                 ${task.completed ? 'checked' : ''}>
          <span class="task-item__text">${Utils.escapeHtml(task.text)}</span>
          <div class="task-item__actions">
            <button class="task-item__action-btn" title="Modifica" data-edit-task="${task.id}">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="task-item__action-btn task-item__action-btn--delete"
                    title="Elimina" data-delete-task="${task.id}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        `;
        DOM.tasksList.appendChild(li);
      });
    }

    DOM.renderBoard();
  },

  // Etichette e stile per colonna della bacheca
  boardMeta: {
    todo:  { label: 'Da fare',    icon: 'fa-list-ul' },
    doing: { label: 'In corso',   icon: 'fa-spinner' },
    done:  { label: 'Completato', icon: 'fa-circle-check' }
  },

  // Kanban board rendering — ripopola solo le liste interne (le dropzone e i
  // relativi handler delegati restano vivi tra un render e l'altro).
  renderBoard() {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;

    const statusIndex = { todo: 0, doing: 1, done: 2 };

    Tasks.statuses.forEach(status => {
      const zone = board.querySelector(`[data-dropzone="${status}"]`);
      const countEl = board.querySelector(`[data-count="${status}"]`);
      if (!zone) return;

      const items = Tasks.getByStatus(status);
      if (countEl) countEl.textContent = items.length;

      if (items.length === 0) {
        zone.innerHTML = `<div class="kanban__empty">Trascina qui una card</div>`;
        return;
      }

      const idx = statusIndex[status];
      zone.innerHTML = items.map(task => {
        const canPrev = idx > 0;
        const canNext = idx < Tasks.statuses.length - 1;
        return `
          <article class="kanban-card kanban-card--${status}" draggable="true"
                   data-task-id="${task.id}" tabindex="0"
                   aria-label="${Utils.escapeHtml(task.text)}">
            <div class="kanban-card__text">${Utils.escapeHtml(task.text)}</div>
            <div class="kanban-card__footer">
              <span class="kanban-card__date">${Utils.formatDateShort(task.createdAt)}</span>
              <div class="kanban-card__actions">
                <button class="kanban-card__btn" title="Sposta a sinistra"
                        data-board-move="-1" data-task-id="${task.id}" ${canPrev ? '' : 'disabled'}>
                  <i class="fa-solid fa-arrow-left"></i>
                </button>
                <button class="kanban-card__btn" title="Sposta a destra"
                        data-board-move="1" data-task-id="${task.id}" ${canNext ? '' : 'disabled'}>
                  <i class="fa-solid fa-arrow-right"></i>
                </button>
                <button class="kanban-card__btn" title="Modifica" data-edit-task="${task.id}">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="kanban-card__btn kanban-card__btn--delete" title="Elimina" data-delete-task="${task.id}">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          </article>
        `;
      }).join('');
    });
  },

  // Appointments rendering
  renderAppointments() {
    const remote = Appointments.getByType('remote');
    const onsite = Appointments.getByType('onsite');

    DOM.appointmentsRemote.innerHTML = DOM.createAppointmentsHtml(remote);
    DOM.appointmentsOnsite.innerHTML = DOM.createAppointmentsHtml(onsite);
  },

  createAppointmentsHtml(appointments) {
    if (appointments.length === 0) {
      return `<div class="appts-list__empty">Nessun appuntamento</div>`;
    }

    return appointments.map(appt => `
      <li class="appt-item">
        <input type="checkbox" class="appt-item__checkbox" 
               data-toggle-appt="${appt.id}" 
               ${appt.completed ? 'checked' : ''}>
        <div class="appt-item__content">
          <div class="appt-item__date">${appt.date || 'Senza data'}</div>
          <div class="appt-item__desc">${Utils.escapeHtml(appt.description)}</div>
        </div>
        <div class="appt-item__actions">
          <button class="appt-item__action-btn" 
                  title="Elimina"
                  data-delete-appt="${appt.id}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </li>
    `).join('');
  },
  // Assets rendering
  renderAssets() {
    const assetsList = document.getElementById('assetsList');
    Assets.renderList(assetsList);
  }
};

// ============================================================================
// UI MODULE - User interactions
// ============================================================================
const UI = {
  init() {
    UI.setupClientHandlers();
    UI.setupAssetHandlers();
    UI.setupNoteHandlers();
    UI.setupTaskHandlers();
    UI.setupBoardHandlers();
    UI.setupAppointmentHandlers();
    UI.setupExportHandlers();
    UI.setupExpandHandler();
    UI.setupDarkModeHandler();
  },

  // Ridisegna la lista elementi rispettando il filtro di ricerca attivo,
  // così add/edit/delete non azzerano la ricerca corrente.
  refreshClients() {
    const query = (DOM.clientSearch?.value || '').trim();
    DOM.renderClients(query ? Clients.search(query) : null);
  },

  setupClientHandlers() {
    const addBtn = document.getElementById('addClientBtn');
    const searchInput = DOM.clientSearch;

    addBtn?.addEventListener('click', () => UI.handleAddClient());

    // Debounced search
    searchInput?.addEventListener('input',
      Utils.debounce(() => UI.refreshClients(), 300)
    );

    // Event delegation for client actions
    DOM.clientsList.addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-open-client]');
      const deleteBtn = e.target.closest('[data-delete-client]');
      const editBtn = e.target.closest('[data-edit-client]');

      if (openBtn) {
        const client = Clients.getAll().find(c => c.id === openBtn.dataset.openClient);
        const safe = client ? Utils.safeUrl(client.link) : '';
        if (safe) {
          window.open(safe, '_blank', 'noopener,noreferrer');
        } else {
          Toast.warning('Link non valido o non sicuro');
        }
      }

      if (deleteBtn) {
        const clientId = deleteBtn.dataset.deleteClient;
        UI.handleDeleteClient(clientId);
      }

      if (editBtn) {
        const clientId = editBtn.dataset.editClient;
        UI.handleEditClient(clientId);
      }
    });

    DOM.renderClients();
  },

  setupAssetHandlers() {
    const createAssetButtons = document.querySelectorAll('[data-create-asset-btn]');
    const assetsList = document.getElementById('assetsList');

    createAssetButtons.forEach(btn => {
      btn.addEventListener('click', () => UI.handleCreateAsset());
    });

    assetsList?.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-asset]');
      const editBtn = e.target.closest('[data-edit-asset]');
      if (deleteBtn) {
        UI.handleDeleteAsset(deleteBtn.dataset.deleteAsset);
      }
      if (editBtn) {
        UI.handleEditAsset(editBtn.dataset.editAsset);
      }
    });

    DOM.renderAssets();
  },

  handleCreateAsset() {
    const content = `
      <div class="form-group">
        <label for="assetName" class="label">Nome Asset:</label>
        <input type="text" id="assetName" class="input" placeholder="es. Modulo riutilizzabile">
      </div>
      <div class="form-group">
        <label for="assetDescription" class="label">Descrizione (opzionale):</label>
        <textarea id="assetDescription" class="textarea" placeholder="Descrizione dell'asset"></textarea>
      </div>
    `;

    Modal.open('Crea Asset', content, (body) => {
      const name = body.querySelector('#assetName').value.trim();
      const description = body.querySelector('#assetDescription').value.trim();

      const result = Assets.save({ name, description });
      if (!result.success) {
        Toast.error(result.error);
        return false;
      }

      DOM.renderAssets();
      UI.refreshClients();
      Toast.success('Asset creato con successo');
      return true;
    });
  },

  handleEditAsset(assetId) {
    const asset = Assets.getById(assetId);
    if (!asset) return;

    const content = `
      <div class="form-group">
        <label for="editAssetName" class="label">Nome Asset:</label>
        <input type="text" id="editAssetName" class="input" value="${Utils.escapeHtml(asset.name)}">
      </div>
      <div class="form-group">
        <label for="editAssetDescription" class="label">Descrizione:</label>
        <textarea id="editAssetDescription" class="textarea" placeholder="Descrizione dell'asset">${Utils.escapeHtml(asset.description || '')}</textarea>
      </div>
    `;

    Modal.open('Modifica Asset', content, (body) => {
      const name = body.querySelector('#editAssetName').value.trim();
      const description = body.querySelector('#editAssetDescription').value.trim();

      const result = Assets.save({
        id: asset.id,
        name,
        description,
        createdAt: asset.createdAt
      });

      if (!result.success) {
        Toast.error(result.error);
        return false;
      }

      DOM.renderAssets();
      UI.refreshClients();
      Toast.success('Asset aggiornato');
      return true;
    });
  },
  handleDeleteAsset(assetId) {
    const asset = Assets.getById(assetId);
    AlertDialog.confirmDelete({
      title: 'Elimina Asset',
      message: `Confermi l'eliminazione dell'asset "${asset?.name || 'selezionato'}"? L'asset verra rimosso anche da tutti gli elementi associati.`,
      onConfirm: () => {
        Assets.delete(assetId);
        UI.refreshClients();
        DOM.renderAssets();
        Toast.success('Asset eliminato');
      }
    });
  },

  handleAddClient() {
    const nameInput = document.getElementById('clientName');
    const linkInput = document.getElementById('clientLink');
    const nome = nameInput.value.trim();
    const link = linkInput.value.trim();

    const validation = Validators.validateClient(nome, link);
    if (!validation.valid) {
      Toast.error(validation.error);
      return;
    }

    const content = `
      <div class="client-add-modal modal-content-fade">
        <div class="form-group">
          <label class="label">Attributo</label>
          <div class="modal-static-field">${Utils.escapeHtml(nome)}</div>
        </div>
        <div class="form-group">
          <label class="label">Link</label>
          <div class="modal-static-field modal-static-field--link">${Utils.escapeHtml(link)}</div>
        </div>
        <div class="form-group">
          <h4 class="h3" style="margin-top: 0;">Asset disponibili</h4>
          <div id="clientAssetsSelection"></div>
        </div>
      </div>
    `;

    Modal.open('Aggiungi Elemento', content, (body) => {
      const selectedAssets = Array.from(body.querySelectorAll('.asset-selection-checkbox:checked'))
        .map(cb => cb.value);

      Clients.add(nome, link, selectedAssets);
      nameInput.value = '';
      linkInput.value = '';
      UI.refreshClients();
      Toast.success('Elemento aggiunto con asset associati');
      return true;
    });

    Assets.renderSelection(document.getElementById('clientAssetsSelection'), []);
  },

  handleEditClient(clientId) {
    const client = Clients.getAll().find(c => c.id === clientId);
    if (!client) return;

    const content = `
      <div class="form-group">
        <label for="editClientName" class="label">Attributo</label>
        <input type="text" id="editClientName" class="input" value="${Utils.escapeHtml(client.nome)}">
      </div>
      <div class="form-group">
        <label for="editClientLink" class="label">Link</label>
        <input type="url" id="editClientLink" class="input" value="${Utils.escapeHtml(client.link)}">
      </div>
      <div class="form-group">
        <label class="label">Asset associati:</label>
        <div id="editClientAssetsSelection"></div>
      </div>
    `;

    Modal.open('Modifica Elemento', content, (body) => {
      const nome = body.querySelector('#editClientName').value.trim();
      const link = body.querySelector('#editClientLink').value.trim();
      const selectedAssets = Array.from(body.querySelectorAll('.asset-selection-checkbox:checked'))
        .map(cb => cb.value);

      const validation = Validators.validateClient(nome, link);
      if (!validation.valid) {
        Toast.error(validation.error);
        return false;
      }

      Clients.update(clientId, nome, link, selectedAssets);
      UI.refreshClients();
      Toast.success('Elemento aggiornato');
      return true;
    });

    Assets.renderSelection(document.getElementById('editClientAssetsSelection'), client.assets || []);
  },

  handleDeleteClient(clientId) {
    const client = Clients.getAll().find(c => c.id === clientId);
    AlertDialog.confirmDelete({
      title: 'Elimina Elemento',
      message: `Confermi l'eliminazione dell'elemento "${client?.nome || 'selezionato'}"?`,
      onConfirm: () => {
        Clients.delete(clientId);
        UI.refreshClients();
        Toast.success('Elemento eliminato');
      }
    });
  },

  setupNoteHandlers() {
    const addBtn = document.getElementById('addNoteBtn');
    const input = document.getElementById('noteInput');

    addBtn?.addEventListener('click', () => UI.handleAddNote());
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        UI.handleAddNote();
      }
    });

    DOM.notesList.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-note]');
      if (deleteBtn) {
        const noteId = deleteBtn.dataset.deleteNote;
        UI.handleDeleteNote(noteId);
      }
    });

    DOM.renderNotes();
  },

  handleAddNote() {
    const text = document.getElementById('noteInput').value;

    const validation = Validators.validateNote(text);
    if (!validation.valid) {
      Toast.error(validation.error);
      return;
    }

    Notes.add(text);
    document.getElementById('noteInput').value = '';
    DOM.renderNotes();
    Toast.success('Nota aggiunta');
  },

  handleDeleteNote(noteId) {
    AlertDialog.confirmDelete({
      title: 'Elimina Nota',
      message: 'Confermi l\'eliminazione di questa nota?',
      onConfirm: () => {
        Notes.delete(noteId);
        DOM.renderNotes();
        Toast.success('Nota eliminata');
      }
    });
  },

  setupTaskHandlers() {
    const addBtn = document.getElementById('addTaskBtn');
    const input = document.getElementById('taskInput');

    addBtn?.addEventListener('click', () => UI.handleAddTask());
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        UI.handleAddTask();
      }
    });

    DOM.tasksList.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-task]');
      const editBtn = e.target.closest('[data-edit-task]');

      if (deleteBtn) {
        const taskId = deleteBtn.dataset.deleteTask;
        UI.handleDeleteTask(taskId);
      }

      if (editBtn) {
        const taskId = editBtn.dataset.editTask;
        UI.handleEditTask(taskId);
      }
    });

    DOM.tasksList.addEventListener('change', (e) => {
      const checkbox = e.target.closest('[data-toggle-task]');
      if (checkbox) {
        const taskId = checkbox.dataset.toggleTask;
        Tasks.toggle(taskId);
        DOM.renderTasks();
      }
    });

    DOM.renderTasks();
  },

  handleAddTask() {
    const text = document.getElementById('taskInput').value;

    const validation = Validators.validateTask(text);
    if (!validation.valid) {
      Toast.error(validation.error);
      return;
    }

    Tasks.add(text);
    document.getElementById('taskInput').value = '';
    DOM.renderTasks();
    Toast.success('Task aggiunta');
  },

  handleEditTask(taskId) {
    const task = Tasks.getAll().find(t => t.id === taskId);
    if (!task) return;

    const content = `
      <div class="form-group">
        <label for="editTaskText" class="label">Testo:</label>
        <input type="text" id="editTaskText" class="input" value="${Utils.escapeHtml(task.text)}">
      </div>
    `;

    Modal.open('Modifica Task', content, (body) => {
      const text = body.querySelector('#editTaskText').value;

      const validation = Validators.validateTask(text);
      if (!validation.valid) {
        Toast.error(validation.error);
        return false; // mantiene aperta la modale su input non valido
      }

      Tasks.update(taskId, text);
      DOM.renderTasks();
      Toast.success('Task aggiornata');
      return true;
    });
  },

  handleDeleteTask(taskId) {
    AlertDialog.confirmDelete({
      title: 'Elimina Task',
      message: 'Confermi l\'eliminazione di questa task?',
      onConfirm: () => {
        Tasks.delete(taskId);
        DOM.renderTasks();
        Toast.success('Task eliminata');
      }
    });
  },

  // ---- Kanban board (bacheca) ----
  setupBoardHandlers() {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;

    const input = document.getElementById('boardTaskInput');
    const addBtn = document.getElementById('boardAddTaskBtn');

    const addFromInput = () => {
      if (!input) return;
      const validation = Validators.validateTask(input.value);
      if (!validation.valid) {
        Toast.error(validation.error);
        return;
      }
      Tasks.add(input.value.trim(), 'todo');
      input.value = '';
      DOM.renderTasks();
      Toast.success('Attività aggiunta');
    };

    addBtn?.addEventListener('click', addFromInput);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addFromInput();
    });

    // Click delegato: sposta / modifica / elimina (edit e delete riusano gli handler task)
    board.addEventListener('click', (e) => {
      const moveBtn = e.target.closest('[data-board-move]');
      const editBtn = e.target.closest('[data-edit-task]');
      const deleteBtn = e.target.closest('[data-delete-task]');

      if (moveBtn) {
        const dir = parseInt(moveBtn.dataset.boardMove, 10);
        if (Tasks.moveByOffset(moveBtn.dataset.taskId, dir)) {
          DOM.renderTasks();
        }
        return;
      }
      if (editBtn) { UI.handleEditTask(editBtn.dataset.editTask); return; }
      if (deleteBtn) { UI.handleDeleteTask(deleteBtn.dataset.deleteTask); }
    });

    // Tastiera: frecce ← / → spostano la card focalizzata
    board.addEventListener('keydown', (e) => {
      const card = e.target.closest('.kanban-card');
      if (!card) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        if (Tasks.moveByOffset(card.dataset.taskId, dir)) DOM.renderTasks();
      }
    });

    // ---- Drag & Drop (delegato sul contenitore, sopravvive ai re-render) ----
    let draggingId = null;

    board.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.kanban-card');
      if (!card) return;
      draggingId = card.dataset.taskId;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggingId);
    });

    board.addEventListener('dragend', (e) => {
      e.target.closest('.kanban-card')?.classList.remove('is-dragging');
      board.querySelectorAll('.kanban__list.is-over')
        .forEach(el => el.classList.remove('is-over'));
      draggingId = null;
    });

    board.addEventListener('dragover', (e) => {
      const zone = e.target.closest('[data-dropzone]');
      if (!zone) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('is-over');
    });

    board.addEventListener('dragleave', (e) => {
      const zone = e.target.closest('[data-dropzone]');
      if (zone && !zone.contains(e.relatedTarget)) {
        zone.classList.remove('is-over');
      }
    });

    board.addEventListener('drop', (e) => {
      const zone = e.target.closest('[data-dropzone]');
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove('is-over');
      const id = draggingId || e.dataTransfer.getData('text/plain');
      if (id && Tasks.setStatus(id, zone.dataset.dropzone)) {
        DOM.renderTasks();
      }
    });
  },

  setupAppointmentHandlers() {
    const addBtn = document.getElementById('addApptBtn');

    addBtn?.addEventListener('click', () => UI.handleAddAppointment());

    document.getElementById('appointmentsRemote').addEventListener('change', (e) => {
      const checkbox = e.target.closest('[data-toggle-appt]');
      if (checkbox) {
        const apptId = checkbox.dataset.toggleAppt;
        Appointments.toggle(apptId);
        DOM.renderAppointments();
      }
    });

    document.getElementById('appointmentsOnsite').addEventListener('change', (e) => {
      const checkbox = e.target.closest('[data-toggle-appt]');
      if (checkbox) {
        const apptId = checkbox.dataset.toggleAppt;
        Appointments.toggle(apptId);
        DOM.renderAppointments();
      }
    });

    // Event delegation for delete
    document.getElementById('appointmentsRemote').addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-appt]');
      if (deleteBtn) {
        const apptId = deleteBtn.dataset.deleteAppt;
        UI.handleDeleteAppointment(apptId);
      }
    });

    document.getElementById('appointmentsOnsite').addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-appt]');
      if (deleteBtn) {
        const apptId = deleteBtn.dataset.deleteAppt;
        UI.handleDeleteAppointment(apptId);
      }
    });

    DOM.renderAppointments();
  },

  handleAddAppointment() {
    const date = document.getElementById('apptDate').value;
    const desc = document.getElementById('apptDesc').value;
    const type = document.getElementById('apptType').value;

    if (!Validators.isNotEmpty(desc)) {
      Toast.error('Descrizione richiesta');
      return;
    }

    Appointments.add(date, desc, type);
    document.getElementById('apptDate').value = '';
    document.getElementById('apptDesc').value = '';
    DOM.renderAppointments();
    Toast.success('Appuntamento aggiunto');
  },

  handleDeleteAppointment(apptId) {
    AlertDialog.confirmDelete({
      title: 'Elimina Appuntamento',
      message: 'Confermi l\'eliminazione di questo appuntamento?',
      onConfirm: () => {
        Appointments.delete(apptId);
        DOM.renderAppointments();
        Toast.success('Appuntamento eliminato');
      }
    });
  },

  setupExportHandlers() {
    const exportClientsBtn = document.getElementById('exportClientsBtn');
    const exportNotesBtn = document.getElementById('exportNotesBtn');

    exportClientsBtn?.addEventListener('click', () => {
      const clients = Clients.getAll();
      if (clients.length === 0) {
        Toast.warning('Nessun elemento da esportare');
        return;
      }

      const csv = Clients.toCSV();
      const filename = `elementi_${Utils.getCurrentDateString()}.csv`;
      Utils.downloadCsv(csv, filename);
      Toast.success('Elementi esportati');
    });

    exportNotesBtn?.addEventListener('click', () => {
      const notes = Notes.getAll();
      if (notes.length === 0) {
        Toast.warning('Nessuna nota da esportare');
        return;
      }

      const csv = Notes.toCSV();
      const filename = `note_${Utils.getCurrentDateString()}.csv`;
      Utils.downloadCsv(csv, filename);
      Toast.success('Note esportate');
    });
  },

  setupExpandHandler() {
    // La funzione "espandi" è stata rimossa con il passaggio al layout a pagine.
    // Bonifica un'eventuale preferenza vecchia in localStorage che altrimenti
    // applicherebbe la classe layout-expanded rompendo il nuovo layout.
    document.querySelector('.container')?.classList.remove('layout-expanded');
    if (Storage.get(Storage.keys.layoutExpanded) === 'true') {
      Storage.remove(Storage.keys.layoutExpanded);
    }
  },

  setupDarkModeHandler() {
    const toggle = document.getElementById('darkModeToggle');
    const html = document.documentElement;

    // Icona luna (tema chiaro) / sole (tema scuro)
    const setDarkIcon = (dark) => {
      const icon = toggle?.querySelector('i');
      if (!icon) return;
      icon.classList.toggle('fa-moon', !dark);
      icon.classList.toggle('fa-sun', dark);
    };

    // Load saved preference
    const isDark = Storage.get(Storage.keys.darkMode) === 'true';
    if (isDark) {
      html.classList.add('dark');
      toggle?.setAttribute('aria-pressed', 'true');
    }
    setDarkIcon(isDark);

    toggle?.addEventListener('click', () => {
      const dark = html.classList.toggle('dark');
      toggle.setAttribute('aria-pressed', dark);
      setDarkIcon(dark);
      Storage.set(Storage.keys.darkMode, dark ? 'true' : 'false');
    });
  }
};

// ============================================================================
// SIDEBAR NAV MODULE - Vertical navigation with accessibility
// ============================================================================
const SidebarNav = {
  keyCollapsed: Storage.keys.sidebarCollapsed,
  elements: {
    sidebar: null,
    toggle: null,
    links: []
  },
  pages: [],
  init() {
    SidebarNav.elements.sidebar = document.getElementById('appSidebar');
    SidebarNav.elements.toggle = document.getElementById('sidebarToggle');
    SidebarNav.elements.links = Array.from(document.querySelectorAll('.app-sidebar__link[data-nav-target]'));
    if (!SidebarNav.elements.sidebar || !SidebarNav.elements.toggle || SidebarNav.elements.links.length === 0) {
      return;
    }
    SidebarNav.pages = Array.from(document.querySelectorAll('.container .page'));
    SidebarNav.restoreState();
    SidebarNav.bindToggle();
    SidebarNav.bindLinks();
    SidebarNav.bindRouting();
    SidebarNav.bindOutsideClose();
  },
  isMobile() {
    return window.matchMedia('(max-width: 1024px)').matches;
  },
  restoreState() {
    const isCollapsed = Storage.get(SidebarNav.keyCollapsed) === 'true';
    if (isCollapsed && !SidebarNav.isMobile()) {
      document.body.classList.add('sidebar-collapsed');
    }
    SidebarNav.updateToggleAria();
  },
  bindToggle() {
    SidebarNav.elements.toggle.addEventListener('click', () => {
      if (SidebarNav.isMobile()) {
        document.body.classList.toggle('sidebar-open');
      } else {
        document.body.classList.toggle('sidebar-collapsed');
        Storage.set(SidebarNav.keyCollapsed, document.body.classList.contains('sidebar-collapsed') ? 'true' : 'false');
      }
      SidebarNav.updateToggleAria();
    });
    window.addEventListener('resize', Utils.debounce(() => {
      if (!SidebarNav.isMobile()) {
        document.body.classList.remove('sidebar-open');
      }
      SidebarNav.updateToggleAria();
    }, 120));
  },
  bindLinks() {
    SidebarNav.elements.links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.dataset.navTarget;
        if (!document.getElementById(targetId)) return;
        if (location.hash === '#' + targetId) {
          SidebarNav.route();          // stesso hash: forza comunque lo switch
        } else {
          location.hash = targetId;    // → hashchange → route()
        }
      });
    });
  },
  // Routing a pagine (hash-based): mostra una sola sezione per volta.
  bindRouting() {
    window.addEventListener('hashchange', () => SidebarNav.route());
    SidebarNav.route(); // stato iniziale (da hash o pagina di default)
  },
  validTarget(id) {
    return !!id
      && SidebarNav.elements.links.some(l => l.dataset.navTarget === id)
      && !!document.getElementById(id);
  },
  route() {
    let id = (location.hash || '').replace(/^#/, '');
    if (!SidebarNav.validTarget(id)) {
      id = SidebarNav.elements.links[0]?.dataset.navTarget;
    }
    if (id) SidebarNav.showPage(id);
  },
  showPage(targetId) {
    (SidebarNav.pages || []).forEach(page => {
      page.classList.toggle('is-active', page.id === targetId);
    });
    SidebarNav.setActive(targetId);
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (SidebarNav.isMobile()) {
      document.body.classList.remove('sidebar-open');
      SidebarNav.updateToggleAria();
    }
  },
  bindOutsideClose() {
    document.addEventListener('click', (e) => {
      if (!SidebarNav.isMobile()) return;
      if (!document.body.classList.contains('sidebar-open')) return;
      const inSidebar = e.target.closest('#appSidebar');
      const isToggle = e.target.closest('#sidebarToggle');
      if (!inSidebar && !isToggle) {
        document.body.classList.remove('sidebar-open');
        SidebarNav.updateToggleAria();
      }
    });
  },
  setActive(targetId) {
    SidebarNav.elements.links.forEach(link => {
      const isActive = link.dataset.navTarget === targetId;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  },
  updateToggleAria() {
    const expanded = SidebarNav.isMobile()
      ? document.body.classList.contains('sidebar-open')
      : !document.body.classList.contains('sidebar-collapsed');
    SidebarNav.elements.toggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    SidebarNav.elements.toggle?.setAttribute('aria-label', expanded ? 'Chiudi menu navigazione' : 'Apri menu navigazione');
  }
};

// ============================================================================
// ALERT DIALOG MODULE - Confirm actions with app modal
// ============================================================================
const AlertDialog = {
  confirmDelete({ title = 'Conferma eliminazione', message = 'Sei sicuro di voler eliminare questo elemento?', onConfirm }) {
    const content = `
      <div class="form-group">
        <p class="modal-alert-text">${Utils.escapeHtml(message)}</p>
      </div>
    `;

    Modal.open(title, content, () => {
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
      return true;
    }, { confirmLabel: 'Conferma', danger: true });
  }
};
// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();
  Modal.init();
  UI.init();
  SidebarNav.init();
});

























