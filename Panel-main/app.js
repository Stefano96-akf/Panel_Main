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
  },

  // Parser CSV tollerante (virgolette, "" escaped, CRLF/LF). `delim` = separatore.
  csvParse(text, delim) {
    text = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = []; let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  },

  // CSV → array di oggetti chiavati dall'intestazione. Autorileva separatore , o ;
  csvToArray(text) {
    text = String(text || '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
    const rows = Utils.csvParse(text, delim);
    if (!rows.length) return [];
    const headers = rows[0].map(h => (h || '').trim());
    return rows.slice(1)
      .filter(r => r.some(v => (v || '').trim() !== ''))
      .map(r => { const o = {}; headers.forEach((h, i) => { o[h] = (r[i] != null ? r[i] : '').trim(); }); return o; });
  },

  // Normalizza una data in 'YYYY-MM-DD' (accetta anche DD/MM/YYYY, DD-MM-YY, ...)
  normalizeDate(str) {
    str = String(str || '').trim();
    if (!str) return '';
    let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = str.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (m) {
      let d = m[1], mo = m[2], y = m[3];
      if (y.length === 2) y = '20' + y;
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
    return '';
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
      groupId: client.groupId || null,
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

  add(nome, link, assets = [], groupId = null) {
    const clients = Clients.getAll();
    const newClient = {
      id: Utils.generateId(),
      nome,
      link,
      assets: assets || [],
      groupId: groupId || null,
      createdAt: new Date().toISOString()
    };
    clients.unshift(newClient);
    Clients.save(clients);
    return newClient;
  },

  update(id, nome, link, assets = [], groupId = undefined) {
    const clients = Clients.getAll();
    const index = clients.findIndex(c => c.id === id);
    if (index === -1) return false;
    const patch = { nome, link, assets: assets || [] };
    if (groupId !== undefined) patch.groupId = groupId || null;
    clients[index] = { ...clients[index], ...patch };
    Clients.save(clients);
    return true;
  },

  delete(id) {
    const clients = Clients.getAll();
    const filtered = clients.filter(c => c.id !== id);
    Clients.save(filtered);
    return true;
  },

  // Assegna un elemento a un gruppo/sotto-gruppo (o null = senza gruppo)
  setGroup(id, groupId) {
    const clients = Clients.getAll();
    const c = clients.find(x => x.id === id);
    if (!c) return false;
    c.groupId = groupId || null;
    Clients.save(clients);
    return true;
  },

  // Toglie dal gruppo tutti gli elementi che referenziano uno degli id passati
  ungroupBy(idSet) {
    const clients = Clients.getAll();
    let changed = false;
    clients.forEach(c => { if (c.groupId && idSet.has(c.groupId)) { c.groupId = null; changed = true; } });
    if (changed) Clients.save(clients);
    return changed;
  },

  // Import in blocco da righe CSV già mappate ({ nome, link, gruppo, sottogruppo })
  importRows(rows) {
    const clients = Clients.getAll();
    let added = 0, skipped = 0;
    rows.forEach(r => {
      const nome = (r.nome || '').trim();
      const link = (r.link || '').trim();
      if (!nome) { skipped++; return; }
      let groupId = null;
      const g = (r.gruppo || '').trim();
      const sg = (r.sottogruppo || '').trim();
      if (g && typeof Groups !== 'undefined') {
        const top = Groups.ensure(g, null);
        groupId = top.id;
        if (sg) groupId = Groups.ensure(sg, top.id).id;
      }
      clients.unshift(Clients.normalize({ id: Utils.generateId(), nome, link, groupId, createdAt: new Date().toISOString() }));
      added++;
    });
    Clients.save(clients);
    return { added, skipped };
  },

  search(query, groupId = 'all', assetId = 'all') {
    const q = (query || '').toLowerCase();
    return Clients.getAll().filter(c => {
      const matchesText = !q ||
        (c.nome || '').toLowerCase().includes(q) ||
        (c.link || '').toLowerCase().includes(q);
      const matchesGroup =
        groupId === 'all' ? true :
        groupId === 'none' ? !c.groupId :
        (c.groupId === groupId ||
         (typeof Groups !== 'undefined' && Groups.get(c.groupId) && Groups.get(c.groupId).parentId === groupId));
      const matchesAsset =
        assetId === 'all' ? true :
        assetId === 'none' ? (!Array.isArray(c.assets) || c.assets.length === 0) :
        (Array.isArray(c.assets) && c.assets.includes(assetId));
      return matchesText && matchesGroup && matchesAsset;
    });
  },

  toCSV() {
    const clients = Clients.getAll();
    const rows = clients.map(c => {
      const g = (typeof Groups !== 'undefined') ? Groups.get(c.groupId) : null;
      const top = g ? (g.parentId ? Groups.get(g.parentId) : g) : null;
      const sub = g && g.parentId ? g : null;
      return {
        Nome: c.nome,
        Link: c.link,
        Gruppo: top ? top.name : '',
        'Sotto-gruppo': sub ? sub.name : '',
        'Data creazione': Utils.formatDate(c.createdAt)
      };
    });
    return Utils.arrayToCsv(rows, ['Nome', 'Link', 'Gruppo', 'Sotto-gruppo', 'Data creazione']);
  }
};

// ============================================================================
// GROUPS MODULE - Cartelle a 2 livelli per gli Elementi (gruppo → sotto-gruppo)
// Ogni elemento sta in un gruppo o sotto-gruppo (o nessuno). Locale su
// `panel_groups`; in cloud rispecchiato nella tabella `groups` (permesso della
// sezione "clients") dal MAP di SupaSync.
// ============================================================================
const Groups = {
  getAll() { return Storage.get(Storage.keys.groups, []).map(Groups.normalize); },
  normalize(g = {}) {
    return {
      id: g.id || Utils.generateId(),
      name: g.name || '',
      parentId: g.parentId || null,
      createdAt: g.createdAt || new Date().toISOString()
    };
  },
  save(list) { return Storage.set(Storage.keys.groups, list.map(Groups.normalize)); },
  get(id) { return id ? (Groups.getAll().find(g => g.id === id) || null) : null; },
  topLevel() { return Groups.getAll().filter(g => !g.parentId); },
  children(parentId) { return Groups.getAll().filter(g => g.parentId === parentId); },

  add(name, parentId = null) {
    name = (name || '').trim();
    if (!name) return null;
    // niente sotto-sotto-gruppi: se il "parent" è già annidato, aggancia al suo top
    if (parentId) {
      const p = Groups.get(parentId);
      if (p && p.parentId) parentId = p.parentId;
    }
    const list = Groups.getAll();
    const g = Groups.normalize({ id: Utils.generateId(), name, parentId: parentId || null });
    list.push(g);
    Groups.save(list);
    return g;
  },

  // Trova (per nome, sotto lo stesso parent) o crea — usato dall'import CSV
  ensure(name, parentId = null) {
    name = (name || '').trim();
    const found = Groups.getAll().find(g =>
      (g.name || '').toLowerCase() === name.toLowerCase() && (g.parentId || null) === (parentId || null));
    return found || Groups.add(name, parentId);
  },

  rename(id, name) {
    name = (name || '').trim();
    if (!name) return false;
    const list = Groups.getAll();
    const g = list.find(x => x.id === id);
    if (!g) return false;
    g.name = name;
    Groups.save(list);
    return true;
  },

  remove(id) {
    const all = Groups.getAll();
    const ids = new Set([id, ...all.filter(g => g.parentId === id).map(g => g.id)]); // gruppo + sotto-gruppi
    Groups.save(all.filter(g => !ids.has(g.id)));
    if (typeof Clients !== 'undefined') Clients.ungroupBy(ids); // elementi coinvolti → senza gruppo
    return true;
  },

  // Etichetta completa "Gruppo / Sotto-gruppo"
  labelFor(id) {
    const g = Groups.get(id);
    if (!g) return '';
    if (g.parentId) { const p = Groups.get(g.parentId); return (p ? p.name + ' / ' : '') + g.name; }
    return g.name;
  }
};
window.Groups = Groups;

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
  // Normalizza un task: garantisce id, `boardId`, colonna (`status` = id colonna)
  // e mantiene `completed` come flag indipendente (usato dalla lista Attività).
  normalize(task = {}) {
    const status = task.status || 'todo';
    return {
      ...task,
      id: task.id || Utils.generateId(),
      boardId: task.boardId || null,
      text: task.text || '',
      status,
      completed: task.completed != null ? !!task.completed : (status === 'done'),
      createdAt: task.createdAt || new Date().toISOString()
    };
  },

  getAll() {
    return Storage.get(Storage.keys.tasks, []).map(Tasks.normalize);
  },

  save(tasksList) {
    return Storage.set(Storage.keys.tasks, tasksList.map(Tasks.normalize));
  },

  // Task di una singola bacheca
  getByBoard(boardId) {
    return Tasks.getAll().filter(t => t.boardId === boardId);
  },

  add(text, boardId, colId) {
    const tasks = Tasks.getAll();
    const newTask = Tasks.normalize({
      id: Utils.generateId(),
      boardId: boardId || null,
      text,
      status: colId || 'todo',
      createdAt: new Date().toISOString()
    });
    tasks.unshift(newTask);
    Tasks.save(tasks);
    return newTask;
  },

  toggle(id) {
    const tasks = Tasks.getAll();
    const task = tasks.find(t => t.id === id);
    if (task) { task.completed = !task.completed; Tasks.save(tasks); }
    return true;
  },

  // Sposta un task in una colonna (per id) della sua bacheca
  setColumn(id, colId) {
    const tasks = Tasks.getAll();
    const task = tasks.find(t => t.id === id);
    if (!task || task.status === colId) return false;
    task.status = colId;
    task.completed = colId === 'done';
    Tasks.save(tasks);
    return true;
  },

  // Sposta un task alla colonna adiacente nella sua bacheca (dir -1 / +1)
  moveByOffset(id, dir) {
    const task = Tasks.getAll().find(t => t.id === id);
    if (!task) return false;
    const board = (typeof Boards !== 'undefined') ? Boards.get(task.boardId) : null;
    if (!board) return false;
    const ids = board.cols.map(c => c.id);
    let current = ids.indexOf(task.status);
    if (current < 0) current = 0;
    const next = current + dir;
    if (next < 0 || next >= ids.length) return false;
    return Tasks.setColumn(id, ids[next]);
  },

  // Riassegna i task di una colonna (es. colonna eliminata) a un'altra colonna
  reassignColumn(boardId, fromColId, toColId) {
    const tasks = Tasks.getAll();
    let changed = false;
    tasks.forEach(t => {
      if (t.boardId === boardId && t.status === fromColId) {
        t.status = toColId; t.completed = toColId === 'done'; changed = true;
      }
    });
    if (changed) Tasks.save(tasks);
    return changed;
  },

  // Adotta i task senza bacheca (retro-compat) nella bacheca indicata
  adoptOrphans(boardId) {
    if (!boardId) return false;
    const tasks = Tasks.getAll();
    let changed = false;
    tasks.forEach(t => { if (!t.boardId) { t.boardId = boardId; changed = true; } });
    if (changed) Tasks.save(tasks);
    return changed;
  },

  // Elimina tutti i task di una bacheca (usato all'eliminazione della bacheca)
  deleteByBoard(boardId) {
    Tasks.save(Tasks.getAll().filter(t => t.boardId !== boardId));
  },

  delete(id) {
    Tasks.save(Tasks.getAll().filter(t => t.id !== id));
    return true;
  },

  update(id, text) {
    const tasks = Tasks.getAll();
    const task = tasks.find(t => t.id === id);
    if (task) { task.text = text; Tasks.save(tasks); }
    return true;
  }
};

// ============================================================================
// BOARDS MODULE - Bacheche Kanban multiple con colonne dinamiche
//
// Ogni bacheca ha un nome e un elenco ORDINATO di colonne [{id,label}].
// I task referenziano la bacheca (boardId) e la colonna (status = id colonna).
//
// Modello dati:
//   - Locale (solo localStorage): le bacheche vivono in `panel_boards`, la
//     bacheca attiva in `panel_current_board`. Tutto sincrono.
//   - Cloud (Supabase): le bacheche sono ONLINE-FIRST (tabella `boards` con RLS
//     per-bacheca) con cache in localStorage per il render sincrono. Le
//     scritture (create/rinomina/colonne/elimina/accesso) chiamano `window.sb`
//     e poi aggiornano la cache. `panel_boards` NON è nel MAP di SupaSync,
//     quindi scriverlo non innesca il push snapshot (niente clobbering).
// ============================================================================
const Boards = {
  MAX: 3,
  DEFAULT_COLS: [
    { id: 'todo',  label: 'Da fare' },
    { id: 'doing', label: 'In corso' },
    { id: 'done',  label: 'Completato' }
  ],

  normalize(b = {}) {
    let cols = Array.isArray(b.cols) ? b.cols : null;
    // retro-compat: colonne salvate come mappa {id: label}
    if (!cols && b.cols && typeof b.cols === 'object') {
      cols = Object.keys(b.cols).map(k => ({ id: k, label: String(b.cols[k]) }));
    }
    if (!cols || !cols.length) cols = Boards.DEFAULT_COLS.map(c => ({ ...c }));
    return {
      id: b.id || Utils.generateId(),
      name: b.name || 'Bacheca',
      cols: cols.map(c => ({ id: c.id || Utils.generateId(), label: c.label || 'Colonna' })),
      createdBy: b.createdBy || null,
      createdAt: b.createdAt || new Date().toISOString()
    };
  },

  // ---- stato cloud/permessi ----
  _online() { return !!window.sb && !!(window.Workspace && Workspace.state && Workspace.state.currentId); },
  _ws() { return (window.Workspace && Workspace.state && Workspace.state.currentId) || null; },
  _uid() { return (window.SupaSync && SupaSync.userId) || null; },
  isCloud() { return Boards._online(); },
  isAdmin() {
    const w = window.Workspace && Workspace.current && Workspace.current();
    return !!w && (w.role === 'owner' || w.role === 'admin');
  },
  canCreate() { return !Boards._online() || (window.Workspace && Workspace.canEdit('tasks')); },
  canEditTasks() { return !Boards._online() || (window.Workspace && Workspace.canEdit('tasks')); },
  canManageBoard(board) {
    if (!Boards._online()) return true;
    if (Boards.isAdmin()) return true;
    return !!board && !!board.createdBy && board.createdBy === Boards._uid();
  },
  canManageAccess(board) {
    if (!Boards._online()) return false; // l'accesso per-bacheca ha senso solo in cloud
    return Boards.canManageBoard(board);
  },

  _msg(e) {
    const m = (e && e.message) || '';
    if (/Limite di 3|too many|limit/i.test(m)) return 'Massimo ' + Boards.MAX + ' bacheche per spazio.';
    if (/row-level security|violates row-level|permission/i.test(m)) return 'Non hai i permessi per questa operazione.';
    return m || 'Operazione non riuscita.';
  },

  // ---- lettura sincrona (cache) ----
  all() {
    const list = Storage.get(Storage.keys.boards, []);
    if (Array.isArray(list) && list.length) return list.map(Boards.normalize);
    if (Boards._online()) return []; // in cloud il seed lo fa ensureDefaultAndAdopt()
    const def = Boards.normalize({ name: 'Bacheca' });
    Storage.set(Storage.keys.boards, [def]);
    return [def];
  },
  get(id) { return Boards.all().find(b => b.id === id) || null; },
  currentId() {
    const list = Boards.all();
    const saved = Storage.get(Storage.keys.currentBoard, null);
    if (saved && list.some(b => b.id === saved)) return saved;
    const first = list[0] ? list[0].id : null;
    if (first) Storage.set(Storage.keys.currentBoard, first);
    return first;
  },
  current() { const id = Boards.currentId(); return id ? Boards.get(id) : null; },
  setCurrent(id) { Storage.set(Storage.keys.currentBoard, id); },

  // ---- cache helpers ----
  _cacheUpsert(b) {
    const norm = Boards.normalize(b);
    const list = (Storage.get(Storage.keys.boards, []) || []).map(Boards.normalize).filter(x => x.id !== norm.id);
    list.push(norm);
    Storage.set(Storage.keys.boards, list);
  },
  _cacheRemove(id) {
    Storage.set(Storage.keys.boards, (Storage.get(Storage.keys.boards, []) || []).filter(x => x.id !== id));
  },

  // ---- sincronizzazione cloud ----
  async pull() {
    if (!Boards._online()) return;
    const { data, error } = await window.sb.from('boards')
      .select('id,name,cols,created_by,created_at')
      .order('created_at', { ascending: true });
    if (error) { console.error('[Boards] pull', error.message); return; }
    const list = (data || []).map(r => Boards.normalize({
      id: r.id, name: r.name, cols: r.cols, createdBy: r.created_by, createdAt: r.created_at
    }));
    Storage.set(Storage.keys.boards, list); // panel_boards non è nel MAP → nessun push
  },

  async ensureDefaultAndAdopt() {
    let list = Boards.all();
    if (!list.length && Boards.canCreate()) {
      await Boards.create('Bacheca');
      list = Boards.all();
    }
    const cur = Boards.current();
    if (cur) Tasks.adoptOrphans(cur.id);
  },

  // ---- mutazioni ----
  async create(name) {
    if (Boards.all().length >= Boards.MAX) {
      if (typeof Toast !== 'undefined') Toast.warning('Massimo ' + Boards.MAX + ' bacheche per spazio.');
      return null;
    }
    const cols = Boards.DEFAULT_COLS.map(c => ({ ...c }));
    name = (name || 'Bacheca').trim() || 'Bacheca';
    if (Boards._online()) {
      const { data, error } = await window.sb.from('boards')
        .insert({ workspace_id: Boards._ws(), name, cols })
        .select('id,name,cols,created_by,created_at').single();
      if (error) { if (typeof Toast !== 'undefined') Toast.error(Boards._msg(error)); return null; }
      Boards._cacheUpsert({ id: data.id, name: data.name, cols: data.cols, createdBy: data.created_by, createdAt: data.created_at });
      Boards.setCurrent(data.id);
      return Boards.get(data.id);
    }
    const b = Boards.normalize({ name, cols });
    Boards._cacheUpsert(b);
    Boards.setCurrent(b.id);
    return b;
  },

  async rename(id, name) {
    name = (name || '').trim();
    if (!name) return false;
    if (Boards._online()) {
      const { error } = await window.sb.from('boards').update({ name }).eq('id', id);
      if (error) { if (typeof Toast !== 'undefined') Toast.error(Boards._msg(error)); return false; }
    }
    const b = Boards.get(id);
    if (b) { b.name = name; Boards._cacheUpsert(b); }
    return true;
  },

  async setColumns(id, cols) {
    cols = (cols || []).map(c => ({ id: c.id || Utils.generateId(), label: (c.label || 'Colonna').trim() || 'Colonna' }));
    if (!cols.length) return false;
    if (Boards._online()) {
      const { error } = await window.sb.from('boards').update({ cols }).eq('id', id);
      if (error) { if (typeof Toast !== 'undefined') Toast.error(Boards._msg(error)); return false; }
    }
    const b = Boards.get(id);
    if (b) { b.cols = cols; Boards._cacheUpsert(b); }
    return true;
  },

  addColumn(id, label) {
    const b = Boards.get(id);
    if (!b) return Promise.resolve(false);
    const cols = b.cols.concat([{ id: Utils.generateId(), label: (label || 'Nuova colonna').trim() || 'Nuova colonna' }]);
    return Boards.setColumns(id, cols);
  },
  renameColumn(id, colId, label) {
    const b = Boards.get(id);
    if (!b) return Promise.resolve(false);
    const cols = b.cols.map(c => c.id === colId ? { id: c.id, label } : c);
    return Boards.setColumns(id, cols);
  },
  async removeColumn(id, colId) {
    const b = Boards.get(id);
    if (!b) return false;
    if (b.cols.length <= 1) { if (typeof Toast !== 'undefined') Toast.warning('Deve restare almeno una colonna.'); return false; }
    const remaining = b.cols.filter(c => c.id !== colId);
    Tasks.reassignColumn(id, colId, remaining[0].id);
    return Boards.setColumns(id, remaining);
  },

  async remove(id) {
    if (Boards.all().length <= 1) { if (typeof Toast !== 'undefined') Toast.warning('Deve restare almeno una bacheca.'); return false; }
    if (Boards._online()) {
      const { error } = await window.sb.from('boards').delete().eq('id', id);
      if (error) { if (typeof Toast !== 'undefined') Toast.error(Boards._msg(error)); return false; }
    }
    Tasks.deleteByBoard(id); // in cloud i task vanno in cascade; qui puliamo la cache locale
    Boards._cacheRemove(id);
    if (Boards.currentId() === id) {
      const next = Boards.all()[0];
      Boards.setCurrent(next ? next.id : null);
    }
    return true;
  },

  // ---- gestione accesso (collaboratori per-bacheca, solo cloud) ----
  async members(id) {
    if (!Boards._online()) return [];
    const { data, error } = await window.sb.rpc('board_members_emails', { b: id });
    if (error) { console.error('[Boards] members', error.message); return []; }
    return (data || []).map(r => ({ userId: r.user_id, email: r.email }));
  },
  async candidates(id) {
    if (!Boards._online()) return [];
    const { data, error } = await window.sb.rpc('workspace_members_emails', { ws: Boards._ws() });
    if (error) { console.error('[Boards] candidates', error.message); return []; }
    const memberIds = new Set((await Boards.members(id)).map(m => m.userId));
    return (data || []).filter(r => !memberIds.has(r.user_id)).map(r => ({ userId: r.user_id, email: r.email }));
  },
  async attach(id, userId) {
    if (!Boards._online()) return false;
    const { error } = await window.sb.from('board_members').insert({ board_id: id, user_id: userId });
    if (error) { if (typeof Toast !== 'undefined') Toast.error(Boards._msg(error)); return false; }
    return true;
  },
  async detach(id, userId) {
    if (!Boards._online()) return false;
    const { error } = await window.sb.from('board_members').delete().eq('board_id', id).eq('user_id', userId);
    if (error) { if (typeof Toast !== 'undefined') Toast.error(Boards._msg(error)); return false; }
    return true;
  }
};
window.Boards = Boards;

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

  update(id, patch) {
    const appointments = Appointments.getAll();
    const appt = appointments.find(a => a.id === id);
    if (!appt) return false;
    if (patch.date !== undefined) appt.date = patch.date || '';
    if (patch.description !== undefined) appt.description = patch.description || '';
    if (patch.type !== undefined) appt.type = patch.type || 'remote';
    if (patch.completed !== undefined) appt.completed = !!patch.completed;
    Appointments.save(appointments);
    return true;
  },

  get(id) { return Appointments.getAll().find(a => a.id === id) || null; },

  delete(id) {
    const appointments = Appointments.getAll();
    const filtered = appointments.filter(a => a.id !== id);
    Appointments.save(filtered);
    return true;
  },

  getByType(type) {
    return Appointments.getAll()
      .filter(a => a.type === type)
      .sort(Appointments._byDate);
  },

  _byDate(a, b) {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
  },

  _match(a, filters) {
    const f = filters || {};
    if (f.type && f.type !== 'all' && a.type !== f.type) return false;
    if (f.showCompleted === false && a.completed) return false;
    return true;
  },

  // Tutti gli appuntamenti filtrati, ordinati per data
  getFiltered(filters) {
    return Appointments.getAll().filter(a => Appointments._match(a, filters)).sort(Appointments._byDate);
  },

  // Appuntamenti di un giorno (dateStr 'YYYY-MM-DD'), filtrati
  forDate(dateStr, filters) {
    return Appointments.getAll()
      .filter(a => a.date === dateStr && Appointments._match(a, filters))
      .sort(Appointments._byDate);
  },

  // Import da righe CSV mappate ({ data, descrizione, tipo })
  importRows(rows) {
    const appts = Appointments.getAll();
    let added = 0, skipped = 0;
    rows.forEach(r => {
      const description = (r.descrizione || '').trim();
      if (!description) { skipped++; return; }
      const date = Utils.normalizeDate(r.data || '');
      const t = (r.tipo || '').trim().toLowerCase();
      const type = /onsite|sede|presenza|on-site|fisic/.test(t) ? 'onsite' : 'remote';
      appts.unshift({ id: Utils.generateId(), date, description, type, completed: false, createdAt: new Date().toISOString() });
      added++;
    });
    Appointments.save(appts);
    return { added, skipped };
  },

  toCSV() {
    const rows = Appointments.getFiltered({}).map(a => ({
      Data: a.date || '',
      Descrizione: a.description || '',
      Tipo: a.type === 'onsite' ? 'Onsite' : 'Da remoto',
      Completato: a.completed ? 'sì' : 'no'
    }));
    return Utils.arrayToCsv(rows, ['Data', 'Descrizione', 'Tipo', 'Completato']);
  }
};

