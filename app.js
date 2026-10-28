'use strict';

const STORE_KEY = 'taskhelper.v1';
const COLORS = ['#e07a5f', '#f2a541', '#2a9d8f', '#3d8bfd', '#9b5de5', '#e05fa0', '#7c8696'];

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const ICON = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

// ---------- dates (local YYYY-MM-DD strings; compare as strings) ----------

const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toISO(new Date());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); };
const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000); // a minus b
const fmt = s => parseISO(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function relative(s) {
  const n = diffDays(s, today());
  if (n === 0) return 'today';
  if (n === -1) return 'yesterday';
  if (n === 1) return 'tomorrow';
  return n < 0 ? `${-n} days ago` : `in ${n} days`;
}

function everyLabel(n) {
  if (n === 1) return 'daily';
  if (n === 7) return 'weekly';
  if (n % 7 === 0) return `every ${n / 7} weeks`;
  return `every ${n} days`;
}

// ---------- state ----------

const newTask = props => ({
  id: uid(), created: Date.now(), title: '', groupId: null, notes: '',
  due: null, today: false, done: false, doneOn: null,
  every: null, lastDone: null, history: [],
  ...props,
});

function seed() {
  const g = (name, color, choreDefault = false) => ({ id: uid(), name, color, choreDefault });
  return {
    groups: [
      g('Chores', COLORS[0], true),
      g('Home Deep Clean', COLORS[3]),
      g('LED Development', COLORS[4]),
      g('LED Operations', COLORS[2]),
    ],
    tasks: [],
    lastExport: null,
  };
}

function normalize(data) {
  return {
    groups: data.groups.map(g => ({ choreDefault: false, color: COLORS[6], ...g })),
    tasks: data.tasks.map(t => newTask(t)),
    lastExport: data.lastExport ?? null,
  };
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (data && Array.isArray(data.groups) && Array.isArray(data.tasks)) return normalize(data);
  } catch { /* fall through to seed */ }
  return seed();
}

let state = load();
const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(state));
save(); // persist the seed immediately so group ids stay stable across reloads
const task = id => state.tasks.find(t => t.id === id);
const group = id => state.groups.find(g => g.id === id);

// ---------- chore logic ----------

const isChore = t => !!t.every;
// Never-done chores are due immediately; otherwise due `every` days after the last completion.
const nextDue = t => t.lastDone ? addDays(t.lastDone, t.every) : today();
const isDone = t => isChore(t) ? t.lastDone === today() : t.done;
const byNextDue = (a, b) => nextDue(a).localeCompare(nextDue(b)) || a.title.localeCompare(b.title);
const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.created - b.created;

function toggleDone(t) {
  const t0 = today();
  if (isChore(t)) {
    if (t.lastDone === t0) {
      t.history.shift();
      t.lastDone = t.history[0] ?? null;
    } else {
      t.history = [t0, ...t.history].slice(0, 50);
      t.lastDone = t0;
      t.today = false;
      toast(`Done. Next due ${fmt(nextDue(t))}`, () => toggleDone(task(t.id)));
    }
  } else {
    t.done = !t.done;
    t.doneOn = t.done ? t0 : null;
    if (t.done) toast('Task completed', () => toggleDone(task(t.id)));
  }
  save();
  render();
}

// ---------- rendering ----------

function choreMeta(t) {
  const overdue = diffDays(today(), nextDue(t));
  const last = t.lastDone
    ? `Last done ${fmt(t.lastDone)} (${relative(t.lastDone)})`
    : 'Never done';
  let status;
  if (t.lastDone === today()) status = `next ${fmt(nextDue(t))}`;
  else if (overdue > 0) status = `<span class="overdue">${overdue}d overdue</span>`;
  else if (overdue === 0) status = '<span class="due-now">due today</span>';
  else status = `due ${relative(nextDue(t))}`;
  return `<span${overdue > 0 ? ' class="overdue"' : ''}>${last}</span><span>${everyLabel(t.every)} · ${status}</span>`;
}

