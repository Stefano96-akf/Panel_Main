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

