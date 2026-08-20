/**
 * Wrapper di autenticazione Supabase.
 * Tutte le funzioni sono no-op sicure se `window.sb` è null.
 */
const SupaAuth = {
  get ready() { return !!window.sb; },

  async currentUser() {
    if (!window.sb) return null;
    const { data } = await window.sb.auth.getUser();
    return data?.user || null;
  },

  // Email + password
  async signIn(email, password) {
    return window.sb.auth.signInWithPassword({ email, password });
  },
  async signUp(email, password) {
    return window.sb.auth.signUp({ email, password });
  },

  // Magic link (senza password): invia una email con link di accesso.
  // Richiede SMTP configurato in Supabase per un uso reale (il servizio email
  // integrato del piano free è limitato e pensato solo per test).
  async signInMagic(email) {
    return window.sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split('#')[0] }
    });
  },

  async signOut() {
    if (!window.sb) return;
    return window.sb.auth.signOut();
  },

  // Aggiorna la password dell'utente loggato.
  async updatePassword(newPassword) {
    if (!window.sb) return { error: { message: 'Supabase non configurato' } };
    return window.sb.auth.updateUser({ password: newPassword });
  },

  // Recupero password: invia una email con link di reset. L'utente, aprendo il
  // link, rientra con una sessione di recupero e può impostare la nuova password.
  // (Con SMTP configurato in Supabase per un uso reale.)
  async resetPassword(email) {
    if (!window.sb) return { error: { message: 'Supabase non configurato' } };
    const origin = window.location.origin;
    const redirectTo = (origin && /^https?:/.test(origin)) ? origin + '/app.html' : undefined;
    return window.sb.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  },

  // Cancellazione account self-service (RPC SECURITY DEFINER lato DB).
  async deleteAccount() {
    if (!window.sb) return { error: { message: 'Supabase non configurato' } };
    return window.sb.rpc('delete_my_account');
  },

  // Notifica ad ogni cambio di sessione (login/logout/refresh token).
  onChange(callback) {
    if (!window.sb) return { data: { subscription: { unsubscribe() {} } } };
    return window.sb.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });
  }
};
