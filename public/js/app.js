// app.js - small plain functions, no libraries.
// Sections: theme, sidebar, toasts, confirm dialog, form submit, live table filter, password match, start-up.

// ---------- Theme (light / dark), remembered in localStorage ----------
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('theme', theme); } catch (e) {}
}

function toggleTheme() {
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  setTheme(isDark ? 'light' : 'dark');
}

// ---------- Sidebar on small screens ----------
function toggleSidebar(open) {
  document.body.classList.toggle('sidebar-open', open);
}

// ---------- Toast messages ----------
function showToast(type, text) {
  var box = document.getElementById('toasts');
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + (type === 'error' ? 'error' : 'success');
  toast.textContent = text;                       // textContent: the text is never treated as HTML

  function close() {
    toast.classList.add('hide');
    setTimeout(function () { toast.remove(); }, 300);
  }
  toast.addEventListener('click', close);         // click to dismiss
  box.appendChild(toast);
  setTimeout(close, 4500);                        // or disappears by itself
}

// The server leaves the flash message in a hidden element, show it as a toast
function showFlash() {
  var data = document.getElementById('flash-data');
  if (data) showToast(data.getAttribute('data-type'), data.getAttribute('data-text'));
}

// ---------- Confirm dialog (used instead of the browser's confirm()) ----------
function openConfirm(message, onYes) {
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true">' +
    '<p class="modal-text"></p>' +
    '<div class="modal-actions">' +
    '<button type="button" class="btn btn-ghost" data-no>Cancel</button>' +
    '<button type="button" class="btn btn-danger" data-yes>Confirm</button>' +
    '</div></div>';
  overlay.querySelector('.modal-text').textContent = message;
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  overlay.querySelector('[data-no]').addEventListener('click', close);
  overlay.querySelector('[data-yes]').addEventListener('click', function () { close(); onYes(); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  overlay.querySelector('[data-no]').focus();
}

// ---------- Form submit: confirm dialog + stop double clicks ----------
// A form with data-confirm="Are you sure?" asks first. Every form disables its buttons after submit.
function lockButtons(form) {
  setTimeout(function () {                        // after the browser has read the form values
    form.querySelectorAll('button[type="submit"]').forEach(function (btn) {
      btn.disabled = true;
      btn.setAttribute('data-label', btn.textContent);
      btn.textContent = 'Please wait...';
    });
  }, 0);
}

function unlockButtons() {                         // when the Back button shows a cached page
  document.querySelectorAll('button[type="submit"][data-label]').forEach(function (btn) {
    btn.disabled = false;
    btn.textContent = btn.getAttribute('data-label');
    btn.removeAttribute('data-label');
  });
}

function onSubmit(e) {
  var form = e.target;
  var message = form.getAttribute('data-confirm');
  if (message && !form.dataset.confirmed) {
    e.preventDefault();
    openConfirm(message, function () {
      form.dataset.confirmed = '1';
      form.requestSubmit();                        // submits again, this time without asking
    });
    return;
  }
  lockButtons(form);
}

// ---------- Live search: <input data-filter="tableId"> hides rows that do not match ----------
function setupLiveFilter(input) {
  var table = document.getElementById(input.getAttribute('data-filter'));
  if (!table) return;
  input.addEventListener('input', function () {
    var text = input.value.toLowerCase();
    table.querySelectorAll('tbody tr').forEach(function (row) {
      row.hidden = row.textContent.toLowerCase().indexOf(text) === -1;
    });
  });
}

// ---------- Password match: <input data-match="#other"> must equal the other field ----------
function setupMatch(input) {
  var other = document.querySelector(input.getAttribute('data-match'));
  if (!other) return;
  function check() {
    input.setCustomValidity(input.value === other.value ? '' : 'The two passwords do not match');
  }
  input.addEventListener('input', check);
  other.addEventListener('input', check);
}

// ---------- Room map: clicking a free room tile selects it in the allocate form ----------
function setupRoomMap() {
  var select = document.getElementById('allocate-room');
  var tiles = document.querySelectorAll('.room-tile');
  tiles.forEach(function (tile) {
    tile.addEventListener('click', function () {
      if (!select) return;
      select.value = tile.getAttribute('data-room-id');
      tiles.forEach(function (t) { t.classList.remove('selected'); });
      tile.classList.add('selected');
      select.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

// ---------- Print button: <button data-print> prints the page (fee receipt) ----------
function setupPrint() {
  document.querySelectorAll('[data-print]').forEach(function (btn) {
    btn.addEventListener('click', function () { window.print(); });
  });
}

// ---------- Dashboard charts (Chart.js is loaded only on the dashboard page) ----------
function drawDashboardCharts() {
  var holder = document.getElementById('dashboard-data');
  if (!holder || typeof Chart === 'undefined') return;
  var data = JSON.parse(holder.textContent);
  var colors = ['#4f46e5', '#16a34a', '#d97706', '#dc2626', '#0284c7', '#8b5cf6'];
  Chart.defaults.color = getComputedStyle(document.body).color;   // follows the current theme (reload after switching)
  Chart.defaults.maintainAspectRatio = false;

  function draw(id, config) {
    var canvas = document.getElementById(id);
    if (canvas) new Chart(canvas, config);
  }
  var noLegend = { legend: { display: false } };
  var fromZero = { y: { beginAtZero: true, ticks: { precision: 0 } } };

  draw('chart-status', { type: 'doughnut', data: { labels: data.status.labels, datasets: [{ data: data.status.values, backgroundColor: colors }] } });
  draw('chart-category', { type: 'bar', data: { labels: data.category.labels, datasets: [{ data: data.category.values, backgroundColor: colors[0] }] }, options: { plugins: noLegend, scales: fromZero } });
  draw('chart-fees', { type: 'bar', data: { labels: data.fees.labels, datasets: [
    { label: 'Collected', data: data.fees.collected, backgroundColor: colors[1] },
    { label: 'Pending', data: data.fees.pending, backgroundColor: colors[2] }] }, options: { scales: { y: { beginAtZero: true } } } });
  draw('chart-running', { type: 'line', data: { labels: data.running.labels, datasets: [{ data: data.running.values, borderColor: colors[0], tension: 0.2 }] }, options: { plugins: noLegend, scales: { y: { beginAtZero: true } } } });
  draw('chart-days', { type: 'bar', data: { labels: data.days.labels, datasets: [{ data: data.days.values, backgroundColor: colors[4] }] }, options: { plugins: noLegend, scales: fromZero } });
}

// ---------- Start-up ----------
document.addEventListener('DOMContentLoaded', function () {
  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  var menuBtn = document.getElementById('menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', function () { toggleSidebar(true); });
  var overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.addEventListener('click', function () { toggleSidebar(false); });

  document.addEventListener('submit', onSubmit);
  document.querySelectorAll('[data-filter]').forEach(setupLiveFilter);
  document.querySelectorAll('[data-match]').forEach(setupMatch);
  showFlash();
  setupRoomMap();
  setupPrint();
  drawDashboardCharts();
});

window.addEventListener('pageshow', unlockButtons);