function dueMeta(t) {
  const n = diffDays(t.due, today());
  if (t.done) return `<span>Due ${fmt(t.due)}</span>`;
  if (n < 0) return `<span class="overdue">Overdue · ${fmt(t.due)}</span>`;
  if (n === 0) return '<span class="due-now">Due today</span>';
  return `<span>Due ${fmt(t.due)} (${relative(t.due)})</span>`;
}

function row(t, { showGroup = true } = {}) {
  const g = group(t.groupId);
  const done = isDone(t);
  const meta = [];
  if (showGroup && g) meta.push(`<span class="chip" style="--c:${g.color}">${esc(g.name)}</span>`);
  if (isChore(t)) meta.push(choreMeta(t));
  else if (t.due) meta.push(dueMeta(t));
  if (t.notes) meta.push('<span>Notes</span>');

  // Due chores are forced onto Today, so they get no pin toggle.
  const pinnable = !done && !(isChore(t) && nextDue(t) <= today());
  const pin = pinnable
    ? `<button class="pin" data-action="toggle-today" aria-pressed="${!!t.today}" aria-label="${t.today ? 'Remove from Today' : 'Add to Today'}" title="${t.today ? 'Remove from Today' : 'Add to Today'}">${ICON.sun}</button>`
    : '';

  return `<li class="task${isChore(t) ? ' chore' : ''}${done ? ' done' : ''}" data-id="${t.id}">
    <button class="check" data-action="toggle-done" aria-label="${done ? 'Mark not done' : 'Mark done'}"></button>
    <button class="body" data-action="edit"><span class="title">${esc(t.title)}</span>${meta.length ? `<span class="meta">${meta.join('')}</span>` : ''}</button>
    ${pin}
  </li>`;
}

const list = (tasks, opts) => `<ul class="list">${tasks.map(t => row(t, opts)).join('')}</ul>`;

const section = (title, tasks, opts) => tasks.length
  ? `<section><h2>${title}<span class="count">${tasks.length}</span></h2>${list(tasks, opts)}</section>`
  : '';

function viewToday() {
  const t0 = today();
  const chores = state.tasks.filter(t => isChore(t) && t.lastDone !== t0 && (nextDue(t) <= t0 || t.today)).sort(byNextDue);
  const planned = state.tasks.filter(t => !isChore(t) && !t.done && t.today).sort(byDue);
  const soon = state.tasks.filter(t => !isChore(t) && !t.done && !t.today && t.due && t.due <= addDays(t0, 2)).sort(byDue);
  const done = state.tasks.filter(t => isChore(t) ? t.lastDone === t0 : t.done && t.doneOn === t0);

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const summary = [chores.length && `${chores.length} chore${chores.length > 1 ? 's' : ''} due`, planned.length && `${planned.length} planned`]
    .filter(Boolean).join(' · ') || 'All clear';

  const empty = !chores.length && !planned.length
    ? `<div class="empty">Nothing on your plate.<br>Tap ☀ on any task in Groups to pull it into today.</div>`
    : '';

  return `
    <div class="view-head"><h1>Today</h1></div>
    <p class="sub">${dateLabel} · ${summary}</p>
    ${section('Chores due', chores)}
    ${section('Planned', planned)}
    ${empty}
    ${soon.length ? `<section style="margin-top:24px"><h2>Due soon. Add to Today?<span class="count">${soon.length}</span></h2>${list(soon)}</section>` : ''}
    ${done.length ? `<details><summary>Done today (${done.length})</summary>${list(done)}</details>` : ''}
  `;
}

