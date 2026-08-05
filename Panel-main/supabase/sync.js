/**
 * Sincronizzazione offline-first tra localStorage e Supabase.
 *
 * Filosofia: l'app continua a leggere/scrivere localStorage in modo SINCRONO
 * (nessuna modifica al render pipeline). Questo modulo rispecchia i dati verso
 * Supabase in modo trasparente:
 *   - al login: PULL del cloud → localStorage → re-render (il cloud è la fonte
 *     di verità; se il cloud è vuoto e il locale ha dati, il locale viene
 *     caricato come seed);
 *   - ad ogni scrittura locale (Storage.set): PUSH snapshot della tabella
 *     interessata (upsert delle righe presenti + delete di quelle rimosse).
 *
 * Strategia di conflitto: last-write-wins a livello di tabella. Adatta a un
 * uso singolo-utente multi-dispositivo; per scenari multi-utente concorrenti
 * servirebbe una strategia più fine.
 */
const SupaSync = {
  userId: null,
  _applyingRemote: false,
  _timers: {},
  _origStorageSet: null,

  // key localStorage  ->  { table, toRow(app,uid), toApp(row) }
  MAP: {
    panel_assets: {
      table: 'assets',
      toRow: (a, uid) => ({ id: a.id, user_id: uid, name: a.name || '', description: a.description || '', created_at: a.createdAt }),
      toApp: (r) => ({ id: r.id, name: r.name, description: r.description || '', createdAt: r.created_at })
    },
    panel_clients: {
      table: 'clients',
      toRow: (c, uid) => ({ id: c.id, user_id: uid, nome: c.nome || '', link: c.link || '', asset_ids: Array.isArray(c.assets) ? c.assets : [], created_at: c.createdAt }),
      toApp: (r) => ({ id: r.id, nome: r.nome, link: r.link, assets: r.asset_ids || [], createdAt: r.created_at })
    },
    panel_notes: {
      table: 'notes',
      toRow: (n, uid) => ({ id: n.id, user_id: uid, text: n.text || '', created_at: n.createdAt }),
      toApp: (r) => ({ id: r.id, text: r.text, createdAt: r.created_at })
    },
    panel_tasks: {
      table: 'tasks',
      toRow: (t, uid) => ({ id: t.id, user_id: uid, text: t.text || '', status: t.status || (t.completed ? 'done' : 'todo'), completed: !!t.completed, created_at: t.createdAt }),
      toApp: (r) => ({ id: r.id, text: r.text, status: r.status, completed: !!r.completed, createdAt: r.created_at })
    },
    panel_appointments: {
      table: 'appointments',
      toRow: (a, uid) => ({ id: a.id, user_id: uid, date: a.date || null, description: a.description || '', type: a.type || 'remote', completed: !!a.completed, created_at: a.createdAt }),
      toApp: (r) => ({ id: r.id, date: r.date || '', description: r.description, type: r.type, completed: !!r.completed, createdAt: r.created_at })
    }
  },

  // Aggancia il wrapper su Storage.set per intercettare le scritture locali.
  install() {
    if (!window.sb || !window.Storage || SupaSync._origStorageSet) return;
    SupaSync._origStorageSet = Storage.set.bind(Storage);
    Storage.set = function (key, value) {
      const okRes = SupaSync._origStorageSet(key, value);
      if (!SupaSync._applyingRemote && SupaSync.userId && SupaSync.MAP[key]) {
        SupaSync._schedulePush(key);
      }
      return okRes;
    };
  },

  _schedulePush(key) {
    clearTimeout(SupaSync._timers[key]);
    SupaSync._timers[key] = setTimeout(() => SupaSync.pushTable(key), 600);
  },

  // Upsert delle righe locali + delete delle righe cloud non più presenti.
  async pushTable(key) {
    const conf = SupaSync.MAP[key];
    if (!conf || !SupaSync.userId) return;
    const rows = (Storage.get(key, []) || []).map(x => conf.toRow(x, SupaSync.userId));
    const ids = rows.map(r => r.id);

    if (rows.length) {
      const { error } = await window.sb.from(conf.table).upsert(rows, { onConflict: 'id' });
      if (error) { console.error('[Sync] upsert', conf.table, error.message); return; }
    }

    let del = window.sb.from(conf.table).delete().eq('user_id', SupaSync.userId);
    if (ids.length) del = del.not('id', 'in', '(' + ids.join(',') + ')');
    const { error: delErr } = await del;
    if (delErr) console.error('[Sync] delete-missing', conf.table, delErr.message);
  },

  async pushAll() {
    for (const key of Object.keys(SupaSync.MAP)) await SupaSync.pushTable(key);
  },

  // Scarica tutte le tabelle e sovrascrive il localStorage (senza ritriggerare push).
  async pull() {
    SupaSync._applyingRemote = true;
    try {
      for (const [key, conf] of Object.entries(SupaSync.MAP)) {
        const { data, error } = await window.sb
          .from(conf.table).select('*').order('created_at', { ascending: false });
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
    for (const conf of Object.values(SupaSync.MAP)) {
      const { count, error } = await window.sb
        .from(conf.table).select('id', { count: 'exact', head: true });
      if (!error && count > 0) return false;
    }
    return true;
  },

  // Prima sincronizzazione dopo il login.
  async initialSync(user) {
    SupaSync.userId = user.id;
    if (await SupaSync._cloudIsEmpty() && SupaSync._localHasData()) {
      await SupaSync.pushAll();   // seed: carica sul cloud i dati locali esistenti
    }
    await SupaSync.pull();        // allinea il locale al cloud
  },

  // Ridisegna le viste dell'app (se i moduli sono presenti).
  _rerender() {
    try {
      window.UI && UI.refreshClients && UI.refreshClients();
      window.DOM && DOM.renderAssets && DOM.renderAssets();
      window.DOM && DOM.renderNotes && DOM.renderNotes();
      window.DOM && DOM.renderTasks && DOM.renderTasks();        // aggiorna anche la bacheca
      window.DOM && DOM.renderAppointments && DOM.renderAppointments();
    } catch (e) {
      console.error('[Sync] re-render', e);
    }
  }
};
