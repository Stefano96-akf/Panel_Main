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
//   REPLY_TO        (opzionale) indirizzo per le risposte (es. la casella Kalbid)
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

    // Nota: non esponiamo l'email di chi invita nel corpo del messaggio
    // (l'invito è "dallo spazio di lavoro", non dall'indirizzo personale).
    // deno-lint-ignore no-explicit-any
    const wsName = (inv as any).workspaces?.name || "uno spazio di lavoro";
    const roleLabel = ROLE_LABELS[(inv as any).role] || (inv as any).role || "collaboratore";

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL");
    const SENDER_NAME = Deno.env.get("SENDER_NAME") || "Skelety";
    // Indirizzo a cui vanno le eventuali risposte (opzionale): utile se il
    // mittente è un no-reply ma vuoi ricevere le risposte su una casella reale.
    const REPLY_TO = (Deno.env.get("REPLY_TO") || "").trim();
    const APP_URL = Deno.env.get("APP_URL") || "https://skelety.app/app.html";
    if (!BREVO_API_KEY || !SENDER_EMAIL) {
      // Config mancante: l'invito esiste comunque (accettato al primo login).
      return json({ sent: false, reason: "email_not_configured" }, 200);
    }

    const subject = "Sei stato invitato su Skelety";
    const preheader = `Unisciti a "${wsName}" su Skelety come ${roleLabel}.`;

    // Versione testuale (accessibilità + deliverability: molti provider premiano
    // le email multipart text+html).
    const text =
`Ti hanno invitato a collaborare su Skelety.

Sei stato invitato nello spazio di lavoro "${wsName}" come ${roleLabel}.

Per accettare, accedi o registrati con questo indirizzo email (${email}): l'invito verra applicato automaticamente al primo accesso.

Apri Skelety: ${APP_URL}

Se non ti aspettavi questo invito puoi ignorare questa email.`;

    // Email brandizzata Skelety — layout a tabella (compatibile Outlook & co.),
    // stili inline, nessuna immagine esterna. Palette: dark #191a23, lime #b9ff66.
    const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f3f3f3;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f3f3;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e1e3db;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="height:6px;line-height:6px;font-size:0;background:#b9ff66;">&nbsp;</td></tr>
        <tr><td style="padding:32px 36px 4px;">
          <span style="display:inline-block;font-size:22px;font-weight:800;color:#191a23;letter-spacing:-0.02em;">
            <span style="background:#b9ff66;padding:2px 9px;border-radius:8px;">Skelety</span>
          </span>
        </td></tr>
        <tr><td style="padding:22px 36px 0;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#191a23;font-weight:700;">Ti hanno invitato a collaborare</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#52545e;">
            Sei stato invitato nello spazio di lavoro <b style="color:#191a23;">${esc(wsName)}</b> come <b style="color:#191a23;">${esc(roleLabel)}</b>.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#52545e;">
            Per accettare, accedi o registrati su Skelety <b style="color:#191a23;">con questo indirizzo email</b> (${esc(email)}): l'invito verrà applicato automaticamente al primo accesso.
          </p>
        </td></tr>
        <tr><td style="padding:0 36px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:10px;background:#191a23;">
              <a href="${esc(APP_URL)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Apri Skelety</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 36px 0;"><hr style="border:none;border-top:1px solid #e1e3db;margin:0;"></td></tr>
        <tr><td style="padding:14px 36px 30px;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#8a8d96;">Se non ti aspettavi questo invito puoi ignorare questa email.</p>
        </td></tr>
        <tr><td style="padding:16px 36px;background:#f3f3f3;border-top:1px solid #e1e3db;">
          <p style="margin:0;font-size:12px;color:#8a8d96;">Skelety · <a href="https://skelety.app" style="color:#52545e;text-decoration:none;">skelety.app</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

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
        ...(REPLY_TO ? { replyTo: { email: REPLY_TO } } : {}),
        subject,
        htmlContent: html,
        textContent: text,
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
