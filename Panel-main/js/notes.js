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
      completed: false,
      createdAt: new Date().toISOString()
    };
    notes.unshift(newNote);
    Notes.save(notes);
    return newNote;
  },

  update(id, text) {
    const notes = Notes.getAll();
    const note = notes.find(n => n.id === id);
    if (!note) return false;
    note.text = text;
    Notes.save(notes);
    return true;
  },

  // Segna/desegna la nota come completata (flag indipendente, come per le attività).
  toggle(id) {
    const notes = Notes.getAll();
    const note = notes.find(n => n.id === id);
    if (!note) return false;
    note.completed = !note.completed;
    Notes.save(notes);
    return true;
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
      Completata: n.completed ? 'Sì' : 'No',
      'Data creazione': Utils.formatDate(n.createdAt)
    }));
    return Utils.arrayToCsv(rows, ['Nota', 'Completata', 'Data creazione']);
  }
};
