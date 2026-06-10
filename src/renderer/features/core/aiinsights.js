// ============================================================
// aiinsights.js — Farm Intelligence chat (OpenAI + local fallback)
// ============================================================
// Multi-turn chat: each send refreshes live farm context and sends
// recent thread history to the model. Local mode uses the same UI.
// ============================================================
import { dataService } from '../../services/dataService.js';
import { getEstateApi } from '../../services/estateApi.js';

/** Max user+assistant pairs kept in API payload (excluding current send). */
const MAX_CHAT_MESSAGES = 24;

/**
 * Farm Intelligence message thread — survives tab switches.
 * `renderPage` replaces `#workspace` on each navigation, so history cannot live inside `renderAIInsights`.
 * Cleared only by "Clear chat" or app reload.
 */
const aiChatSessionHistory = [];

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function scrollThreadToBottom(threadEl) {
  requestAnimationFrame(() => {
    threadEl.scrollTop = threadEl.scrollHeight;
  });
}

function renderChatBubbles(threadEl, messages, opts = {}) {
  const { typing } = opts;
  if (!messages.length && !typing) {
    threadEl.innerHTML = `
      <div id="ai-chat-welcome" style="text-align:center;padding:32px 16px;color:var(--text-muted);font-size:13px;line-height:1.6;">
        <span class="material-symbols-outlined" style="font-size:40px;color:var(--gold);opacity:.6;display:block;margin-bottom:12px;">forum</span>
        <p style="margin:0 0 8px;color:var(--text-secondary);font-weight:600;">Start a conversation</p>
        <p style="margin:0;max-width:420px;margin-left:auto;margin-right:auto;">Ask about blocks, harvest, workers, or finances. Follow-ups work like a normal chat — the assistant remembers this thread.</p>
      </div>`;
    return;
  }

  let html = '';
  for (const m of messages) {
    if (m.role === 'user') {
      html += `
        <div class="ai-chat-row ai-chat-row-user" style="display:flex;justify-content:flex-end;margin-bottom:12px;">
          <div style="max-width:min(88%, 560px);background:linear-gradient(135deg, rgba(212,175,55,.12), rgba(212,175,55,.06));border:1px solid var(--border);border-radius:14px 14px 4px 14px;padding:10px 14px;font-size:13px;color:var(--text-primary);line-height:1.45;">${escHtml(m.content)}</div>
        </div>`;
    } else if (m.role === 'assistant') {
      const body = m.isHtml ? m.content : markdownToHtml(m.content);
      html += `
        <div class="ai-chat-row ai-chat-row-assistant" style="display:flex;justify-content:flex-start;margin-bottom:12px;gap:8px;align-items:flex-start;">
          <span class="material-symbols-outlined" style="font-size:22px;color:var(--gold);flex-shrink:0;margin-top:2px;">smart_toy</span>
          <div style="max-width:min(92%, 640px);background:var(--bg-surface);border:1px solid var(--border);border-radius:14px 14px 14px 4px;padding:14px 16px;font-size:13px;line-height:1.65;color:var(--text-secondary);">${body}</div>
        </div>`;
    }
  }
  if (typing) {
    html += `
      <div id="ai-chat-typing" style="display:flex;align-items:center;gap:10px;color:var(--text-muted);font-size:12px;padding:4px 0 8px 30px;">
        <span class="material-symbols-outlined" style="animation:spin 1s linear infinite;color:var(--gold);font-size:18px;">progress_activity</span>
        ${typing}
      </div>`;
  }
  threadEl.innerHTML = html;
  scrollThreadToBottom(threadEl);
}

