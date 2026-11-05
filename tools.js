/* ====================== TOOLS — output folder, daily auto-backup, command palette (Ctrl+K) ====================== */
// Output folder: Chrome / Edge File System Access API. The folder handle is kept in IndexedDB; files are written
// straight into it (optionally a YYYY-MM subfolder) instead of Downloads. Falls back to a normal download.
(function () {
  if (typeof HTMLElement === 'undefined') return;            // headless test harness
  const FS = typeof window.showDirectoryPicker === 'function';
  const TL = { dir: null, month: true, last: '' };
  const today = () => new Date().toISOString().slice(0, 10);
  const css = document.createElement('style');
  css.textContent = `
.tlb{flex:none;border:1px solid var(--line);background:var(--card);color:var(--mut);border-radius:6px;padding:4px 10px;font:inherit;font-size:.78rem;cursor:pointer;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tlb:hover{color:var(--ink);background:var(--soft)}.tlb b{color:var(--ink);font-weight:600}
.tlp{position:fixed;top:60px;right:24px;z-index:60;width:340px;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:14px 16px}
.tlp h4{margin:0 0 8px;font-size:.9rem}.tlp p{margin:4px 0 10px;color:var(--mut);font-size:.8rem}.tlp .actions{display:flex;gap:6px;flex-wrap:wrap}
.tlp label{display:flex;gap:6px;align-items:center;font-size:.82rem;margin:8px 0}
.kp{position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.35);display:flex;justify-content:center;align-items:flex-start;padding-top:12vh}
.kp>div{width:min(560px,92vw);background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.3);overflow:hidden}
.kp input{width:100%;border:0;border-bottom:1px solid var(--line);padding:14px 16px;font:inherit;font-size:1rem;background:var(--card);color:var(--ink);outline:0}
.kp ul{list-style:none;margin:0;padding:6px;max-height:50vh;overflow:auto}.kp li{padding:8px 10px;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between;gap:12px}
.kp li small{color:var(--mut)}.kp li.on{background:var(--soft)}.kp .none{padding:12px 16px;color:var(--mut)}`;
  document.head.appendChild(css);

  /* ---------- output folder ---------- */
  async function perm(ask) {
    if (!TL.dir) return false;
    try { if (await TL.dir.queryPermission({ mode: 'readwrite' }) === 'granted') return true; return ask ? await TL.dir.requestPermission({ mode: 'readwrite' }) === 'granted' : false; } catch (e) { return false; }
  }
  async function writeTo(dir, path, blob) {
    const parts = path.split('/'); let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const fh = await d.getFileHandle(parts[parts.length - 1], { create: true }), w = await fh.createWritable();
    await w.write(blob); await w.close();
  }
  const sub = () => TL.month ? new Date().toISOString().slice(0, 7) + '/' : '';
  const raw = saveBlobRaw;
  saveBlobRaw = function (name, blob) {
    if (!TL.dir) return raw(name, blob);
    const nm = fname(name);
    (async () => {
      if (!await perm(true)) return raw(name, blob);
      try { await writeTo(TL.dir, sub() + nm, blob); toast(`Saved to ${TL.dir.name}/${sub()}${nm}`); autoBackup(); }
      catch (e) { toast('Could not write to the folder — downloaded instead', 'warn'); raw(name, blob); }
    })();
  };
  async function backupNow(quiet) {
    if (!await perm(!quiet)) { if (!quiet) toast('No folder access — choose the output folder first', 'warn'); return; }
    const all = await DB.all(); delete all.msFmt;
    await writeTo(TL.dir, `Backup/settlement-engine-backup-${today()}.json`, new Blob([JSON.stringify(all)], { type: 'application/json' }));
    TL.last = today(); await DB.set('tlLastBackup', TL.last); if (!quiet) toast(`Backup saved to ${TL.dir.name}/Backup`); paintBtn();
  }
  async function autoBackup() { if (TL.dir && TL.last !== today() && await perm(false)) { try { await backupNow(true); } catch (e) { } } }
  async function pick() {
    try { TL.dir = await window.showDirectoryPicker({ id: 'se-out', mode: 'readwrite' }); await DB.set('tlDir', TL.dir); toast(`Output folder: ${TL.dir.name}`); autoBackup(); }
    catch (e) { if (e && e.name !== 'AbortError') toast('Folder not available: ' + e.message, 'bad'); }
    paintBtn(); panel(true);
  }

  /* ---------- top-bar button + panel ---------- */
  function paintBtn() {
    let b = document.getElementById('tlb');
    if (!b) { const thm = document.getElementById('thm'); if (!thm) return; b = document.createElement('button'); b.id = 'tlb'; b.className = 'tlb'; thm.parentNode.insertBefore(b, thm); b.onclick = () => panel(); }
    b.innerHTML = `Output: <b>${esc(TL.dir ? TL.dir.name : 'Downloads')}</b>`; b.title = 'Where downloaded files are saved · Ctrl+K for commands';
  }
  function panel(refresh) {
    let p = document.getElementById('tlp');
    if (p && !refresh) { p.remove(); return; }
    if (!p) { p = document.createElement('div'); p.id = 'tlp'; p.className = 'tlp'; document.body.appendChild(p); }
    p.innerHTML = `<h4>Output folder</h4>
      <p>${FS ? (TL.dir ? `Files are saved straight into <b>${esc(TL.dir.name)}</b>${TL.month ? ' (one subfolder per month)' : ''}. A backup of ledger, tracker &amp; settings goes to <b>${esc(TL.dir.name)}/Backup</b> once a day.` : 'Files go to Downloads. Choose a folder (e.g. on Z:) to save outputs there directly and get a daily automatic backup.') : 'This browser cannot write to folders — use Chrome or Edge. Files go to Downloads.'}</p>
      ${FS ? `<label><input type="checkbox" data-tl="month"${TL.month ? ' checked' : ''}> Subfolder per month (YYYY-MM)</label>
      <div class="actions"><button class="btn sm pri" data-tl="pick">${TL.dir ? 'Change folder' : 'Choose folder'}</button>${TL.dir ? `<button class="btn sm" data-tl="bk">Backup now</button><button class="btn sm" data-tl="off">Use Downloads</button>` : ''}</div>
      <p style="margin-top:10px">Last backup: <b>${esc(TL.last || 'never')}</b></p>` : ''}`;
  }
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-tl]'), p = document.getElementById('tlp');
    if (!t) { if (p && !p.contains(e.target) && e.target.id !== 'tlb' && !e.target.closest('#tlb')) p.remove(); return; }
    const a = t.dataset.tl;
    if (a === 'pick') pick();
    else if (a === 'bk') backupNow(false);
    else if (a === 'off') { TL.dir = null; await DB.set('tlDir', null); paintBtn(); panel(true); toast('Files go to Downloads'); }
  });
  document.addEventListener('change', async e => { if (e.target.dataset.tl === 'month') { TL.month = e.target.checked; await DB.set('tlMonth', TL.month); panel(true); } });

  /* ---------- command palette (Ctrl+K) ---------- */
  function commands() {
    const L = TABS.map(([k, n, s]) => ({ t: n, s: 'Go to tab', run: () => { S.tab = k; renderAll(); } }));
    const btns = [...document.querySelectorAll('#panel button[data-act]')].filter(b => b.offsetParent && !b.disabled && b.innerText.trim()).map(b => ({ t: b.innerText.replace(/^[⬇⬆✔✉↺]\s*/, '').trim(), s: 'Action', run: () => b.click() }));
    return [...btns, ...L,
      { t: 'Open files…', s: 'Choose raw files', run: () => { const d = document.getElementById('drop'); if (d) d.click(); } },
      ...['light', 'dim', 'dark'].map(m => ({ t: 'Theme: ' + m[0].toUpperCase() + m.slice(1), s: 'Appearance', run: () => { const b = document.querySelector(`#thm [data-t=${m}]`); if (b) b.click(); } })),
      { t: 'Review & edit before download: on / off', s: 'Setting', run: () => { const b = document.querySelector('[data-rv=pill]'); if (b) b.click(); } },
      ...(FS ? [{ t: 'Choose output folder…', s: 'Files', run: pick }, { t: 'Backup now', s: 'Files', run: () => backupNow(false) }] : [])];
  }
  function palette() {
    if (document.querySelector('.kp')) return;
    const el = document.createElement('div'); el.className = 'kp';
    el.innerHTML = '<div><input placeholder="Type a command, tab or button…" spellcheck="false"><ul></ul></div>'; document.body.appendChild(el);
    const inp = el.querySelector('input'), ul = el.querySelector('ul'), all = commands(); let list = [], i = 0;
    const draw = () => { const q = inp.value.trim().toLowerCase().split(/\s+/).filter(Boolean); list = all.filter(c => q.every(w => (c.t + ' ' + c.s).toLowerCase().includes(w))).slice(0, 40); i = Math.min(i, Math.max(0, list.length - 1));
      ul.innerHTML = list.length ? list.map((c, k) => `<li class="${k === i ? 'on' : ''}" data-k="${k}"><span>${esc(c.t)}</span><small>${esc(c.s)}</small></li>`).join('') : '<div class="none">No match</div>'; const on = ul.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' }); };
    const run = k => { const c = list[k]; el.remove(); if (c) c.run(); };
    inp.addEventListener('input', () => { i = 0; draw(); });
    inp.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { i = Math.min(i + 1, list.length - 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { i = Math.max(i - 1, 0); draw(); e.preventDefault(); } else if (e.key === 'Enter') { e.preventDefault(); run(i); } else if (e.key === 'Escape') el.remove(); });
    ul.addEventListener('click', e => { const li = e.target.closest('li'); if (li) run(+li.dataset.k); });
    el.addEventListener('mousedown', e => { if (e.target === el) el.remove(); });
    draw(); inp.focus();
  }
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && !document.querySelector('.rvm')) { e.preventDefault(); palette(); } });

  /* ---------- start ---------- */
  EXT.load.push(async () => {
    if (FS) { TL.dir = await DB.get('tlDir', null); TL.month = await DB.get('tlMonth', true); TL.last = await DB.get('tlLastBackup', ''); }
    paintBtn(); autoBackup();
  });
})();
