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
      const moreBtn = e.target.closest('[data-note-more]');
      if (moreBtn) {
        const item = moreBtn.closest('.note-item');
        const text = item && item.querySelector('.note-item__text');
        if (!item || !text) return;
        const expanded = item.classList.toggle('is-expanded');
        if (expanded) { text.classList.remove('note-item__text--clamped'); moreBtn.textContent = 'Mostra di meno'; }
        else { text.classList.add('note-item__text--clamped'); moreBtn.textContent = 'Mostra di più'; }
        return;
      }
      const editBtn = e.target.closest('[data-edit-note]');
      if (editBtn) { UI.handleEditNote(editBtn.dataset.editNote); return; }
      const deleteBtn = e.target.closest('[data-delete-note]');
      if (deleteBtn) {
        const noteId = deleteBtn.dataset.deleteNote;
        UI.handleDeleteNote(noteId);
      }
    });

    window.addEventListener('resize', Utils.debounce(() => DOM.updateNoteClamps(), 150));

    DOM.renderNotes();
  },

  handleEditNote(noteId) {
    const note = Notes.getAll().find(n => n.id === noteId);
    if (!note) return;
    Modal.open('Modifica nota',
      '<div class="form-group"><label class="label" for="editNoteText">Testo</label>' +
      '<textarea id="editNoteText" class="input textarea" rows="5" placeholder="Testo della nota">' + Utils.escapeHtml(note.text) + '</textarea></div>',
      (body) => {
        const text = body.querySelector('#editNoteText').value;
        const validation = Validators.validateNote(text);
        if (!validation.valid) { Toast.error(validation.error); return false; }
        Notes.update(noteId, text.trim());
        DOM.renderNotes();
        Toast.success('Nota aggiornata');
      });
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