export async function renderAIInsights(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:12px;flex-wrap:wrap;">
      <div>
        <h1 class="page-title">Farm Intelligence</h1>
        <p class="page-subtitle">Chat with the Nyakamenta estate assistant — powered by your live data + AI</p>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div id="ai-status-badge" style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);">
          <span class="material-symbols-outlined" style="font-size:14px;animation:spin 1.2s linear infinite;color:var(--gold);">progress_activity</span>
          Checking AI…
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="ai-clear-chat" title="Clear this conversation">Clear chat</button>
      </div>
    </div>

    <div class="ai-chat-root" style="display:flex;flex-direction:column;min-height:min(520px, calc(100vh - 280px));max-height:calc(100vh - 220px);border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--bg-raised);">
      <div id="ai-chat-thread" style="flex:1;overflow-y:auto;padding:16px 14px 12px;scroll-behavior:smooth;"></div>
      <div style="border-top:1px solid var(--border);padding:10px 12px;background:var(--bg-surface);">
        <p style="margin:0 0 8px;font-size:10px;color:var(--text-muted);line-height:1.4;">
          <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">info</span>
          All amounts are UGX. Answers use your database — verify critical decisions in the field.
        </p>
        <div style="display:flex;align-items:center;gap:10px;background:var(--bg-raised);border:1px solid var(--border);border-radius:10px;padding:6px 10px 6px 14px;" id="search-shell">
          <span class="material-symbols-outlined" style="font-size:20px;color:var(--gold);flex-shrink:0;">chat</span>
          <input id="farm-search-input" type="text" autocomplete="off" spellcheck="false"
            placeholder="Message the assistant…"
            style="flex:1;background:none;border:none;outline:none;font-size:14px;color:var(--text-primary);padding:10px 0;font-family:var(--font);min-width:0;"/>
          <button type="button" id="farm-search-btn" class="btn btn-primary btn-sm" style="flex-shrink:0;">
            <span class="material-symbols-outlined" style="font-size:16px;">send</span> Send
          </button>
        </div>
      </div>
    </div>
  `;

  const threadEl = container.querySelector('#ai-chat-thread');
  const input = container.querySelector('#farm-search-input');
  const btn = container.querySelector('#farm-search-btn');
  const aiBadge = container.querySelector('#ai-status-badge');

  renderChatBubbles(threadEl, aiChatSessionHistory);

  const testResult = await getEstateApi()
    .openAIChat({ messages: [{ role: 'user', content: 'Reply with exactly: OK' }] })
    .catch(() => ({ error: 'API_ERROR', message: 'Could not reach OpenAI from the app.' }));
  const hasAI = !testResult.error && String(testResult.reply || '').length > 0;
  if (hasAI) {
    aiBadge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:var(--gold);display:inline-block;box-shadow:0 0 6px var(--gold);"></span> OpenAI connected`;
  } else if (testResult.error === 'NO_KEY') {
    aiBadge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:var(--text-muted);display:inline-block;"></span> Local mode — add <code style="font-size:10px;">OPENAI_API_KEY</code> in <code style="font-size:10px;">.env</code>`;
  } else {
    const detail = escHtml(testResult.message || testResult.error || 'Unknown error');
    aiBadge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:var(--red-text);display:inline-block;"></span> OpenAI unavailable — ${detail}`;
  }

  const sendMessage = async () => {
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    btn.disabled = true;
    btn.style.opacity = '0.65';

    aiChatSessionHistory.push({ role: 'user', content: q });
    renderChatBubbles(threadEl, aiChatSessionHistory, {
      typing: hasAI ? 'Refreshing farm data and thinking…' : 'Querying farm data…',
    });

    try {
      if (hasAI) {
        const result = await runAIChatTurn(aiChatSessionHistory);
        if (result.error) {
          aiChatSessionHistory.push({
            role: 'assistant',
            isHtml: true,
            content: `<div style="color:var(--red-text);font-size:13px;line-height:1.5;"><strong>Could not get a reply.</strong> ${escHtml(result.message || '')}${result.error === 'NO_KEY' ? ` <span style="color:var(--text-muted);font-size:11px;">Add OPENAI_API_KEY to .env</span>` : ''}</div>`,
          });
        } else {
          aiChatSessionHistory.push({ role: 'assistant', content: result.reply || 'No response.' });
        }
      } else {
        const answer = await runLocalQuery(q);
        const temp = document.createElement('div');
        renderLocalAnswer(temp, q, answer, { chatMode: true });
        aiChatSessionHistory.push({ role: 'assistant', content: temp.innerHTML, isHtml: true });
      }
    } catch (e) {
      aiChatSessionHistory.push({
        role: 'assistant',
        isHtml: true,
        content: `<div style="color:var(--red-text);font-size:13px;"><strong>Error.</strong> ${escHtml(e.message || String(e))}</div>`,
      });
    }

    renderChatBubbles(threadEl, aiChatSessionHistory);
    btn.disabled = false;
    btn.style.opacity = '1';
    input.focus();
  };

  btn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  container.querySelector('#ai-clear-chat')?.addEventListener('click', () => {
    if (aiChatSessionHistory.length && !confirm('Clear this conversation?')) return;
    aiChatSessionHistory.length = 0;
    renderChatBubbles(threadEl, aiChatSessionHistory);
    input.focus();
  });

  input.focus();
}

// ─────────────────────────────────────────────────────────────
// Full farm + lodge + SACCO snapshot for OpenAI (see dataService.buildAIContextSnapshot)
// ─────────────────────────────────────────────────────────────
async function buildFarmContext() {
  return await dataService.buildAIContextSnapshot();
}

