# PanLink · Setup Supabase (auth + sync) e deploy su Vercel

Guida per attivare **login** e **sincronizzazione dei dati** (cross-device) con
Supabase, mantenendo l'app 100% statica ospitata su Vercel.

L'integrazione è **inerte finché non la configuri**: finché `Panel-main/supabase/config.js`
contiene i placeholder, l'app funziona esattamente come oggi (solo `localStorage`,
nessun login).

---

## Come funziona (architettura)

```
Browser (statico su Vercel)  ──HTTPS──►  Supabase (Auth + Postgres + RLS)
   supabase-js + anon key                 la RLS isola i dati per-utente
```

- Il frontend resta **statico e sincrono**: l'app continua a leggere/scrivere
  `localStorage`. Un layer di **sync offline-first** (`supabase/sync.js`) rispecchia
  in modo trasparente i dati verso Supabase:
  - **al login** scarica i dati dell'utente e riallinea il locale (se il cloud è
    vuoto, carica come *seed* i dati locali già presenti → migrazione automatica);
  - **ad ogni modifica** locale fa l'upsert della tabella interessata e rimuove dal
    cloud le righe eliminate.
- Strategia conflitti: *last-write-wins* per tabella (adatta a uso singolo-utente
  multi-dispositivo).

---

## 1. Crea il progetto e lo schema
1. Crea un progetto su [supabase.com](https://supabase.com).
2. Apri **SQL Editor** e incolla/esegui il contenuto di
   [`Panel-main/supabase/schema.sql`](Panel-main/supabase/schema.sql).
   Crea le 5 tabelle (`assets`, `clients`, `notes`, `tasks`, `appointments`),
   gli indici e le policy **RLS** (ogni utente vede solo le proprie righe).

## 2. Configura l'autenticazione
In **Authentication → Providers → Email**:
- **Email + password** (consigliato per iniziare): abilita il provider Email.
  Per un accesso immediato senza email di conferma, disattiva *"Confirm email"*
  (Authentication → Providers → Email → *Confirm email* = off).
- **Magic link** (senza password): funziona, ma il servizio email integrato del
  piano free è limitato (poche email/ora, solo per test). Per un uso reale
  configura un **SMTP** custom in *Authentication → Emails → SMTP Settings*.

In **Authentication → URL Configuration** aggiungi tra i *Redirect URLs*:
- `http://localhost:8000` (sviluppo locale)
- `https://IL-TUO-DOMINIO.vercel.app` (produzione)

## 3. Inserisci le chiavi pubbliche
Da **Project Settings → API** copia *Project URL* e *anon public key* in
[`Panel-main/supabase/config.js`](Panel-main/supabase/config.js):

```js
window.PANLINK_SUPABASE = {
  url: 'https://xxxxxxxx.supabase.co',
  anonKey: 'eyJ... (anon public key)'
};
```

> L'`anon key` è **pubblica per design**: è normale che stia nel client. La
> protezione reale è la **RLS**. NON inserire mai qui la `service_role` key.

## 4. Deploy su Vercel
Import del repo su [vercel.com](https://vercel.com), poi **una** delle due opzioni:

- **A (consigliata):** Project Settings → *Root Directory* = `Panel-main`,
  *Framework Preset* = **Other**, nessun build command. Vercel serve i file statici.
- **B:** lascia la root del repo e usa il [`vercel.json`](vercel.json) incluso
  (`outputDirectory: "Panel-main"`).

Dominio gratuito: `https://<progetto>.vercel.app` (HTTPS incluso). Ricorda di
aggiungerlo ai *Redirect URLs* di Supabase (passo 2).

## 5. Prova
- In locale: `cd Panel-main && python3 -m http.server 8000` → apri
  `http://localhost:8000`. Se le chiavi sono valide compare il **login**.
- Registrati/accedi, aggiungi qualche elemento/nota/task: compaiono nelle tabelle
  Supabase (Table Editor). Accedendo con lo stesso account da un altro dispositivo,
  ritrovi i dati.

---

## File dell'integrazione
```
Panel-main/
├── vendor/supabase/supabase.js   # libreria supabase-js (UMD, vendorizzata)
└── supabase/
    ├── schema.sql                # tabelle + RLS (da eseguire su Supabase)
    ├── config.js                 # URL + anon key (da compilare)
    ├── client.js                 # crea window.sb (o resta inerte)
    ├── auth.js                   # login/registrazione/logout/magic link
    ├── sync.js                   # sync offline-first localStorage ↔ Supabase
    ├── boot.js                   # gate di login + avvio sync (dopo app.js)
    └── gate.css                  # stile overlay di login
```

## Note di sicurezza
- La sicurezza dei dati dipende dalla **RLS** (attivata dallo schema): senza policy
  corrette, la anon key permetterebbe letture indebite.
- Non committare mai la `service_role` key nel frontend.
- I link degli elementi restano validati a `http`/`https` lato app.

## Limiti attuali / evoluzioni
- Sync *last-write-wins* per tabella: ok per uso personale multi-dispositivo, non
  per editing concorrente fine.
- Possibile evoluzione: passaggio a Supabase come **unica** fonte dati (rendering
  async) e realtime (`supabase.channel`) per aggiornamenti live.
