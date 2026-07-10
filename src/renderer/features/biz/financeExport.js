// ============================================================
// financeExport.js — Word export for Farm accounting
// Builds a Word-compatible .doc (HTML Word format) from the
// on-screen report so Cashflow, Cash Book, etc. open in Word
// with the same organised sections and tables.
// ============================================================

export function exportStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textOf(el) {
  return String(el?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function amountClass(el) {
  if (!el) return '';
  if (el.classList?.contains('fa-num-rev') || el.classList?.contains('fa-kpi-f-green')) return 'rev';
  if (el.classList?.contains('fa-num-exp') || el.classList?.contains('fa-kpi-f-red')) return 'exp';
  return '';
}

/** Word-friendly stylesheet (opens cleanly in Microsoft Word). */
function wordDocCss() {
  return `
    body { font-family: Calibri, Arial, sans-serif; color: #0f172a; font-size: 11pt; line-height: 1.4; }
    h1 { font-size: 18pt; margin: 0 0 6pt; color: #0f172a; }
    h2 { font-size: 13pt; margin: 16pt 0 4pt; color: #0f172a; border-bottom: 1pt solid #cbd5e1; padding-bottom: 3pt; }
    .meta { font-size: 10pt; color: #64748b; margin-bottom: 14pt; }
    .blurb { font-size: 10pt; color: #64748b; margin: 0 0 10pt; }
    .desc { font-size: 9pt; color: #64748b; margin: 0 0 8pt; }
    table { border-collapse: collapse; width: 100%; margin: 0 0 12pt; }
    th {
      text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em;
      color: #64748b; background: #f1f5f9; border-bottom: 1.5pt solid #cbd5e1;
      padding: 6pt 8pt;
    }
    td { border-bottom: 0.75pt solid #e2e8f0; padding: 6pt 8pt; vertical-align: top; font-size: 10pt; }
    th.num, td.num { text-align: right; white-space: nowrap; }
    tr.total td { font-weight: bold; border-top: 1pt solid #94a3b8; }
    .rev { color: #047857; font-weight: 600; }
    .exp { color: #b91c1c; font-weight: 600; }
    .kpi-table td { border: 1pt solid #e2e8f0; background: #f8fafc; width: 50%; vertical-align: top; }
    .kpi-h { font-size: 8pt; text-transform: uppercase; color: #64748b; font-weight: 700; margin: 0 0 3pt; }
    .kpi-v { font-size: 14pt; font-weight: 800; margin: 0 0 2pt; }
    .kpi-f { font-size: 9pt; color: #64748b; margin: 0; }
    .footer { font-size: 9pt; color: #94a3b8; margin-top: 18pt; border-top: 0.75pt solid #e2e8f0; padding-top: 8pt; }
  `;
}

function htmlTableFromEl(tableEl) {
  const headCells = [...tableEl.querySelectorAll('thead th')];
  let thead = '';
  if (headCells.length) {
    thead = `<thead><tr>${headCells
      .map((th, i) => {
        const num = th.classList.contains('fa-th-num') || i > 0;
        return `<th class="${num ? 'num' : ''}">${escHtml(textOf(th))}</th>`;
      })
      .join('')}</tr></thead>`;
  }

  const bodyRows = [...tableEl.querySelectorAll('tbody tr')]
    .map((tr) => {
      const tds = [...tr.querySelectorAll('td')];
      if (!tds.length) return '';
      if (tds.some((td) => td.classList.contains('fa-td-empty'))) {
        return `<tr><td colspan="${Math.max(tds.length, 1)}" style="text-align:center;color:#94a3b8;">${escHtml(textOf(tds[0]))}</td></tr>`;
      }
      const style = tr.getAttribute('style') || '';
      const isTotal = /font-weight:\s*700/.test(style);
      const cells = tds
        .map((td, i) => {
          const isNum = td.classList.contains('fa-td-num') || i > 0;
          const cls = [isNum ? 'num' : '', amountClass(td)].filter(Boolean).join(' ');
          return `<td class="${cls}">${escHtml(textOf(td))}</td>`;
        })
        .join('');
      return `<tr class="${isTotal ? 'total' : ''}">${cells}</tr>`;
    })
    .join('');

  return `<table>${thead}<tbody>${bodyRows}</tbody></table>`;
}

function htmlFromKpiGrid(gridEl) {
  const kpis = [...gridEl.querySelectorAll('.fa-kpi')];
  if (!kpis.length) return '';
  const cells = kpis
    .map((kpi) => {
      const h = escHtml(textOf(kpi.querySelector('.fa-kpi-h')));
      const v = escHtml(textOf(kpi.querySelector('.fa-kpi-v')));
      const f = escHtml(textOf(kpi.querySelector('.fa-kpi-f')));
      const vCls = amountClass(kpi.querySelector('.fa-kpi-v'));
      const fCls = amountClass(kpi.querySelector('.fa-kpi-f'));
      return `<td>
        <p class="kpi-h">${h}</p>
        <p class="kpi-v ${vCls}">${v}</p>
        <p class="kpi-f ${fCls}">${f}</p>
      </td>`;
    })
    .join('');
  // Pair into rows of 2
  const pairs = [];
  for (let i = 0; i < kpis.length; i += 2) {
    const slice = kpis.slice(i, i + 2);
    const rowCells = slice
      .map((kpi) => {
        const h = escHtml(textOf(kpi.querySelector('.fa-kpi-h')));
        const v = escHtml(textOf(kpi.querySelector('.fa-kpi-v')));
        const f = escHtml(textOf(kpi.querySelector('.fa-kpi-f')));
        const vCls = amountClass(kpi.querySelector('.fa-kpi-v'));
        const fCls = amountClass(kpi.querySelector('.fa-kpi-f'));
        return `<td>
          <p class="kpi-h">${h}</p>
          <p class="kpi-v ${vCls}">${v}</p>
          <p class="kpi-f ${fCls}">${f}</p>
        </td>`;
      })
      .join('');
    const pad = slice.length === 1 ? '<td></td>' : '';
    pairs.push(`<tr>${rowCells}${pad}</tr>`);
  }
  void cells;
  return `<h2>Summary</h2><table class="kpi-table">${pairs.join('')}</table>`;
}

function htmlFromCard(cardEl) {
  const title = textOf(cardEl.querySelector('.fa-card-title'));
  const desc = textOf(cardEl.querySelector('.fa-card-desc'));
  let html = '';
  if (title) html += `<h2>${escHtml(title)}</h2>`;
  if (desc) html += `<p class="desc">${escHtml(desc)}</p>`;
  const table = cardEl.querySelector('table.fa-table, table');
  if (table) html += htmlTableFromEl(table);
  if (cardEl.querySelector('canvas')) {
    html += `<p class="desc">(Chart is shown in the application; figures are listed in the tables.)</p>`;
  }
  return html;
}

function htmlBodyFromPanel(panel) {
  if (!panel) return '<p class="blurb">No report content to export.</p>';
  const parts = [];
  const walk = (root) => {
    [...root.children].forEach((el) => {
      if (el.matches?.('.fa-blurb')) {
        parts.push(`<p class="blurb">${escHtml(textOf(el))}</p>`);
        return;
      }
      if (el.matches?.('.fa-report-preamble')) {
        el.querySelectorAll('p').forEach((para) => {
          parts.push(`<p class="blurb">${escHtml(textOf(para))}</p>`);
        });
        return;
      }
      if (el.matches?.('.fa-kpi-grid')) {
        parts.push(htmlFromKpiGrid(el));
        return;
      }
      if (el.matches?.('.fa-card')) {
        parts.push(htmlFromCard(el));
        return;
      }
      if (el.matches?.('.fa-chart-row')) {
        el.querySelectorAll('.fa-card').forEach((card) => parts.push(htmlFromCard(card)));
        return;
      }
      if (el.matches?.('table.fa-table, table')) {
        parts.push(htmlTableFromEl(el));
        return;
      }
      if (el.children?.length) walk(el);
    });
  };
  walk(panel);
  if (!parts.length) {
    panel.querySelectorAll('table').forEach((t) => parts.push(htmlTableFromEl(t)));
  }
  return parts.join('\n') || '<p class="blurb">No report content to export.</p>';
}

/**
 * Build a Word-compatible .doc Blob (HTML Word format).
 * Opens in Microsoft Word / LibreOffice with organised sections & tables.
 */
export async function buildFarmFinanceDocx(panel, { title, tabLabel, periodLabel }) {
  const generated = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const docTitle = title || tabLabel || 'Farm finance report';
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <meta name="ProgId" content="Word.Document" />
  <meta name="Generator" content="Coffee Estate OS" />
  <title>${escHtml(docTitle)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    ${wordDocCss()}
    @page { margin: 2cm; }
  </style>
</head>
<body>
  <h1>${escHtml(docTitle)}</h1>
  <p class="meta"><strong>${escHtml(tabLabel || 'Report')}</strong>${
    periodLabel ? ` · ${escHtml(periodLabel)}` : ''
  } · Generated ${escHtml(generated)}</p>
  ${htmlBodyFromPanel(panel)}
  <p class="footer">Farm finance · amounts in UGX · Estate (farm) and Ruhunga farm house tagged where shown.</p>
</body>
</html>`;

  // BOM helps Word detect UTF-8 correctly
  return new Blob(['\ufeff', html], {
    type: 'application/msword',
  });
}

/** Light HTML used for Print → Save as PDF. */
export function buildVisualReportExportHtml(panel, { title, tabLabel, periodLabel }) {
  const generated = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const docTitle = title || tabLabel || 'Farm finance report';
  const clone = panel ? panel.cloneNode(true) : document.createElement('div');
  if (panel) {
    const liveCanvases = panel.querySelectorAll('canvas');
    const cloneCanvases = clone.querySelectorAll('canvas');
    liveCanvases.forEach((canvas, i) => {
      const target = cloneCanvases[i];
      if (!target) return;
      try {
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        img.style.maxWidth = '100%';
        target.replaceWith(img);
      } catch {
        target.remove();
      }
    });
    clone.querySelectorAll('button, input, select, textarea').forEach((el) => el.remove());
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escHtml(docTitle)}</title>
  <style>${wordDocCss()} img{max-width:100%;height:auto} @media print{body{margin:12mm}}</style>
  </head><body>
  <h1>${escHtml(docTitle)}</h1>
  <p class="meta"><strong>${escHtml(tabLabel || 'Report')}</strong>${
    periodLabel ? ` · ${escHtml(periodLabel)}` : ''
  } · Generated ${escHtml(generated)}</p>
  ${clone.innerHTML || '<p>No content</p>'}
  </body></html>`;
}

export function openHtmlInPrintWindow(html, { onBlocked } = {}) {
  const w = window.open('', '_blank');
  if (!w) {
    if (typeof onBlocked === 'function') onBlocked();
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* ignore */
    }
  }, 350);
  return true;
}
