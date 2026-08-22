/**
 * Workspace / collaboratori.
 * Gestisce: bootstrap del workspace al login, permessi dell'utente corrente,
 * e le operazioni di gestione membri/inviti. No-op sicuro se window.sb è null.
 */
const Workspace = {
  SECTIONS: ['clients', 'assets', 'notes', 'tasks', 'appointments'],
  KEY_CURRENT: 'skelety_workspace_id',

  state: {
    user: null,
    currentId: null,
    list: [],        // [{ id, name, owner_id, role, overrides }]
  },

  // Permesso di default per ruolo su una sezione — deve rispecchiare role_perm() lato SQL
  rolePerm(role, section) {
    if (role === 'owner' || role === 'admin' || role === 'editor') return 'edit';
    if (role === 'contributor') return ['notes', 'tasks', 'appointments'].includes(section) ? 'edit' : 'view';
    return 'view'; // viewer
  },

  current() {
    return Workspace.state.list.find(w => w.id === Workspace.state.currentId) || null;
  },

  permFor(section) {
    const w = Workspace.current();
    if (!w) return 'none';
    const ov = w.overrides && w.overrides[section];
    return ov || Workspace.rolePerm(w.role, section);
  },
  canEdit(section) { return Workspace.permFor(section) === 'edit'; },
  canView(section) { return Workspace.permFor(section) !== 'none'; },
  isAdmin() {
    const w = Workspace.current();
    return !!w && (w.role === 'owner' || w.role === 'admin');
  },
  isOwner() {
    const w = Workspace.current();
    return !!w && w.role === 'owner';
  },

  // Carica le membership dell'utente (con nome/owner del workspace)
  async loadList() {
    const { data, error } = await window.sb
      .from('workspace_members')
      .select('workspace_id, role, overrides, workspaces(name, owner_id)')
      .eq('user_id', Workspace.state.user.id);
    if (error) { console.error('[Workspace] loadList', error.message); return; }
    Workspace.state.list = (data || []).map(r => ({
      id: r.workspace_id,
      name: r.workspaces?.name || 'Spazio',
      owner_id: r.workspaces?.owner_id || null,
      role: r.role,
      overrides: r.overrides || {}
    }));
  },

  // Da eseguire dopo il login: accetta inviti, garantisce un workspace, sceglie il corrente.
  async bootstrap(user) {
    Workspace.state.user = user;

    // 1) accetta eventuali inviti pendenti per la mia email
    try { await window.sb.rpc('accept_invitations'); } catch (e) { console.error('[Workspace] accept', e); }

    // 2) carica le membership
    await Workspace.loadList();

    // 3) se non appartengo a nessuno spazio, ne creo uno (divento owner via trigger)
    if (Workspace.state.list.length === 0) {
      const { error } = await window.sb.from('workspaces').insert({ name: 'Il mio spazio' });
      if (error) console.error('[Workspace] create', error.message);
      await Workspace.loadList();
    }

    // 4) scelgo il workspace corrente: salvato → il mio (owner) → il primo
    let saved = null;
    try { saved = localStorage.getItem(Workspace.KEY_CURRENT); } catch (e) {}
    const owned = Workspace.state.list.find(w => w.owner_id === user.id);
    const chosen = Workspace.state.list.find(w => w.id === saved)
      || owned || Workspace.state.list[0];
    Workspace.state.currentId = chosen ? chosen.id : null;
    Workspace.persist();
    return Workspace.current();
  },

  persist() {
    try {
      if (Workspace.state.currentId) localStorage.setItem(Workspace.KEY_CURRENT, Workspace.state.currentId);
    } catch (e) {}
  },

  setCurrent(id) {
    if (!Workspace.state.list.some(w => w.id === id)) return false;
    Workspace.state.currentId = id;
    Workspace.persist();
    return true;
  },

  // ---- Gestione membri / inviti (solo admin, la RLS lo impone comunque) ----
  async members() {
    const { data, error } = await window.sb.rpc('workspace_members_emails', { ws: Workspace.state.currentId });
    if (error) { console.error('[Workspace] members', error.message); return []; }
    return data || [];
  },
  async invites() {
    const { data, error } = await window.sb
      .from('invitations').select('id, email, role, overrides, status, created_at')
      .eq('workspace_id', Workspace.state.currentId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) { console.error('[Workspace] invites', error.message); return []; }
    return data || [];
  },
  async invite(email, role) {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return { error: 'Email mancante' };
    const wsId = Workspace.state.currentId;
    const r = role || 'viewer';

    // Vincolo unico (workspace_id, lower(email)): esiste al più un invito per
    // email. Se ne esiste già uno, invece di bloccare lo "ri-inviamo":
    // riportiamo lo stato a 'pending', aggiorniamo il ruolo e rimandiamo l'email
    // (utile per reinviare un invito o rifarlo dopo un errore d'invio).
    let resent = false;
    const { error } = await window.sb.from('invitations').insert({
      workspace_id: wsId, email: clean, role: r
    });
    if (error) {
      if (/(duplicate|unique|23505)/i.test(error.message)) {
        const { error: upErr } = await window.sb.from('invitations')
          .update({ status: 'pending', role: r })
          .eq('workspace_id', wsId).eq('email', clean);
        if (upErr) return { error: upErr.message };
        resent = true;
      } else {
        return { error: error.message };
      }
    }

    // La persona entra al primo accesso con quell'email (accept_invitations()).
    // Invio email di invito best-effort tramite Edge Function `send-invite`
    // (richiede Brevo configurato lato server; se non lo è, l'invito resta valido).
    let emailed = false;
    try {
      const { data, error: fErr } = await window.sb.functions.invoke('send-invite', { body: { workspaceId: wsId, email: clean } });
      if (fErr) console.warn('[Workspace] send-invite', fErr.message || fErr);
      else emailed = !!(data && data.sent === true);
    } catch (e) { console.warn('[Workspace] send-invite', e); }
    return { error: null, emailed, resent };
  },
  async revokeInvite(id) {
    const { error } = await window.sb.from('invitations').update({ status: 'revoked' }).eq('id', id);
    return { error: error ? error.message : null };
  },
  async setRole(userId, role) {
    const { error } = await window.sb.from('workspace_members')
      .update({ role }).eq('workspace_id', Workspace.state.currentId).eq('user_id', userId);
    return { error: error ? error.message : null };
  },
  async setOverride(userId, section, perm) {
    // perm: 'edit' | 'view' | null (rimuove l'override → torna al ruolo)
    const m = (await Workspace.members()).find(x => x.user_id === userId);
    const ov = Object.assign({}, m ? m.overrides : {});
    if (perm) ov[section] = perm; else delete ov[section];
    const { error } = await window.sb.from('workspace_members')
      .update({ overrides: ov }).eq('workspace_id', Workspace.state.currentId).eq('user_id', userId);
    return { error: error ? error.message : null };
  },
  async removeMember(userId) {
    const { error } = await window.sb.from('workspace_members')
      .delete().eq('workspace_id', Workspace.state.currentId).eq('user_id', userId);
    return { error: error ? error.message : null };
  },

  // ---- Link d'invito condivisibile (chi apre il link entra con l'account che vuole) ----
  // La tabella workspace_join_links ha RLS admin-only: solo un admin legge/gestisce
  // il token. L'ingresso avviene via RPC SECURITY DEFINER join_workspace_by_token.
  async joinLinkGet() {
    const { data, error } = await window.sb.from('workspace_join_links')
      .select('token, role').eq('workspace_id', Workspace.state.currentId).maybeSingle();
    if (error) { console.error('[Workspace] joinLinkGet', error.message); return null; }
    return data; // { token, role } oppure null
  },
  // regenerate=true → nuovo token (revoca il vecchio link); altrimenti crea/aggiorna il ruolo
  async joinLinkSet(role, regenerate) {
    const ws = Workspace.state.currentId;
    if (regenerate) {
      await window.sb.from('workspace_join_links').delete().eq('workspace_id', ws);
    }
    const { data, error } = await window.sb.from('workspace_join_links')
      .upsert({ workspace_id: ws, role: role || 'viewer' }, { onConflict: 'workspace_id' })
      .select('token, role').maybeSingle();
    if (error) return { error: error.message };
    return { data };
  },
  async joinLinkOff() {
    const { error } = await window.sb.from('workspace_join_links')
      .delete().eq('workspace_id', Workspace.state.currentId);
    return { error: error ? error.message : null };
  },
  joinLinkUrl(token) {
    let origin = 'https://skelety.app';
    try { origin = window.location.origin; } catch (e) {}
    return origin + '/app.html?join=' + encodeURIComponent(token);
  },
  async joinByToken(token) {
    const { data, error } = await window.sb.rpc('join_workspace_by_token', { p_token: token });
    if (error) return { error: error.message };
    return { workspaceId: data || null };
  }
};

window.Workspace = Workspace;
