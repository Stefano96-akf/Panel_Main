# CLAUDE.md

Guida per istanze di Claude Code che lavorano su questo repository.

## Panoramica

**PanLink** (titolo interno "Panel"/"Dashboard") è una web app **100% client-side** in
**vanilla HTML/CSS/JS**, senza backend, build step, package manager o dipendenze npm.
Serve a gestire elementi/link, asset riutilizzabili, note, attività (task) e appuntamenti.
Tutti i dati sono persistiti nel `localStorage` del browser.

Il codice applicativo vive nella sottocartella **`Panel-main/`**.

## Come eseguire / testare

Non c'è build né server obbligatorio: aprire direttamente il file.

```bash
# Opzione 1: aprire il file nel browser
open Panel-main/index.html          # macOS
xdg-open Panel-main/index.html      # Linux

# Opzione 2 (consigliata per testare correttamente fetch/relative path):
cd Panel-main && python3 -m http.server 8000
# poi visitare http://localhost:8000
```

Non esistono test automatici, linter o CI. La verifica è **manuale nel browser**:
flussi CRUD, persistenza dopo refresh, dark mode, responsive sidebar, console senza errori.

> Nota: font (Inter) e icone (Font Awesome) sono **vendorizzati in locale** sotto
> `Panel-main/vendor/` — nessun CDN, l'app funziona completamente offline via `file://`.

## Struttura file

```
Panel-main/
├── index.html          # Landing page pubblica (Skelety) — entry point su /
├── app.html            # L'app (dashboard a pagine) — dietro login Supabase
├── style.css           # Design system completo con CSS custom properties
├── app.js              # Tutta la logica applicativa (moduli come object literal)
├── favicon.svg
│
├── vendor/             # Asset locali (offline, nessun CDN)
│   ├── fontawesome/    #   Font Awesome (solo fa-solid) — CSS + woff2
│   ├── inter/          #   Font Inter (pesi 300-700) — inter.css + woff2
│   └── supabase/       #   supabase-js (UMD vendorizzato)
│
├── supabase/           # Integrazione auth+sync: schema.sql, config/client/auth/sync/boot, gate.css
│
├── ARCHITETTURA.md     # Doc architetturale (report storico v2.0)
├── WEBAPP_GUIDE.md     # Guida funzionale
└── Readme.txt          # README iniziale
```

## Architettura JavaScript

`app.js` è organizzato in **moduli come object literal** (nessun ES module, nessun
`import/export`, nessun bundler). Tutto è caricato con un singolo `<script src="app.js">`
e inizializzato su `DOMContentLoaded`. Convenzione: ogni modulo è un `const NomeModulo = { ... }`.

| Modulo | Responsabilità |
|--------|----------------|
| `Storage` | Wrapper storage con try/catch e `JSON.parse/stringify`. Chiavi in `Storage.keys`. Con Supabase attivo, le chiavi dati (`Storage.dataKeys`) usano **sessionStorage** (cache di sessione: Supabase è la fonte, si azzera a chiusura scheda e al logout via `clearData()`); preferenze e token restano in `localStorage`. In modalità locale (senza Supabase) i dati restano in `localStorage`. `migrateToSession()` sposta i dati legacy da localStorage a sessionStorage all'avvio. |
| `Validators` | Validazione pura form (nome/link/note/task), ritorna `{ valid, error? }`. |
| `Utils` | Helper: `escapeHtml`, `generateId`, `debounce`, formattazione date, CSV, download blob. |
| `Clients` | CRUD "Elementi & Link". Chiave storage `panel_clients`. Ogni elemento può avere un `groupId` (gruppo/sotto-gruppo) e importarsi da CSV. |
| `Groups` | Cartelle a 2 livelli (gruppo → sotto-gruppo) per gli Elementi. Locale su `panel_groups`; in cloud tabella `groups` (permesso sezione `clients`). |
| `Assets` | CRUD asset riutilizzabili, associabili agli elementi tramite array di id. |
| `Notes` | CRUD note. |
| `Tasks` | CRUD attività. Ogni task referenzia una bacheca (`boardId`) e una colonna (`status` = id colonna). |
| `Boards` | Bacheche Kanban multiple (max 3) con colonne dinamiche `[{id,label}]`. Locale su `panel_boards`; in cloud è online-first (tabella `boards` + `board_members`, accesso ristretto per-bacheca) con cache localStorage. |
| `Appointments` | CRUD appuntamenti (tipo `remote`/`onsite`). UI "Calendario": griglia mensile + vista lista, filtri per tipo/completati, import/export CSV. |
| `Dashboard` | Analytics aggregate (sola lettura) da tutti i moduli: KPI, grafici a barre, donut completamento attività, attività recenti. Pagina landing `section-dashboard`. |
| `Toast` | Notifiche temporanee (success/error/warning/info). |
| `Modal` | Modale unico riutilizzabile con focus trap, ESC, restore focus. |
| `DOM` | Funzioni di rendering delle liste. Cache dei nodi principali. |
| `UI` | Event binding e handler dei flussi utente. Entry point `UI.init()`. |
| `SidebarNav` | Sidebar verticale, scrollspy con IntersectionObserver, stato collapsed persistito. |
| `AlertDialog` | Conferme eliminazione costruite sul `Modal` (sostituisce `confirm()` nativo). |

### Convenzione modale (importante)

`Modal.open(title, htmlContent, onSaveCallback)`:
- Il callback riceve il nodo `#modalBody` e viene invocato al click su "Salva".
- **Il valore di ritorno controlla la chiusura**: la modale si chiude **a meno che** il
  callback ritorni **esattamente `false`**. Quindi, se una validazione fallisce, il
  callback deve `return false` per tenere aperta la modale. Ritornare `undefined`
  (es. un semplice `return;`) chiude comunque la modale — vedi bug noti.
