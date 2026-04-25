import Fuse from './vendor/fuse.min.mjs';
import { marked } from './vendor/marked.esm.js';

marked.setOptions({ breaks: true, gfm: true });

const vscode = acquireVsCodeApi();

/** @type {Array<{id:string,title:string,body:string,tags:string[],createdAt:string,updatedAt:string}>} */
let notes = [];
let defaultAction = 'copy';
let search = '';
const activeTags = new Set();
let fuse = null;

const FUSE_OPTIONS = {
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'tags', weight: 0.3 },
    { name: 'body', weight: 0.2 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: false,
  minMatchCharLength: 2,
};

const els = {
  search: document.getElementById('search'),
  newBtn: document.getElementById('new-btn'),
  viewGrid: document.getElementById('view-grid'),
  viewList: document.getElementById('view-list'),
  tags: document.getElementById('tags'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  toast: document.getElementById('toast'),
  backdrop: document.getElementById('editor-backdrop'),
  editorTitle: document.getElementById('editor-title'),
  editorClose: document.getElementById('editor-close'),
  editorCancel: document.getElementById('editor-cancel'),
  editorSave: document.getElementById('editor-save'),
  editorDelete: document.getElementById('editor-delete'),
  titleInput: document.getElementById('editor-title-input'),
  tagsInput: document.getElementById('editor-tags-input'),
  bodyInput: document.getElementById('editor-body-input'),
  bodyPreview: document.getElementById('editor-body-preview'),
  bodyModeEdit: document.getElementById('body-mode-edit'),
  bodyModePreview: document.getElementById('body-mode-preview'),
};

let editingId = null; // null = new, string = editing existing
const savedState = vscode.getState() || {};
let viewMode = savedState.viewMode === 'list' ? 'list' : 'grid';

// Tag autocomplete dropdown — append once, populated on focus/input.
const tagSuggestions = document.createElement('div');
tagSuggestions.className = 'tag-suggestions';
tagSuggestions.hidden = true;
els.tagsInput.parentElement?.appendChild(tagSuggestions);
let suggestionIndex = -1;
/** @type {string[]} */
let currentSuggestions = [];

els.tagsInput.addEventListener('input', updateTagSuggestions);
els.tagsInput.addEventListener('focus', updateTagSuggestions);
els.tagsInput.addEventListener('blur', () => {
  // Delay so a click on a suggestion can fire before we hide.
  setTimeout(hideTagSuggestions, 120);
});
els.tagsInput.addEventListener('keydown', handleTagSuggestionKey);

els.search.addEventListener('input', (e) => {
  search = e.target.value.trim().toLowerCase();
  renderGrid();
});
els.newBtn.addEventListener('click', () => openEditor(null));
els.viewGrid?.addEventListener('click', () => setViewMode('grid'));
els.viewList?.addEventListener('click', () => setViewMode('list'));
els.bodyModeEdit?.addEventListener('click', () => setBodyMode('edit'));
els.bodyModePreview?.addEventListener('click', () => setBodyMode('preview'));
els.editorClose.addEventListener('click', closeEditor);
els.editorCancel.addEventListener('click', closeEditor);
els.editorSave.addEventListener('click', saveEditor);
els.editorDelete.addEventListener('click', () => {
  if (!editingId) {
    return;
  }
  vscode.postMessage({ type: 'delete', id: editingId });
  closeEditor();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.backdrop.hidden) {
    closeEditor();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !els.backdrop.hidden) {
    saveEditor();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n' && els.backdrop.hidden) {
    e.preventDefault();
    openEditor(null);
  }
  if (e.key === '/' && els.backdrop.hidden && document.activeElement !== els.search) {
    e.preventDefault();
    els.search.focus();
  }
});
els.backdrop.addEventListener('click', (e) => {
  if (e.target === els.backdrop) {
    closeEditor();
  }
});

applyViewMode();

window.addEventListener('message', (ev) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    notes = msg.notes;
    defaultAction = msg.defaultAction || 'copy';
    document.documentElement.style.setProperty('--col-w', (msg.minColumnWidth || 260) + 'px');
    rebuildFuse();
    renderTags();
    renderGrid();
  } else if (msg.type === 'updated') {
    notes = msg.notes;
    for (const t of Array.from(activeTags)) {
      if (!notes.some((n) => n.tags.includes(t))) {
        activeTags.delete(t);
      }
    }
    rebuildFuse();
    renderTags();
    renderGrid();
  } else if (msg.type === 'toast') {
    showToast(msg.message, msg.level);
  } else if (msg.type === 'focusNew') {
    openEditor(null);
  } else if (msg.type === 'focusEdit') {
    openEditor(msg.id);
  }
});

vscode.postMessage({ type: 'ready' });

function rebuildFuse() {
  fuse = new Fuse(notes, FUSE_OPTIONS);
}

