/**
 * Profilo utente: chip in fondo alla sidebar + overlay con dati account,
 * cambio password e "Consiglia Skelety". Inerte se non loggato.
 */
const Profile = {
  user: null,
  chip: null,
  overlay: null,
  _escHandler: null,

  ROLE_LABELS: { owner: 'Proprietario', admin: 'Amministratore', editor: 'Editor', contributor: 'Collaboratore', viewer: 'Visualizzatore' },

  esc(s) { return (typeof Utils !== 'undefined' && Utils.escapeHtml) ? Utils.escapeHtml(s) : String(s == null ? '' : s); },

  fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }); }
    catch (e) { return '—'; }
  },

  // ---- chip in fondo alla sidebar ----
  mountChip(user) {
    Profile.user = user;
    const inner = document.querySelector('.app-sidebar__inner');
    if (!inner) return;
    if (Profile.chip) { Profile.updateChip(user); return; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'profile-chip';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.innerHTML = Profile._chipInner(user);
    btn.addEventListener('click', () => Profile.open());
    inner.appendChild(btn);
    Profile.chip = btn;
  },
  _chipInner(user) {
    const email = user?.email || '';
    const initials = (email.trim()[0] || '?').toUpperCase();
    return '<span class="profile-chip__ava">' + Profile.esc(initials) + '</span>' +
      '<span class="profile-chip__meta"><span class="profile-chip__email">' + Profile.esc(email) + '</span>' +
      '<span class="profile-chip__hint">Profilo e account</span></span>' +
      '<i class="fa-solid fa-gear" aria-hidden="true"></i>';
  },
  updateChip(user) { Profile.user = user; if (Profile.chip) Profile.chip.innerHTML = Profile._chipInner(user); },
  unmountChip() { Profile.close(); Profile.chip?.remove(); Profile.chip = null; Profile.user = null; },

  // ---- overlay ----
  open() {
    if (!Profile.user || Profile.overlay) return;
    const u = Profile.user;
    const w = (window.Workspace && Workspace.current && Workspace.current()) || null;
    const role = w ? (Profile.ROLE_LABELS[w.role] || w.role) : null;
    const url = window.location.origin && window.location.origin !== 'null'
      ? window.location.origin + '/' : 'https://skelety.app';
    const msg = 'Ti consiglio Skelety — lo scheletro del tuo lavoro. Organizza elementi, note, attività e appuntamenti in un unico posto: ' + url;
    const canShare = typeof navigator !== 'undefined' && !!navigator.share;

    const ov = document.createElement('div');
    ov.className = 'profile-overlay';
    ov.innerHTML =
      '<div class="profile-overlay__backdrop" data-close></div>' +
      '<div class="profile-card" role="dialog" aria-modal="true" aria-label="Profilo">' +
        '<div class="profile-card__head"><h2>Profilo</h2>' +
          '<button class="btn btn--icon" data-close aria-label="Chiudi"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>' +
        '<div class="profile-card__body">' +

          '<section class="profile-sec">' +
            '<h3 class="profile-sec__title">Account</h3>' +
            '<div class="profile-row"><span>Email</span><b>' + Profile.esc(u.email || '—') + '</b></div>' +
            (w ? '<div class="profile-row"><span>Spazio</span><b>' + Profile.esc(w.name) + ' · ' + Profile.esc(role) + '</b></div>' : '') +
            '<div class="profile-row"><span>Membro dal</span><b>' + Profile.fmtDate(u.created_at) + '</b></div>' +
            '<button class="btn btn--secondary profile-logout" data-logout><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Esci</button>' +
          '</section>' +

          '<section class="profile-sec">' +
            '<h3 class="profile-sec__title">Cambia password</h3>' +
            '<div class="form-group"><label class="form-label" for="ppNew">Nuova password</label>' +
              '<input type="password" id="ppNew" class="input" autocomplete="new-password" minlength="8" placeholder="Almeno 8 caratteri"></div>' +
            '<div class="form-group"><label class="form-label" for="ppConfirm">Conferma password</label>' +
              '<input type="password" id="ppConfirm" class="input" autocomplete="new-password" placeholder="Ripeti la password"></div>' +
            '<button class="btn btn--primary" data-savepw>Aggiorna password</button>' +
            '<p class="profile-msg" id="ppMsg" role="status"></p>' +
          '</section>' +

          '<section class="profile-sec">' +
            '<h3 class="profile-sec__title">Consiglia Skelety</h3>' +
            '<p class="profile-hint">Condividi Skelety con qualcuno che potrebbe trovarlo utile.</p>' +
            '<div class="profile-refer">' +
              '<input class="input" id="referLink" readonly value="' + Profile.esc(url) + '" aria-label="Link di Skelety">' +
              '<button class="btn btn--secondary" data-copy>Copia link</button>' +
            '</div>' +
            '<div class="profile-refer__actions">' +
              '<a class="btn btn--secondary" data-email href="mailto:?subject=' + encodeURIComponent('Ti consiglio Skelety') + '&body=' + encodeURIComponent(msg) + '"><i class="fa-solid fa-envelope" aria-hidden="true"></i> Email</a>' +
              (canShare ? '<button class="btn btn--secondary" data-share><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Condividi</button>' : '') +
            '</div>' +
          '</section>' +

        '</div>' +
      '</div>';

    ov.addEventListener('click', (e) => Profile._onClick(e, { url, msg }));
    document.body.appendChild(ov);
    Profile.overlay = ov;
    Profile._escHandler = (e) => { if (e.key === 'Escape') Profile.close(); };
    document.addEventListener('keydown', Profile._escHandler);
    setTimeout(() => { ov.querySelector('#ppNew')?.focus(); }, 30);
  },

  close() {
    if (!Profile.overlay) return;
    document.removeEventListener('keydown', Profile._escHandler);
    Profile.overlay.remove();
    Profile.overlay = null;
  },

  async _onClick(e, ctx) {
    if (e.target.closest('[data-close]')) { Profile.close(); return; }
    if (e.target.closest('[data-logout]')) { Profile.close(); try { await SupaAuth.signOut(); } catch (_) {} return; }

    if (e.target.closest('[data-savepw]')) {
      const nw = Profile.overlay.querySelector('#ppNew').value;
      const cf = Profile.overlay.querySelector('#ppConfirm').value;
      const msgEl = Profile.overlay.querySelector('#ppMsg');
      const setMsg = (t, ok) => { msgEl.textContent = t; msgEl.className = 'profile-msg ' + (ok ? 'is-ok' : 'is-err'); };
      if (!nw || nw.length < 8) return setMsg('La password deve avere almeno 8 caratteri.', false);
      if (nw !== cf) return setMsg('Le due password non coincidono.', false);
      setMsg('Aggiornamento…', true);
      const { error } = await SupaAuth.updatePassword(nw);
      if (error) { setMsg(error.message || 'Errore durante l\'aggiornamento.', false); return; }
      setMsg('Password aggiornata.', true);
      Profile.overlay.querySelector('#ppNew').value = '';
      Profile.overlay.querySelector('#ppConfirm').value = '';
      if (window.Toast) Toast.success('Password aggiornata');
      return;
    }

    if (e.target.closest('[data-copy]')) {
      try {
        await navigator.clipboard.writeText(ctx.url);
        if (window.Toast) Toast.success('Link copiato'); else Profile._flash('Link copiato');
      } catch (_) {
        // fallback: seleziona il campo
        const inp = Profile.overlay.querySelector('#referLink');
        inp?.select();
      }
      return;
    }

    if (e.target.closest('[data-share]')) {
      try { await navigator.share({ title: 'Skelety', text: ctx.msg, url: ctx.url }); } catch (_) {}
      return;
    }
  },

  _flash(t) { const el = Profile.overlay?.querySelector('[data-copy]'); if (el) { const o = el.textContent; el.textContent = t; setTimeout(() => { el.textContent = o; }, 1200); } }
};

window.Profile = Profile;
