// ============================================================================
// UTILS MODULE - Helper functions
// ============================================================================
const Utils = {
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text || '').replace(/[&<>"']/g, m => map[m]);
  },

  // Ritorna l'URL solo se ha schema http/https, altrimenti stringa vuota.
  // Difesa in profondità per link `javascript:`/`data:` eventualmente già
  // presenti in localStorage (salvati prima della validazione più stretta).
  safeUrl(url) {
    try {
      const parsed = new URL(url);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? url : '';
    } catch {
      return '';
    }
  },

  generateId() {
    return Date.now() + Math.random().toString(36).substr(2, 9);
  },

  debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  formatDate(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('it-IT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  },

  formatDateShort(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('it-IT');
    } catch {
      return isoString;
    }
  },

  csvEscape(value) {
    const escaped = String(value || '').replace(/"/g, '""');
    return `"${escaped}"`;
  },

  arrayToCsv(rows, headers) {
    const headerLine = headers.map(h => Utils.csvEscape(h)).join(',');
    const dataLines = rows.map(row =>
      headers.map(h => Utils.csvEscape(row[h])).join(',')
    );
    return [headerLine, ...dataLines].join('\r\n');
  },

  downloadCsv(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  getCurrentDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  },

  // Parser CSV tollerante (virgolette, "" escaped, CRLF/LF). `delim` = separatore.
  csvParse(text, delim) {
    text = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = []; let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  },

  // CSV → array di oggetti chiavati dall'intestazione. Autorileva separatore , o ;
  csvToArray(text) {
    text = String(text || '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
    const rows = Utils.csvParse(text, delim);
    if (!rows.length) return [];
    const headers = rows[0].map(h => (h || '').trim());
    return rows.slice(1)
      .filter(r => r.some(v => (v || '').trim() !== ''))
      .map(r => { const o = {}; headers.forEach((h, i) => { o[h] = (r[i] != null ? r[i] : '').trim(); }); return o; });
  },

  // Normalizza una data in 'YYYY-MM-DD' (accetta anche DD/MM/YYYY, DD-MM-YY, ...)
  normalizeDate(str) {
    str = String(str || '').trim();
    if (!str) return '';
    let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = str.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (m) {
      let d = m[1], mo = m[2], y = m[3];
      if (y.length === 2) y = '20' + y;
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
    return '';
  }
};