// ─────────────────────────────────────────────────────────────
// OpenAI multi-turn chat (refreshes farm context every send)
// ─────────────────────────────────────────────────────────────
async function buildOpenAISystemPrompt() {
  const context = await buildFarmContext();
  return `You are a farm intelligence assistant for Nyakamenta Coffee Estate in Uganda.
All money in this system is in Ugandan Shillings (UGX). Never use dollar signs ($), "USD", or US cents. Always express money as "UGX" followed by the amount (e.g. UGX 1,574,400) or say "Ugandan Shillings". The live data below is already labeled in UGX.

You are having a continuous conversation with the estate manager. Use the message thread: answer follow-ups in context (e.g. "explain more", "what about the other blocks?", "compare to last season"). When the user refers to something you said earlier, connect it to the current farm data below.

Answer with specific numbers and clear, actionable insights. Format using markdown-style structure. Be concise but thorough. Use bullet points for lists.
If recommending actions, be specific (e.g. "Block A should be prioritised for stumping given its ${'>'}10 year age and lowest kg/ac").

The FARM DATA block below is a full snapshot from the estate database, organized with lines like "=== SECTION NAME ===". Prefer those sections when answering; long lists may be truncated in the text but totals and rollups are authoritative.

FARM DATA:
${context}`;
}

/**
 * @param {{ role: string, content: string }[]} chatHistoryIncludingLatestUser
 */
async function runAIChatTurn(chatHistoryIncludingLatestUser) {
  const systemPrompt = await buildOpenAISystemPrompt();
  const trimmed = chatHistoryIncludingLatestUser.slice(-MAX_CHAT_MESSAGES);
  const messages = [{ role: 'system', content: systemPrompt }, ...trimmed];
  return await getEstateApi().openAIChat({
    model: 'gpt-4o-mini',
    messages,
  });
}

// ─────────────────────────────────────────────────────────────
// Minimal Markdown → HTML converter for AI responses
// ─────────────────────────────────────────────────────────────
function markdownToHtml(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // headings
    .replace(/^### (.+)$/gm, '<h4 style="margin:14px 0 6px;font-size:13px;color:var(--text-primary);font-weight:700;">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:14px;color:var(--text-primary);font-weight:700;">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin:18px 0 10px;font-size:15px;color:var(--text-primary);font-weight:800;">$1</h2>')
    // bold + italic
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-primary);">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // code inline
    .replace(/`(.+?)`/g, '<code style="background:var(--bg-overlay);padding:1px 5px;border-radius:3px;font-size:12px;color:var(--gold);">$1</code>')
    // bullet lists
    .replace(/^[-•] (.+)$/gm, '<li style="margin:4px 0;padding-left:4px;">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="margin:8px 0 8px 16px;padding:0;list-style:disc;">$&</ul>')
    // numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0;">$1</li>')
    // paragraphs from blank lines
    .replace(/\n\n/g, '</p><p style="margin:10px 0;">')
    .replace(/\n/g, '<br>')
    // wrap in paragraph
    .replace(/^/, '<p style="margin:0 0 10px;">')
    .replace(/$/, '</p>');
}

// ─────────────────────────────────────────────────────────────
// Local query engine (fallback when no OpenAI key)
// ─────────────────────────────────────────────────────────────
async function runLocalQuery(q) {
  const lq = q.toLowerCase();
  const is = (...kws) => kws.some(kw => lq.includes(kw));

  if (is('block', 'acre', 'yield', 'output', 'harvest', 'kg', 'best', 'worst', 'top', 'active', 'alert', 'variety', 'altitude')) {
    const blocks = await dataService.getBlocks();
    const sorted = [...blocks].sort((a, b) => (b.kgProcessed || 0) - (a.kgProcessed || 0));
    const maxKg = Math.max(...blocks.map(b => b.kgProcessed || 0), 1);

    if (is('highest', 'best yield', 'top yield')) return { type: 'best_block', label: 'Highest Yield', block: sorted[0], blocks: sorted.slice(0, 3), maxKg };
    if (is('alert', 'attention')) return { type: 'block_list', label: 'Alert Blocks', blocks: blocks.filter(b => b.status === 'Alert'), maxKg, isAlert: true };
    if (is('active')) return { type: 'block_list', label: 'Active Blocks', blocks: blocks.filter(b => b.status === 'Active'), maxKg };
    if (is('variety')) {
      const byV = {};
      blocks.forEach(b => { const v = b.variety || 'Unknown'; byV[v] = (byV[v] || { acres: 0, kg: 0 }); byV[v].acres += (b.acres || 0); byV[v].kg += (b.kgProcessed || 0); });
      return { type: 'variety', rows: Object.entries(byV).sort((a, b) => b[1].kg - a[1].kg) };
    }
    return { type: 'block_list', label: `All ${blocks.length} Blocks`, blocks: sorted, maxKg };
  }
  if (is('batch', 'processing')) {
    const batches = await dataService.getBatches();
    return { type: 'batch_list', label: 'Batches', batches: batches.slice(0, 15) };
  }
  if (is('worker', 'workforce', 'staff')) {
    const wf = await dataService.getWorkforce();
    return { type: 'workforce', ...wf };
  }
  if (is('finance', 'revenue', 'expense', 'profit')) {
    const fin = await dataService.getFinanceSummary();
    return { type: 'finance', ...fin, items: [] };
  }
  // Estate overview
  const [blocks, fin, wf, stats] = await Promise.all([
    dataService.getBlocks(), dataService.getFinanceSummary(),
    dataService.getWorkforce(), dataService.getComputedStats(),
  ]);
  return { type: 'estate_summary', blocks, fin, wf, stats };
}

