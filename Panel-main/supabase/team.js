/**
 * UI "Collaboratori": switcher workspace, inviti, membri, permessi per sezione.
 * Richiede window.sb, Workspace, Toast. Inerte se non configurato.
 */
const Team = {
  SECTION_LABELS: { clients: 'Elementi', assets: 'Asset', notes: 'Note', tasks: 'Attività', appointments: 'Appunt.' },
  ROLE_LABELS: { owner: 'Proprietario', admin: 'Amministratore', editor: 'Editor', contributor: 'Collaboratore', viewer: 'Visualizzatore' },
  ASSIGNABLE: ['admin', 'editor', 'contributor', 'viewer'],

  el: null,
  init() {
    Team.el = document.getElementById('teamContent');
    if (!Team.el) return;
    // delega eventi (i controlli sono ricreati ad ogni render)
    Team.el.addEventListener('click', Team.onClick);
    Team.el.addEventListener('change', Team.onChange);
  },

  esc(s) { return (typeof Utils !== 'undefined' && Utils.escapeHtml) ? Utils.escapeHtml(s) : String(s == null ? '' : s); },

  async render() {
    if (!Team.el || !window.Workspace || !Workspace.current()) return;
    const admin = Workspace.isAdmin();
    const me = Workspace.state.user;
    const [members, invites, joinLink] = await Promise.all([
      Workspace.members(),
      admin ? Workspace.invites() : [],
      admin ? Workspace.joinLinkGet() : null
    ]);

    const roleOpts = (sel) => Team.ASSIGNABLE
      .map(r => `<option value="${r}" ${r === sel ? 'selected' : ''}>${Team.ROLE_LABELS[r]}</option>`).join('');

    // switcher workspace (se appartieni a più spazi)
    const switcher = Workspace.state.list.length > 1 ? `
      <div class="team__switch">
        <label class="label" for="wsSwitch">Spazio attivo</label>
        <select id="wsSwitch" class="input" data-ws-switch>
          ${Workspace.state.list.map(w => `<option value="${w.id}" ${w.id === Workspace.state.currentId ? 'selected' : ''}>${Team.esc(w.name)}${w.owner_id === me.id ? ' (tuo)' : ''}</option>`).join('')}
        </select>
      </div>` : '';

    const inviteBox = admin ? `
      <div class="team__card">
        <h3 class="team__h">Invita un collaboratore</h3>
        <div class="team__invite">
          <input type="email" id="inviteEmail" class="input" placeholder="email@esempio.it" aria-label="Email da invitare">
          <select id="inviteRole" class="input" aria-label="Ruolo">${roleOpts('viewer')}</select>
          <button class="btn btn--primary" data-invite>Invita</button>
        </div>
        <p class="team__hint">La persona entra al primo accesso con quell'email.</p>
        ${invites.length ? `<ul class="team__invites">${invites.map(i => `
          <li><span>${Team.esc(i.email)} · <em>${Team.ROLE_LABELS[i.role] || i.role}</em> · in attesa</span>
          <button class="team__link" data-revoke="${i.id}">Revoca</button></li>`).join('')}</ul>` : ''}
      </div>` : '';

    const joinLinkBox = admin ? `
      <div class="team__card">
        <h3 class="team__h">Link d'invito</h3>
        <p class="team__hint">Chiunque apra il link entra in questo spazio con l'account che preferisce (qualsiasi email), con il ruolo scelto.</p>
        <div class="team__invite">
          <select id="joinLinkRole" class="input" aria-label="Ruolo del link" data-joinlink-role>${roleOpts(joinLink ? joinLink.role : 'viewer')}</select>
          <button class="btn btn--primary" data-joinlink-gen>${joinLink ? 'Rigenera link' : 'Genera link'}</button>
          ${joinLink ? '<button class="btn btn--secondary" data-joinlink-off>Disattiva</button>' : ''}
        </div>
        ${joinLink ? `<div class="team__joinlink">
          <input type="text" readonly class="input team__joinlink-url" id="joinLinkUrl" value="${Team.esc(Workspace.joinLinkUrl(joinLink.token))}" aria-label="Link d'invito" data-joinlink-url>
          <button class="btn btn--secondary btn--small" data-joinlink-copy>Copia</button>
        </div>
        <p class="team__hint">Rigenerando il link, quello precedente smette di funzionare.</p>` : ''}
      </div>` : '';

    const rows = members.map(m => {
      const isOwner = m.role === 'owner';
      const isMe = m.user_id === me.id;
      const canManage = admin && !isOwner && !isMe;
      const ov = m.overrides || {};
      const overrides = canManage ? `
        <details class="team__perms">
          <summary>Permessi per sezione</summary>
          <div class="team__perms-grid">
            ${Workspace.SECTIONS.map(s => `
              <label>${Team.SECTION_LABELS[s]}
                <select data-override="${m.user_id}" data-section="${s}">
                  <option value="">Predefinito (${Team.ROLE_LABELS[m.role]})</option>
                  <option value="edit" ${ov[s] === 'edit' ? 'selected' : ''}>Modifica</option>
                  <option value="view" ${ov[s] === 'view' ? 'selected' : ''}>Sola lettura</option>
                </select>
              </label>`).join('')}
          </div>
        </details>` : '';
      return `
        <li class="team__member">
          <div class="team__member-main">
            <span class="team__email">${Team.esc(m.email)}${isMe ? ' <em>(tu)</em>' : ''}</span>
            ${canManage
              ? `<select class="team__role" data-role="${m.user_id}">${roleOpts(m.role)}</select>`
              : `<span class="team__badge team__badge--${m.role}">${Team.ROLE_LABELS[m.role] || m.role}</span>`}
            ${canManage ? `<button class="team__link team__link--danger" data-remove="${m.user_id}">Rimuovi</button>` : ''}
          </div>
          ${overrides}
        </li>`;
    }).join('');

    Team.el.innerHTML = `
      ${switcher}
      ${inviteBox}
      ${joinLinkBox}
      <div class="team__card">
        <h3 class="team__h">Membri (${members.length})</h3>
        <ul class="team__members">${rows}</ul>
      </div>`;
  },

  async onClick(e) {
    const inviteBtn = e.target.closest('[data-invite]');
    const revoke = e.target.closest('[data-revoke]');
    const remove = e.target.closest('[data-remove]');
    const jlGen = e.target.closest('[data-joinlink-gen]');
    const jlOff = e.target.closest('[data-joinlink-off]');
    const jlCopy = e.target.closest('[data-joinlink-copy]');
    if (jlGen) {
      const roleSel = document.getElementById('joinLinkRole');
      const role = roleSel ? roleSel.value : 'viewer';
      const existing = !!document.getElementById('joinLinkUrl'); // link già attivo → rigenera
      const { error } = await Workspace.joinLinkSet(role, existing);
      if (error) { Toast && Toast.error(error); return; }
      Toast && Toast.success(existing ? 'Link rigenerato' : 'Link creato');
      Team.render();
      return;
    }
    if (jlOff) {
      const { error } = await Workspace.joinLinkOff();
      if (error) { Toast && Toast.error(error); return; }
      Toast && Toast.success('Link disattivato'); Team.render();
      return;
    }
    if (jlCopy) {
      const inp = document.getElementById('joinLinkUrl');
      if (!inp) return;
      const val = inp.value;
      const done = () => { Toast && Toast.success('Link copiato'); };
      const fallback = () => { try { inp.focus(); inp.select(); document.execCommand('copy'); done(); } catch (err) {} };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(val).then(done).catch(fallback);
      } else { fallback(); }
      return;
    }
    if (inviteBtn) {
      const email = document.getElementById('inviteEmail').value;
      const role = document.getElementById('inviteRole').value;
      const { error, emailed, resent } = await Workspace.invite(email, role);
      if (error) { Toast && Toast.error(error); return; }
      const base = resent ? 'Invito reinviato' : 'Invito creato';
      Toast && Toast.success(emailed ? base + ' via email' : base);
      Team.render();
    } else if (revoke) {
      const { error } = await Workspace.revokeInvite(revoke.dataset.revoke);
      if (error) { Toast && Toast.error(error); return; }
      Team.render();
    } else if (remove) {
      const doIt = async () => {
        const { error } = await Workspace.removeMember(remove.dataset.remove);
        if (error) { Toast && Toast.error(error); return; }
        Toast && Toast.success('Membro rimosso'); Team.render();
      };
      if (typeof AlertDialog !== 'undefined' && AlertDialog.confirmDelete) AlertDialog.confirmDelete({ title: 'Rimuovi membro', message: 'Rimuovere questo collaboratore dallo spazio?', onConfirm: doIt });
      else doIt();
    }
  },

  async onChange(e) {
    const sw = e.target.closest('[data-ws-switch]');
    const role = e.target.closest('[data-role]');
    const ov = e.target.closest('[data-override]');
    const jlRole = e.target.closest('[data-joinlink-role]');
    if (jlRole) {
      // Se il link esiste già, aggiorna il suo ruolo mantenendo il token.
      // Altrimenti la scelta verrà usata al click su "Genera link".
      if (document.getElementById('joinLinkUrl')) {
        const { error } = await Workspace.joinLinkSet(jlRole.value, false);
        if (error) { Toast && Toast.error(error); return; }
        Toast && Toast.success('Ruolo del link aggiornato'); Team.render();
      }
      return;
    }
    if (sw) {
      if (Workspace.setCurrent(sw.value)) {
        await SupaSync.switchWorkspace();
        if (window.SkeletyGate) SkeletyGate.applyPermissions();
        Team.render();
        Toast && Toast.info('Spazio cambiato');
      }
    } else if (role) {
      const { error } = await Workspace.setRole(role.dataset.role, role.value);
      if (error) { Toast && Toast.error(error); Team.render(); return; }
      Toast && Toast.success('Ruolo aggiornato'); Team.render();
    } else if (ov) {
      const { error } = await Workspace.setOverride(ov.dataset.override, ov.dataset.section, ov.value || null);
      if (error) { Toast && Toast.error(error); return; }
      Toast && Toast.success('Permesso aggiornato');
    }
  }
};

window.Team = Team;
