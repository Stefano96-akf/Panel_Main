Questo progetto è un semplice pannello (frontend statico) per gestire clienti, generare link per enti e salvare appunti.

Come usarlo
- Apri `index.html` nel browser (doppio click o "Apri con").
- Tutti i dati (clienti e note) vengono salvati nel LocalStorage del browser.

Funzionalità implementate in questa versione
- Aggiungi / modifica / elimina clienti (nome + link) con salvataggio nel LocalStorage.
- Ricerca in tempo reale dei clienti.
- Generatore di link con pulsante "Copia".
- Note & Appunti salvati localmente.
- Modalità scura persistente (viene ricordata nel LocalStorage).
- Presets rapidi per popolamento veloce del campo ente.
- Piccole animazioni, toast (notifiche temporanee) e miglioramenti di accessibilità.

Struttura dei dati
- `localStorage['clienti']` = JSON array di oggetti: [{ nome: string, link: string }, ...]
- `localStorage['noteUtente']` = JSON array di stringhe
- `localStorage['darkMode']` = '1' o '0'

Suggerimenti di funzioni da implementare (possibili estensioni)
1) Import / Export JSON
	- Esporta l'elenco clienti / note in un file JSON e importa per ripristinare o condividere.
2) Tag / categorie per clienti
	- Aggiungere tag e categorie personalizzate, filtri multipli e raggruppamenti.
3) Backup remoto / sincronizzazione
	- Sincronizzare i dati con un piccolo backend (Firebase o API) per condividerli tra dispositivi.
4) Bulk actions
	- Seleziona più clienti per eliminarli o esportarli in blocco.
5) Condivisione rapida
	- Generare link condivisibili o esportare CSV per invio ai colleghi.
6) Validazione & preview dei link
	- Verificare che i link siano validi (HEAD request) oppure mostrare un'anteprima.
7) Autocomplete e salvataggio automatico
	- Suggerimenti mentre si digita il nome dell'ente e salvataggio bozze automatico.
8) Sicurezza e ruoli (richiede backend)
	- Autenticazione, diversi permessi per utenti, cronologia modifiche.

Prossimi passi consigliati (veloci e a basso rischio)
- Aggiungere pulsante di import/export (JSON) lato client.
- Abilitare ordinamento alfabetico della lista clienti.
- Aggiungere un filtro per dominio (es. mostra solo clienti di `example.com`).

Se vuoi, implemento subito una di queste estensioni (ad es. Export/Import JSON e ordinamento). Dimmi quale preferisci e la aggiungo.

