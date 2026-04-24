import { parseAnsi } from './ansiParser';

const LINE_RE = /^\[([^\]]+)\] \[([^\]]+)\] (.*)$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ansiToHtml(content: string): string {
  const spans = parseAnsi(content);
  return spans
    .map(span => {
      const styles: string[] = [];
      if (span.fg) styles.push(`color:${span.fg}`);
      if (span.bg) styles.push(`background:${span.bg}`);
      if (span.bold) styles.push('font-weight:bold');
      if (span.italic) styles.push('font-style:italic');
      if (span.underline) styles.push('text-decoration:underline');
      const text = escapeHtml(span.text);
      if (styles.length === 0) return text;
      return `<span style="${styles.join(';')}">${text}</span>`;
    })
    .join('');
}

function deathlogsUrl(serverKey: string | null, serverHostMap: Record<string, string>): string {
  if (serverKey) {
    const host = serverHostMap[serverKey] || '';
    if (host.toLowerCase().includes('reinosdeleyenda.es')) {
      return 'https://deathlogs.com/list_log.php?m_id=10';
    }
  }
  return 'https://deathlogs.com/';
}

export function generateLogHtml(
  rawLog: string,
  cutoffMs: number | null,
  serverHostMap: Record<string, string>
): string {
  const rawLines = rawLog.split('\n');
  const entries: { ts: string; tsMs: number; server: string; html: string }[] = [];
  const serverSet = new Set<string>();

  for (const rawLine of rawLines) {
    if (!rawLine) continue;
    const match = LINE_RE.exec(rawLine);
    if (!match) continue;
    const ts = match[1];
    const server = match[2];
    const content = match[3];
    const tsMs = Date.parse(ts);
    if (Number.isNaN(tsMs)) continue;
    if (cutoffMs !== null && tsMs < cutoffMs) continue;
    serverSet.add(server);
    entries.push({ ts, tsMs, server, html: ansiToHtml(content) });
  }

  const servers = [...serverSet].sort();
  const serverOptions = servers
    .map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
    .join('');

  const defaultDeathlogs = deathlogsUrl(servers.length === 1 ? servers[0] : null, serverHostMap);
  const serverHostMapJson = JSON.stringify(serverHostMap);

  const lineHtml = entries
    .map(e => {
      const timeShort = e.ts.slice(11, 19);
      return `<div class="line" data-ts="${e.ts}" data-server="${escapeHtml(e.server)}"><span class="ts">${timeShort}</span> <span class="msg">${e.html}</span></div>`;
    })
    .join('\n');

  const generatedAtIso = new Date().toISOString();
  const totalLines = entries.length;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>BlowTorch Log</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body { background: #0a0a0a; color: #ddd; font-family: ui-monospace, Menlo, Consolas, monospace; margin: 0; padding: 0; }
  body.picking { cursor: crosshair; }
  body.picking #log .line:hover { background: #222244; }
  header { position: sticky; top: 0; background: #111; border-bottom: 1px solid #333; padding: 10px 12px; z-index: 10; }
  header h1 { margin: 0 0 6px; font-size: 15px; color: #00cc00; }
  .meta { font-size: 11px; color: #888; margin-bottom: 8px; }
  .meta a { color: #88ccff; }
  .row { display: flex; gap: 6px; margin-bottom: 6px; }
  .row > * { flex: 1 1 0; min-width: 0; }
  .row.four > * { flex: 1 1 0; }
  .ctrl { height: 34px; padding: 0 10px; font-family: inherit; font-size: 13px; border-radius: 4px; border: 1px solid #444; background: #222; color: #ddd; text-align: center; display: flex; align-items: center; justify-content: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
  select.ctrl, input.ctrl { text-align: left; cursor: text; }
  select.ctrl { cursor: pointer; }
  button.ctrl { font-weight: 500; }
  button.primary { background: #336633; border-color: #558855; color: #fff; }
  button.secondary { background: #334466; border-color: #556688; color: #fff; }
  button.pick { background: #4a3322; border-color: #886633; color: #fff; position: relative; justify-content: space-between; padding-right: 28px; text-align: left; }
  button.pick .clear-x { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); color: #888; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 3px; }
  button.pick .clear-x:hover { color: #dd5555; background: rgba(0,0,0,0.3); }
  button.pick.picking { background: #aa5522; border-color: #ddaa44; animation: pulse 1s infinite; }
  button.shortcut { background: #1f1f1f; border-color: #444; color: #aaa; font-size: 12px; padding: 0 6px; }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.7 } }
  .pick-label { color: #aaa; font-size: 12px; margin-right: 4px; flex-shrink: 0; }
  .pick-value { color: #fff; font-size: 12px; overflow: hidden; text-overflow: ellipsis; flex: 1; }
  .pick-value.empty { color: #888; font-style: italic; }
  #log { padding: 10px 14px; font-size: 13px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
  .line { display: block; padding: 1px 4px; border-radius: 2px; border-left: 3px solid transparent; }
  .ts { color: #666; user-select: none; }
  .line.hidden { display: none; }
  .line.pick-from { background: rgba(85, 221, 85, 0.15); border-left-color: #55dd55; }
  .line.pick-to { background: rgba(221, 221, 85, 0.15); border-left-color: #dddd55; }
  .line.pick-from.pick-to { background: rgba(85, 221, 85, 0.25); }
  .empty { color: #888; padding: 20px; text-align: center; }
  .hint { font-size: 12px; color: #ddaa44; margin-top: 4px; display: none; }
  .hint.active { display: block; }
  .status { font-size: 12px; margin-top: 4px; display: none; }
  .status.ok { color: #55dd55; }
  .status.err { color: #dd5555; }
  .status.visible { display: block; }
</style>
</head>
<body>
<header>
  <h1>BlowTorch — Log exportado</h1>
  <div class="meta">Generado: ${escapeHtml(generatedAtIso)} · ${totalLines} líneas · <a href="${defaultDeathlogs}" target="_blank" id="deathlogs-link">Subir a deathlogs.com ↗</a></div>

  <div class="row">
    <select class="ctrl" id="f-server">
      <option value="">Todos los servidores</option>
      ${serverOptions}
    </select>
    <input class="ctrl" type="text" id="f-text" placeholder="Buscar texto...">
  </div>

  <div class="row">
    <button class="ctrl secondary" onclick="clearFilters()">Limpiar filtros</button>
    <button class="ctrl secondary" onclick="copyVisible()">Copiar con formato</button>
    <button class="ctrl secondary" onclick="copyCleanHtml()">Copiar HTML limpio</button>
  </div>

  <div class="row">
    <button class="ctrl pick" id="btn-from" onclick="startPicking('from')">
      <span><span class="pick-label">Desde:</span><span class="pick-value empty" id="v-from">ninguno</span></span>
      <span class="clear-x" id="clr-from" onclick="event.stopPropagation(); clearPick('from')">×</span>
    </button>
    <button class="ctrl pick" id="btn-to" onclick="startPicking('to')">
      <span><span class="pick-label">Hasta:</span><span class="pick-value empty" id="v-to">ninguno</span></span>
      <span class="clear-x" id="clr-to" onclick="event.stopPropagation(); clearPick('to')">×</span>
    </button>
  </div>

  <div class="row four">
    <button class="ctrl shortcut" onclick="quickFilter(30)">30 min</button>
    <button class="ctrl shortcut" onclick="quickFilter(60)">1 h</button>
    <button class="ctrl shortcut" onclick="quickFilterToday()">Hoy</button>
    <button class="ctrl shortcut" onclick="quickFilterAll()">Todo</button>
  </div>

  <div class="hint" id="pick-hint">Toca una línea del log para marcar el punto…</div>
  <div class="status" id="copy-status"></div>
</header>

<div id="log">
${lineHtml || '<div class="empty">Sin líneas en el rango exportado.</div>'}
</div>

<script>
const SERVER_HOST_MAP = ${serverHostMapJson};
const allLines = Array.from(document.querySelectorAll('.line'));
let pickingMode = null;
let fromTs = null;
let toTs = null;

function applyFilters() {
  const server = document.getElementById('f-server').value;
  const text = document.getElementById('f-text').value.toLowerCase();
  for (const el of allLines) {
    const elServer = el.getAttribute('data-server');
    const elTs = Date.parse(el.getAttribute('data-ts'));
    let hide = false;
    if (server && elServer !== server) hide = true;
    if (!hide && fromTs !== null && elTs < fromTs) hide = true;
    if (!hide && toTs !== null && elTs > toTs) hide = true;
    if (!hide && text && !el.textContent.toLowerCase().includes(text)) hide = true;
    el.classList.toggle('hidden', hide);
  }
  updateDeathlogsLink();
}

function clearFilters() {
  document.getElementById('f-server').value = '';
  document.getElementById('f-text').value = '';
  clearPick('from');
  clearPick('to');
  applyFilters();
}

function updateDeathlogsLink() {
  const server = document.getElementById('f-server').value;
  const link = document.getElementById('deathlogs-link');
  if (server && SERVER_HOST_MAP[server] && SERVER_HOST_MAP[server].toLowerCase().includes('reinosdeleyenda.es')) {
    link.href = 'https://deathlogs.com/list_log.php?m_id=10';
  } else {
    link.href = 'https://deathlogs.com/';
  }
}

function fmtTsShort(iso) {
  if (!iso) return 'ninguno';
  return iso.slice(0, 10) + ' ' + iso.slice(11, 19);
}

function setValueDisplay(which, isoOrNull) {
  const el = document.getElementById(which === 'from' ? 'v-from' : 'v-to');
  el.textContent = fmtTsShort(isoOrNull);
  el.classList.toggle('empty', !isoOrNull);
}

function startPicking(which) {
  if (pickingMode === which) { stopPicking(); return; }
  pickingMode = which;
  document.body.classList.add('picking');
  document.getElementById('btn-from').classList.toggle('picking', which === 'from');
  document.getElementById('btn-to').classList.toggle('picking', which === 'to');
  const hint = document.getElementById('pick-hint');
  hint.textContent = which === 'from' ? 'Toca una línea para marcar el inicio…' : 'Toca una línea para marcar el fin…';
  hint.classList.add('active');
}

function stopPicking() {
  pickingMode = null;
  document.body.classList.remove('picking');
  document.getElementById('btn-from').classList.remove('picking');
  document.getElementById('btn-to').classList.remove('picking');
  document.getElementById('pick-hint').classList.remove('active');
}

function setPickFromLine(el, which) {
  const ts = el.getAttribute('data-ts');
  if (which === 'from') { fromTs = Date.parse(ts); setValueDisplay('from', ts); }
  else { toTs = Date.parse(ts); setValueDisplay('to', ts); }
  refreshPickHighlights();
  stopPicking();
  applyFilters();
}

function clearPick(which) {
  if (which === 'from') { fromTs = null; setValueDisplay('from', null); }
  else { toTs = null; setValueDisplay('to', null); }
  refreshPickHighlights();
  applyFilters();
}

function refreshPickHighlights() {
  for (const el of allLines) {
    const elTs = Date.parse(el.getAttribute('data-ts'));
    el.classList.toggle('pick-from', fromTs !== null && elTs === fromTs);
    el.classList.toggle('pick-to', toTs !== null && elTs === toTs);
  }
}

function quickFilter(minutes) {
  const now = Date.now();
  fromTs = now - minutes * 60 * 1000;
  toTs = now;
  setValueDisplay('from', new Date(fromTs).toISOString());
  setValueDisplay('to', new Date(toTs).toISOString());
  refreshPickHighlights();
  applyFilters();
}

function quickFilterToday() {
  const now = new Date();
  fromTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0).getTime();
  toTs = now.getTime();
  setValueDisplay('from', new Date(fromTs).toISOString());
  setValueDisplay('to', new Date(toTs).toISOString());
  refreshPickHighlights();
  applyFilters();
}

function quickFilterAll() {
  clearPick('from');
  clearPick('to');
  applyFilters();
}

async function copyVisible() {
  const visible = allLines.filter(el => !el.classList.contains('hidden'));
  if (visible.length === 0) { showStatus('No hay líneas visibles para copiar', true); return; }

  // Primary: selection + execCommand — preserves formatting, works in file:// / content:// contexts
  try {
    const range = document.createRange();
    range.setStartBefore(visible[0]);
    range.setEndAfter(visible[visible.length - 1]);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    if (ok) { showStatus('Copiado ' + visible.length + ' líneas con formato'); return; }
  } catch (e) { /* try next */ }

  // Fallback 1: Clipboard API with HTML + plain text
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const html = visible.map(el => el.outerHTML).join('\\n');
      const text = visible.map(el => el.textContent).join('\\n');
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      showStatus('Copiado ' + visible.length + ' líneas con formato');
      return;
    }
  } catch (e) { /* try next */ }

  // Fallback 2: plain text only
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      const text = visible.map(el => el.textContent).join('\\n');
      await navigator.clipboard.writeText(text);
      showStatus('Copiado ' + visible.length + ' líneas (texto plano)');
      return;
    }
  } catch (e) { /* try next */ }

  // Fallback 3: textarea hack with HTML as plain text
  try {
    const ta = document.createElement('textarea');
    ta.value = visible.map(el => el.outerHTML).join('\\n');
    ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) { showStatus('Copiado como HTML plano'); return; }
  } catch (e) { /* try next */ }

  showStatus('No se pudo copiar. Selecciona manualmente y usa Ctrl+C.', true);
}

function buildCleanHtml(lines) {
  return lines.map(el => {
    const ts = el.querySelector('.ts');
    const msg = el.querySelector('.msg');
    const tsText = ts ? ts.textContent : '';
    const msgHtml = msg ? msg.innerHTML : '';
    return (tsText ? tsText + ' ' : '') + msgHtml;
  }).join('<br>\\n');
}

async function copyCleanHtml() {
  const visible = allLines.filter(el => !el.classList.contains('hidden'));
  if (visible.length === 0) { showStatus('No hay líneas visibles para copiar', true); return; }
  const clean = buildCleanHtml(visible);

  // Primary: writeText (plain) — puts HTML source as text
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(clean);
      showStatus('Copiado HTML limpio de ' + visible.length + ' líneas');
      return;
    }
  } catch (e) { /* try next */ }

  // Fallback: textarea hack
  try {
    const ta = document.createElement('textarea');
    ta.value = clean;
    ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) { showStatus('Copiado HTML limpio de ' + visible.length + ' líneas'); return; }
  } catch (e) { /* fall through */ }

  showStatus('No se pudo copiar. Selecciona manualmente y usa Ctrl+C.', true);
}

function showStatus(msg, isError) {
  const el = document.getElementById('copy-status');
  el.textContent = msg;
  el.className = 'status visible ' + (isError ? 'err' : 'ok');
  setTimeout(() => { el.className = 'status'; }, 4000);
}

document.getElementById('f-text').addEventListener('input', applyFilters);
document.getElementById('f-server').addEventListener('change', applyFilters);

document.getElementById('log').addEventListener('click', function(e) {
  if (!pickingMode) return;
  let el = e.target;
  while (el && !el.classList.contains('line')) el = el.parentElement;
  if (el && el.classList.contains('line')) {
    e.preventDefault();
    e.stopPropagation();
    setPickFromLine(el, pickingMode);
  }
});

document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && pickingMode) stopPicking(); });
</script>
</body>
</html>`;
}
