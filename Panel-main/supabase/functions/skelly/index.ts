// ============================================================================
// Supabase Edge Function: skelly
// Assistente AI di Skelety. Riceve i messaggi dell'utente e chiede a Claude
// (Anthropic) quali "azioni" proporre (crea nota / link / attività / appuntamento
// / asset) tramite tool use. NON crea nulla: restituisce le azioni proposte, che
// il client mostra all'utente per CONFERMA prima di salvare.
//
// Sicurezza: verify_jwt = true (solo utenti autenticati). La chiave Anthropic
// resta un secret lato server (mai nel client).
//
// Secret richiesti (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   chiave API di Anthropic
//   SKELLY_MODEL        (opzionale) id modello, default claude-haiku-4-5-20251001
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
const TOOLS: any[] = [
  {
    name: "crea_nota",
    description: "Crea una nota testuale rapida.",
    input_schema: { type: "object", properties: { testo: { type: "string", description: "Il contenuto della nota" } }, required: ["testo"] },
  },
  {
    name: "crea_link",
    description: "Salva un elemento con un link/URL (deve essere http o https).",
    input_schema: { type: "object", properties: { nome: { type: "string", description: "Nome/etichetta dell'elemento" }, url: { type: "string", description: "URL http/https" } }, required: ["nome", "url"] },
  },
  {
    name: "crea_attivita",
    description: "Crea un'attività (task) da fare.",
    input_schema: { type: "object", properties: { testo: { type: "string", description: "Descrizione dell'attività" } }, required: ["testo"] },
  },
  {
    name: "crea_appuntamento",
    description: "Crea un appuntamento in calendario.",
    input_schema: { type: "object", properties: { data: { type: "string", description: "Data in formato YYYY-MM-DD" }, descrizione: { type: "string" }, tipo: { type: "string", enum: ["remote", "onsite"], description: "Da remoto o in sede" } }, required: ["data", "descrizione"] },
  },
  {
    name: "crea_asset",
    description: "Crea un asset riutilizzabile (componente da associare agli elementi).",
    input_schema: { type: "object", properties: { nome: { type: "string" }, descrizione: { type: "string" } }, required: ["nome"] },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const MODEL = Deno.env.get("SKELLY_MODEL") || "claude-haiku-4-5-20251001";

    const body = await req.json().catch(() => ({}));
    // deno-lint-ignore no-explicit-any
    const raw: any[] = Array.isArray(body?.messages) ? body.messages : [];
    const today = typeof body?.today === "string" ? body.today : new Date().toISOString().slice(0, 10);

    // Sanitizza la cronologia: solo user/assistant con contenuto testuale,
    // ultimi 12 messaggi, ogni testo max 2000 caratteri.
    const messages = raw
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-12)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return json({ ok: false, reason: "bad_request", reply: "Scrivimi cosa vuoi salvare 🙂" }, 200);
    }

    if (!ANTHROPIC_API_KEY) {
      return json({ ok: false, reason: "not_configured", reply: "Skelly non è ancora attivo: manca la chiave API di Anthropic. Il proprietario deve impostarla nei secret della funzione." }, 200);
    }

    // Rate-limit giornaliero per-utente (protegge dai costi/abusi). Se il controllo
    // non è disponibile non blocchiamo l'uso.
    const LIMIT = Number(Deno.env.get("SKELLY_DAILY_LIMIT") || "60");
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
      );
      const { data: rc } = await supabase.rpc("skelly_rate_check", { p_limit: LIMIT });
      if (rc && rc.allowed === false) {
        return json({ ok: false, reason: "rate_limited", reply: `Hai raggiunto il limite di ${LIMIT} messaggi al giorno con Skelly. Riprova domani.` }, 200);
      }
    } catch (_) { /* check non disponibile → prosegui */ }

    const system =
      "Sei Skelly, l'assistente dentro Skelety — uno spazio di lavoro con note, elementi/link, attività, appuntamenti e asset. " +
      "Il tuo compito è aiutare l'utente a SALVARE cose usando gli strumenti (tool) disponibili. " +
      "Quando l'utente dice cosa vuole aggiungere, scegli lo strumento giusto ed estrai i dati. " +
      "Se manca un dato essenziale (es. l'URL di un link, o la data di un appuntamento) chiedilo brevemente invece di inventarlo. Non inventare mai URL. " +
      "Per le date usa il formato YYYY-MM-DD; se l'utente dice 'oggi', 'domani', 'lunedì', calcola la data considerando che oggi è " + today + " (fuso Europe/Rome). " +
      "Puoi proporre più azioni insieme se l'utente chiede più cose. Rispondi sempre in italiano, breve e amichevole. " +
      "Se il messaggio non riguarda il salvataggio di qualcosa, rispondi normalmente senza usare strumenti.";

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, system, tools: TOOLS, messages }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      console.error("anthropic error", resp.status, t);
      return json({ ok: false, reason: "api_error", reply: "Skelly ha avuto un problema momentaneo. Riprova tra poco." }, 200);
    }

    const data = await resp.json();
    // deno-lint-ignore no-explicit-any
    const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
    let reply = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const actions = blocks
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: String(b.id || ""), tool: String(b.name || ""), input: b.input || {} }));
    if (!reply) reply = actions.length ? "Ecco cosa posso salvare — confermi?" : "Dimmi pure cosa vuoi aggiungere.";

    return json({ ok: true, reply, actions }, 200);
  } catch (e) {
    console.error("skelly exception", e);
    return json({ ok: false, reason: "exception", reply: "Ops, qualcosa è andato storto. Riprova." }, 200);
  }
});
