/**
 * UI "Impostazioni" → "Gestione Permessi".
 * Matrice utenti × sezioni: l'admin imposta ruolo e permessi per-sezione di ogni
 * collaboratore. Usa lo stesso sistema di permessi già presente (Workspace.setRole
 * / setOverride). Inerte se non configurato o se non sei admin.
 */
const Settings = {
  SECTION_LABELS: { clients: 'Elementi', assets: 'Asset', notes: 'Note', tasks: 'Attività', appointments: 'Appuntamenti' },
  ROLE_LABELS: { owner: 'Proprietario', admin: 'Amministratore', editor: 'Editor', contributor: 'Collaboratore', viewer: 'Visualizzatore' },
  ASSIGNABLE: ['admin', 'editor', 'contributor', 'viewer'],
  el: null, _bound: false,

  esc(s) { return (typeof Utils !== 'undefined' && Utils.escapeHtml) ? Utils.escapeHtml(s) : String(s == null ? '' : s); },

  init() {
    Settings.el = document.getElementById('settingsContent');
    if (!Settings.el || Settings._bound) return;
    Settings._bound = true;
    Settings.el.addEventListener('change', Settings.onChange);
  },

  effLabel(role, section) {
    return (window.Workspace && Workspace.rolePerm && Workspace.rolePerm(role, section) === 'edit') ? 'Modifica' : 'Sola lettura';
  },

  async render() {
    if (!Settings.el || !window.Workspace || !Workspace.current()) return;
    const admin = Workspace.isAdmin();
    const tabs =
      '<div class="profile-tabs" role="tablist" aria-label="Impostazioni">' +
        '<button class="profile-tab is-active" role="tab" aria-selected="true" type="button">Gestione Permessi</button>' +
      '</div>';

    if (!admin) {
      Settings.el.innerHTML = tabs + '<p class="team__hint">Solo gli amministratori dello spazio possono gestire i permessi.</p>';
      return;
    }

    const me = Workspace.state.user;
    const sections = Workspace.SECTIONS;
    const members = await Workspace.members();

    const roleOpts = (sel) => Settings.ASSIGNABLE
      .map(r => `<option value="${r}" ${r === sel ? 'selected' : ''}>${Settings.ROLE_LABELS[r]}</option>`).join('');

    const rows = members.map(m => {
      const isOwner = m.role === 'owner';
      const isMe = m.user_id === me.id;
      const canManage = admin && !isOwner && !isMe;
      const ov = m.overrides || {};

      const roleCell = canManage
        ? `<select class="input settings__sel" data-set-role="${m.user_id}" aria-label="Ruolo">${roleOpts(m.role)}</select>`
        : `<span class="team__badge team__badge--${m.role}">${Settings.ROLE_LABELS[m.role] || m.role}</span>`;

      const cells = sections.map(s => {
        const label = Settings.SECTION_LABELS[s];
        if (canManage) {
          const cur = ov[s] || '';
          return `<td data-label="${label}">
            <select class="input settings__sel" data-set-override="${m.user_id}" data-section="${s}" aria-label="Permesso ${label}">
              <option value="">Predefinito (${Settings.effLabel(m.role, s)})</option>
              <option value="edit" ${cur === 'edit' ? 'selected' : ''}>Modifica</option>
              <option value="view" ${cur === 'view' ? 'selected' : ''}>Sola lettura</option>
            </select></td>`;
        }
        const eff = ov[s] || (window.Workspace && Workspace.rolePerm ? Workspace.rolePerm(m.role, s) : 'view');
        return `<td data-label="${label}">` + (eff === 'edit' ? 'Modifica' : '<span class="data-table__muted">Sola lettura</span>') + '</td>';
      }).join('');

      return `<tr>
        <td data-label="Utente" class="data-table__name">${Settings.esc(m.email)}${isMe ? ' <em>(tu)</em>' : ''}</td>
        <td data-label="Ruolo">${roleCell}</td>
        ${cells}
      </tr>`;
    }).join('');

    const head = '<tr><th>Utente</th><th>Ruolo</th>' +
      sections.map(s => `<th>${Settings.SECTION_LABELS[s]}</th>`).join('') + '</tr>';

    Settings.el.innerHTML = tabs +
      '<p class="team__hint">Imposta ruolo e permessi per sezione di ogni collaboratore. «Predefinito» segue il ruolo. Proprietario e il tuo account non sono modificabili qui.</p>' +
      '<div class="data-table-wrap"><table class="data-table settings__table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
  },

  async onChange(e) {
    const role = e.target.closest('[data-set-role]');
    const ov = e.target.closest('[data-set-override]');
    if (role) {
      const { error } = await Workspace.setRole(role.dataset.setRole, role.value);
      if (error) { if (typeof Toast !== 'undefined') Toast.error(error); }
      else if (typeof Toast !== 'undefined') Toast.success('Ruolo aggiornato');
      Settings.render(); // aggiorna le etichette "Predefinito (…)"
    } else if (ov) {
      const { error } = await Workspace.setOverride(ov.dataset.setOverride, ov.dataset.section, ov.value || null);
      if (error) { if (typeof Toast !== 'undefined') Toast.error(error); }
      else if (typeof Toast !== 'undefined') Toast.success('Permesso aggiornato');
    }
  }
};

window.Settings = Settings;
