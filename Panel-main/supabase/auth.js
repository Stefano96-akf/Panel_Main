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

  // Notifica ad ogni cambio di sessione (login/logout/refresh token).
  onChange(callback) {
    if (!window.sb) return { data: { subscription: { unsubscribe() {} } } };
    return window.sb.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });
  }
};