function renderTags() {
  const counts = new Map();
  for (const n of notes) {
    for (const t of n.tags) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  els.tags.textContent = '';
  if (sorted.length === 0) {
    return;
  }
  for (const [tag, count] of sorted) {
    const chip = document.createElement('button');
    chip.className = 'tag-chip' + (activeTags.has(tag) ? ' active' : '');
    chip.type = 'button';
    chip.textContent = `${tag} · ${count}`;
    chip.addEventListener('click', () => {
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
      } else {
        activeTags.add(tag);
      }
      renderTags();
      renderGrid();
    });
    els.tags.append(chip);
  }
}

function renderGrid() {
  const filtered = computeFiltered();
  els.grid.textContent = '';
  els.empty.hidden = filtered.length !== 0 || notes.length !== 0;

  if (filtered.length === 0 && notes.length > 0) {
    const nothing = document.createElement('div');
    nothing.className = 'empty';
    nothing.innerHTML = '<h2>No notes match</h2><p>Try clearing the search or tag filters.</p>';
    els.grid.append(nothing);
    return;
  }

  for (const n of filtered) {
    els.grid.append(renderCard(n));
  }
}

function computeFiltered() {
  // Tag filter (AND)
  let filtered = activeTags.size === 0
    ? notes.slice()
    : notes.filter((n) => {
        for (const t of activeTags) {
          if (!n.tags.includes(t)) {
            return false;
          }
        }
        return true;
      });

  // Search: substring for ≤1 char (fuse threshold floors out for very short
  // queries), fuzzy via Fuse for ≥2 chars.
  if (search) {
    if (search.length < 2) {
      filtered = filtered.filter((n) =>
        (n.title + '\n' + n.body + '\n' + n.tags.join(' ')).toLowerCase().includes(search),
      );
    } else if (fuse) {
      const matchedIds = new Set(fuse.search(search).map((r) => r.item.id));
      filtered = filtered.filter((n) => matchedIds.has(n.id));
    }
  }
  return filtered;
}

function renderCard(note) {
  const card = document.createElement('article');
  card.className = 'card' + (note.pinned ? ' pinned' : '');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', note.title);

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = 'pin-btn' + (note.pinned ? ' pinned' : '');
  pinBtn.setAttribute('aria-pressed', String(note.pinned));
  pinBtn.title = note.pinned ? 'Unpin' : 'Pin';
  pinBtn.innerHTML = note.pinned
    ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.5 1a.5.5 0 0 0-.354.854L6 2.707V6L3 8v1h4v5l1 1 1-1V9h4V8L10 6V2.707l.854-.853A.5.5 0 0 0 10.5 1z"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M5.5 1.5h5l-.7 1.4V6L13 8.4V9H3v-.6L5.7 6V2.9z"/><path d="M8 9v5.5"/></svg>';
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    vscode.postMessage({ type: 'update', id: note.id, patch: { pinned: !note.pinned } });
  });
  card.append(pinBtn);

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    mkActionBtn('Copy', 'copy', note.id),
    mkActionBtn('Insert', 'insert', note.id),
    mkActionBtn('Chat', 'sendToChat', note.id),
    mkActionBtn('Edit', 'edit', note.id),
  );
  card.append(actions);

  const title = document.createElement('h3');
  title.className = 'title';
  title.textContent = note.title;
  card.append(title);

  const body = document.createElement('p');
  body.className = 'body';
  body.textContent = note.body;
  card.append(body);

  if (note.tags.length > 0) {
    const tags = document.createElement('div');
    tags.className = 'tags';
    for (const t of note.tags) {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag';
      tagEl.textContent = t;
      tags.append(tagEl);
    }
    card.append(tags);
  }

  card.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('.actions')) {
      return;
    }
    runAction(defaultAction, note);
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      runAction(defaultAction, note);
    }
  });

  return card;
}

function mkActionBtn(label, action, id) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const note = notes.find((n) => n.id === id);
    if (!note) {
      return;
    }
    runAction(action, note);
  });
  return b;
}

function runAction(action, note) {
  if (action === 'edit') {
    openEditor(note.id);
    return;
  }
  vscode.postMessage({ type: 'action', action, id: note.id });
}

function openEditor(id) {
  editingId = id;
  if (id) {
    const n = notes.find((x) => x.id === id);
    if (!n) {
      return;
    }
    els.editorTitle.textContent = 'Edit note';
    els.titleInput.value = n.title;
    els.tagsInput.value = n.tags.join(', ');
    els.bodyInput.value = n.body;
    els.editorDelete.hidden = false;
  } else {
    els.editorTitle.textContent = 'New note';
    els.titleInput.value = '';
    els.tagsInput.value = '';
    els.bodyInput.value = '';
    els.editorDelete.hidden = true;
  }
  setBodyMode('edit');
  els.backdrop.hidden = false;
  setTimeout(() => els.titleInput.focus(), 0);
}

