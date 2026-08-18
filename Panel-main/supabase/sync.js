/**
 * Sincronizzazione offline-first tra localStorage e Supabase (per-workspace).
 *
 * L'app continua a leggere/scrivere localStorage in modo SINCRONO; questo modulo
 * rispecchia i dati verso Supabase sul WORKSPACE corrente:
 *   - al login/switch: PULL del workspace → localStorage → re-render (se il
 *     workspace è vuoto e il locale ha dati, il locale fa da seed → migrazione);
 *   - ad ogni scrittura locale (Storage.set): PUSH snapshot della tabella, ma
 *     solo se hai permesso "Modifica" su quella sezione (altrimenti la RLS
 *     rifiuterebbe).
 *
 * Conflitti: last-write-wins per tabella.
 */
const SupaSync = {
  userId: null,
  _applyingRemote: false,
  _timers: {},
  _origStorageSet: null,

  // key localStorage -> { table (= sezione), toRow(app, uid, ws), toApp(row) }
  MAP: {
    panel_assets: {
      table: 'assets',
      toRow: (a, uid, ws) => ({ id: a.id, user_id: uid, workspace_id: ws, name: a.name || '', description: a.description || '', created_at: a.createdAt }),
      toApp: (r) => ({ id: r.id, name: r.name, description: r.description || '', createdAt: r.created_at })
    },
    panel_clients: {
      table: 'clients',
      toRow: (c, uid, ws) => ({ id: c.id, user_id: uid, workspace_id: ws, nome: c.nome || '', link: c.link || '', asset_ids: Array.isArray(c.assets) ? c.assets : [], group_id: c.groupId || null, created_at: c.createdAt }),
      toApp: (r) => ({ id: r.id, nome: r.nome, link: r.link, assets: r.asset_ids || [], groupId: r.group_id || null, createdAt: r.created_at })
    },
    panel_groups: {
      table: 'groups',
      section: 'clients', // i gruppi appartengono alla sezione Elementi (permesso "clients")
      toRow: (g, uid, ws) => ({ id: g.id, user_id: uid, workspace_id: ws, name: g.name || '', parent_id: g.parentId || null, created_at: g.createdAt }),
      toApp: (r) => ({ id: r.id, name: r.name, parentId: r.parent_id || null, createdAt: r.created_at })
    },
    panel_notes: {
      table: 'notes',
      toRow: (n, uid, ws) => ({ id: n.id, user_id: uid, workspace_id: ws, text: n.text || '', created_at: n.createdAt }),
      toApp: (r) => ({ id: r.id, text: r.text, createdAt: r.created_at })
    },
    panel_tasks: {
      table: 'tasks',
      // board_id è NOT NULL in cloud: i task senza bacheca (orfani transitori)
      // vengono esclusi dal push (li adotta Boards.ensureDefaultAndAdopt()).
      filter: (r) => !!r.board_id,
      toRow: (t, uid, ws) => ({ id: t.id, user_id: uid, workspace_id: ws, board_id: t.boardId || null, text: t.text || '', status: t.status || (t.completed ? 'done' : 'todo'), completed: !!t.completed, created_at: t.createdAt }),
      toApp: (r) => ({ id: r.id, text: r.text, status: r.status, completed: !!r.completed, boardId: r.board_id, createdAt: r.created_at })
    },
    panel_appointments: {
      table: 'appointments',
      toRow: (a, uid, ws) => ({ id: a.id, user_id: uid, workspace_id: ws, date: a.date || null, description: a.description || '', type: a.type || 'remote', completed: !!a.completed, created_at: a.createdAt }),
      toApp: (r) => ({ id: r.id, date: r.date || '', description: r.description, type: r.type, completed: !!r.completed, createdAt: r.created_at })
    }
  },

  ws() { return (window.Workspace && Workspace.state.currentId) || null; },

  install() {
    if (!window.sb || !window.Storage || SupaSync._origStorageSet) return;
    SupaSync._origStorageSet = Storage.set.bind(Storage);
    Storage.set = function (key, value) {
      const okRes = SupaSync._origStorageSet(key, value);
      const conf = SupaSync.MAP[key];
      if (!SupaSync._applyingRemote && SupaSync.ws() && conf &&
          window.Workspace && Workspace.canEdit(conf.section || conf.table)) {
        SupaSync._schedulePush(key);
      }
      return okRes;
    };
  },

  _schedulePush(key) {
    clearTimeout(SupaSync._timers[key]);
    SupaSync._timers[key] = setTimeout(() => SupaSync.pushTable(key), 600);
  },

  async pushTable(key) {
    const conf = SupaSync.MAP[key];
    const ws = SupaSync.ws();
    if (!conf || !ws) return;
    if (window.Workspace && !Workspace.canEdit(conf.section || conf.table)) return; // sola lettura
    let rows = (Storage.get(key, []) || []).map(x => conf.toRow(x, SupaSync.userId, ws));
    if (conf.filter) rows = rows.filter(conf.filter);
    const ids = rows.map(r => r.id);

    if (rows.length) {
      const { error } = await window.sb.from(conf.table).upsert(rows, { onConflict: 'id' });
      if (error) { console.error('[Sync] upsert', conf.table, error.message); return; }
    }

    let del = window.sb.from(conf.table).delete().eq('workspace_id', ws);
    if (ids.length) del = del.not('id', 'in', '(' + ids.join(',') + ')');
    const { error: delErr } = await del;
    if (delErr) console.error('[Sync] delete-missing', conf.table, delErr.message);
  },

  async pushAll() {
    for (const key of Object.keys(SupaSync.MAP)) await SupaSync.pushTable(key);
  },

  // Scarica il workspace corrente in localStorage (senza ritriggerare push).
  async pull() {
    const ws = SupaSync.ws();
    if (!ws) return;
    SupaSync._applyingRemote = true;
    try {
      for (const [key, conf] of Object.entries(SupaSync.MAP)) {
        const { data, error } = await window.sb
          .from(conf.table).select('*').eq('workspace_id', ws)
          .order('created_at', { ascending: false });
        if (error) { console.error('[Sync] pull', conf.table, error.message); continue; }
        SupaSync._origStorageSet(key, (data || []).map(conf.toApp));
      }
    } finally {
      SupaSync._applyingRemote = false;
    }
    SupaSync._rerender();
  },

  _localHasData() {
    return Object.keys(SupaSync.MAP).some(k => (Storage.get(k, []) || []).length > 0);
  },

  async _cloudIsEmpty() {
    const ws = SupaSync.ws();
    for (const conf of Object.values(SupaSync.MAP)) {
      const { count, error } = await window.sb
        .from(conf.table).select('id', { count: 'exact', head: true }).eq('workspace_id', ws);
      if (!error && count > 0) return false;
    }
    return true;
  },

  // Prima sincronizzazione dopo login/bootstrap del workspace.
  async initialSync(user) {
    SupaSync.userId = user.id;
    if (!SupaSync.ws()) return;
    // seed solo se sono io a poter scrivere (owner del nuovo spazio)
    const seeding = window.Workspace && Workspace.canEdit('notes') &&
        await SupaSync._cloudIsEmpty() && SupaSync._localHasData();
    if (seeding) {
      // le bacheche vanno preparate PRIMA del push: board_id è NOT NULL, quindi
      // i task locali orfani vanno adottati in una bacheca esistente.
      if (window.Boards) { await Boards.pull(); await Boards.ensureDefaultAndAdopt(); }
      await SupaSync.pushAll();
    }
    await SupaSync.pull();
    if (window.Boards) { await Boards.pull(); await Boards.ensureDefaultAndAdopt(); }
    SupaSync._rerender();
  },

  // Cambio workspace: azzera il locale delle sezioni e ricarica dal nuovo spazio.
  async switchWorkspace() {
    SupaSync._applyingRemote = true;
    try {
      Object.keys(SupaSync.MAP).forEach(k => SupaSync._origStorageSet(k, []));
      SupaSync._origStorageSet(Storage.keys.boards, []);
    } finally { SupaSync._applyingRemote = false; }
    Storage.remove(Storage.keys.currentBoard);
    await SupaSync.pull();
    if (window.Boards) { await Boards.pull(); await Boards.ensureDefaultAndAdopt(); }
    SupaSync._rerender();
  },

  _rerender() {
    try {
      if (typeof UI !== 'undefined' && UI.renderGroupFilter) UI.renderGroupFilter();
      if (typeof UI !== 'undefined' && UI.refreshClients) UI.refreshClients();
      if (typeof DOM !== 'undefined') {
        DOM.renderAssets && DOM.renderAssets();
        DOM.renderNotes && DOM.renderNotes();
        DOM.renderTasks && DOM.renderTasks();
        DOM.renderAppointments && DOM.renderAppointments();
      }
    } catch (e) {
      console.error('[Sync] re-render', e);
    }
  }
};

window.SupaSync = SupaSync;