function viewGroups() {
  const t0 = today();
  const cards = state.groups.map(g => {
    const tasks = state.tasks.filter(t => t.groupId === g.id);
    const open = tasks.filter(t => !isChore(t) && !t.done).length;
    const chores = tasks.filter(isChore);
    const due = chores.filter(t => t.lastDone !== t0 && nextDue(t) <= t0).length;
    const stats = [
      open && `${open} open`,
      chores.length && `${chores.length} chore${chores.length > 1 ? 's' : ''}`,
      due && `<span class="overdue">${due} due</span>`,
    ].filter(Boolean).join('<br>') || 'Empty';
    return `<a class="group-card" href="#group/${g.id}" style="--c:${g.color}"><span class="name">${esc(g.name)}</span><span class="stats">${stats}</span></a>`;
  }).join('');

  return `
    <div class="view-head"><h1>Groups</h1>
      <button class="icon-btn" data-action="add-group" aria-label="New group">${ICON.plus}</button>
    </div>
    <p class="sub">Tap a group to see and add its tasks.</p>
    <div class="groups">${cards || '<div class="empty">No groups yet.</div>'}</div>
  `;
}

function viewGroup(id) {
  const g = group(id);
  if (!g) { location.hash = '#groups'; return ''; }
  const tasks = state.tasks.filter(t => t.groupId === g.id);
  const chores = tasks.filter(isChore).sort(byNextDue);
  const open = tasks.filter(t => !isChore(t) && !t.done).sort((a, b) => b.today - a.today || byDue(a, b));
  const completed = tasks.filter(t => !isChore(t) && t.done).sort((a, b) => (b.doneOn || '').localeCompare(a.doneOn || ''));

  return `
    <div class="view-head">
      <a class="icon-btn" href="#groups" aria-label="Back to groups">${ICON.back}</a>
      <h1>${esc(g.name)}</h1>
      <button class="icon-btn" data-action="edit-group" data-gid="${g.id}" aria-label="Edit group">${ICON.edit}</button>
    </div>
    <p class="sub">${g.choreDefault ? 'New tasks here repeat as chores.' : 'Tap ☀ to put a task on Today.'}</p>
    <form class="quick-add" data-gid="${g.id}">
      <input name="title" placeholder="${g.choreDefault ? 'Add a chore (weekly)…' : 'Add a task…'}" autocomplete="off" enterkeyhint="done">
      <button class="btn primary">Add</button>
    </form>
    ${section('Chores', chores, { showGroup: false })}
    ${section('Tasks', open, { showGroup: false })}
    ${!tasks.length ? '<div class="empty">No tasks yet. Add one above.</div>' : ''}
    ${completed.length ? `<details><summary>Completed (${completed.length})</summary>${list(completed, { showGroup: false })}
      <p><button class="btn" data-action="clear-completed" data-gid="${g.id}">Clear completed</button></p></details>` : ''}
  `;
}

function viewChores() {
  const t0 = today();
  const chores = state.tasks.filter(isChore).sort(byNextDue);
  const due = chores.filter(t => t.lastDone !== t0 && nextDue(t) <= t0);
  const later = chores.filter(t => !due.includes(t));
  return `
    <div class="view-head"><h1>Chores</h1></div>
    <p class="sub">Each chore repeats from the day you last did it.</p>
    ${section('Due now', due)}
    ${section('Coming up', later)}
    ${!chores.length ? '<div class="empty">No chores yet.<br>Add one in the Chores group, or turn on “Repeating chore” for any task.</div>' : ''}
  `;
}

function viewMore() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const backupAge = state.lastExport ? diffDays(today(), state.lastExport) : null;
  return `
    <div class="view-head"><h1>More</h1></div>
    <p class="sub">Backup and setup.</p>
    <section><h2>Backup</h2><div class="card">
      <p>Tasks are saved only on this device. Export a backup now and then, or to move your tasks to another device.</p>
      <p class="${backupAge === null || backupAge > 14 ? 'overdue' : ''}">${state.lastExport ? `Last backup: ${fmt(state.lastExport)} (${relative(state.lastExport)})` : 'No backup yet'}</p>
      <div class="btn-row">
        <button class="btn primary" data-action="export">Export backup</button>
        <button class="btn" data-action="import">Import backup</button>
      </div>
    </div></section>
    <section><h2>Home screen</h2><div class="card">
      ${standalone
        ? '<p>Running as a home screen app ✓</p>'
        : `<p><b>iPhone:</b> open this page in Safari → Share → <i>Add to Home Screen</i>.</p>
           <p><b>Android:</b> open in Chrome → ⋮ menu → <i>Add to Home screen</i> / <i>Install app</i>.</p>`}
    </div></section>
  `;
}

