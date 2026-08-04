/* Main script: miglioramenti UI & persistenza */
(() => {
  const btnAggiungi = document.getElementById('aggiungi');
  const nomeInput = document.getElementById('nome');
  const linkInput = document.getElementById('link');
  const listaClienti = document.getElementById('lista-clienti');
  const filtroInput = document.getElementById('filtro');
  const generaBtn = document.getElementById('generaLinkBtn');
  const linkSpan = document.getElementById('linkGenerato');
  const copiaBtn = document.getElementById('copiaLinkBtn');
  const nomeEnteInput = document.getElementById('nomeEnte');
  const darkToggle = document.getElementById('dark-mode-toggle');

  let clienteInModifica = null;
  let editingIndex = null;

  // Toast helper
  function showToast(msg, timeout = 2000) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), timeout);
  }

  // note: dark mode is handled centrally by bindDarkMode() later

  // Generate ente link
  function generaLinkComune(enteNome) {
    const baseUrl = 'https://';
    const dominio = '.example.com';
    const percorso = '/Appalti/InitLogin.do';
    const nome = enteNome.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    return `${baseUrl}${nome}${dominio}${percorso}`;
  }

  if (generaBtn) {
    generaBtn.addEventListener('click', () => {
      const nomeEnte = (nomeEnteInput && nomeEnteInput.value) || '';
      if (!nomeEnte) return showToast('Inserisci il nome dell\'ente');
      const link = generaLinkComune(nomeEnte);
      linkSpan.textContent = link;
      showToast('Link generato');
    });
  }

  if (copiaBtn) {
    copiaBtn.addEventListener('click', async () => {
      const text = linkSpan.textContent.trim();
      if (!text) return showToast('Nessun link da copiare');
      try {
        await navigator.clipboard.writeText(text);
        showToast('Link copiato negli appunti');
      } catch (e) {
        // fallback
        const t = document.createElement('textarea');
        t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
        showToast('Link copiato (fallback)');
      }
    });
  }

  // Open external tools
  document.getElementById('QueryDo')?.addEventListener('click', () => window.open('https://eproc-academy.example.com/Appalti/Query.do', '_blank'));
  document.getElementById('CRUD')?.addEventListener('click', () => window.open('https://eproc-academy.example.com/Appalti/CRUD.do', '_blank'));

  // Presets
  document.querySelectorAll('.preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-preset') || btn.textContent;
      if (nomeEnteInput) nomeEnteInput.value = val;
      showToast(`Preset: ${val}`);
    });
  });


  // Init on load
  document.addEventListener('DOMContentLoaded', () => {
    initClients();
    initNotes();
    initAttivita();
    bindPresets();
    bindGenerators();
    bindExport();
    bindDarkMode();
    bindAppointments();
    seedAppointments();
  });

  /* ---------- CLIENTS ---------- */
  function getClients(){
    try { return JSON.parse(localStorage.getItem('clienti')||'[]'); } catch(e){return []}
  }
  function saveClients(list){ localStorage.setItem('clienti', JSON.stringify(list)); }
  function initClients(){
    // add / save handler opens a modal to allow selecting application types
    btnAggiungi?.addEventListener('click', () => {
      const presetName = (nomeInput.value||'').trim();
      const presetLink = (linkInput.value||'').trim();
      const checklist = [
        { id:'t_lfs', label:'LFS', value:'LFS' },
        { id:'t_appalti', label:'APPALTI&CONTRATTI', value:'APPALTI&CONTRATTI' },
        { id:'t_esec', label:'ESECUZIONE', value:'ESECUZIONE' },
        { id:'t_vig', label:'VIGILANZA', value:'VIGILANZA' },
        { id:'t_dl229', label:'DL229', value:'DL229' }
      ];
      const checksHtml = checklist.map(c=>`<label style="display:flex;gap:8px;align-items:center"><input type=\"checkbox\" data-type=\"${c.value}\" id=\"${c.id}\"> <span>${c.label}</span></label>`).join('');
      const html = `
        <div class="form-group"><label>Nome</label><input type="text" id="modalClientName" value="${escapeHtml(presetName)}"></div>
        <div class="form-group"><label>Link</label><input type="url" id="modalClientLink" value="${escapeHtml(presetLink)}"></div>
        <div class="form-group"><label>Tipologie (seleziona)</label><div style="display:flex;flex-direction:column;gap:6px">${checksHtml}</div></div>
      `;
      openModal({ title: 'Aggiungi Cliente', contentHtml: html, onSave: (body)=>{
        const name = (body.querySelector('#modalClientName').value||'').trim();
        const link = (body.querySelector('#modalClientLink').value||'').trim();
        if(!name || !link){ showToast('Inserisci nome e link del cliente'); return; }
        const selected = Array.from(body.querySelectorAll('[data-type]')).filter(i=>i.checked).map(i=>i.getAttribute('data-type'));
        const clients = getClients();
        // if editingIndex is set, replace that entry; otherwise add new
        if (editingIndex !== null && Number.isInteger(editingIndex)) {
          clients[editingIndex] = { nome: name, link: link, types: selected, createdAt: new Date().toISOString() };
          editingIndex = null;
          btnAggiungi.textContent = 'Aggiungi / Salva Cliente';
        } else {
          clients.unshift({ nome: name, link: link, types: selected, createdAt: new Date().toISOString() });
        }
        saveClients(clients);
        nomeInput.value=''; linkInput.value=''; renderClients();
      }});
      // after modal is created, pre-check nothing (user chooses) - modal prefill will apply if needed
    });

    filtroInput?.addEventListener('input', renderClients);
    renderClients();
  }

  function renderClients(){
    const container = document.getElementById('lista-clienti');
    const filtro = (document.getElementById('filtro').value||'').toLowerCase();
    const clients = getClients().filter(c => (c.nome||'').toLowerCase().includes(filtro) || (c.link||'').toLowerCase().includes(filtro));
    container.innerHTML = '';
    if(clients.length===0){ container.innerHTML = '<p style="color:var(--muted)">Nessun cliente</p>'; return; }
    clients.forEach((c, idx) => {
      const el = document.createElement('div'); el.className='client-item';
      const left = document.createElement('div');
      left.innerHTML = `<div><a href="${escapeHtml(c.link)}" target="_blank" rel="noreferrer">${escapeHtml(c.nome)}</a></div>
        <div style="font-size:12px;color:var(--muted)">${new Date(c.createdAt).toLocaleString()}</div>`;
      // badges for types
      const badges = document.createElement('div'); badges.className = 'client-badges'; badges.style.marginTop='6px';
      (c.types||[]).forEach(t=>{
        const span = document.createElement('span'); span.className='badge'; span.textContent = t; span.style.marginRight='6px'; span.style.padding='4px 8px'; span.style.fontSize='12px'; span.style.background='rgba(11,99,255,0.08)'; span.style.color='var(--accent)'; span.style.borderRadius='999px'; badges.appendChild(span);
      });
      left.appendChild(badges);
  const actions = document.createElement('div'); actions.className='client-actions';
  const openBtn = document.createElement('button'); openBtn.title='Apri link'; openBtn.innerHTML='<i class="fa-solid fa-up-right-from-square"></i>';
      openBtn.addEventListener('click', ()=> window.open(c.link, '_blank'));

  const editBtn = document.createElement('button'); editBtn.title='Modifica'; editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
      editBtn.addEventListener('click', ()=>{
        // Apri modal per modificare il cliente e prefill tipi
        const checklist = [
          { id:'t_lfs', label:'LFS', value:'LFS' },
          { id:'t_appalti', label:'APPALTI&CONTRATTI', value:'APPALTI&CONTRATTI' },
          { id:'t_esec', label:'ESECUZIONE', value:'ESECUZIONE' },
          { id:'t_vig', label:'VIGILANZA', value:'VIGILANZA' },
          { id:'t_dl229', label:'DL229', value:'DL229' }
        ];
        const checksHtml = checklist.map(c2=>`<label style="display:flex;gap:8px;align-items:center"><input type=\"checkbox\" data-type=\"${c2.value}\" id=\"edit_${c2.id}\"> <span>${c2.label}</span></label>`).join('');
        const html = `
          <div class="form-group"><label>Nome</label><input type="text" id="modalClientName" value="${escapeHtml(c.nome||'')}"></div>
          <div class="form-group"><label>Link</label><input type="url" id="modalClientLink" value="${escapeHtml(c.link||'')}"></div>
          <div class="form-group"><label>Tipologie (seleziona)</label><div style="display:flex;flex-direction:column;gap:6px">${checksHtml}</div></div>
        `;
        // set editing index so modal save will update instead of create
        editingIndex = idx; btnAggiungi.textContent = 'Salva modifica';
        openModal({ title: 'Modifica cliente', contentHtml: html, onSave: (body)=>{
          const name = (body.querySelector('#modalClientName').value||'').trim();
          const link = (body.querySelector('#modalClientLink').value||'').trim();
          if(!name || !link){ showToast('Compila nome e link'); return; }
          const selected = Array.from(body.querySelectorAll('[data-type]')).filter(i=>i.checked).map(i=>i.getAttribute('data-type'));
          const list = getClients(); list[idx] = { nome: name, link: link, types: selected, createdAt: new Date().toISOString() };
          saveClients(list); renderClients(); editingIndex = null; btnAggiungi.textContent = 'Aggiungi / Salva Cliente';
        }});
        // after modal injected, pre-check the existing types
        setTimeout(()=>{
          const existing = c.types||[];
          Array.from(document.querySelectorAll('[data-type]')).forEach(inp=>{
            if(existing.includes(inp.getAttribute('data-type'))) inp.checked = true;
          });
        }, 50);
      });

  const delBtn = document.createElement('button'); delBtn.title='Elimina'; delBtn.innerHTML='<i class="fa-solid fa-trash"></i>';
      delBtn.addEventListener('click', ()=>{
        if(!confirm('Eliminare il cliente?')) return;
        const list = getClients(); list.splice(idx,1); saveClients(list);
        // if we were editing this index, cancel edit
        if (editingIndex !== null) {
          if (editingIndex === idx) {
            editingIndex = null; btnAggiungi.textContent = 'Aggiungi / Salva Cliente'; nomeInput.value=''; linkInput.value='';
          } else if (editingIndex > idx) {
            // shifted up
            editingIndex = editingIndex - 1;
          }
        }
        renderClients();
      });
      actions.appendChild(openBtn); actions.appendChild(editBtn); actions.appendChild(delBtn);
      el.appendChild(left); el.appendChild(actions);
      container.appendChild(el);
    });
  }

  /* ---------- LINK GENERATOR ---------- */
  function bindGenerators(){
    document.getElementById('generaLinkBtn').addEventListener('click', ()=>{
      const nomeEnte = (document.getElementById('nomeEnte').value||'').trim();
      if(!nomeEnte){ alert('Inserisci il nome dell\'ente'); return; }
      // semplice generatore (modifica target a piacere)
      const slug = encodeURIComponent(nomeEnte.replace(/\s+/g,'-').toLowerCase());
      const url = `https://example.com/ente/${slug}`;
      document.getElementById('linkGenerato').textContent = url;
    });

    document.getElementById('copiaLinkBtn').addEventListener('click', async ()=>{
      const txt = document.getElementById('linkGenerato').textContent;
      if(!txt){ alert('Genera prima il link'); return; }
      try{ await navigator.clipboard.writeText(txt); alert('Link copiato negli appunti'); }catch(e){ alert('Copia non supportata') }
    });
  }

  /* ---------- NOTES ---------- */
  function getNotes(){ try { return JSON.parse(localStorage.getItem('noteUtente')||'[]'); } catch(e){ return [] } }
  function saveNotes(arr){ localStorage.setItem('noteUtente', JSON.stringify(arr)); }
  function initNotes(){
    const btn = document.getElementById('aggiungiNota');
    const input = document.getElementById('noteInput');
    btn.addEventListener('click', ()=>{
      const text = (input.value||'').trim();
      if(!text){ alert('Inserisci una nota prima di aggiungere.'); return; }
      const notes = getNotes(); notes.unshift({ text, createdAt:new Date().toISOString() });
      saveNotes(notes); input.value=''; renderNotes();
    });
    renderNotes();
  }
  function renderNotes(){
    const list = document.getElementById('listaNote');
    const notes = getNotes();
    list.innerHTML = '';
    if(notes.length===0){ list.innerHTML = '<li style="color:var(--muted)">Nessuna nota</li>'; return; }
    notes.forEach((n, idx) => {
      const li = document.createElement('li');
      const left = document.createElement('div'); left.style.flex='1';
      left.innerHTML = `<div style="font-size:14px">${escapeHtml(n.text)}</div><div style="font-size:11px;color:var(--muted);margin-top:6px">${new Date(n.createdAt).toLocaleString()}</div>`;
  const del = document.createElement('button'); del.className='delete-note'; del.title='Elimina nota';
  del.innerHTML = '<i class="fa-solid fa-trash" style="color:#c0392b"></i>';
      del.addEventListener('click', ()=>{
        if(!confirm('Eliminare questa nota?')) return;
        const notes = getNotes(); notes.splice(idx,1); saveNotes(notes); renderNotes();
      });
      li.appendChild(left); li.appendChild(del);
      list.appendChild(li);
    });
  }

  /* ---------- EXPORT CSV ---------- */
  function toCsv(rows, headers){
    const esc = v => `"${String(v||'').replace(/"/g,'""')}"`;
    const lines = [headers.map(esc).join(',')];
    rows.forEach(r => {
      lines.push(headers.map(h => esc(r[h])).join(','));
    });
    return lines.join('\r\n');
  }
  function downloadBlob(text, filename, type='text/csv;charset=utf-8;'){
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function bindExport(){
    document.getElementById('exportClientsCsv').addEventListener('click', ()=>{
      const clients = getClients();
      if(!clients.length){ alert('Nessun cliente da esportare'); return; }
      const rows = clients.map(c => ({ nome:c.nome, link:c.link, types: (c.types||[]).join(';'), createdAt:c.createdAt }));
      const csv = toCsv(rows, ['nome','link','types','createdAt']);
      downloadBlob(csv, 'clienti_export.csv');
    });
    document.getElementById('exportNotesCsv').addEventListener('click', ()=>{
      const notes = getNotes();
      if(!notes.length){ alert('Nessuna nota da esportare'); return; }
      const rows = notes.map(n => ({ text:n.text, createdAt:n.createdAt }));
      const csv = toCsv(rows, ['text','createdAt']);
      downloadBlob(csv, 'note_export.csv');
    });
  }

  /* ---------- PRESETS ---------- */
  function bindPresets(){
    document.querySelectorAll('.preset').forEach(btn=>{
      btn.addEventListener('click', ()=> {
        const preset = btn.dataset.preset || btn.textContent;
        const input = document.getElementById('nomeEnte');
        if(input) input.value = preset;
      });
    });
  }

  /* ---------- APPOINTMENTS (CRUD) ---------- */
  function getAppointments(){ try { return JSON.parse(localStorage.getItem('appuntamenti')||'[]'); } catch(e){ return [] } }
  function saveAppointments(arr){ localStorage.setItem('appuntamenti', JSON.stringify(arr)); }
  function bindAppointments(){
    const addBtn = document.getElementById('addAppt');
    const dateIn = document.getElementById('appt-date');
    const descIn = document.getElementById('appt-desc');
    const typeIn = document.getElementById('appt-type');
    if(addBtn){
      addBtn.addEventListener('click', ()=>{
        const date = dateIn.value || '';
        const desc = (descIn.value||'').trim();
        const type = typeIn.value || 'remote';
        if(!desc){ alert('Inserisci la descrizione'); return; }
        const appts = getAppointments();
        appts.unshift({ id: Date.now(), date, desc, type, done:false });
        saveAppointments(appts); descIn.value=''; dateIn.value=''; renderAppointments();
      });
    }
    renderAppointments();
  }

  function renderAppointments(){
    const remoteEl = document.getElementById('appt-remote');
    const onsiteEl = document.getElementById('appt-onsite');
    if(!remoteEl || !onsiteEl) return;
    const appts = getAppointments();
    remoteEl.innerHTML=''; onsiteEl.innerHTML='';
    appts.forEach(a => {
      const li = document.createElement('li');
      const chk = document.createElement('input'); chk.type='checkbox'; chk.checked = !!a.done; chk.title='Segna come completato';
      chk.addEventListener('change', ()=>{
        const list = getAppointments(); const idx = list.findIndex(x=>x.id===a.id); if(idx>-1){ list[idx].done = chk.checked; saveAppointments(list); renderAppointments(); }
      });
      const txt = document.createElement('span'); txt.innerHTML = `<strong>${a.date||''}</strong> — ${escapeHtml(a.desc)}`;
  const del = document.createElement('button'); del.title='Elimina'; del.innerHTML = '<i class="fa-solid fa-trash"></i>';
  del.addEventListener('click', ()=>{ if(!confirm('Eliminare appuntamento?')) return; let list = getAppointments(); list = list.filter(x=>x.id!==a.id); saveAppointments(list); renderAppointments(); });
      li.appendChild(chk); li.appendChild(txt); li.appendChild(del);
      if(a.type === 'onsite') onsiteEl.appendChild(li); else remoteEl.appendChild(li);
    });
  }

  /* ---------- DARK MODE ---------- */
  function bindDarkMode(){
    const key = 'panel_dark';
    const el = document.documentElement;
    const saved = localStorage.getItem(key);
    const btn = document.getElementById('dark-mode-toggle');
    if(saved === '1'){ el.classList.add('dark'); if(btn) btn.setAttribute('aria-pressed','true'); }
    if(btn){
      btn.setAttribute('aria-pressed', saved === '1' ? 'true' : 'false');
      btn.addEventListener('click', ()=>{
        const is = el.classList.toggle('dark');
        btn.setAttribute('aria-pressed', is ? 'true' : 'false');
        localStorage.setItem(key, is ? '1' : '0');
      });
    }
  }

  /* ---------- APPOINTMENTS (seed) ---------- */
  function seedAppointments(){
    const remote = document.getElementById('appt-remote');
    const onsite = document.getElementById('appt-onsite');
    // esempi statici; sostituire con CRUD se necessario
    remote.innerHTML = '<li><strong>10/01</strong> - Onboarding remoto</li>';
    onsite.innerHTML = '<li><strong>12/01</strong> - Visita cliente</li>';
  }

  /* ---------- ATTIVITA (CRUD) ---------- */
  function getAttivita(){ try { return JSON.parse(localStorage.getItem('attivita')||'[]'); } catch(e){ return [] } }
  function saveAttivita(arr){ localStorage.setItem('attivita', JSON.stringify(arr)); }
  function initAttivita(){
    const addBtn = document.getElementById('addAttivita');
    const input = document.getElementById('attivita-input');
    if(addBtn){
      addBtn.addEventListener('click', ()=>{
        const txt = (input.value||'').trim();
        if(!txt){ showToast('Inserisci una attività'); return; }
        const list = getAttivita();
        list.unshift({ id: Date.now(), text: txt, done: false, createdAt: new Date().toISOString() });
        saveAttivita(list); input.value=''; renderAttivita();
      });
    }
    // allow Enter key
    if(input){ input.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); addBtn?.click(); } }); }
    renderAttivita();
  }

  function renderAttivita(){
    const container = document.getElementById('listaAttivita');
    if(!container) return;
    const items = getAttivita();
    container.innerHTML = '';
    if(!items.length){ container.innerHTML = '<li style="color:var(--muted)">Nessuna attività</li>'; return; }
    items.forEach((it, idx)=>{
      const li = document.createElement('li'); li.className = 'att-item';
      const left = document.createElement('div'); left.style.display='flex'; left.style.alignItems='center'; left.style.flex='1';
      const chk = document.createElement('input'); chk.type='checkbox'; chk.checked = !!it.done; chk.title='Segna come completata';
      chk.addEventListener('change', ()=>{ const list = getAttivita(); const i = list.findIndex(x=>x.id===it.id); if(i>-1){ list[i].done = chk.checked; saveAttivita(list); renderAttivita(); } });
      const txt = document.createElement('span'); txt.style.marginLeft='8px'; txt.textContent = it.text;
      if(it.done) txt.style.textDecoration = 'line-through';
      left.appendChild(chk); left.appendChild(txt);

      const actions = document.createElement('div'); actions.className='att-actions';
      const edit = document.createElement('button'); edit.title='Modifica'; edit.innerHTML = '<i class="fa-solid fa-pen"></i>';
      edit.addEventListener('click', ()=>{
        const html = `<div class="form-group"><label>Attività</label><input type="text" id="modalAttText" value=""></div>`;
        openModal({ title: 'Modifica attività', contentHtml: html, onSave: (body)=>{
          const val = (body.querySelector('#modalAttText').value||'').trim();
          if(!val){ showToast('Inserisci una attività'); return; }
          const list = getAttivita(); const i = list.findIndex(x=>x.id===it.id);
          if(i>-1){ list[i].text = val; list[i].createdAt = new Date().toISOString(); saveAttivita(list); renderAttivita(); }
        }});
        // prefill
        const fld = document.getElementById('modalAttText'); if(fld) fld.value = it.text || '';
      });
      const del = document.createElement('button'); del.title='Elimina'; del.innerHTML = '<i class="fa-solid fa-trash"></i>';
      del.addEventListener('click', ()=>{ if(!confirm('Eliminare attività?')) return; const l = getAttivita(); const newl = l.filter(x=>x.id!==it.id); saveAttivita(newl); renderAttivita(); });
      actions.appendChild(edit); actions.appendChild(del);

      li.appendChild(left); li.appendChild(actions);
      container.appendChild(li);
    });
  }

  /* ---------- MODAL HELPERS ---------- */
  function openModal({ title = 'Modifica', contentHtml = '', onSave } = {}){
    const modal = document.getElementById('editModal');
    if(!modal) return;
    const modalTitle = modal.querySelector('#modalTitle');
    const modalBody = modal.querySelector('#modalBody');
    const saveBtn = modal.querySelector('#modalSave');
    const cancelBtn = modal.querySelector('#modalCancel');
    modalTitle.textContent = title;
    modalBody.innerHTML = contentHtml;
    modal.setAttribute('aria-hidden','false'); modal.classList.add('show');

    const cleanup = ()=>{
      saveBtn.removeEventListener('click', saveHandler);
      cancelBtn.removeEventListener('click', cancelHandler);
      modal.querySelector('[data-modal-close]')?.removeEventListener('click', cancelHandler);
    };
    const closeModal = ()=>{
      modal.setAttribute('aria-hidden','true'); modal.classList.remove('show'); cleanup();
    };
    const saveHandler = ()=>{
      try{ if(onSave) onSave(modalBody); }catch(e){ console.error(e); }
      closeModal();
    };
    const cancelHandler = ()=>{ closeModal(); };

    saveBtn.addEventListener('click', saveHandler);
    cancelBtn.addEventListener('click', cancelHandler);
    modal.querySelector('[data-modal-close]')?.addEventListener('click', cancelHandler);
  }

  /* ---------- HELPERS ---------- */
  function escapeHtml(str){ return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
})();