- Per contenuto dinamico da iniettare dopo l'apertura (es. checkbox asset), lo si
  renderizza **dopo** `Modal.open(...)` scrivendo nell'elemento appena creato.

## Modello dati (localStorage)

Chiavi in `Storage.keys` più alcune ausiliarie. Ogni record ha `id` (stringa da
`Utils.generateId()`) e `createdAt` (ISO string).

```jsonc
// panel_clients  → array
// `groupId` = id di un gruppo o sotto-gruppo in panel_groups (o null).
{ "id": "...", "nome": "...", "link": "...", "assets": ["assetId", ...], "groupId": "<groupId>|null", "createdAt": "ISO" }

// panel_groups   → array (cartelle a 2 livelli per gli Elementi)
// `parentId` = id del gruppo padre (null = gruppo di primo livello).
{ "id": "...", "name": "...", "parentId": "<groupId>|null", "createdAt": "ISO" }

// panel_assets   → array
{ "id": "...", "name": "...", "description": "...", "createdAt": "ISO" }

// panel_notes    → array
{ "id": "...", "text": "...", "createdAt": "ISO" }

// panel_tasks    → array
// `status` = id della colonna nella bacheca `boardId`; `completed` è un flag
// indipendente usato dalla lista "Attività".
{ "id": "...", "boardId": "...", "text": "...", "status": "<colId>", "completed": false, "createdAt": "ISO" }

// panel_boards   → array (bacheche Kanban, max 3)
{ "id": "...", "name": "...", "cols": [{ "id": "todo", "label": "Da fare" }, ...], "createdAt": "ISO" }

// panel_appointments → array
{ "id": "...", "date": "YYYY-MM-DD", "description": "...", "type": "remote|onsite", "completed": false, "createdAt": "ISO" }
```

Chiave ausiliaria: `panel_current_board` (id della bacheca attiva).

Chiavi ausiliarie (stringhe JSON `"true"`/`"false"`):
`panel_dark_mode`, `panel_layout_expanded`, `panlink_sidebar_collapsed`.

Vista Elementi: `panel_clients_view` = `"comoda"` | `"compatta"` | `"affiancata"`.

> `Clients.normalize()` rende retro-compatibili i record vecchi (`name` → `nome`,
> default per `assets`/`createdAt`). Applicare lo stesso pattern quando si estende
> uno schema: normalizzare in lettura invece di migrare in massa.

## Convenzioni di stile / design system

- **CSS custom properties** in `:root` per spacing (base 4px), colori, radius, shadow,
  durate, tipografia, z-index. Dark mode via override delle variabili su `html.dark`.
  **Usare sempre le variabili** (`var(--spacing-md)`, `var(--color-primary)`, …),
  mai valori hardcoded.
- Naming classi **BEM-like**: `.block`, `.block__element`, `.block--modifier`.
- Rendering: mix di `document.createElement` + `innerHTML` con template string.
  **Ogni valore proveniente da dati utente deve passare per `Utils.escapeHtml()`.**
- Nessun framework: niente React/Vue, niente JSX. Restare in vanilla JS.

## Sicurezza / gotcha da conoscere

- L'output HTML è escapato con `Utils.escapeHtml`. I **link** vengono inoltre filtrati
  per schema: `Validators.isValidUrl` e `Utils.safeUrl` accettano solo `http/https`
  (bloccano `javascript:`/`data:`). Non reintrodurre `onclick` inline: l'apertura link
  passa per la delega eventi (`data-open-client`). `safeUrl` va usato ogni volta che un
  URL utente finisce in un `href`, come difesa per record vecchi già in `localStorage`.
- La modale chiude se il callback non ritorna `false`: nei path di validazione fallita
  **ritornare sempre `false`** per tenerla aperta (vedi convenzione modale sopra).
- Il contenuto della modale può essere iniettato **dopo** `Modal.open` (es. checkbox
  asset): il focus-trap calcola gli elementi focusabili on-demand via `Modal.getFocusable()`,
  quindi non memorizzarli all'apertura.
- La lista elementi va ridisegnata con `UI.refreshClients()` (non `DOM.renderClients()`
  nudo) così il **filtro di ricerca attivo** viene preservato dopo add/edit/delete.
- Font e icone sono vendorizzati in `vendor/` (nessun CDN): l'app funziona offline.
  Se si aggiunge un'icona, usare una classe `fa-solid` già coperta dal woff2
  incluso (solo il set *solid* è vendorizzato; niente brands/regular).

## Integrazione Supabase (opzionale, auth + sync)

Sotto `Panel-main/supabase/` c'è un'integrazione **opzionale e inerte di default**
per login + sincronizzazione cloud (vedi `SUPABASE_SETUP.md` alla radice).
- È **disattivata** finché `supabase/config.js` contiene i placeholder: in quel caso
  `window.sb` resta `null`, `boot.js` esce subito e l'app funziona come sempre
  (solo `localStorage`). Non introdurre logica che assuma Supabase sempre presente.
- Design: l'app resta **sincrona su `localStorage`**; `sync.js` fa da specchio
  offline-first verso Supabase avvolgendo `Storage.set` (non riscrive il render
  pipeline). Le chiavi localStorage restano la fonte per la UI.
- Le tabelle Postgres usano **PK `text`** = l'`id` generato dal client, con RLS
  per-utente. La `anon key` in `config.js` è pubblica per design.

## Git / workflow

- Branch di sviluppo corrente: `claude/project-analysis-kanban-zt12k1`.
- Commit chiari e descrittivi; **non** aprire PR salvo richiesta esplicita.
- Nei placeholder e nei valori di esempio usare testi generici: niente riferimenti
  a programmi/prodotti esterni o a contesti specifici.