const VIEWS = { today: viewToday, groups: viewGroups, group: viewGroup, chores: viewChores, more: viewMore };

function render() {
  const [view, id] = (location.hash.slice(1) || 'today').split('/');
  const tab = view === 'group' ? 'groups' : view;
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.view === tab));
  $('#main').innerHTML = (VIEWS[view] || viewToday)(id);
}

// ---------- toast ----------

let toastTimer;
function toast(message, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button>Undo</button>' : ''}`;
  el.hidden = false;
  if (undo) el.querySelector('button').onclick = () => { el.hidden = true; undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

// ---------- task editor ----------

let editingTaskId = null;

function openTaskEditor(t, defaults = {}) {
  editingTaskId = t?.id ?? null;
  const dialog = $('#taskDialog');
  const f = $('#taskForm').elements;
  const g = group(t?.groupId ?? defaults.groupId) ?? state.groups[0];

  $('#taskDialogTitle').textContent = t ? 'Edit task' : 'New task';
  f.groupId.innerHTML = state.groups.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  f.title.value = t?.title ?? '';
  f.groupId.value = g?.id ?? '';
  f.repeat.checked = t ? isChore(t) : !!g?.choreDefault;
  f.every.value = t?.every ?? 7;
  f.lastDone.value = t?.lastDone ?? '';
  f.lastDone.max = today();
  f.due.value = t?.due ?? '';
  f.today.checked = t ? !!t.today : !!defaults.today;
  f.notes.value = t?.notes ?? '';
  $('#deleteTask').hidden = !t;

  dialog.returnValue = '';
  dialog.showModal();
  if (!t) f.title.focus();
}

$('#taskForm').elements.groupId.addEventListener('change', e => {
  if (!editingTaskId) $('#taskForm').elements.repeat.checked = !!group(e.target.value)?.choreDefault;
});

$('#taskDialog').addEventListener('close', () => {
  if ($('#taskDialog').returnValue !== 'save') return;
  const f = $('#taskForm').elements;
  const title = f.title.value.trim();
  if (!title) return;

  const t = editingTaskId ? task(editingTaskId) : newTask();
  Object.assign(t, { title, groupId: f.groupId.value, notes: f.notes.value.trim() });

  if (f.repeat.checked) {
    t.every = Math.max(1, parseInt(f.every.value, 10) || 7);
    const lastDone = f.lastDone.value || null;
    if (lastDone !== t.lastDone) {
      t.lastDone = lastDone;
      t.history = lastDone ? [lastDone, ...t.history.filter(d => d < lastDone)] : [];
    }
    t.due = null;
    t.done = false;
    t.doneOn = null;
  } else {
    t.every = null;
    t.lastDone = null;
    t.history = [];
    t.due = f.due.value || null;
    t.today = f.today.checked;
  }

  if (!editingTaskId) state.tasks.push(t);
  save();
  render();
});

$('#deleteTask').addEventListener('click', () => {
  const t = task(editingTaskId);
  if (!t || !confirm(`Delete “${t.title}”?`)) return;
  state.tasks = state.tasks.filter(x => x.id !== t.id);
  save();
  $('#taskDialog').close();
  render();
});

// ---------- group editor ----------

let editingGroupId = null;

function openGroupEditor(g) {
  editingGroupId = g?.id ?? null;
  const dialog = $('#groupDialog');
  const f = $('#groupForm').elements;
  const color = g?.color ?? COLORS[state.groups.length % COLORS.length];

  $('#groupDialogTitle').textContent = g ? 'Edit group' : 'New group';
  $('#swatches').innerHTML = '<legend>Color</legend>' + COLORS.map(c =>
    `<input type="radio" name="color" value="${c}" style="--c:${c}" aria-label="${c}"${c === color ? ' checked' : ''}>`).join('');
  f.name.value = g?.name ?? '';
  f.choreDefault.checked = !!g?.choreDefault;
  $('#deleteGroup').hidden = !g;

  dialog.returnValue = '';
  dialog.showModal();
  if (!g) f.name.focus();
}

$('#groupDialog').addEventListener('close', () => {
  if ($('#groupDialog').returnValue !== 'save') return;
  const f = $('#groupForm').elements;
  const name = f.name.value.trim();
  if (!name) return;
  const props = { name, color: f.color.value || COLORS[6], choreDefault: f.choreDefault.checked };
  if (editingGroupId) {
    Object.assign(group(editingGroupId), props);
  } else {
    const g = { id: uid(), ...props };
    state.groups.push(g);
    location.hash = `#group/${g.id}`;
  }
  save();
  render();
});

$('#deleteGroup').addEventListener('click', () => {
  const g = group(editingGroupId);
  const count = state.tasks.filter(t => t.groupId === g.id).length;
  if (!confirm(`Delete “${g.name}”${count ? ` and its ${count} task${count > 1 ? 's' : ''}` : ''}?`)) return;
  state.groups = state.groups.filter(x => x.id !== g.id);
  state.tasks = state.tasks.filter(t => t.groupId !== g.id);
  save();
  $('#groupDialog').close();
  location.hash = '#groups';
  render();
});

// ---------- backup ----------

async function exportData() {
  const name = `task-helper-backup-${today()}.json`;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  try {
    // On phones the share sheet is the reliable way to save a file (Files, Drive, email…).
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Task Helper backup' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    state.lastExport = today();
    save();
    render();
  } catch (err) {
    if (err.name !== 'AbortError') alert(`Export failed: ${err.message}`);
  }
}

$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.groups) || !Array.isArray(data.tasks)) throw new Error('That file is not a Task Helper backup.');
    if (!confirm(`Replace everything on this device with the backup (${data.groups.length} groups, ${data.tasks.length} tasks)?`)) return;
    state = normalize(data);
    save();
    location.hash = '#today';
    render();
    toast('Backup restored');
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
});

