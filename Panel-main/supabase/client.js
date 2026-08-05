/**
 * Crea l'istanza del client Supabase in `window.sb`.
 * Richiede che siano caricati PRIMA:
 *   - vendor/supabase/supabase.js  (espone il global `supabase`)
 *   - supabase/config.js           (window.PANLINK_SUPABASE)
 *
 * Se la config è mancante o ancora ai valori placeholder, `window.sb` resta
 * null e l'app prosegue in modalità solo-localStorage (integrazione inerte).
 */
(function () {
  const cfg = window.PANLINK_SUPABASE || {};
  const configured =
    window.supabase &&
    typeof cfg.url === 'string' && /^https:\/\/.+\.supabase\.co/.test(cfg.url) &&
    typeof cfg.anonKey === 'string' && cfg.anonKey.length > 20 &&
    !cfg.anonKey.startsWith('INCOLLA');

  if (!configured) {
    window.sb = null;
    console.info('[PanLink] Supabase non configurato: modalità locale (localStorage).');
    return;
  }

  window.sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
})();
