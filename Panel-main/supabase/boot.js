/**
 * Bootstrap dell'integrazione Supabase (auth gate + avvio sync).
 * Da includere DOPO app.js. Inerte se Supabase non è configurato.
 */
(function () {
  if (!window.sb) return; // nessuna config → app in modalità locale, nessun gate

  // Link d'invito: se si arriva con ?join=<token>, lo memorizzo subito così
  // sopravvive all'eventuale redirect di login (es. magic link) e lo applico
  // dopo l'accesso (vedi maybeJoinFromLink).
  try {
    const jt = new URL(window.location.href).searchParams.get('join');
    if (jt) localStorage.setItem('skelety_join_token', jt);
  } catch (e) {}

  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  // ---- Overlay di login ----
  const gate = el(`
    <div id="supaGate" class="supa-gate" role="dialog" aria-modal="true" aria-labelledby="supaGateTitle" hidden>
      <div class="supa-gate__card">
        <h2 id="supaGateTitle" class="supa-gate__title">Accedi a Skelety</h2>
        <p class="supa-gate__sub">I tuoi dati sono sincronizzati e protetti sul tuo account.</p>
        <form id="supaForm" class="supa-gate__form" autocomplete="on">
          <label class="supa-gate__label" for="supaEmail">Email</label>
          <input id="supaEmail" class="supa-gate__input" type="email" required autocomplete="email" placeholder="tu@esempio.it">
          <label class="supa-gate__label" for="supaPassword">Password</label>
          <input id="supaPassword" class="supa-gate__input" type="password" required autocomplete="current-password" minlength="8" placeholder="Almeno 8 caratteri">
          <label class="supa-gate__consent"><input type="checkbox" id="supaConsent"> Accetto i <a href="termini.html" target="_blank" rel="noopener">Termini</a> e l'<a href="privacy.html" target="_blank" rel="noopener">Informativa Privacy</a></label>
          <div id="supaMsg" class="supa-gate__msg" role="status" aria-live="polite"></div>
          <div class="supa-gate__actions">
            <button id="supaSignIn" class="btn btn--primary" type="submit">Accedi</button>
            <button id="supaSignUp" class="btn btn--secondary" type="button">Registrati</button>
          </div>
          <div class="supa-gate__links">
            <button id="supaForgot" class="supa-gate__link" type="button">Password dimenticata?</button>
            <button id="supaMagic" class="supa-gate__link" type="button">Accedi con magic link</button>
          </div>
        </form>
      </div>
    </div>
  `);
  document.body.appendChild(gate);

  const $ = (id) => gate.querySelector(id);
  const emailEl = $('#supaEmail'), pwEl = $('#supaPassword'), msgEl = $('#supaMsg');
  const form = $('#supaForm');

  const showGate = (show) => {
    gate.hidden = !show;
    document.body.classList.toggle('supa-locked', show);
  };
  const setMsg = (text, kind = 'info') => { msgEl.textContent = text || ''; msgEl.dataset.kind = kind; };
  const busy = (b) => form.querySelectorAll('button,input').forEach(x => x.disabled = b);

  // ---- Logout nel header ----
  let logoutBtn = null;
  const mountLogout = (user) => {
    const controls = document.querySelector('.header__controls');
    if (!controls) return;
    if (!logoutBtn) {
      logoutBtn = el('<button id="supaLogout" class="btn btn--icon" title="Esci" aria-label="Esci"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i></button>');
      logoutBtn.addEventListener('click', () => SupaAuth.signOut());
      controls.appendChild(logoutBtn);
    }
    logoutBtn.title = 'Esci (' + (user?.email || '') + ')';
  };
  const unmountLogout = () => { logoutBtn?.remove(); logoutBtn = null; };

  // ---- Handlers form ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('Accesso in corso…'); busy(true);
    const { error } = await SupaAuth.signIn(emailEl.value.trim(), pwEl.value);
    busy(false);
    if (error) setMsg(traduci(error.message), 'error'); else setMsg('');
  });

  $('#supaSignUp').addEventListener('click', async () => {
    if (!emailEl.value.trim() || pwEl.value.length < 8) { setMsg('Inserisci email e una password di almeno 8 caratteri.', 'error'); return; }
    if (!$('#supaConsent').checked) { setMsg('Per registrarti devi accettare i Termini e l\'Informativa Privacy.', 'error'); return; }
    setMsg('Creazione account…'); busy(true);
    const { data, error } = await SupaAuth.signUp(emailEl.value.trim(), pwEl.value);
    busy(false);
    if (error) { setMsg(traduci(error.message), 'error'); return; }
    if (data.session) setMsg(''); // login immediato (conferma email disattivata)
    else setMsg('Account creato. Controlla la tua email per confermare, poi accedi.', 'ok');
  });

  $('#supaMagic').addEventListener('click', async () => {
    if (!emailEl.value.trim()) { setMsg('Inserisci prima la tua email.', 'error'); return; }
    setMsg('Invio del link…'); busy(true);
    const { error } = await SupaAuth.signInMagic(emailEl.value.trim());
    busy(false);
    setMsg(error ? traduci(error.message) : 'Ti abbiamo inviato un link di accesso via email.', error ? 'error' : 'ok');
  });

  $('#supaForgot').addEventListener('click', async () => {
    if (!emailEl.value.trim()) { setMsg('Inserisci prima la tua email, poi premi "Password dimenticata?".', 'error'); return; }
    setMsg('Invio del link di reset…'); busy(true);
    const { error } = await SupaAuth.resetPassword(emailEl.value.trim());
    busy(false);
    setMsg(error ? traduci(error.message) : 'Ti abbiamo inviato un link per reimpostare la password.', error ? 'error' : 'ok');
  });

  function traduci(m) {
    if (/Invalid login credentials/i.test(m)) return 'Email o password non validi.';
    if (/already registered/i.test(m)) return 'Questa email è già registrata: usa "Accedi".';
    if (/rate limit|too many/i.test(m)) return 'Troppi tentativi, riprova tra poco.';
    return m;
  }

  // ---- Gating permessi: mostra/nasconde o rende sola-lettura le sezioni ----
  const SkeletyGate = {
    sectionPages: {
      clients: ['section-clients'],
      assets: ['section-assets'],
      notes: ['section-notes'],
      tasks: ['section-tasks', 'section-board'],
      appointments: ['section-appointments']
    },
    applyPermissions() {
      if (!window.Workspace || !Workspace.current()) return;
      Object.entries(SkeletyGate.sectionPages).forEach(([section, pages]) => {
        const perm = Workspace.permFor(section);
        pages.forEach(pid => {
          const page = document.getElementById(pid);
          const link = document.querySelector('[data-nav-target="' + pid + '"]');
          const hidden = perm === 'none';
          if (page) { page.classList.toggle('perm-hidden', hidden); page.classList.toggle('is-readonly', perm === 'view'); }
          if (link) link.classList.toggle('perm-hidden', hidden);
        });
      });
      // La pagina Collaboratori è sempre accessibile a chi è loggato: mostra sia
      // il link in sidebar sia la sezione. I controlli riservati (invito/permessi)
      // sono gestiti da Team.render() in base al ruolo (owner/admin).
      document.querySelector('[data-nav-target="section-team"]')?.classList.remove('perm-hidden');
      document.getElementById('section-team')?.classList.remove('perm-hidden');
    }
  };
  window.SkeletyGate = SkeletyGate;

  // Applica un eventuale link d'invito (?join=<token>, o stashato in localStorage
  // prima del login): aggiunge l'utente al workspace condiviso e lo rende attivo.
  async function maybeJoinFromLink() {
    if (!window.Workspace || !Workspace.joinByToken) return;
    let token = null;
    try { token = new URL(window.location.href).searchParams.get('join'); } catch (e) {}
    if (!token) { try { token = localStorage.getItem('skelety_join_token'); } catch (e) {} }
    if (!token) return;
    try {
      const { workspaceId, error } = await Workspace.joinByToken(token);
      if (error) {
        console.warn('[boot] join', error);
      } else if (workspaceId) {
        await Workspace.loadList();
        Workspace.setCurrent(workspaceId);
        if (typeof Toast !== 'undefined') Toast.success('Sei entrato nello spazio di lavoro');
      } else if (typeof Toast !== 'undefined') {
        Toast.warning('Link d\'invito non valido o non più attivo');
      }
    } finally {
      try { localStorage.removeItem('skelety_join_token'); } catch (e) {}
      try {
        const u = new URL(window.location.href);
        if (u.searchParams.has('join')) {
          u.searchParams.delete('join');
          const qs = u.searchParams.toString();
          history.replaceState(null, '', u.pathname + (qs ? '?' + qs : '') + u.hash);
        }
      } catch (e) {}
    }
  }

  // ---- Stato di autenticazione ----
  SupaSync.install();          // aggancia Storage.set
  if (window.Team) Team.init(); // bind UI Collaboratori (una volta)

  SupaAuth.onChange(async (user) => {
    if (user) {
      showGate(false);
      mountLogout(user);
      // Ogni passo è isolato: un errore in bootstrap/sync non deve impedire
      // l'applicazione dei permessi né il render della sezione Collaboratori
      // (bug: senza questo, un intoppo nella sync nascondeva i controlli admin).
      try { await Workspace.bootstrap(user); } catch (e) { console.error('[boot] bootstrap', e); }
      try { await maybeJoinFromLink(); } catch (e) { console.error('[boot] join', e); }
      try { await SupaSync.initialSync(user); } catch (e) { console.error('[boot] initialSync', e); }
      try { SkeletyGate.applyPermissions(); } catch (e) { console.error('[boot] applyPermissions', e); }
      try { if (window.Team) await Team.render(); } catch (e) { console.error('[boot] Team.render', e); }
      try { if (window.Profile) Profile.mount(user); } catch (e) { console.error('[boot] Profile.mount', e); }
      // Rientro da link di reset password → guida l'utente al cambio password
      try {
        if (/type=recovery/.test(window.location.hash || '')) {
          if (typeof Toast !== 'undefined') Toast.show('Link di recupero attivo: imposta una nuova password qui nel Profilo.', 'info', 8000);
          document.querySelector('[data-nav-target="section-profile"]')?.click();
          try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
        }
      } catch (e) { console.error('[boot] recovery', e); }
    } else {
      SupaSync.userId = null;
      if (window.Workspace) Workspace.state.currentId = null;
      if (window.Profile) Profile.unmount();
      // pulizia completa dei dati utente dal browser (session + local): nessun
      // contenuto resta sul dispositivo dopo il logout (Supabase è la fonte).
      if (typeof Storage !== 'undefined' && Storage.clearData) Storage.clearData();
      try { localStorage.removeItem('skelety_workspace_id'); } catch (e) {}
      unmountLogout();
      showGate(true);
    }
  });

  // Stato iniziale al caricamento (se Supabase non risponde, mostra comunque il gate)
  SupaAuth.currentUser().then(user => { if (!user) showGate(true); }).catch(() => showGate(true));
})();