// ============================================================================
// DASHBOARD MODULE - Analytics aggregate (sola lettura) da tutti i moduli
// ============================================================================
const Dashboard = {
  _len(mod, method) {
    try { return (typeof mod !== 'undefined' && mod && mod[method]) ? mod[method]().length : 0; }
    catch (e) { return 0; }
  },

  stats() {
    return {
      clients: Dashboard._len(typeof Clients !== 'undefined' ? Clients : null, 'getAll'),
      assets: Dashboard._len(typeof Assets !== 'undefined' ? Assets : null, 'getAll'),
      notes: Dashboard._len(typeof Notes !== 'undefined' ? Notes : null, 'getAll'),
      tasks: Dashboard._len(typeof Tasks !== 'undefined' ? Tasks : null, 'getAll'),
      appts: Dashboard._len(typeof Appointments !== 'undefined' ? Appointments : null, 'getAll'),
      boards: (typeof Boards !== 'undefined') ? Boards.all().length : 0,
      groups: Dashboard._len(typeof Groups !== 'undefined' ? Groups : null, 'getAll')
    };
  },

  taskStats() {
    const tasks = (typeof Tasks !== 'undefined') ? Tasks.getAll() : [];
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    const boards = (typeof Boards !== 'undefined') ? Boards.all() : [];
    const perBoard = boards.map(b => ({ name: b.name, count: tasks.filter(t => t.boardId === b.id).length }))
      .sort((a, b) => b.count - a.count);
    return { total, done, pct: total ? Math.round(done / total * 100) : 0, perBoard };
  },

  apptStats() {
    const all = (typeof Appointments !== 'undefined') ? Appointments.getAll() : [];
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return {
      total: all.length,
      upcoming: all.filter(a => a.date && a.date >= ts && !a.completed).length,
      completed: all.filter(a => a.completed).length,
      remote: all.filter(a => a.type === 'remote').length,
      onsite: all.filter(a => a.type === 'onsite').length
    };
  },

  groupStats() {
    const clients = (typeof Clients !== 'undefined') ? Clients.getAll() : [];
    const groups = (typeof Groups !== 'undefined') ? Groups.getAll() : [];
    const counts = groups
      .filter(g => !g.parentId)
      .map(g => {
        const subIds = (typeof Groups !== 'undefined') ? Groups.children(g.id).map(s => s.id) : [];
        const count = clients.filter(c => c.groupId === g.id || subIds.includes(c.groupId)).length;
        return { name: g.name, count };
      })
      .sort((a, b) => b.count - a.count);
    return { top: counts.slice(0, 6), none: clients.filter(c => !c.groupId).length };
  },

  recent(n = 6) {
    const items = [];
    const push = (arr, type, icon, nameFn) => (arr || []).forEach(x => items.push({ type, icon, name: nameFn(x), at: x.createdAt }));
    if (typeof Clients !== 'undefined') push(Clients.getAll(), 'Elemento', 'fa-up-right-from-square', x => x.nome);
    if (typeof Notes !== 'undefined') push(Notes.getAll(), 'Nota', 'fa-note-sticky', x => (x.text || '').slice(0, 48));
    if (typeof Tasks !== 'undefined') push(Tasks.getAll(), 'Attività', 'fa-list-check', x => x.text);
    if (typeof Appointments !== 'undefined') push(Appointments.getAll(), 'Appuntamento', 'fa-calendar-days', x => x.description);
    if (typeof Assets !== 'undefined' && Assets.getAll) push(Assets.getAll(), 'Asset', 'fa-layer-group', x => x.name);
    return items.filter(i => i.at).sort((a, b) => (a.at < b.at ? 1 : (a.at > b.at ? -1 : 0))).slice(0, n);
  },

  // Contenuti creati per mese negli ultimi `months` mesi (tutte le sezioni)
  trend(months = 6) {
    const now = new Date();
    const buckets = [];
    const idx = {};
    for (let k = months - 1; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      idx[key] = buckets.length;
      buckets.push({ key, label: d.toLocaleDateString('it-IT', { month: 'short' }), value: 0 });
    }
    const bump = (iso) => {
      if (!iso) return;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key in idx) buckets[idx[key]].value++;
    };
    const eachAt = (mod, method) => { try { if (typeof mod !== 'undefined' && mod && mod[method]) mod[method]().forEach(x => bump(x.createdAt)); } catch (e) {} };
    eachAt(typeof Clients !== 'undefined' ? Clients : null, 'getAll');
    eachAt(typeof Notes !== 'undefined' ? Notes : null, 'getAll');
    eachAt(typeof Tasks !== 'undefined' ? Tasks : null, 'getAll');
    eachAt(typeof Appointments !== 'undefined' ? Appointments : null, 'getAll');
    eachAt(typeof Assets !== 'undefined' ? Assets : null, 'getAll');
    return buckets;
  }
};
window.Dashboard = Dashboard;

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
  clientSearch: document.getElementById('clientSearch'),

  // Clients rendering — tabella (Nome | Link | Gruppo | Asset/Tag | Azioni)
  renderClients(clients = null) {
    const list = clients || Clients.getAll();
    if (!DOM.clientsList) return;

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

    const rows = list.map(c => DOM.clientRowHtml(c)).join('');
    DOM.clientsList.innerHTML = `
      <table class="data-table data-table--clients">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Link</th>
            <th>Gruppo</th>
            <th>Asset / Tag</th>
            <th class="data-table__actions-col">Azioni</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  },
  clientRowHtml(client) {
    const safeLink = Utils.safeUrl(client.link);
    const nameHtml = Utils.escapeHtml(client.nome || '');
    const linkCell = safeLink
      ? `<a href="${Utils.escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer" class="data-table__link">${Utils.escapeHtml(client.link)}</a>`
      : (client.link
          ? `<span class="data-table__link data-table__link--unsafe" title="Link non valido o non sicuro">${Utils.escapeHtml(client.link)}</span>`
          : '<span class="data-table__muted">—</span>');
    const groupLabel = (typeof Groups !== 'undefined' && client.groupId) ? Groups.labelFor(client.groupId) : '';
    const groupCell = groupLabel
      ? `<span class="client-item__group"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> ${Utils.escapeHtml(groupLabel)}</span>`
      : '<span class="data-table__muted">—</span>';
    const assets = (client.assets && client.assets.length) ? Assets.getByIds(client.assets) : [];
    const assetCell = assets.length
      ? `<div class="asset-badges">${assets.map(a => `<span class="asset-badge">${Utils.escapeHtml(a.name)}</span>`).join('')}</div>`
      : '<span class="data-table__muted">—</span>';
    return `
      <tr>
        <td data-label="Nome" class="data-table__name">${nameHtml}</td>
        <td data-label="Link">${linkCell}</td>
        <td data-label="Gruppo">${groupCell}</td>
        <td data-label="Asset / Tag">${assetCell}</td>
        <td data-label="Azioni" class="data-table__actions">
          <button class="client-item__action-btn" title="Apri link" data-open-client="${client.id}" ${safeLink ? '' : 'disabled'}>
            <i class="fa-solid fa-up-right-from-square"></i>
          </button>
          <button class="client-item__action-btn" title="Modifica" data-edit-client="${client.id}">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="client-item__action-btn client-item__action-btn--delete" title="Elimina" data-delete-client="${client.id}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>`;
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

  // Palette dei "pallini" colonna (per indice), in armonia col design system
  COL_DOTS: ['#b9ff66', '#8ed0ff', '#ffd166', '#c9a7ff', '#ff9db1', '#7ee0c0'],

  // Rendering completo della bacheca: barra bacheche (tab) + intestazione con
  // azioni + colonne dinamiche. Le dropzone e gli handler delegati (drag&drop,
  // click) vivono su #kanbanBoard e restano validi tra un render e l'altro.
  renderBoard() {
    const controls = document.getElementById('boardControls');
    const board = document.getElementById('kanbanBoard');
    if (!board) return;

    const boards = Boards.all();
    const current = Boards.current();
    const canEditTasks = Boards.canEditTasks();
    const addWrap = document.getElementById('boardAddWrap');

    // Nessuna bacheca visibile (es. visualizzatore senza accessi)
    if (!current) {
      if (controls) controls.innerHTML =
        '<div class="board-empty"><i class="fa-solid fa-inbox" aria-hidden="true"></i>' +
        '<p>Nessuna bacheca disponibile.</p></div>';
      board.innerHTML = '';
      if (addWrap) addWrap.hidden = true;
      return;
    }
    if (addWrap) addWrap.hidden = !canEditTasks;

    const canManage = Boards.canManageBoard(current);
    const canAccess = Boards.canManageAccess(current);
    const esc = Utils.escapeHtml;

    // ---- Barra bacheche + intestazione (in #boardControls) ----
    if (controls) {
      const tabs = boards.map(b =>
        `<button class="board-tab ${b.id === current.id ? 'is-active' : ''}" role="tab"
                 aria-selected="${b.id === current.id}" data-board-switch="${b.id}">${esc(b.name)}</button>`
      ).join('');
      const addTab = (Boards.canCreate() && boards.length < Boards.MAX)
        ? `<button class="board-tab board-tab--add" data-board-new title="Nuova bacheca">
             <i class="fa-solid fa-plus" aria-hidden="true"></i> Nuova</button>`
        : '';

      const actions =
        (canAccess ? `<button class="btn btn--secondary btn--small" data-board-access="${current.id}">
             <i class="fa-solid fa-user-group" aria-hidden="true"></i> Accesso</button>` : '') +
        (canManage ? `<button class="btn btn--secondary btn--small" data-board-rename="${current.id}">
             <i class="fa-solid fa-pen" aria-hidden="true"></i> Rinomina</button>` : '') +
        (canManage ? `<button class="btn btn--secondary btn--small" data-board-addcol="${current.id}">
             <i class="fa-solid fa-plus" aria-hidden="true"></i> Colonna</button>` : '') +
        (canManage && boards.length > 1 ? `<button class="btn btn--secondary btn--small btn--danger" data-board-delete="${current.id}" title="Elimina bacheca">
             <i class="fa-solid fa-trash" aria-hidden="true"></i></button>` : '');

      controls.innerHTML =
        `<div class="board-tabs" role="tablist">${tabs}${addTab}</div>` +
        `<div class="board-head">
           <h3 class="board-head__title">${esc(current.name)}</h3>
           <div class="board-head__actions">${actions}</div>
         </div>`;
    }

    // ---- Colonne (in #kanbanBoard) ----
    const tasks = Tasks.getByBoard(current.id);
    const colIds = current.cols.map(c => c.id);
    const byCol = {};
    current.cols.forEach(c => { byCol[c.id] = []; });
    tasks.forEach(t => {
      const key = colIds.includes(t.status) ? t.status : colIds[0]; // fallback: prima colonna
      byCol[key].push(t);
    });

    board.innerHTML = current.cols.map((col, ci) => {
      const dot = DOM.COL_DOTS[ci % DOM.COL_DOTS.length];
      const items = byCol[col.id] || [];
      const cards = items.length === 0
        ? `<div class="kanban__empty">${canEditTasks ? 'Trascina qui una card' : 'Nessuna attività'}</div>`
        : items.map(task => {
            const canPrev = ci > 0;
            const canNext = ci < current.cols.length - 1;
            const tools = canEditTasks ? `
              <div class="kanban-card__actions">
                <button class="kanban-card__btn" title="Sposta a sinistra"
                        data-board-move="-1" data-task-id="${task.id}" ${canPrev ? '' : 'disabled'}>
                  <i class="fa-solid fa-arrow-left"></i></button>
                <button class="kanban-card__btn" title="Sposta a destra"
                        data-board-move="1" data-task-id="${task.id}" ${canNext ? '' : 'disabled'}>
                  <i class="fa-solid fa-arrow-right"></i></button>
                <button class="kanban-card__btn" title="Modifica" data-edit-task="${task.id}">
                  <i class="fa-solid fa-pen"></i></button>
                <button class="kanban-card__btn kanban-card__btn--delete" title="Elimina" data-delete-task="${task.id}">
                  <i class="fa-solid fa-trash"></i></button>
              </div>` : '';
            return `
              <article class="kanban-card" ${canEditTasks ? 'draggable="true"' : ''}
                       data-task-id="${task.id}" tabindex="0" aria-label="${esc(task.text)}"
                       style="border-left-color:${dot}">
                <div class="kanban-card__text">${esc(task.text)}</div>
                <div class="kanban-card__footer">
                  <span class="kanban-card__date">${Utils.formatDateShort(task.createdAt)}</span>
                  ${tools}
                </div>
              </article>`;
          }).join('');

      const colTools = Boards.canManageBoard(current) ? `
        <button class="kanban__coltool" data-col-rename="${col.id}" title="Rinomina colonna">
          <i class="fa-solid fa-pen"></i></button>
        ${current.cols.length > 1 ? `<button class="kanban__coltool kanban__coltool--danger" data-col-remove="${col.id}" title="Elimina colonna">
          <i class="fa-solid fa-xmark"></i></button>` : ''}` : '';

      return `
        <section class="kanban__column" data-status="${col.id}">
          <header class="kanban__column-header">
            <h3 class="kanban__column-title">
              <span class="kanban__dot" style="background:${dot}" aria-hidden="true"></span>
              <span class="kanban__column-label">${esc(col.label)}</span>
            </h3>
            <div class="kanban__column-tools">
              <span class="kanban__count" data-count="${col.id}">${items.length}</span>
              ${colTools}
            </div>
          </header>
          <div class="kanban__list" data-dropzone="${col.id}" aria-label="Colonna ${esc(col.label)}">${cards}</div>
        </section>`;
    }).join('');
  },

  // Appointments rendering
  // Entry point: ridisegna calendario + lista (rispetta la vista/filtri correnti)
  renderAppointments() {
    DOM.renderCalendar();
    DOM.renderApptList();
  },

  _calDows: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'],
  _calState() {
    return (typeof UI !== 'undefined' && UI.calState) ? UI.calState
      : { year: new Date().getFullYear(), month: new Date().getMonth(), type: 'all', showCompleted: true, view: 'calendar' };
  },
  _dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  _dayLabel(ds) {
    if (!ds) return 'Senza data';
    const d = new Date(ds + 'T00:00:00');
    return isNaN(d.getTime()) ? ds : d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  renderCalendar() {
    const host = document.getElementById('calendarBody');
    if (!host) return;
    const st = DOM._calState();
    const filters = { type: st.type, showCompleted: st.showCompleted };
    const y = st.year, m = st.month;
    const first = new Date(y, m, 1);
    const startWeekday = (first.getDay() + 6) % 7; // Lun=0 … Dom=6
    const todayStr = DOM._dateStr(new Date());
    const esc = Utils.escapeHtml;

    const label = document.getElementById('calMonthLabel');
    if (label) {
      const ml = first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      label.textContent = ml.charAt(0).toUpperCase() + ml.slice(1);
    }

    const head = DOM._calDows.map(d => `<div class="cal__dow">${d}</div>`).join('');
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(y, m, i - startWeekday + 1);
      const ds = DOM._dateStr(cellDate);
      const inMonth = cellDate.getMonth() === m;
      const isToday = ds === todayStr;
      const appts = Appointments.forDate(ds, filters);
      const shown = appts.slice(0, 3);
      const chips = shown.map(a => `
        <button type="button" class="cal__chip cal__chip--${a.type}${a.completed ? ' is-done' : ''}" data-appt="${a.id}" title="${esc(a.description)}">${esc(a.description)}</button>`).join('');
      const more = appts.length > shown.length ? `<span class="cal__more">+${appts.length - shown.length}</span>` : '';
      cells.push(`
        <div class="cal__cell${inMonth ? '' : ' is-other'}${isToday ? ' is-today' : ''}" data-cal-day="${ds}" tabindex="0">
          <div class="cal__daynum">${cellDate.getDate()}</div>
          <div class="cal__chips">${chips}${more}</div>
        </div>`);
    }
    host.innerHTML =
      `<div class="cal__grid cal__grid--dow">${head}</div>` +
      `<div class="cal__grid cal__grid--days">${cells.join('')}</div>`;
  },

  renderApptList() {
    const host = document.getElementById('apptListView');
    if (!host) return;
    const st = DOM._calState();
    const list = Appointments.getFiltered({ type: st.type, showCompleted: st.showCompleted });
    if (!list.length) { host.innerHTML = `<div class="appts-list__empty">Nessun appuntamento</div>`; return; }
    const esc = Utils.escapeHtml;
    host.innerHTML = list.map(a => `
      <li class="appt-item${a.completed ? ' appt-item--completed' : ''}">
        <input type="checkbox" class="appt-item__checkbox" data-toggle-appt="${a.id}" ${a.completed ? 'checked' : ''} aria-label="Completato">
        <div class="appt-item__content" data-edit-appt="${a.id}">
          <div class="appt-item__date">${DOM._dayLabel(a.date)} · <span class="appt-item__type appt-item__type--${a.type}">${a.type === 'onsite' ? 'Onsite' : 'Da remoto'}</span></div>
          <div class="appt-item__desc">${esc(a.description)}</div>
        </div>
        <div class="appt-item__actions">
          <button class="appt-item__action-btn" title="Modifica" data-edit-appt="${a.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="appt-item__action-btn appt-item__action-btn--delete" title="Elimina" data-delete-appt="${a.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </li>`).join('');
  },
  // Palette per i grafici a torta (leggibile in light e dark)
  PIE_COLORS: ['#b9ff66', '#8ed0ff', '#ffd166', '#c9a7ff', '#ff9db1', '#7ee0c0', '#f0a868', '#a0aec0'],

  // Donut SVG multi-segmento da [{label,value,color}]; centerLabel opzionale.
  _donut(segments, centerLabel) {
    const total = segments.reduce((s, x) => s + (x.value || 0), 0);
    const r = 26, cx = 32, cy = 32, C = 2 * Math.PI * r;
    let acc = 0;
    const arcs = total <= 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" class="pie__empty"></circle>`
      : segments.filter(s => s.value > 0).map(s => {
          const frac = s.value / total;
          const dash = `${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`;
          const off = (-acc * C).toFixed(2);
          acc += frac;
          return `<circle cx="${cx}" cy="${cy}" r="${r}" class="pie__seg" stroke="${s.color}"
            stroke-dasharray="${dash}" stroke-dashoffset="${off}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
        }).join('');
    const center = (centerLabel != null)
      ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="pie__center">${Utils.escapeHtml(String(centerLabel))}</text>` : '';
    return `<svg class="pie" viewBox="0 0 64 64" width="118" height="118" role="img">${arcs}${center}</svg>`;
  },

  _legend(segments) {
    const total = segments.reduce((s, x) => s + (x.value || 0), 0);
    return `<ul class="pie-legend">` + segments.map(s => {
      const pct = total ? Math.round(s.value / total * 100) : 0;
      return `<li class="pie-legend__item">` +
        `<span class="pie-legend__dot" style="background:${s.color}"></span>` +
        `<span class="pie-legend__label" title="${Utils.escapeHtml(s.label)}">${Utils.escapeHtml(s.label)}</span>` +
        `<span class="pie-legend__val">${s.value} · ${pct}%</span></li>`;
    }).join('') + `</ul>`;
  },

  // Grafico area/linea da [{label,value}] (andamento nel tempo)
  _areaChart(points) {
    const W = 320, H = 120, padL = 8, padR = 8, padT = 12, padB = 22;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const max = Math.max(1, ...points.map(p => p.value));
    const n = points.length;
    const X = i => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const Y = v => padT + innerH - (v / max) * innerH;
    const line = points.map((p, i) => `${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
    const base = (padT + innerH).toFixed(1);
    const area = `${X(0).toFixed(1)},${base} ${line} ${X(n - 1).toFixed(1)},${base}`;
    const dots = points.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.value).toFixed(1)}" r="2.6" class="area__dot"></circle>`).join('');
    const vals = points.map((p, i) => p.value ? `<text x="${X(i).toFixed(1)}" y="${(Y(p.value) - 5).toFixed(1)}" text-anchor="middle" class="area__val">${p.value}</text>` : '').join('');
    const labels = points.map((p, i) => `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="area__lbl">${Utils.escapeHtml(p.label)}</text>`).join('');
    return `<svg class="area" viewBox="0 0 ${W} ${H}" width="100%" role="img">` +
      `<polygon points="${area}" class="area__fill"></polygon>` +
      `<polyline points="${line}" class="area__line" fill="none"></polyline>${dots}${vals}${labels}</svg>`;
  },

  // Dashboard analytics rendering (KPI + diagrammi a torta + attività recenti)
  renderDashboard() {
    const host = document.getElementById('dashboardBody');
    if (!host) return;
    const s = Dashboard.stats();
    const ts = Dashboard.taskStats();
    const as = Dashboard.apptStats();
    const gs = Dashboard.groupStats();
    const recent = Dashboard.recent(6);
    const esc = Utils.escapeHtml;
    const COL = DOM.PIE_COLORS, gray = '#a0aec0';

    const kpi = (icon, label, value, target) => `
      <button type="button" class="dash-kpi" data-nav-target="${target}">
        <span class="dash-kpi__icon"><i class="fa-solid ${icon}"></i></span>
        <span class="dash-kpi__value">${value}</span>
        <span class="dash-kpi__label">${label}</span>
      </button>`;
    const kpis =
      kpi('fa-up-right-from-square', 'Elementi', s.clients, 'section-clients') +
      kpi('fa-layer-group', 'Asset', s.assets, 'section-assets') +
      kpi('fa-note-sticky', 'Note', s.notes, 'section-notes') +
      kpi('fa-list-check', 'Attività', s.tasks, 'section-board') +
      kpi('fa-calendar-days', 'Appuntamenti', s.appts, 'section-appointments') +
      kpi('fa-table-columns', 'Bacheche', s.boards, 'section-board');

    const pieCard = (title, segments, centerLabel) => `
      <section class="dash-card">
        <h3 class="dash-card__title">${title}</h3>
        <div class="pie-wrap">${DOM._donut(segments, centerLabel)}${DOM._legend(segments)}</div>
      </section>`;

    const compSeg = [
      { label: 'Completate', value: ts.done, color: COL[0] },
      { label: 'Da fare', value: Math.max(0, ts.total - ts.done), color: gray }
    ];
    const boardSeg = ts.perBoard.length
      ? ts.perBoard.map((b, i) => ({ label: b.name, value: b.count, color: COL[i % COL.length] }))
      : [{ label: 'Nessuna attività', value: 0, color: gray }];
    const groupSeg = (gs.top.length || gs.none)
      ? gs.top.map((g, i) => ({ label: g.name, value: g.count, color: COL[i % COL.length] }))
          .concat(gs.none ? [{ label: 'Senza gruppo', value: gs.none, color: gray }] : [])
      : [{ label: 'Nessun elemento', value: 0, color: gray }];
    const apptSeg = [
      { label: 'Da remoto', value: as.remote, color: COL[1] },
      { label: 'Onsite', value: as.onsite, color: COL[2] }
    ];
    const contentSeg = [
      { label: 'Elementi', value: s.clients, color: COL[0] },
      { label: 'Note', value: s.notes, color: COL[1] },
      { label: 'Attività', value: s.tasks, color: COL[2] },
      { label: 'Appuntamenti', value: s.appts, color: COL[3] },
      { label: 'Asset', value: s.assets, color: COL[4] }
    ];

    const recentHtml = recent.length ? recent.map(i => `
      <li class="dash-recent__item">
        <span class="dash-recent__icon"><i class="fa-solid ${i.icon}"></i></span>
        <span class="dash-recent__name">${esc(i.name || '—')}</span>
        <span class="dash-recent__meta">${esc(i.type)} · ${Utils.formatDate(i.at)}</span>
      </li>`).join('') : '<li class="dash-empty">Ancora niente da mostrare.</li>';

    host.innerHTML = `
      <div class="dash-kpis">${kpis}</div>
      <div class="dash-grid">
        <section class="dash-card dash-card--wide">
          <h3 class="dash-card__title">Andamento contenuti (ultimi 6 mesi)</h3>
          ${DOM._areaChart(Dashboard.trend(6))}
        </section>
        ${pieCard('Attività completate', compSeg, ts.pct + '%')}
        ${pieCard('Attività per bacheca', boardSeg)}
        <section class="dash-card">
          <h3 class="dash-card__title">Appuntamenti</h3>
          <div class="dash-mini">
            <div class="dash-mini__stat"><b>${as.upcoming}</b><span>In arrivo</span></div>
            <div class="dash-mini__stat"><b>${as.completed}</b><span>Completati</span></div>
            <div class="dash-mini__stat"><b>${as.total}</b><span>Totale</span></div>
          </div>
          <div class="pie-wrap">${DOM._donut(apptSeg)}${DOM._legend(apptSeg)}</div>
        </section>
        ${pieCard('Elementi per gruppo', groupSeg)}
        ${pieCard('Composizione contenuti', contentSeg)}
        <section class="dash-card">
          <h3 class="dash-card__title">Attività recenti</h3>
          <ul class="dash-recent">${recentHtml}</ul>
        </section>
      </div>`;
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
    UI.setupDashboardHandlers();
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

  setupDashboardHandlers() {
    // Click su una KPI → apre la sezione relativa (riusa il link della sidebar)
    document.getElementById('dashboardBody')?.addEventListener('click', (e) => {
      const kpi = e.target.closest('[data-nav-target]');
      if (!kpi) return;
      const link = document.querySelector('.app-sidebar__link[data-nav-target="' + kpi.dataset.navTarget + '"]');
      if (link) link.click();
    });
    // Ridisegna quando si apre la Dashboard
    document.querySelector('.app-sidebar__link[data-nav-target="section-dashboard"]')
      ?.addEventListener('click', () => DOM.renderDashboard());
    DOM.renderDashboard();
  },

  // Ridisegna la lista elementi rispettando il filtro di ricerca attivo,
  // così add/edit/delete non azzerano la ricerca corrente.
  refreshClients() {
    const query = (DOM.clientSearch?.value || '').trim();
    const groupId = document.getElementById('clientGroupFilter')?.value || 'all';
    const assetId = document.getElementById('clientAssetFilter')?.value || 'all';
    DOM.renderClients(Clients.search(query, groupId, assetId));
  },

  // Popola entrambi i filtri (gruppo + asset) mantenendo la selezione valida
  renderClientFilters() {
    UI.renderGroupFilter();
    UI.renderAssetFilter();
  },

  // Filtro per asset/tag (gli asset fungono da etichette sugli elementi)
  renderAssetFilter() {
    const sel = document.getElementById('clientAssetFilter');
    if (!sel) return;
    const prev = sel.value || 'all';
    const assets = (typeof Assets !== 'undefined' && Assets.getAll) ? Assets.getAll() : [];
    let html = '<option value="all">Tutti gli asset</option><option value="none">Senza asset</option>';
    assets.forEach(a => { html += `<option value="${a.id}">${Utils.escapeHtml(a.name)}</option>`; });
    sel.innerHTML = html;
    sel.value = Array.from(sel.options).some(o => o.value === prev) ? prev : 'all';
  },

  // Popola il <select> del filtro gruppo mantenendo la selezione valida
  renderGroupFilter() {
    const sel = document.getElementById('clientGroupFilter');
    if (!sel) return;
    const prev = sel.value || 'all';
    let html = '<option value="all">Tutti i gruppi</option><option value="none">Senza gruppo</option>';
    (typeof Groups !== 'undefined' ? Groups.topLevel() : []).forEach(g => {
      html += `<option value="${g.id}">${Utils.escapeHtml(g.name)}</option>`;
      Groups.children(g.id).forEach(sg => {
        html += `<option value="${sg.id}">  — ${Utils.escapeHtml(sg.name)}</option>`;
      });
    });
    sel.innerHTML = html;
    sel.value = Array.from(sel.options).some(o => o.value === prev) ? prev : 'all';
  },

  // Opzioni <option> per assegnare un gruppo (form add/edit elemento)
  _groupOptionsHtml(selectedId) {
    const mark = (id) => (selectedId && id === selectedId) ? ' selected' : '';
    let html = `<option value=""${selectedId ? '' : ' selected'}>— Nessun gruppo —</option>`;
    (typeof Groups !== 'undefined' ? Groups.topLevel() : []).forEach(g => {
      html += `<option value="${g.id}"${mark(g.id)}>${Utils.escapeHtml(g.name)}</option>`;
      Groups.children(g.id).forEach(sg => {
        html += `<option value="${sg.id}"${mark(sg.id)}>  — ${Utils.escapeHtml(sg.name)}</option>`;
      });
    });
    return html;
  },

  setupClientHandlers() {
    const addBtn = document.getElementById('addClientBtn');
    const searchInput = DOM.clientSearch;

    addBtn?.addEventListener('click', () => UI.handleAddClient());
    searchInput?.addEventListener('input', Utils.debounce(() => UI.refreshClients(), 300));

    document.getElementById('clientGroupFilter')?.addEventListener('change', () => UI.refreshClients());
    document.getElementById('clientAssetFilter')?.addEventListener('change', () => UI.refreshClients());
    document.getElementById('manageGroupsBtn')?.addEventListener('click', () => UI.handleManageGroups());
    document.getElementById('importClientsBtn')?.addEventListener('click', () => UI.handleImportCsv());

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

    // Stato iniziale: filtro gruppo popolato + tabella
    UI.renderClientFilters();
    DOM.renderClients();
  },

  // ---- Gestione gruppi (cartelle a 2 livelli) ----
  handleManageGroups() {
    Modal.open('Gestisci gruppi',
      '<p class="modal-hint">Organizza gli elementi in gruppi e sotto-gruppi (come cartelle).</p>' +
      '<div class="group-manager">' +
        '<div class="group-manager__add">' +
          '<input type="text" id="newGroupName" class="input" placeholder="Nuovo gruppo" maxlength="40" autocomplete="off">' +
          '<button class="btn btn--primary btn--small" data-add-group>Aggiungi</button>' +
        '</div>' +
        '<div id="groupManagerTree" class="group-manager__tree"></div>' +
      '</div>',
      () => true, { confirmLabel: 'Chiudi' });
    UI._renderGroupManager();
  },

  _renderGroupManager() {
    const host = document.getElementById('groupManagerTree');
    if (!host) return;
    const esc = Utils.escapeHtml;
    const tops = Groups.topLevel();
    host.innerHTML = tops.length ? tops.map(g => {
      const subs = Groups.children(g.id);
      const subHtml = subs.map(sg => `
        <li class="group-manager__row group-manager__row--sub">
          <span class="group-manager__name">${esc(sg.name)}</span>
          <span class="group-manager__tools">
            <button class="kanban__coltool" data-rename-group="${sg.id}" title="Rinomina"><i class="fa-solid fa-pen"></i></button>
            <button class="kanban__coltool kanban__coltool--danger" data-remove-group="${sg.id}" title="Elimina"><i class="fa-solid fa-xmark"></i></button>
          </span>
        </li>`).join('');
      return `
        <ul class="group-manager__list">
          <li class="group-manager__row">
            <span class="group-manager__name"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> ${esc(g.name)}</span>
            <span class="group-manager__tools">
              <button class="kanban__coltool" data-add-sub="${g.id}" title="Aggiungi sotto-gruppo"><i class="fa-solid fa-plus"></i></button>
              <button class="kanban__coltool" data-rename-group="${g.id}" title="Rinomina"><i class="fa-solid fa-pen"></i></button>
              <button class="kanban__coltool kanban__coltool--danger" data-remove-group="${g.id}" title="Elimina"><i class="fa-solid fa-xmark"></i></button>
            </span>
          </li>
          ${subHtml}
        </ul>`;
    }).join('') : '<p class="group-manager__empty">Nessun gruppo. Creane uno qui sopra.</p>';

    if (!host.dataset.bound) {
      const container = host.closest('.group-manager');
      container.addEventListener('click', (e) => {
        const add = e.target.closest('[data-add-group]');
        const addSub = e.target.closest('[data-add-sub]');
        const ren = e.target.closest('[data-rename-group]');
        const rem = e.target.closest('[data-remove-group]');
        if (add) {
          // aggiunta gruppo top: inline, il modale resta aperto
          const input = document.getElementById('newGroupName');
          const name = (input.value || '').trim();
          if (!name) { Toast.error('Inserisci un nome'); return; }
          Groups.add(name); input.value = '';
          UI._afterGroupsChanged();
        } else if (addSub) {
          // operazioni che aprono un modale annidato → poi riapro il gestore
          const pid = addSub.dataset.addSub;
          UI._promptGroupName('Nuovo sotto-gruppo', '', (name) => { Groups.add(name, pid); UI._reopenGroupManager(); });
        } else if (ren) {
          const id = ren.dataset.renameGroup;
          const g = Groups.get(id);
          UI._promptGroupName('Rinomina gruppo', g ? g.name : '', (name) => { Groups.rename(id, name); UI._reopenGroupManager(); });
        } else if (rem) {
          const id = rem.dataset.removeGroup;
          const g = Groups.get(id);
          AlertDialog.confirmDelete({
            title: 'Elimina gruppo',
            message: `Eliminare "${g ? g.name : 'gruppo'}"? Gli elementi (e gli eventuali sotto-gruppi) resteranno senza gruppo.`,
            onConfirm: () => { Groups.remove(id); UI._reopenGroupManager(); }
          });
        }
      });
      host.dataset.bound = '1';
    }
  },

  // Re-render in-place del gestore (il modale è già aperto)
  _afterGroupsChanged() {
    UI._renderGroupManager();
    UI.renderGroupFilter();
    UI.refreshClients();
  },

  // Riapre il gestore gruppi dopo un modale annidato (prompt/conferma), che sul
  // Modal condiviso avrebbe altrimenti sostituito il gestore.
  _reopenGroupManager() {
    UI.renderGroupFilter();
    UI.refreshClients();
    UI.handleManageGroups();
  },

  // Piccolo prompt testuale su Modal (non annidato: usa un secondo Modal.open)
  _promptGroupName(title, value, onOk) {
    Modal.open(title, UI._textField('Nome', value),
      (body) => {
        const v = body.querySelector('#modalTextInput').value.trim();
        if (!v) { Toast.error('Inserisci un nome'); return false; }
        onOk(v);
        return true;
      }, { confirmLabel: 'Salva' });
  },

  // ---- Import CSV ----
  handleImportCsv() {
    Modal.open('Importa CSV',
      '<p class="modal-hint">Colonne riconosciute: <b>Nome</b>, <b>Link</b>, <b>Gruppo</b>, <b>Sotto-gruppo</b> (intestazioni flessibili, separatore , o ;). Gruppi e sotto-gruppi mancanti vengono creati.</p>' +
      '<div class="form-group"><label class="label" for="csvFile">File .csv</label>' +
        '<input type="file" id="csvFile" class="input" accept=".csv,text/csv"></div>' +
      '<div class="form-group"><label class="label" for="csvText">…oppure incolla il CSV</label>' +
        '<textarea id="csvText" class="input textarea" rows="6" placeholder="Nome,Link,Gruppo,Sotto-gruppo"></textarea></div>' +
      '<p class="profile-msg" id="csvMsg" role="status"></p>',
      (body) => {
        const fileEl = body.querySelector('#csvFile');
        const textEl = body.querySelector('#csvText');
        const doImport = (text) => {
          const res = UI._importCsvText(text);
          if (res == null) { const m = body.querySelector('#csvMsg'); if (m) { m.textContent = 'CSV non valido o nessuna colonna "Nome" trovata.'; m.className = 'profile-msg is-err'; } return; }
          Modal.close();
          Toast.success(`Importati ${res.added} elementi` + (res.skipped ? ` (${res.skipped} saltati)` : ''));
        };
        if (fileEl && fileEl.files && fileEl.files[0]) {
          const reader = new FileReader();
          reader.onload = () => doImport(String(reader.result || ''));
          reader.readAsText(fileEl.files[0]);
          return false; // chiudo io dopo la lettura async
        }
        doImport(textEl ? textEl.value : '');
        return false;
      }, { confirmLabel: 'Importa' });
  },

  // Mappa intestazioni → {nome,link,gruppo,sottogruppo} e importa. Ritorna {added,skipped} o null.
  _importCsvText(text) {
    const rows = Utils.csvToArray(text);
    if (!rows.length) return null;
    const keyOf = (obj, re) => Object.keys(obj).find(k => re.test(k));
    const sample = rows[0];
    const kNome = keyOf(sample, /^(nome|name|attributo|titolo|elemento)$/i);
    const kLink = keyOf(sample, /^(link|url|indirizzo|sito)$/i);
    const kGrp = keyOf(sample, /^(gruppo|group|categoria|cartella)$/i);
    const kSub = keyOf(sample, /(sotto|sub)/i);
    if (!kNome) return null;
    const mapped = rows.map(r => ({
      nome: r[kNome] || '',
      link: kLink ? (r[kLink] || '') : '',
      gruppo: kGrp ? (r[kGrp] || '') : '',
      sottogruppo: kSub ? (r[kSub] || '') : ''
    }));
    const res = Clients.importRows(mapped);
    UI.renderGroupFilter();
    UI.refreshClients();
    return res;
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
      UI.renderAssetFilter();
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
      UI.renderAssetFilter();
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
        DOM.renderAssets();
        UI.renderAssetFilter();
        UI.refreshClients();
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
          <label class="label" for="clientGroupSelect">Gruppo</label>
          <select id="clientGroupSelect" class="input">${UI._groupOptionsHtml(null)}</select>
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
      const groupId = body.querySelector('#clientGroupSelect')?.value || null;

      Clients.add(nome, link, selectedAssets, groupId);
      nameInput.value = '';
      linkInput.value = '';
      UI.refreshClients();
      Toast.success('Elemento aggiunto');
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
        <label class="label" for="editClientGroup">Gruppo</label>
        <select id="editClientGroup" class="input">${UI._groupOptionsHtml(client.groupId || null)}</select>
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
      const groupId = body.querySelector('#editClientGroup')?.value || null;

      const validation = Validators.validateClient(nome, link);
      if (!validation.valid) {
        Toast.error(validation.error);
        return false;
      }

      Clients.update(clientId, nome, link, selectedAssets, groupId);
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
      const cur = Boards.current();
      if (!cur) { Toast.error('Nessuna bacheca disponibile'); return; }
      const validation = Validators.validateTask(input.value);
      if (!validation.valid) {
        Toast.error(validation.error);
        return;
      }
      Tasks.add(input.value.trim(), cur.id, cur.cols[0].id);
      input.value = '';
      DOM.renderTasks();
      Toast.success('Attività aggiunta');
    };

    addBtn?.addEventListener('click', addFromInput);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addFromInput();
    });

    // ---- Barra bacheche + intestazione (#boardControls): switch / nuova /
    //      rinomina / colonna / accesso / elimina bacheca ----
    const controls = document.getElementById('boardControls');
    controls?.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-board-switch]');
      const nw = e.target.closest('[data-board-new]');
      const rn = e.target.closest('[data-board-rename]');
      const ac = e.target.closest('[data-board-addcol]');
      const acc = e.target.closest('[data-board-access]');
      const del = e.target.closest('[data-board-delete]');
      if (sw) { Boards.setCurrent(sw.dataset.boardSwitch); DOM.renderTasks(); return; }
      if (nw) { UI.handleNewBoard(); return; }
      if (rn) { UI.handleRenameBoard(rn.dataset.boardRename); return; }
      if (ac) { UI.handleAddColumn(ac.dataset.boardAddcol); return; }
      if (acc) { UI.handleBoardAccess(acc.dataset.boardAccess); return; }
      if (del) { UI.handleDeleteBoard(del.dataset.boardDelete); return; }
    });

    // Click delegato su #kanbanBoard: colonne (rinomina/elimina) + card (sposta/
    // modifica/elimina). Edit e delete riusano gli handler task.
    board.addEventListener('click', (e) => {
      const colRen = e.target.closest('[data-col-rename]');
      const colRem = e.target.closest('[data-col-remove]');
      const moveBtn = e.target.closest('[data-board-move]');
      const editBtn = e.target.closest('[data-edit-task]');
      const deleteBtn = e.target.closest('[data-delete-task]');

      if (colRen) { UI.handleRenameColumn(Boards.currentId(), colRen.dataset.colRename); return; }
      if (colRem) { UI.handleRemoveColumn(Boards.currentId(), colRem.dataset.colRemove); return; }
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
      if (id && Tasks.setColumn(id, zone.dataset.dropzone)) {
        DOM.renderTasks();
      }
    });
  },

  // ---- Gestione bacheche / colonne (Kanban multi-bacheca) ----

  _textField(label, value = '', placeholder = '') {
    return `<div class="form-group">
      <label class="form-label" for="modalTextInput">${Utils.escapeHtml(label)}</label>
      <input type="text" id="modalTextInput" class="input" value="${Utils.escapeHtml(value)}"
             placeholder="${Utils.escapeHtml(placeholder)}" maxlength="40" autocomplete="off">
    </div>`;
  },

  handleNewBoard() {
    if (Boards.all().length >= Boards.MAX) { Toast.warning('Massimo ' + Boards.MAX + ' bacheche per spazio.'); return; }
    Modal.open('Nuova bacheca', UI._textField('Nome bacheca', '', 'Es. Progetto, Sprint…'),
      (body) => {
        const v = body.querySelector('#modalTextInput').value.trim();
        if (!v) { Toast.error('Inserisci un nome'); return false; }
        Boards.create(v).then(b => { if (b) { DOM.renderTasks(); Toast.success('Bacheca creata'); } });
        return true;
      }, { confirmLabel: 'Crea' });
  },

  handleRenameBoard(id) {
    const b = Boards.get(id);
    if (!b) return;
    Modal.open('Rinomina bacheca', UI._textField('Nome bacheca', b.name),
      (body) => {
        const v = body.querySelector('#modalTextInput').value.trim();
        if (!v) { Toast.error('Inserisci un nome'); return false; }
        Boards.rename(id, v).then(ok => { if (ok) { DOM.renderTasks(); Toast.success('Bacheca rinominata'); } });
        return true;
      }, { confirmLabel: 'Salva' });
  },

  handleDeleteBoard(id) {
    const b = Boards.get(id);
    if (!b) return;
    AlertDialog.confirmDelete({
      title: 'Elimina bacheca',
      message: `Eliminare la bacheca "${b.name}" e tutte le sue attività? L'azione non è reversibile.`,
      onConfirm: () => {
        Boards.remove(id).then(ok => { if (ok) { DOM.renderTasks(); Toast.success('Bacheca eliminata'); } });
      }
    });
  },

  handleAddColumn(id) {
    Modal.open('Nuova colonna', UI._textField('Nome colonna', '', 'Es. In revisione'),
      (body) => {
        const v = body.querySelector('#modalTextInput').value.trim();
        if (!v) { Toast.error('Inserisci un nome'); return false; }
        Boards.addColumn(id, v).then(ok => { if (ok) { DOM.renderTasks(); Toast.success('Colonna aggiunta'); } });
        return true;
      }, { confirmLabel: 'Aggiungi' });
  },

  handleRenameColumn(boardId, colId) {
    const b = Boards.get(boardId);
    const col = b && b.cols.find(c => c.id === colId);
    if (!col) return;
    Modal.open('Rinomina colonna', UI._textField('Nome colonna', col.label),
      (body) => {
        const v = body.querySelector('#modalTextInput').value.trim();
        if (!v) { Toast.error('Inserisci un nome'); return false; }
        Boards.renameColumn(boardId, colId, v).then(ok => { if (ok) { DOM.renderTasks(); } });
        return true;
      }, { confirmLabel: 'Salva' });
  },

  handleRemoveColumn(boardId, colId) {
    const b = Boards.get(boardId);
    const col = b && b.cols.find(c => c.id === colId);
    if (!col) return;
    AlertDialog.confirmDelete({
      title: 'Elimina colonna',
      message: `Eliminare la colonna "${col.label}"? Le attività verranno spostate nella prima colonna.`,
      onConfirm: () => {
        Boards.removeColumn(boardId, colId).then(ok => { if (ok) { DOM.renderTasks(); Toast.success('Colonna eliminata'); } });
      }
    });
  },

  handleBoardAccess(id) {
    const b = Boards.get(id);
    if (!b) return;
    Modal.open('Accesso · ' + b.name,
      '<p class="modal-hint">Chi è aggiunto vede e usa questa bacheca. Gli amministratori dello spazio vedono comunque tutte le bacheche.</p>' +
      '<div id="boardAccessBody" class="board-access"><p class="board-access__loading">Caricamento…</p></div>',
      () => true, { confirmLabel: 'Chiudi' });
    UI._renderBoardAccess(id);
  },

  async _renderBoardAccess(id) {
    const host = document.getElementById('boardAccessBody');
    if (!host) return;
    const esc = Utils.escapeHtml;
    const uid = Boards._uid();
    const [members, candidates] = await Promise.all([Boards.members(id), Boards.candidates(id)]);
    if (!document.getElementById('boardAccessBody')) return; // modale chiusa nel frattempo

    const memHtml = members.length ? members.map(m => `
        <li class="board-access__row">
          <span class="board-access__email">${esc(m.email)}${m.userId === uid ? ' <em>(tu)</em>' : ''}</span>
          ${m.userId !== uid ? `<button class="btn btn--secondary btn--small" data-detach="${m.userId}">Rimuovi</button>` : ''}
        </li>`).join('') : '<li class="board-access__empty">Solo tu, per ora.</li>';

    const canHtml = candidates.length ? candidates.map(c => `
        <li class="board-access__row">
          <span class="board-access__email">${esc(c.email)}</span>
          <button class="btn btn--primary btn--small" data-attach="${c.userId}">Aggiungi</button>
        </li>`).join('') : '<li class="board-access__empty">Nessun altro collaboratore nello spazio.</li>';

    host.innerHTML =
      `<h4 class="board-access__title">Con accesso</h4><ul class="board-access__list">${memHtml}</ul>` +
      `<h4 class="board-access__title">Collaboratori dello spazio</h4><ul class="board-access__list">${canHtml}</ul>`;

    if (!host.dataset.bound) {
      host.addEventListener('click', async (e) => {
        const at = e.target.closest('[data-attach]');
        const dt = e.target.closest('[data-detach]');
        if (at) { if (await Boards.attach(id, at.dataset.attach)) { Toast.success('Collaboratore aggiunto'); UI._renderBoardAccess(id); } }
        else if (dt) { if (await Boards.detach(id, dt.dataset.detach)) { Toast.success('Collaboratore rimosso'); UI._renderBoardAccess(id); } }
      });
      host.dataset.bound = '1';
    }
  },

  setupAppointmentHandlers() {
    const now = new Date();
    UI.calState = { year: now.getFullYear(), month: now.getMonth(), type: 'all', showCompleted: true, view: 'calendar' };
    const $ = (id) => document.getElementById(id);

    $('calPrev')?.addEventListener('click', () => UI.calShift(-1));
    $('calNext')?.addEventListener('click', () => UI.calShift(1));
    $('calToday')?.addEventListener('click', () => {
      const d = new Date();
      UI.calState.year = d.getFullYear(); UI.calState.month = d.getMonth();
      DOM.renderAppointments();
    });
    $('calTypeFilter')?.addEventListener('change', (e) => { UI.calState.type = e.target.value; DOM.renderAppointments(); });
    $('calShowCompleted')?.addEventListener('change', (e) => { UI.calState.showCompleted = e.target.checked; DOM.renderAppointments(); });
    $('addApptBtn')?.addEventListener('click', () => UI.handleAddAppointment());
    $('importApptsBtn')?.addEventListener('click', () => UI.handleImportAppts());
    $('exportApptsBtn')?.addEventListener('click', () => UI.handleExportAppts());

    document.querySelectorAll('[data-cal-view]').forEach(btn =>
      btn.addEventListener('click', () => UI.setCalView(btn.dataset.calView)));

    // Calendario: click su giorno (aggiungi) o su chip (modifica)
    $('calendarBody')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-appt]');
      if (chip) { UI.handleEditAppointment(chip.dataset.appt); return; }
      const cell = e.target.closest('[data-cal-day]');
      if (cell) UI.handleAddAppointment(cell.dataset.calDay);
    });
    $('calendarBody')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const cell = e.target.closest('[data-cal-day]'); if (cell) UI.handleAddAppointment(cell.dataset.calDay); }
    });

    // Lista: toggle completato / modifica / elimina
    $('apptListView')?.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-toggle-appt]');
      if (cb) { Appointments.toggle(cb.dataset.toggleAppt); DOM.renderAppointments(); }
    });
    $('apptListView')?.addEventListener('click', (e) => {
      const del = e.target.closest('[data-delete-appt]');
      const edit = e.target.closest('[data-edit-appt]');
      if (del) { UI.handleDeleteAppointment(del.dataset.deleteAppt); return; }
      if (edit) UI.handleEditAppointment(edit.dataset.editAppt);
    });

    UI.setCalView('calendar');
    DOM.renderAppointments();
  },

  setCalView(view) {
    UI.calState.view = (view === 'list') ? 'list' : 'calendar';
    const section = document.getElementById('section-appointments');
    if (section) {
      section.classList.toggle('cal-view--list', UI.calState.view === 'list');
      section.classList.toggle('cal-view--calendar', UI.calState.view === 'calendar');
    }
    document.querySelectorAll('[data-cal-view]').forEach(b =>
      b.classList.toggle('is-active', b.dataset.calView === UI.calState.view));
    DOM.renderAppointments();
  },

  calShift(delta) {
    let m = UI.calState.month + delta, y = UI.calState.year;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    UI.calState.month = m; UI.calState.year = y;
    DOM.renderAppointments();
  },

  // Contenuto modale del form appuntamento (aggiungi/modifica)
  _apptForm(a) {
    a = a || {};
    const esc = Utils.escapeHtml;
    return `
      <div class="form-group"><label class="label" for="apptFormDate">Data</label>
        <input type="date" id="apptFormDate" class="input" value="${esc(a.date || '')}"></div>
      <div class="form-group"><label class="label" for="apptFormDesc">Descrizione</label>
        <input type="text" id="apptFormDesc" class="input" value="${esc(a.description || '')}" placeholder="Es. Riunione operativa"></div>
      <div class="form-group"><label class="label" for="apptFormType">Tipo</label>
        <select id="apptFormType" class="input">
          <option value="remote"${a.type !== 'onsite' ? ' selected' : ''}>Da remoto</option>
          <option value="onsite"${a.type === 'onsite' ? ' selected' : ''}>Onsite</option>
        </select></div>`;
  },

  handleAddAppointment(dateStr) {
    Modal.open('Nuovo appuntamento', UI._apptForm({ date: dateStr || '' }), (body) => {
      const date = body.querySelector('#apptFormDate').value;
      const desc = body.querySelector('#apptFormDesc').value.trim();
      const type = body.querySelector('#apptFormType').value;
      if (!desc) { Toast.error('Descrizione richiesta'); return false; }
      Appointments.add(date, desc, type);
      DOM.renderAppointments();
      Toast.success('Appuntamento aggiunto');
      return true;
    }, { confirmLabel: 'Aggiungi' });
  },

  handleEditAppointment(id) {
    const a = Appointments.get(id);
    if (!a) return;
    Modal.open('Modifica appuntamento',
      UI._apptForm(a) +
      `<label class="appt-complete"><input type="checkbox" id="apptFormDone"${a.completed ? ' checked' : ''}> Completato</label>`,
      (body) => {
        const date = body.querySelector('#apptFormDate').value;
        const desc = body.querySelector('#apptFormDesc').value.trim();
        const type = body.querySelector('#apptFormType').value;
        const completed = body.querySelector('#apptFormDone').checked;
        if (!desc) { Toast.error('Descrizione richiesta'); return false; }
        Appointments.update(id, { date, description: desc, type, completed });
        DOM.renderAppointments();
        Toast.success('Appuntamento aggiornato');
        return true;
      }, { confirmLabel: 'Salva' });
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

  handleImportAppts() {
    Modal.open('Importa appuntamenti (CSV)',
      '<p class="modal-hint">Colonne riconosciute: <b>Data</b> (AAAA-MM-GG o GG/MM/AAAA), <b>Descrizione</b>, <b>Tipo</b> (remoto/onsite). Separatore , o ;</p>' +
      '<div class="form-group"><label class="label" for="apptCsvFile">File .csv</label>' +
        '<input type="file" id="apptCsvFile" class="input" accept=".csv,text/csv"></div>' +
      '<div class="form-group"><label class="label" for="apptCsvText">…oppure incolla il CSV</label>' +
        '<textarea id="apptCsvText" class="input textarea" rows="6" placeholder="Data,Descrizione,Tipo"></textarea></div>' +
      '<p class="profile-msg" id="apptCsvMsg" role="status"></p>',
      (body) => {
        const fileEl = body.querySelector('#apptCsvFile');
        const textEl = body.querySelector('#apptCsvText');
        const run = (text) => {
          const res = UI._importApptsText(text);
          if (res == null) { const m = body.querySelector('#apptCsvMsg'); if (m) { m.textContent = 'CSV non valido o colonna "Descrizione" non trovata.'; m.className = 'profile-msg is-err'; } return; }
          Modal.close();
          Toast.success(`Importati ${res.added} appuntamenti` + (res.skipped ? ` (${res.skipped} saltati)` : ''));
        };
        if (fileEl && fileEl.files && fileEl.files[0]) {
          const reader = new FileReader();
          reader.onload = () => run(String(reader.result || ''));
          reader.readAsText(fileEl.files[0]);
          return false;
        }
        run(textEl ? textEl.value : '');
        return false;
      }, { confirmLabel: 'Importa' });
  },

  _importApptsText(text) {
    const rows = Utils.csvToArray(text);
    if (!rows.length) return null;
    const keyOf = (obj, re) => Object.keys(obj).find(k => re.test(k));
    const s = rows[0];
    const kData = keyOf(s, /^(data|date|giorno|quando)$/i);
    const kDesc = keyOf(s, /^(descrizione|description|desc|oggetto|titolo|nome|note)$/i);
    const kTipo = keyOf(s, /^(tipo|type|modalit)/i);
    if (!kDesc) return null;
    const mapped = rows.map(r => ({ data: kData ? r[kData] : '', descrizione: r[kDesc] || '', tipo: kTipo ? r[kTipo] : '' }));
    const res = Appointments.importRows(mapped);
    DOM.renderAppointments();
    return res;
  },

  handleExportAppts() {
    if (Appointments.getAll().length === 0) { Toast.warning('Nessun appuntamento da esportare'); return; }
    Utils.downloadCsv(Appointments.toCSV(), `appuntamenti_${Utils.getCurrentDateString()}.csv`);
    Toast.success('Appuntamenti esportati');
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
    // Nome in alto (header) = titolo della sezione attiva
    const titleEl = document.querySelector('.header__title');
    const section = document.getElementById(targetId);
    const h2 = section ? section.querySelector('.panel__title') : null;
    if (titleEl && h2) titleEl.textContent = h2.textContent.trim();
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
  Storage.migrateToSession(); // cloud: sposta dati legacy da localStorage a sessionStorage
  Toast.init();
  Modal.init();
  UI.init();
  SidebarNav.init();
});

























