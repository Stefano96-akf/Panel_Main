# PanLink WebApp - Guida Funzionale e Tecnica

## 1. Cos'è PanLink
PanLink è una web app **100% client-side** (vanilla HTML/CSS/JS) per gestire:
- Clienti e link
- Asset associabili ai clienti
- Note
- Task
- Appuntamenti
- Export CSV

Non usa backend: i dati sono salvati in `localStorage` del browser.

## 2. Stack e file principali
- `index.html`: struttura UI (header, sidebar, pannelli, modal, toast)
- `style.css`: stile completo (layout, dark mode, componenti, responsive)
- `app.js`: logica applicativa modulare (storage, validazione, CRUD, rendering)
- `favicon.svg`: icona tab browser

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
Validazioni per campi client, note, task (obbligatorietà e URL validi).

### `Utils`
Helper comuni: escaping HTML, ID, debounce, date formatting, CSV.

### `Clients`
CRUD clienti con struttura:
```json
{
  "id": "...",
  "nome": "...",
  "link": "...",
  "assets": ["assetId1", "assetId2"],
  "createdAt": "ISO"
}
```
Include ricerca e export CSV.

### `Assets`
CRUD asset con supporto a:
- associazione multipla ai clienti
- conteggio elementi collegati (`getLinkedCount`)
- rimozione automatica dagli altri record in caso di delete
- rendering lista asset e selezione asset nel modal cliente

### `Notes`, `Tasks`, `Appointments`
CRUD separati con rendering dedicato e persistenza locale.

### `DOM`
Render delle liste UI (clienti, asset, note, task, appuntamenti).

### `UI`
Event binding e flussi utente:
- aggiunta/modifica/eliminazione record
- dialog di conferma eliminazione
- export CSV
- toggle dark mode
- espansione layout clienti

### `Modal`
Modal unico riutilizzabile per form, conferme e dialog.

### `AlertDialog`
Wrapper per conferme eliminazione (in sostituzione dei `confirm()` nativi).

### `SidebarNav`
Sidebar verticale con:
- link alle sezioni
- evidenziazione sezione attiva
- smooth scroll
- stato collapsed persistito
- comportamento mobile con hamburger

## 4. Flussi principali
### Aggiunta cliente
1. Inserimento nome/link nel form.
2. Apertura modal “Nuovo Cliente”.
3. Selezione asset disponibili.
4. Salvataggio cliente con `assets[]`.
5. Re-render lista + toast.

### Modifica asset
1. Click su “Modifica” nella card asset.
2. Apertura modal con nome/descrizione precompilati.
3. Salvataggio.
4. Re-render asset + clienti.

Nota: i badge cliente si aggiornano automaticamente perché leggono il nome asset corrente per ID.

### Eliminazione asset
1. Dialog di conferma.
2. Rimozione asset da storage.
3. Rimozione asset da tutti i clienti associati.
4. Re-render liste + toast.

## 5. Sidebar e navigazione
Voci:
- Clienti & Link
- Asset
- Note & Appunti
- Attività
- Appuntamenti
- Esporta CSV

Comportamento:
- desktop: sidebar fissa con possibilità collapsed
- mobile: apertura/chiusura con hamburger
- stato attivo aggiornato durante scroll

## 6. Accessibilità
- Modal con `aria-modal="true"` e gestione ESC
- Focus management su apertura/chiusura modal
- Sidebar con `aria-label`, `aria-expanded`, `aria-current`
- Focus visibile sui controlli interattivi

## 7. Dark mode
Dark mode gestita via classe `html.dark` + variabili CSS.
La preferenza è persistita in localStorage.

## 8. Export CSV
- Clienti: bottone “Esporta CSV” nel pannello clienti
- Nome file attuale export clienti: `Export.csv`

## 9. Note operative prima del deploy Git
- Verificare manualmente i flussi CRUD principali in browser
- Verificare responsive sidebar su mobile
- Verificare persistenza localStorage dopo refresh
- Controllare che tutti i file modificati siano inclusi nel commit

## 10. Possibili evoluzioni
- Import dati da CSV/JSON
- Filtri avanzati su clienti/asset
- Backup/restore localStorage
- PWA/offline enhancements