// ─────────────────────────────────────────────────────────────
// Local answer renderer (same as before, compact version)
// ─────────────────────────────────────────────────────────────
function renderLocalAnswer(el, query, ans, options = {}) {
  const chatMode = !!options.chatMode;
  const echo = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:12px;color:var(--text-muted);">
    <span class="material-symbols-outlined" style="font-size:14px;">search</span>
    <em style="color:var(--text-secondary);">"${escHtml(query)}"</em>
    <span style="font-size:10px;margin-left:auto;background:var(--bg-overlay);padding:2px 8px;border-radius:10px;">Local Mode — Add OpenAI key for AI answers</span>
  </div>`;

  let html = chatMode ? '' : echo;
  if (chatMode) {
    html += `<div style="font-size:10px;color:var(--text-muted);margin-bottom:10px;padding:4px 0;">Offline answers from your database (not OpenAI).</div>`;
  }

  const card = c => `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:20px;">${c}</div>`;

  const blockRow = (b, maxKg) => {
    const kpa = b.acres > 0 ? ((b.kgProcessed || 0) / b.acres).toFixed(1) : '—';
    const yp = Math.round((b.kgProcessed || 0) / maxKg * 100);
    const sc = b.status === 'Active' ? 'var(--green-text)' : b.status === 'Alert' ? 'var(--red-text)' : 'var(--text-muted)';
    return `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:14px;font-weight:700;">${b.name}</span>
        <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;
          background:${b.status === 'Active' ? 'rgba(100,180,60,.15)' : b.status === 'Alert' ? 'rgba(220,80,50,.15)' : 'var(--bg-overlay)'};
          color:${sc};">${b.status}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:8px;">
        ${[['Acreage', b.acres + ' ac'], ['Kg/Acre', kpa]].map(([l, v]) => `
          <div><div style="font-size:8px;text-transform:uppercase;color:var(--text-muted);">${l}</div>
          <div style="font-size:13px;font-weight:700;">${v}</div></div>`).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:5px;background:var(--bg-overlay);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${yp}%;background:linear-gradient(90deg,var(--green-mid),var(--green-bright));border-radius:3px;"></div>
        </div>
        <span style="font-size:11px;color:var(--text-muted);">${(b.kgProcessed || 0).toLocaleString()} kg</span>
      </div>
    </div>`;
  };

  if (ans.type === 'best_block') {
    const top = ans.blocks[0];
    html += `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:12px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--gold);margin-bottom:4px;">${ans.label}</div>
      <div style="font-size:36px;font-weight:900;color:var(--text-primary);">${top.name}</div>
      <div style="font-size:13px;color:var(--text-secondary);">${(top.kgProcessed || 0).toLocaleString()} kg · ${top.acres}ac</div>
    </div>
    ${ans.blocks.map(b => blockRow(b, ans.maxKg)).join('')}`;
  } else if (ans.type === 'block_list') {
    html += `<div style="font-size:14px;font-weight:700;margin-bottom:12px;">${ans.label}</div>
    ${ans.blocks.length ? ans.blocks.map(b => blockRow(b, ans.maxKg)).join('') : '<div style="color:var(--text-muted);">No blocks found.</div>'}`;
  } else if (ans.type === 'variety') {
    html += card(`<div style="font-size:14px;font-weight:700;margin-bottom:14px;">Variety Performance</div>
      ${ans.rows.map(([v, d]) => `<div style="display:flex;justify-content:space-between;padding:9px 12px;background:var(--bg-overlay);border-radius:6px;margin-bottom:6px;">
        <div><div style="font-weight:700;">${v}</div><div style="font-size:10px;color:var(--text-muted);">${d.acres}ac</div></div>
        <div style="text-align:right;"><div style="font-size:14px;font-weight:800;color:var(--gold-text);">${d.kg.toLocaleString()} kg</div>
        <div style="font-size:10px;color:var(--text-muted);">${d.acres > 0 ? (d.kg / d.acres).toFixed(1) : '-'} kg/ac</div></div>
      </div>`).join('')}`);
  } else if (ans.type === 'workforce') {
    html += card(`<div style="font-size:14px;font-weight:700;margin-bottom:14px;">Workforce</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${[['Total', ans.totalWorkers || 0], ['Permanent', ans.permanent || 0], ['Seasonal', ans.seasonal || 0]].map(([l, v]) => `
          <div style="background:var(--bg-overlay);padding:14px;border-radius:8px;">
            <div style="font-size:9px;text-transform:uppercase;color:var(--text-muted);">${l}</div>
            <div style="font-size:24px;font-weight:900;">${v}</div>
          </div>`).join('')}
      </div>`);
  } else if (ans.type === 'finance') {
    const p = ans.netProfit || 0;
    html += card(`<div style="font-size:14px;font-weight:700;margin-bottom:14px;">Finance Summary</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${[['Revenue', dataService.formatCurrency(ans.totalRevenue || 0), 'var(--green-text)'],
      ['Expenses', dataService.formatCurrency(ans.totalExpenses || 0), 'var(--red-text)'],
      [p >= 0 ? 'Net Profit' : 'Net Loss', dataService.formatCurrency(Math.abs(p)), p >= 0 ? 'var(--gold-text)' : 'var(--red-text)']].map(([l, v, c]) => `
          <div style="background:var(--bg-overlay);padding:14px;border-radius:8px;">
            <div style="font-size:9px;text-transform:uppercase;color:var(--text-muted);">${l}</div>
            <div style="font-size:20px;font-weight:900;color:${c};">${v}</div>
          </div>`).join('')}
      </div>`);
  } else if (ans.type === 'estate_summary') {
    const blks = ans.blocks, fin = ans.fin;
    const tKg = blks.reduce((s, b) => s + (b.kgProcessed || 0), 0);
    const tAc = blks.reduce((s, b) => s + (b.acres || 0), 0);
    const mKg = Math.max(...blks.map(b => b.kgProcessed || 0), 1);
    html += card(`<div style="font-size:14px;font-weight:700;margin-bottom:14px;">Estate Overview</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;">
        ${[['Total Area', tAc.toFixed(1) + ' ac', 'map'], ['Season Output', tKg.toLocaleString() + ' kg', 'scale'],
      ['Active Blocks', blks.filter(b => b.status === 'Active').length + '/' + blks.length, 'check_circle'],
      ['Net (farm ledger)', dataService.formatCurrency(fin.netProfit || 0), 'payments']].map(([l, v, ic]) => `
          <div style="display:flex;align-items:center;gap:10px;background:var(--bg-overlay);padding:12px;border-radius:8px;">
            <span class="material-symbols-outlined" style="font-size:18px;color:var(--gold);">${ic}</span>
            <div><div style="font-size:9px;text-transform:uppercase;color:var(--text-muted);">${l}</div>
            <div style="font-size:16px;font-weight:800;">${v}</div></div>
          </div>`).join('')}
      </div>
      ${blks.sort((a, b) => (b.kgProcessed || 0) - (a.kgProcessed || 0)).map(b => {
        const pct = ((b.kgProcessed || 0) / mKg * 100).toFixed(0);
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--border-subtle);">
          <div style="width:100px;font-size:12px;font-weight:600;">${b.name}</div>
          <div style="flex:1;height:5px;background:var(--bg-overlay);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--green-mid),var(--green-bright));border-radius:3px;"></div>
          </div>
          <div style="width:80px;text-align:right;font-size:11px;font-weight:700;">${(b.kgProcessed || 0).toLocaleString()} kg</div>
        </div>`}).join('')}`);
  } else {
    html += card(`<div style="text-align:center;padding:20px;color:var(--text-muted);">
      <span class="material-symbols-outlined" style="font-size:36px;margin-bottom:10px;display:block;">search_off</span>
      <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">No match for "${query}"</div>
      <p style="font-size:12px;">Try asking about blocks, yield, workers, batches, or finance.</p>
    </div>`);
  }

  el.innerHTML = html;
}
