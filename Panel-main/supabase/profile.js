/**
 * Profilo utente come SEZIONE (pagina) dell'app.
 * Il chip in fondo alla sidebar è un normale nav-link verso #section-profile
 * (gestito da SidebarNav). Qui popoliamo chip + contenuto e i relativi handler.
 * Inerte se non loggato.
 */
const Profile = {
  user: null,
  _bound: false,

  ROLE_LABELS: { owner: 'Proprietario', admin: 'Amministratore', editor: 'Editor', contributor: 'Collaboratore', viewer: 'Visualizzatore' },

  esc(s) { return (typeof Utils !== 'undefined' && Utils.escapeHtml) ? Utils.escapeHtml(s) : String(s == null ? '' : s); },
  fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }); }
    catch (e) { return '—'; }
  },
  referUrl() {
    const o = window.location.origin;
    return (o && o !== 'null' && /^https?:/.test(o)) ? o + '/' : 'https://skelety.app';
  },
  referMsg(url) {
    return 'Ti consiglio Skelety — lo scheletro del tuo lavoro. Organizza elementi, note, attività e appuntamenti in un unico posto: ' + url;
  },

  // Da login: popola il chip, lo mostra e rende la sezione.
  mount(user) {
    Profile.user = user;
    const chip = document.getElementById('profileChip');
    if (chip) {
      const email = user?.email || '';
      const ava = document.getElementById('profileChipAva');
      const em = document.getElementById('profileChipEmail');
      if (ava) ava.textContent = (email.trim()[0] || '?').toUpperCase();
      if (em) em.textContent = email || 'Profilo';
      chip.classList.remove('perm-hidden');
    }
    Profile.bind();
    Profile.render();
  },

  unmount() {
    Profile.user = null;
    document.getElementById('profileChip')?.classList.add('perm-hidden');
    const host = document.getElementById('profileContent');
    if (host) host.innerHTML = '';
  },

  bind() {
    if (Profile._bound) return;
    const host = document.getElementById('profileContent');
    if (!host) return;
    host.addEventListener('click', Profile.onClick);
    Profile._bound = true;
  },

  render() {
    const host = document.getElementById('profileContent');
    const u = Profile.user;
    if (!host || !u) return;
    const w = (window.Workspace && Workspace.current && Workspace.current()) || null;
    const role = w ? (Profile.ROLE_LABELS[w.role] || w.role) : null;
    const url = Profile.referUrl();
    const canShare = typeof navigator !== 'undefined' && !!navigator.share;

    host.innerHTML =
      '<div class="profile-grid">' +

        '<section class="profile-block">' +
          '<h3 class="profile-sec__title">Account</h3>' +
          '<div class="profile-row"><span>Email</span><b>' + Profile.esc(u.email || '—') + '</b></div>' +
          (w ? '<div class="profile-row"><span>Spazio</span><b>' + Profile.esc(w.name) + ' · ' + Profile.esc(role) + '</b></div>' : '') +
          '<div class="profile-row"><span>Membro dal</span><b>' + Profile.fmtDate(u.created_at) + '</b></div>' +
          '<button class="btn btn--secondary profile-logout" data-logout><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Esci</button>' +
        '</section>' +

        '<section class="profile-block">' +
          '<h3 class="profile-sec__title">Cambia password</h3>' +
          '<div class="form-group"><label class="form-label" for="ppNew">Nuova password</label>' +
            '<input type="password" id="ppNew" class="input" autocomplete="new-password" minlength="8" placeholder="Almeno 8 caratteri"></div>' +
          '<div class="form-group"><label class="form-label" for="ppConfirm">Conferma password</label>' +
            '<input type="password" id="ppConfirm" class="input" autocomplete="new-password" placeholder="Ripeti la password"></div>' +
          '<button class="btn btn--primary" data-savepw>Aggiorna password</button>' +
          '<p class="profile-msg" id="ppMsg" role="status"></p>' +
        '</section>' +

        '<section class="profile-block profile-block--wide">' +
          '<h3 class="profile-sec__title">Consiglia Skelety</h3>' +
          '<p class="profile-hint">Condividi Skelety con qualcuno che potrebbe trovarlo utile.</p>' +
          '<div class="profile-refer">' +
            '<input class="input" id="referLink" readonly value="' + Profile.esc(url) + '" aria-label="Link di Skelety">' +
            '<button class="btn btn--secondary" data-copy>Copia link</button>' +
          '</div>' +
          '<div class="profile-refer__actions">' +
            '<a class="btn btn--secondary" href="mailto:?subject=' + encodeURIComponent('Ti consiglio Skelety') + '&body=' + encodeURIComponent(Profile.referMsg(url)) + '"><i class="fa-solid fa-envelope" aria-hidden="true"></i> Email</a>' +
            (canShare ? '<button class="btn btn--secondary" data-share><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Condividi</button>' : '') +
          '</div>' +
        '</section>' +

      '</div>';
  },

  async onClick(e) {
    if (e.target.closest('[data-logout]')) { try { await SupaAuth.signOut(); } catch (_) {} return; }

    if (e.target.closest('[data-savepw]')) {
      const host = document.getElementById('profileContent');
      const nw = host.querySelector('#ppNew').value;
      const cf = host.querySelector('#ppConfirm').value;
      const msgEl = host.querySelector('#ppMsg');
      const setMsg = (t, ok) => { msgEl.textContent = t; msgEl.className = 'profile-msg ' + (ok ? 'is-ok' : 'is-err'); };
      if (!nw || nw.length < 8) return setMsg('La password deve avere almeno 8 caratteri.', false);
      if (nw !== cf) return setMsg('Le due password non coincidono.', false);
      setMsg('Aggiornamento…', true);
      const { error } = await SupaAuth.updatePassword(nw);
      if (error) return setMsg(error.message || 'Errore durante l\'aggiornamento.', false);
      setMsg('Password aggiornata.', true);
      host.querySelector('#ppNew').value = '';
      host.querySelector('#ppConfirm').value = '';
      if (window.Toast) Toast.success('Password aggiornata');
      return;
    }

    if (e.target.closest('[data-copy]')) {
      const url = Profile.referUrl();
      try { await navigator.clipboard.writeText(url); if (window.Toast) Toast.success('Link copiato'); }
      catch (_) { document.getElementById('referLink')?.select(); }
      return;
    }

    if (e.target.closest('[data-share]')) {
      const url = Profile.referUrl();
      try { await navigator.share({ title: 'Skelety', text: Profile.referMsg(url), url }); } catch (_) {}
      return;
    }
  }
};

window.Profile = Profile;
