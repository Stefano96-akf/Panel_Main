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

