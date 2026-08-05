/**
 * Configurazione Supabase (valori PUBBLICI).
 *
 * L'anon/publishable key è pensata per stare nel client: la sicurezza reale è
 * data dalla Row Level Security sulle tabelle. NON mettere qui la service_role key.
 *
 * Sostituisci i due valori con quelli del tuo progetto
 * (Supabase → Project Settings → API):
 *   - Project URL
 *   - anon public key
 *
 * Finché i valori restano i placeholder qui sotto, l'app funziona esattamente
 * come oggi (solo localStorage, nessun login): l'integrazione è "inerte".
 */
window.PANLINK_SUPABASE = {
  url: 'https://IL-TUO-PROGETTO.supabase.co',
  anonKey: 'INCOLLA_QUI_LA_ANON_PUBLIC_KEY'
};
