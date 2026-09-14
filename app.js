/* Talk To Me – a private, offline thought journal.
   All data is stored in IndexedDB on this device only. */
(() => {
  'use strict';

  const MOODS = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };
  const MOOD_LABELS = { 1: 'Awful', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' };
  const DB_NAME = 'talk-to-me';
  const DB_VERSION = 1;
  const STORE = 'entries';

  // ---------- Storage (IndexedDB with a tiny promise wrapper) ----------
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  function tx(mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      const r = fn(store);
      if (r && typeof r.onsuccess !== 'undefined') r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }
  const store = {
    all: () => tx('readonly', s => s.getAll()).then(list => (list || []).sort((a, b) => b.createdAt - a.createdAt)),
    put: entry => tx('readwrite', s => s.put(entry)),
    putMany: entries => tx('readwrite', s => { entries.forEach(e => s.put(e)); }),
    remove: id => tx('readwrite', s => s.delete(id)),
    clear: () => tx('readwrite', s => s.clear()),
  };

  // ---------- Helpers ----------
  const $ = sel => document.querySelector(sel);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const parseFeelings = str => Array.from(new Set(String(str || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)));
  const fmtDate = ts => new Date(ts).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function setStatus(msg) {
    const el = $('#save-status');
    el.textContent = msg;
    if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000);
  }
  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Views ----------
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
    document.querySelectorAll('.tab').forEach(t => {
      const on = t.dataset.view === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    if (name === 'history') renderHistory();
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));

  // ---------- Log form ----------
  const form = $('#entry-form');
  const intensity = $('#intensity');
  intensity.addEventListener('input', () => { $('#intensity-out').textContent = intensity.value; });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(form);
    const thought = String(data.get('thought') || '').trim();
    if (!thought) return;
    const entry = {
      id: uid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      thought,
      mood: Number(data.get('mood') || 3),
      intensity: Number(data.get('intensity') || 5),
      feelings: parseFeelings(data.get('feelings')),
      situation: String(data.get('situation') || '').trim(),
      evidence: String(data.get('evidence') || '').trim(),
      reframe: String(data.get('reframe') || '').trim(),
    };
    try {
      await store.put(entry);
      resetForm();
      setStatus('Saved.');
      refreshFeelingSuggestions();
    } catch (err) {
      console.error(err);
      setStatus('Could not save. Please try again.');
    }
  });

  function resetForm() {
    form.reset();
    $('#intensity-out').textContent = intensity.value;
    $('#thought').focus();
  }
  $('#clear-btn').addEventListener('click', resetForm);

  async function refreshFeelingSuggestions() {
    const entries = await store.all();
    const counts = {};
    entries.forEach(e => (e.feelings || []).forEach(f => { counts[f] = (counts[f] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([f]) => f);
    $('#feelings-list').innerHTML = top.map(f => `<option value="${escape(f)}">`).join('');
  }

  // ---------- History ----------
  let cache = [];
  async function renderHistory() {
    cache = await store.all();
    paintHistory();
  }
  function paintHistory() {
    const q = $('#search').value.trim().toLowerCase();
    const moodF = $('#mood-filter').value;
    const list = cache.filter(e => {
      if (moodF && String(e.mood) !== moodF) return false;
      if (!q) return true;
      const hay = [e.thought, e.situation, e.evidence, e.reframe, (e.feelings || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
    const ul = $('#entries');
    $('#empty-state').hidden = cache.length > 0;
    $('#history-summary').textContent = cache.length
      ? `${list.length} of ${cache.length} ${cache.length === 1 ? 'entry' : 'entries'}${q || moodF ? ' shown' : ''}`
      : '';
    ul.innerHTML = list.map(e => `
      <li class="entry" data-id="${e.id}">
        <div class="entry-head">
          <span class="entry-mood" title="${MOOD_LABELS[e.mood] || ''}">${MOODS[e.mood] || '😐'}</span>
          <span class="entry-time">${fmtDate(e.createdAt)}</span>
          <span class="entry-intensity">Intensity ${e.intensity}/10</span>
        </div>
        <p class="entry-thought">${escape(e.thought)}</p>
        ${e.feelings && e.feelings.length ? `<div class="entry-tags">${e.feelings.map(f => `<span class="tag">${escape(f)}</span>`).join('')}</div>` : ''}
        ${e.situation ? `<p class="entry-extra"><strong>Situation:</strong> ${escape(e.situation)}</p>` : ''}
        ${e.evidence ? `<p class="entry-extra"><strong>Evidence:</strong> ${escape(e.evidence)}</p>` : ''}
        ${e.reframe ? `<p class="entry-extra"><strong>Balanced view:</strong> ${escape(e.reframe)}</p>` : ''}
        <div class="entry-actions">
          <button type="button" class="btn small" data-action="edit">Edit</button>
          <button type="button" class="btn small" data-action="delete">Delete</button>
        </div>
      </li>`).join('');
  }
  $('#search').addEventListener('input', paintHistory);
  $('#mood-filter').addEventListener('change', paintHistory);

  $('#entries').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('.entry').dataset.id;
    const entry = cache.find(x => x.id === id);
    if (!entry) return;
    if (btn.dataset.action === 'delete') {
      if (confirm('Delete this entry? This cannot be undone.')) {
        await store.remove(id);
        renderHistory();
      }
    } else if (btn.dataset.action === 'edit') {
      openEdit(entry);
    }
  });

  // ---------- Edit dialog ----------
  const dialog = $('#edit-dialog');
  let editing = null;
  function openEdit(entry) {
    editing = entry;
    $('#edit-thought').value = entry.thought;
    $('#edit-feelings').value = (entry.feelings || []).join(', ');
    $('#edit-situation').value = entry.situation || '';
    $('#edit-evidence').value = entry.evidence || '';
    $('#edit-reframe').value = entry.reframe || '';
    dialog.showModal();
  }
  $('#edit-cancel').addEventListener('click', () => dialog.close('cancel'));
  $('#edit-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!editing) return;
    const updated = {
      ...editing,
      thought: $('#edit-thought').value.trim(),
      feelings: parseFeelings($('#edit-feelings').value),
      situation: $('#edit-situation').value.trim(),
      evidence: $('#edit-evidence').value.trim(),
      reframe: $('#edit-reframe').value.trim(),
      updatedAt: Date.now(),
    };
    if (!updated.thought) return;
    await store.put(updated);
    editing = null;
    dialog.close('save');
    renderHistory();
    refreshFeelingSuggestions();
  });

  // ---------- Export / import ----------
  $('#export-json').addEventListener('click', async () => {
    const entries = await store.all();
    const payload = { app: 'talk-to-me', version: 1, exportedAt: new Date().toISOString(), entries };
    download(`talk-to-me-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
  });
  $('#export-text').addEventListener('click', async () => {
    const entries = await store.all();
    const text = entries.map(e => {
      const lines = [
        `${fmtDate(e.createdAt)}  ${MOODS[e.mood] || ''} ${MOOD_LABELS[e.mood] || ''} (intensity ${e.intensity}/10)`,
        e.thought,
      ];
      if (e.feelings && e.feelings.length) lines.push(`Feelings: ${e.feelings.join(', ')}`);
      if (e.situation) lines.push(`Situation: ${e.situation}`);
      if (e.evidence) lines.push(`Evidence: ${e.evidence}`);
      if (e.reframe) lines.push(`Balanced view: ${e.reframe}`);
      return lines.join('\n');
    }).join('\n\n----------\n\n');
    download(`talk-to-me-${new Date().toISOString().slice(0, 10)}.txt`, text || 'No entries yet.', 'text/plain');
  });
  $('#import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const entries = Array.isArray(parsed) ? parsed : parsed.entries;
      if (!Array.isArray(entries)) throw new Error('No entries array found');
      const clean = entries
        .filter(x => x && typeof x.thought === 'string')
        .map(x => ({
          id: x.id || uid(),
          createdAt: Number(x.createdAt) || Date.now(),
          updatedAt: Number(x.updatedAt) || Number(x.createdAt) || Date.now(),
          thought: x.thought,
          mood: Math.min(5, Math.max(1, Number(x.mood) || 3)),
          intensity: Math.min(10, Math.max(1, Number(x.intensity) || 5)),
          feelings: Array.isArray(x.feelings) ? x.feelings.map(String) : parseFeelings(x.feelings),
          situation: String(x.situation || ''),
          evidence: String(x.evidence || ''),
          reframe: String(x.reframe || ''),
        }));
      await store.putMany(clean);
      alert(`Imported ${clean.length} ${clean.length === 1 ? 'entry' : 'entries'}.`);
      refreshFeelingSuggestions();
      showView('history');
    } catch (err) {
      console.error(err);
      alert('Could not import that file. Make sure it is a JSON export from this app.');
    } finally {
      e.target.value = '';
    }
  });
  $('#delete-all').addEventListener('click', async () => {
    if (!confirm('Delete ALL entries on this device? This cannot be undone.')) return;
    if (!confirm('Are you sure? Consider exporting first.')) return;
    await store.clear();
    cache = [];
    refreshFeelingSuggestions();
    alert('All entries deleted.');
  });

  // ---------- Install prompt ----------
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    $('#install-btn').hidden = false;
  });
  $('#install-btn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $('#install-btn').hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    $('#install-btn').hidden = true;
    $('#install-hint').textContent = 'Installed. You can open Talk To Me from your home screen.';
  });
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
    $('#install-hint').textContent = 'Installed. You can open Talk To Me from your home screen.';
  } else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    $('#install-hint').textContent = 'On iPhone/iPad: tap the Share button in Safari, then "Add to Home Screen".';
  }

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
    });
  }

  // ---------- Init ----------
  const initial = (location.hash || '').replace('#', '');
  showView(['log', 'history', 'settings'].includes(initial) ? initial : 'log');
  if (initial === 'new') $('#thought').focus();
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (['log', 'history', 'settings'].includes(h)) showView(h);
  });
  refreshFeelingSuggestions();
})();
