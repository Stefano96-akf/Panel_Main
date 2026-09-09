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