function closeEditor() {
  els.backdrop.hidden = true;
  editingId = null;
}

function saveEditor() {
  const title = els.titleInput.value.trim();
  const body = els.bodyInput.value;
  const tags = els.tagsInput.value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (!title && !body) {
    showToast('Add a title or body before saving.', 'error');
    return;
  }
  if (editingId) {
    vscode.postMessage({
      type: 'update',
      id: editingId,
      patch: { title, tags, body },
    });
  } else {
    vscode.postMessage({
      type: 'create',
      draft: { title, tags, body },
    });
  }
  closeEditor();
}

function getAllExistingTags() {
  const set = new Set();
  for (const n of notes) {
    for (const t of n.tags) {
      set.add(t);
    }
  }
  return Array.from(set).sort();
}

function getCurrentTagToken() {
  const value = els.tagsInput.value;
  const lastComma = value.lastIndexOf(',');
  return value.slice(lastComma + 1).trim().toLowerCase();
}

function updateTagSuggestions() {
  const current = getCurrentTagToken();
  const used = els.tagsInput.value
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!current) {
    hideTagSuggestions();
    return;
  }
  const matches = getAllExistingTags()
    .filter((t) => t.startsWith(current) && t !== current && !used.includes(t))
    .slice(0, 8);
  if (matches.length === 0) {
    hideTagSuggestions();
    return;
  }
  currentSuggestions = matches;
  suggestionIndex = 0;
  renderTagSuggestions();
  tagSuggestions.hidden = false;
}

function renderTagSuggestions() {
  tagSuggestions.textContent = '';
  currentSuggestions.forEach((tag, i) => {
    const item = document.createElement('div');
    item.className = 'tag-suggestion' + (i === suggestionIndex ? ' active' : '');
    item.textContent = tag;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      acceptTagSuggestion(tag);
    });
    tagSuggestions.append(item);
  });
}

function hideTagSuggestions() {
  tagSuggestions.hidden = true;
  suggestionIndex = -1;
  currentSuggestions = [];
}

function handleTagSuggestionKey(e) {
  if (tagSuggestions.hidden || currentSuggestions.length === 0) {
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    suggestionIndex = (suggestionIndex + 1) % currentSuggestions.length;
    renderTagSuggestions();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    suggestionIndex = (suggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
    renderTagSuggestions();
  } else if (e.key === 'Tab' || e.key === 'Enter') {
    const pick = currentSuggestions[suggestionIndex];
    if (pick) {
      e.preventDefault();
      e.stopPropagation();
      acceptTagSuggestion(pick);
    }
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    hideTagSuggestions();
  }
}

function acceptTagSuggestion(tag) {
  const value = els.tagsInput.value;
  const lastComma = value.lastIndexOf(',');
  const prefix = lastComma >= 0 ? value.slice(0, lastComma + 1) + ' ' : '';
  els.tagsInput.value = prefix + tag + ', ';
  hideTagSuggestions();
  els.tagsInput.focus();
}

function setBodyMode(mode) {
  if (!els.bodyPreview || !els.bodyInput) {
    return;
  }
  if (mode === 'preview') {
    els.bodyPreview.innerHTML = marked.parse(els.bodyInput.value || '');
    els.bodyPreview.hidden = false;
    els.bodyInput.hidden = true;
    els.bodyModePreview?.classList.add('active');
    els.bodyModeEdit?.classList.remove('active');
    els.bodyModePreview?.setAttribute('aria-pressed', 'true');
    els.bodyModeEdit?.setAttribute('aria-pressed', 'false');
  } else {
    els.bodyPreview.hidden = true;
    els.bodyInput.hidden = false;
    els.bodyModeEdit?.classList.add('active');
    els.bodyModePreview?.classList.remove('active');
    els.bodyModeEdit?.setAttribute('aria-pressed', 'true');
    els.bodyModePreview?.setAttribute('aria-pressed', 'false');
    setTimeout(() => els.bodyInput.focus(), 0);
  }
}

function setViewMode(mode) {
  if (mode !== 'grid' && mode !== 'list') {
    return;
  }
  viewMode = mode;
  vscode.setState({ ...(vscode.getState() || {}), viewMode });
  applyViewMode();
}

function applyViewMode() {
  document.body.classList.toggle('view-list', viewMode === 'list');
  document.body.classList.toggle('view-grid', viewMode === 'grid');
  if (els.viewGrid && els.viewList) {
    const isGrid = viewMode === 'grid';
    els.viewGrid.classList.toggle('active', isGrid);
    els.viewList.classList.toggle('active', !isGrid);
    els.viewGrid.setAttribute('aria-pressed', String(isGrid));
    els.viewList.setAttribute('aria-pressed', String(!isGrid));
  }
}

let toastTimer = 0;
function showToast(message, level) {
  els.toast.textContent = message;
  els.toast.className = 'toast' + (level === 'error' ? ' error' : '');
  els.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}
