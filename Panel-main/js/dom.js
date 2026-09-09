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
          <button class="note-item__more" type="button" data-note-more hidden>Mostra di più</button>
          <div class="note-item__date">${Utils.formatDate(note.createdAt)}</div>
        </div>
        <div class="note-item__actions">
          <button class="note-item__edit" title="Modifica nota" data-edit-note="${note.id}">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="note-item__delete" title="Elimina nota" data-delete-note="${note.id}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `;
      DOM.notesList.appendChild(li);
    });
    DOM.updateNoteClamps();
  },

  // Mostra "Mostra di più" solo se il testo della nota trabocca su una riga.
  // Va (ri)eseguito quando la sezione Note è visibile (misure reali) e al resize.
  updateNoteClamps() {
    if (!DOM.notesList) return;
    DOM.notesList.querySelectorAll('.note-item').forEach(item => {
      if (item.classList.contains('is-expanded')) return;
      const text = item.querySelector('.note-item__text');
      const more = item.querySelector('.note-item__more');
      if (!text || !more) return;
      text.classList.add('note-item__text--clamped');
      const overflows = text.scrollWidth > text.clientWidth + 1;
      more.hidden = !overflows;
      if (overflows) more.textContent = 'Mostra di più';
      else text.classList.remove('note-item__text--clamped');
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

