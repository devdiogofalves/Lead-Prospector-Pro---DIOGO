/**
 * xlsx-writer.js — exporta como HTML-table salva como .xls (Excel abre nativo).
 * Sem dependências externas.
 */
(function () {
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  window.XLSXWriter = {
    generate(headers, rows, filename) {
      let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
      html += '<head><meta charset="UTF-8"></head><body><table border="1">';
      html += '<tr>' + headers.map(h => `<th>${esc(h)}</th>`).join('') + '</tr>';
      for (const r of rows) {
        html += '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>';
      }
      html += '</table></body></html>';
      const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'leads.xls';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  };
})();
