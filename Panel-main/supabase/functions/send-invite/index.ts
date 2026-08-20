// ============================================================================
// Supabase Edge Function: send-invite
// Invia l'email di invito a un collaboratore tramite Brevo (API transazionale).
//
// Sicurezza: la function legge l'invito usando il JWT del CHIAMANTE; la RLS
// (`inv_all` = is_admin(workspace_id)) fa sì che solo un amministratore di quel
// workspace possa leggere l'invito → autorizzazione implicita. La chiave Brevo
// resta lato server (mai nel client).
//
// Secret richiesti (Supabase → Edge Functions → Secrets):
//   BREVO_API_KEY   chiave API di Brevo (v3)
//   SENDER_EMAIL    mittente verificato in Brevo (es. no-reply@tuodominio)
//   SENDER_NAME     (opzionale) nome mittente, default "Skelety"
//   APP_URL         (opzionale) URL dell'app, default https://skelety.app/app.html
// SUPABASE_URL e SUPABASE_ANON_KEY sono iniettati automaticamente da Supabase.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietario", admin: "Amministratore", editor: "Editor",
  contributor: "Collaboratore", viewer: "Visualizzatore",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ sent: false, reason: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ sent: false, reason: "no_auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = await req.json().catch(() => ({}));
    const workspaceId = body?.workspaceId;
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!workspaceId || !email) return json({ sent: false, reason: "bad_request" }, 400);

    // L'invito è visibile solo a un admin del workspace (RLS) → autorizza.
    const { data: inv, error: invErr } = await supabase
      .from("invitations")
      .select("role, workspace_id, workspaces(name)")
      .eq("workspace_id", workspaceId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();
    if (invErr || !inv) return json({ sent: false, reason: "not_authorized_or_not_found" }, 403);

    const { data: me } = await supabase.auth.getUser();
    const inviter = me?.user?.email || "un collaboratore";
    // deno-lint-ignore no-explicit-any
    const wsName = (inv as any).workspaces?.name || "uno spazio di lavoro";
    const roleLabel = ROLE_LABELS[(inv as any).role] || (inv as any).role || "collaboratore";

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL");
    const SENDER_NAME = Deno.env.get("SENDER_NAME") || "Skelety";
    const APP_URL = Deno.env.get("APP_URL") || "https://skelety.app/app.html";
    if (!BREVO_API_KEY || !SENDER_EMAIL) {
      // Config mancante: l'invito esiste comunque (accettato al primo login).
      return json({ sent: false, reason: "email_not_configured" }, 200);
    }

    const subject = "Sei stato invitato su Skelety";
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#191A23">
        <h2 style="margin:0 0 8px">Ti hanno invitato su <span style="background:#B9FF66;padding:0 6px;border-radius:6px">Skelety</span></h2>
        <p style="color:#3c3e48;line-height:1.6">
          <b>${esc(inviter)}</b> ti ha invitato a collaborare nello spazio di lavoro
          <b>${esc(wsName)}</b> come <b>${esc(roleLabel)}</b>.
        </p>
        <p style="color:#3c3e48;line-height:1.6">
          Per accettare, accedi o registrati su Skelety <b>con questo indirizzo email</b>
          (${esc(email)}): l'invito verrà applicato automaticamente al primo accesso.
        </p>
        <p style="margin:24px 0">
          <a href="${esc(APP_URL)}" style="background:#191A23;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block;font-weight:bold">
            Apri Skelety
          </a>
        </p>
        <p style="color:#6f7280;font-size:12px;line-height:1.5">
          Se non ti aspettavi questo invito puoi ignorare questa email.
        </p>
      </div>`;

    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify({
        sender: { email: SENDER_EMAIL, name: SENDER_NAME },
        to: [{ email }],
        subject,
        htmlContent: html,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      console.error("brevo error", resp.status, t);
      return json({ sent: false, reason: "brevo_error", status: resp.status }, 200);
    }
    return json({ sent: true }, 200);
  } catch (e) {
    console.error("send-invite exception", e);
    return json({ sent: false, reason: "exception" }, 200);
  }
});
