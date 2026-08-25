/**
 * Skelly — assistente AI di Skelety (chat).
 * L'utente scrive in linguaggio naturale cosa salvare; Skelly (via Edge Function
 * `skelly` → Claude) propone delle AZIONI che l'utente CONFERMA prima del salvataggio.
 * Le azioni confermate vengono eseguite coi moduli esistenti (Notes/Clients/…),
 * quindi persistite e sincronizzate come qualsiasi altro dato.
 * Inerte se Supabase non è configurato.
 */
const Skelly = {
  el: null, log: null, input: null, form: null,
  state: { history: [], busy: false },
  _pending: {},
  _seq: 0,

  // Tool → sezione (per il controllo permessi) + etichetta
  SECTION: { crea_nota: 'notes', crea_link: 'clients', crea_attivita: 'tasks', crea_appuntamento: 'appointments', crea_asset: 'assets' },

  esc(s) { return (typeof Utils !== 'undefined' && Utils.escapeHtml) ? Utils.escapeHtml(s) : String(s == null ? '' : s); },

  init() {
    Skelly.log = document.getElementById('skellyLog');
    Skelly.input = document.getElementById('skellyInput');
    Skelly.form = document.getElementById('skellyForm');
    if (!Skelly.form || Skelly._bound) return;
    Skelly._bound = true;
    Skelly.form.addEventListener('submit', (e) => { e.preventDefault(); Skelly.send(Skelly.input.value); });
    Skelly.log.addEventListener('click', (e) => {
      const ok = e.target.closest('[data-skelly-confirm]');
      const no = e.target.closest('[data-skelly-cancel]');
      if (ok) Skelly.confirm(ok.dataset.skellyConfirm);
      else if (no) Skelly.dismiss(no.dataset.skellyCancel);
    });
    if (!Skelly.log.dataset.greeted) {
      Skelly.log.dataset.greeted = '1';
      Skelly.bubble('skelly', 'Ciao! Sono <b>Skelly</b> 💀 Dimmi cosa salvare e lo preparo per te. Es. «aggiungi nota: chiamare il fornitore», «salva il link skelety.app come Sito», «attività: preparare preventivo», «appuntamento onsite domani: visita cliente».');
    }
  },

  today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  scroll() { if (Skelly.log) Skelly.log.scrollTop = Skelly.log.scrollHeight; },

  bubble(role, html) {
    const div = document.createElement('div');
    div.className = 'skelly__msg skelly__msg--' + role;
    div.innerHTML = (role === 'skelly'
      ? '<span class="skelly__ava" aria-hidden="true">' + Skelly.skullSvg() + '</span>' : '') +
      '<div class="skelly__bubble">' + html + '</div>';
    Skelly.log.appendChild(div);
    Skelly.scroll();
    return div;
  },

  typing(on) {
    if (on) {
      Skelly._typing = Skelly.bubble('skelly', '<span class="skelly__dots"><i></i><i></i><i></i></span>');
    } else if (Skelly._typing) { Skelly._typing.remove(); Skelly._typing = null; }
  },

  async send(text) {
    text = (text || '').trim();
    if (!text || Skelly.state.busy) return;
    Skelly.input.value = '';
    Skelly.bubble('me', Skelly.esc(text));
    if (typeof window === 'undefined' || !window.sb) {
      Skelly.bubble('skelly', 'Sono disponibile solo con l\'account cloud (accedi per usarmi).');
      return;
    }
    Skelly.state.history.push({ role: 'user', content: text });
    Skelly.state.busy = true; Skelly.typing(true);
    try {
      const { data, error } = await window.sb.functions.invoke('skelly', {
        body: { messages: Skelly.state.history, today: Skelly.today() }
      });
      Skelly.typing(false);
      if (error) { Skelly.bubble('skelly', 'Non riesco a raggiungermi ora, riprova tra poco.'); return; }
      const reply = (data && data.reply) || 'Ok.';
      Skelly.bubble('skelly', Skelly.esc(reply));
      Skelly.state.history.push({ role: 'assistant', content: reply });
      const actions = (data && Array.isArray(data.actions)) ? data.actions : [];
      if (actions.length) Skelly.renderActions(actions);
    } catch (e) {
      Skelly.typing(false);
      Skelly.bubble('skelly', 'Ops, qualcosa è andato storto. Riprova.');
    } finally {
      Skelly.state.busy = false;
    }
  },

  renderActions(actions) {
    actions.forEach((a) => {
      const key = 'a' + (++Skelly._seq);
      Skelly._pending[key] = a;
      const desc = Skelly.describe(a);
      if (!desc) return; // tool sconosciuto
      const card =
        '<div class="skelly__action" id="skelly-act-' + key + '">' +
          '<div class="skelly__action-desc">' + desc + '</div>' +
          '<div class="skelly__action-btns">' +
            '<button class="btn btn--primary btn--small" data-skelly-confirm="' + key + '">Conferma</button>' +
            '<button class="btn btn--secondary btn--small" data-skelly-cancel="' + key + '">Annulla</button>' +
          '</div>' +
        '</div>';
      Skelly.bubble('skelly', card);
    });
  },

  describe(a) {
    const i = a.input || {};
    switch (a.tool) {
      case 'crea_nota': return '📝 <b>Nota</b><br>«' + Skelly.esc(i.testo) + '»';
      case 'crea_link': return '🔗 <b>Elemento &amp; Link</b><br>' + Skelly.esc(i.nome) + ' → ' + Skelly.esc(i.url);
      case 'crea_attivita': return '✅ <b>Attività</b><br>«' + Skelly.esc(i.testo) + '»';
      case 'crea_appuntamento': return '📅 <b>Appuntamento</b><br>' + Skelly.esc(i.data) + ' · ' + Skelly.esc(i.descrizione) + ' (' + Skelly.esc(i.tipo === 'onsite' ? 'in sede' : 'da remoto') + ')';
      case 'crea_asset': return '📦 <b>Asset</b><br>' + Skelly.esc(i.nome) + (i.descrizione ? '<br>' + Skelly.esc(i.descrizione) : '');
      default: return '';
    }
  },

  dismiss(key) {
    const a = Skelly._pending[key]; if (!a) return;
    delete Skelly._pending[key];
    Skelly.markCard(key, '✗ Annullato');
  },

  confirm(key) {
    const a = Skelly._pending[key]; if (!a) return;
    delete Skelly._pending[key];
    const section = Skelly.SECTION[a.tool];
    // Permessi: se in cloud e non puoi modificare quella sezione, blocca.
    if (section && window.Workspace && Workspace.canEdit && !Workspace.canEdit(section)) {
      Skelly.markCard(key, '⛔ Non hai i permessi per questa sezione');
      return;
    }
    const res = Skelly.execute(a);
    if (res && res.error) { Skelly.markCard(key, '⚠️ ' + res.error); return; }
    Skelly.markCard(key, '✓ ' + (res && res.label || 'Salvato'));
    if (typeof Toast !== 'undefined' && Toast.success) Toast.success(res && res.label || 'Salvato');
    Skelly.refreshDashboard();
  },

  markCard(key, text) {
    const card = document.getElementById('skelly-act-' + key);
    if (!card) return;
    const btns = card.querySelector('.skelly__action-btns');
    if (btns) btns.outerHTML = '<div class="skelly__action-done">' + Skelly.esc(text) + '</div>';
  },

  // Esegue l'azione confermata coi moduli esistenti. Ritorna { label } o { error }.
  execute(a) {
    const i = a.input || {};
    try {
      switch (a.tool) {
        case 'crea_nota': {
          const t = (i.testo || '').trim(); if (!t) return { error: 'Testo mancante' };
          Notes.add(t); Skelly.refresh('renderNotes'); return { label: 'Nota aggiunta' };
        }
        case 'crea_link': {
          const nome = (i.nome || '').trim(); const url = (i.url || '').trim();
          if (!nome || !url) return { error: 'Nome o URL mancante' };
          const safe = (typeof Utils !== 'undefined' && Utils.safeUrl) ? Utils.safeUrl(url) : url;
          if (!safe) return { error: 'Link non valido (solo http/https)' };
          Clients.add(nome, url); Skelly.refresh('refreshClients'); return { label: 'Elemento aggiunto' };
        }
        case 'crea_attivita': {
          const t = (i.testo || '').trim(); if (!t) return { error: 'Testo mancante' };
          Tasks.add(t); Skelly.refresh('renderTasks'); return { label: 'Attività aggiunta' };
        }
        case 'crea_appuntamento': {
          let data = (i.data || '').trim();
          if (typeof Utils !== 'undefined' && Utils.normalizeDate) { const n = Utils.normalizeDate(data); if (n) data = n; }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: 'Data non valida (usa AAAA-MM-GG)' };
          const desc = (i.descrizione || '').trim(); if (!desc) return { error: 'Descrizione mancante' };
          const tipo = i.tipo === 'onsite' ? 'onsite' : 'remote';
          Appointments.add(data, desc, tipo); Skelly.refresh('renderAppointments'); return { label: 'Appuntamento aggiunto' };
        }
        case 'crea_asset': {
          const nome = (i.nome || '').trim(); if (!nome) return { error: 'Nome mancante' };
          Assets.add(nome, (i.descrizione || '').trim());
          try { if (typeof Assets !== 'undefined' && Assets.renderList) Assets.renderList(document.getElementById('assetsList')); } catch (e) {}
          return { label: 'Asset creato' };
        }
        default: return { error: 'Azione non riconosciuta' };
      }
    } catch (e) { return { error: 'Errore durante il salvataggio' }; }
  },

  refresh(fn) {
    try {
      if (fn === 'refreshClients' && typeof UI !== 'undefined' && UI.refreshClients) UI.refreshClients();
      else if (typeof DOM !== 'undefined' && DOM[fn]) DOM[fn]();
    } catch (e) {}
  },
  refreshDashboard() { try { if (typeof DOM !== 'undefined' && DOM.renderDashboard) DOM.renderDashboard(); } catch (e) {} },

  skullSvg() {
    return '<svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">' +
      '<rect x="1.5" y="1.5" width="45" height="45" rx="11" fill="#B9FF66" stroke="#191A23" stroke-width="2.5"/>' +
      '<path fill="#191A23" d="M24 8C15 8 9 14 9 22c0 4.6 1.9 7.3 3.7 9.1.9.9 1.3 1.7 1.3 3.5v2.6a2.6 2.6 0 0 0 2.6 2.6h1v-3.7h1.8v3.7h2.5v-3.7h1.8v3.7h2.5v-3.7h1.8v3.7h1a2.6 2.6 0 0 0 2.6-2.6v-2.6c0-1.8.4-2.6 1.3-3.5C37.1 29.3 39 26.6 39 22c0-8-6-14-15-14Z"/>' +
      '<circle cx="18" cy="23" r="4.6" fill="#B9FF66"/><circle cx="30" cy="23" r="4.6" fill="#B9FF66"/>' +
      '<circle cx="18.6" cy="23.4" r="1.9" fill="#191A23"/><circle cx="29.4" cy="23.4" r="1.9" fill="#191A23"/>' +
      '<path fill="#B9FF66" d="M24 27l-2.1 3.4h4.2z"/></svg>';
  }
};

window.Skelly = Skelly;
