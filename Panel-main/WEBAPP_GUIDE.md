# PanLink WebApp - Guida Funzionale e Tecnica

## 1. Cos'è PanLink
PanLink è una web app **100% client-side** (vanilla HTML/CSS/JS) per gestire:
- Elementi e link
- Asset associabili agli elementi
- Note
- Attività (task) — lista semplice **e** bacheca Kanban
- Appuntamenti
- Export CSV

Non usa backend: i dati sono salvati in `localStorage` del browser.

## 2. Stack e file principali
- `index.html`: struttura UI (header, sidebar, pannelli, modal, toast)
- `style.css`: stile completo (layout, dark mode, componenti, responsive)
- `app.js`: logica applicativa modulare (storage, validazione, CRUD, rendering)
- `favicon.svg`: icona tab browser
- `vendor/`: font (Inter) e icone (Font Awesome) in locale — nessun CDN, l'app
  funziona completamente offline via `file://`

## 3. Architettura JavaScript (moduli)
### `Storage`
Gestisce lettura/scrittura su localStorage.

Chiavi principali:
- `panel_clients`
- `panel_assets`
- `panel_notes`
- `panel_tasks`
- `panel_appointments`
- `panel_dark_mode`
- `panel_layout_expanded`
- `panlink_sidebar_collapsed`

### `Validators`
Validazioni per campi elemento, note, task (obbligatorietà e URL validi).
Gli URL sono accettati **solo con schema `http`/`https`** (blocco di `javascript:`/`data:`).

### `Utils`
Helper comuni: escaping HTML, `safeUrl` (sanitizzazione link), ID, debounce,
formattazione date, CSV.

### `Clients`
CRUD elementi con struttura:
```json
{
  "id": "...",
  "nome": "...",
  "link": "...",
  "assets": ["assetId1", "assetId2"],
  "createdAt": "ISO"
}
```
Include ricerca e export CSV. `normalize()` rende retro-compatibili i record vecchi.

### `Assets`
CRUD asset con supporto a:
- associazione multipla agli elementi
- conteggio elementi collegati (`getLinkedCount`)
- rimozione automatica dagli altri record in caso di delete
- rendering lista asset e selezione asset nel modal elemento

### `Notes`, `Tasks`, `Appointments`
CRUD separati con rendering dedicato e persistenza locale.
`Tasks` gestisce un campo `status` (`todo`/`doing`/`done`) retro-compatibile con
il vecchio flag `completed` (vedi bacheca Kanban).

### `DOM`
Render delle liste UI (elementi, asset, note, task, bacheca, appuntamenti).

### `UI`
Event binding e flussi utente:
- aggiunta/modifica/eliminazione record
- dialog di conferma eliminazione
- drag & drop della bacheca Kanban
- export CSV
- toggle dark mode (icona luna/sole)
- espansione layout elementi

### `Modal`
Modal unico riutilizzabile per form, conferme e dialog. Il focus-trap calcola gli
elementi focusabili on-demand (`Modal.getFocusable`), così include anche i contenuti
iniettati dopo l'apertura (es. checkbox asset).

### `AlertDialog`
Wrapper per conferme eliminazione (in sostituzione dei `confirm()` nativi).

### `SidebarNav`
Sidebar verticale con:
- link alle sezioni
- evidenziazione sezione attiva (scrollspy con IntersectionObserver)
- smooth scroll
- stato collapsed persistito
- comportamento mobile con hamburger

## 4. Flussi principali
### Aggiunta elemento
1. Inserimento nome/link nel form (link validato http/https).
2. Apertura modal "Aggiungi Elemento".
3. Selezione asset disponibili.
4. Salvataggio elemento con `assets[]`.
5. Re-render lista (con `UI.refreshClients()`, che preserva il filtro attivo) + toast.

### Bacheca Kanban (stile Trello)
1. Sezione "Bacheca" con 3 colonne: **Da fare / In corso / Completato**.
2. Le card si spostano via **drag & drop**, pulsanti freccia o tastiera (← →).
3. Lista attività e bacheca condividono lo stesso storage: spuntare una task nella
   lista la sposta in "Completato" e viceversa.

### Modifica asset
1. Click su "Modifica" nella card asset.
2. Apertura modal con nome/descrizione precompilati.
3. Salvataggio.
4. Re-render asset + elementi (i badge si aggiornano leggendo il nome asset per ID).

### Eliminazione asset
1. Dialog di conferma.
2. Rimozione asset da storage.
3. Rimozione asset da tutti gli elementi associati.
4. Re-render liste + toast.

## 5. Sidebar e navigazione
Voci:
- Elementi & Link
- Asset
- Note & Appunti
- Attività
- Bacheca
- Appuntamenti

Comportamento:
- desktop: sidebar fissa con possibilità collapsed
- mobile: apertura/chiusura con hamburger
- stato attivo aggiornato durante lo scroll

## 6. Accessibilità
- Modal con `aria-modal="true"`, gestione ESC e focus-trap dinamico
- Focus management su apertura/chiusura modal (ripristino del focus al trigger)
- Sidebar con `aria-label`, `aria-expanded`, `aria-current`
- Focus visibile sui controlli interattivi (incluse le card della bacheca)

## 7. Dark mode
Dark mode gestita via classe `html.dark` + variabili CSS. La preferenza è persistita
in localStorage. L'icona del toggle alterna luna (chiaro) / sole (scuro).

## 8. Export CSV
- Elementi: bottone "Esporta CSV" nel pannello elementi → file `elementi_<data>.csv`
- Note: bottone "Esporta Note" → file `note_<data>.csv`

## 9. Offline e asset locali
Font e icone sono vendorizzati in `vendor/` (Font Awesome set `fa-solid`, Inter
pesi 300-700): nessun CDN, l'app funziona anche aperta come `file://` senza rete.

## 10. Note operative prima del deploy Git
- Verificare manualmente i flussi CRUD principali in browser
- Verificare responsive sidebar su mobile e drag & drop della bacheca
- Verificare persistenza localStorage dopo refresh
- Controllare che tutti i file modificati siano inclusi nel commit

## 11. Possibili evoluzioni
- Import dati da CSV/JSON
- Filtri avanzati su elementi/asset
- Backup/restore localStorage
- Ordinamento persistente delle card nella colonna Kanban
- PWA/offline enhancements
