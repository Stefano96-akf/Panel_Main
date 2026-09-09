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