// ---------- events ----------

const ACTIONS = {
  'toggle-done': t => toggleDone(t),
  'toggle-today': t => { t.today = !t.today; save(); render(); },
  'edit': t => openTaskEditor(t),
  'add-group': () => openGroupEditor(null),
  'edit-group': (_, el) => openGroupEditor(group(el.dataset.gid)),
  'clear-completed': (_, el) => {
    state.tasks = state.tasks.filter(t => !(t.groupId === el.dataset.gid && !isChore(t) && t.done));
    save();
    render();
  },
  'export': () => exportData(),
  'import': () => $('#importFile').click(),
};

document.addEventListener('click', e => {
  const close = e.target.closest('[data-close]');
  if (close) { close.closest('dialog').close(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = el.closest('[data-id]')?.dataset.id;
  ACTIONS[el.dataset.action]?.(id ? task(id) : null, el);
});

document.addEventListener('submit', e => {
  const form = e.target.closest('.quick-add');
  if (!form) return;
  e.preventDefault();
  const title = form.elements.title.value.trim();
  if (!title) return;
  const g = group(form.dataset.gid);
  state.tasks.push(newTask({ title, groupId: g.id, every: g.choreDefault ? 7 : null }));
  save();
  render();
  $('.quick-add input')?.focus();
});

$('#fab').addEventListener('click', () => {
  const [view, id] = location.hash.slice(1).split('/');
  if (view === 'group') openTaskEditor(null, { groupId: id });
  else if (view === 'chores') openTaskEditor(null, { groupId: state.groups.find(g => g.choreDefault)?.id });
  else openTaskEditor(null, { today: view === 'today' || !view });
});

window.addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

// Re-render when the app is reopened or the date rolls over, so due chores appear.
let renderedDay = today();
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
setInterval(() => { if (today() !== renderedDay) { renderedDay = today(); render(); } }, 60000);

render();
navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
