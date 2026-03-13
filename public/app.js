/* ================================================================
   Dark Intentions Loot Manager — Frontend App
   ================================================================ */

'use strict';

// ── DOM helpers ──────────────────────────────────────────────────
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showMessage(tabId, type, text) {
  const el = $(`#${tabId}-message`);
  if (!el) return;
  el.className = `message ${type}`;
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 6000);
}

// ── WoW Class → CSS class mapping ───────────────────────────────
const CLASS_CSS = {
  'death knight':  'class-death-knight',
  'demon hunter':  'class-demon-hunter',
  'druid':         'class-druid',
  'evoker':        'class-evoker',
  'hunter':        'class-hunter',
  'mage':          'class-mage',
  'monk':          'class-monk',
  'paladin':       'class-paladin',
  'priest':        'class-priest',
  'rogue':         'class-rogue',
  'shaman':        'class-shaman',
  'warlock':       'class-warlock',
  'warrior':       'class-warrior',
};

function classCss(className) {
  if (!className) return '';
  return CLASS_CSS[className.toLowerCase()] || '';
}

// ── All 16 WoW gear slots (display order) ───────────────────────
const GEAR_SLOTS = [
  'Head',      'Neck',
  'Shoulder',  'Back',
  'Chest',     'Wrist',
  'Hands',     'Waist',
  'Legs',      'Feet',
  'Ring 1',    'Ring 2',
  'Trinket 1', 'Trinket 2',
  'Main Hand', 'Off Hand',
];

// ================================================================
//  SIDEBAR / HAMBURGER
// ================================================================
const hamburger = $('#hamburger');
const sidebar   = $('#sidebar');
const mainEl    = $('#main-content');
const overlay   = $('#sidebar-overlay');

let sidebarOpen = true;

function setSidebar(open) {
  sidebarOpen = open;
  sidebar.classList.toggle('closed', !open);
  mainEl.classList.toggle('sidebar-open', open);
  hamburger.classList.toggle('open', open);
  // Only show overlay on mobile
  overlay.classList.toggle('visible', open && window.innerWidth <= 768);
}

function toggleSidebar() { setSidebar(!sidebarOpen); }

hamburger.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);

// On mobile, start with sidebar closed
if (window.innerWidth <= 768) {
  setSidebar(false);
} else {
  setSidebar(true);
}

// ================================================================
//  TAB SWITCHING
// ================================================================
const tabLoaded = {};

function switchTab(name) {
  $$('.nav-item').forEach(li => li.classList.remove('active'));
  $$('.tab-panel').forEach(panel => panel.classList.remove('active'));

  $(`.nav-item[data-tab="${name}"]`).classList.add('active');
  $(`#tab-${name}`).classList.add('active');

  // Lazy-load tab data on first visit
  if (!tabLoaded[name]) {
    tabLoaded[name] = true;
    if (name === 'roster') loadRoster();
    if (name === 'epgp')   loadEpgp();
    if (name === 'admin')  loadAdminSettings();
  }
}

$$('.nav-item').forEach(li => {
  li.addEventListener('click', () => switchTab(li.dataset.tab));
});

// ================================================================
//  ROSTER TAB
// ================================================================
async function loadRoster() {
  const tbody = $('#roster-tbody');
  tbody.innerHTML = '<tr class="empty-row"><td colspan="8" class="loading">Loading roster…</td></tr>';

  try {
    const res  = await fetch('/api/roster');
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    if (data.roster && data.roster.length > 0) {
      renderRoster(data.roster);
    } else {
      tbody.innerHTML =
        '<tr class="empty-row"><td colspan="8">No roster data. Click "Sync from WoWAudit" to load characters.</td></tr>';
    }
  } catch (err) {
    tbody.innerHTML =
      `<tr class="empty-row"><td colspan="8">Error loading roster: ${escHtml(err.message)}</td></tr>`;
  }
}

function renderRoster(roster) {
  const tbody = $('#roster-tbody');
  tbody.innerHTML = roster.map(c => {
    const css    = classCss(c.class);
    const status = (c.status || 'active').toLowerCase();
    const rank   = c.rank_name
      ? escHtml(c.rank_name)
      : (c.rank !== null && c.rank !== undefined ? c.rank : '—');
    const ilvl   = c.ilvl ? Number(c.ilvl).toFixed(1) : '—';

    return `
      <tr>
        <td><span class="char-name ${css}">${escHtml(c.name)}</span></td>
        <td>${escHtml(c.realm || '—')}</td>
        <td class="${css}">${escHtml(c.class || '—')}</td>
        <td>${escHtml(c.spec || '—')}</td>
        <td>${escHtml(c.role || '—')}</td>
        <td>${rank}</td>
        <td>${ilvl}</td>
        <td><span class="status-badge status-${escHtml(status)}">${escHtml(status)}</span></td>
      </tr>`;
  }).join('');
}

$('#sync-roster-btn').addEventListener('click', async () => {
  const btn = $('#sync-roster-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> Syncing…';

  try {
    const res  = await fetch('/api/roster', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showMessage('roster', 'success', `✓ ${data.message}`);
      tabLoaded.roster = false;   // force re-render
      await loadRoster();
      tabLoaded.roster = true;
    } else {
      showMessage('roster', 'error', `✗ ${data.error || 'Sync failed'}`);
    }
  } catch (err) {
    showMessage('roster', 'error', `✗ Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🔄</span> Sync from WoWAudit';
  }
});

// ================================================================
//  EPGP TAB
// ================================================================
async function loadEpgp() {
  try {
    const res  = await fetch('/api/epgp');
    const data = await res.json();

    if (data.error) throw new Error(data.error);
    renderEpgpTable(data.gear_values || []);
  } catch (err) {
    showMessage('epgp', 'error', `✗ Error loading EPGP data: ${err.message}`);
    renderEpgpTable([]);
  }
}

function renderEpgpTable(gearValues) {
  const tbody = $('#epgp-tbody');

  // Build lookup by slot_name
  const lookup = {};
  gearValues.forEach(v => { lookup[v.slot_name] = v; });

  // 4-column layout: 8 rows × (Slot | Value | Slot | Value)
  let html = '';
  for (let i = 0; i < GEAR_SLOTS.length; i += 2) {
    const leftSlot  = GEAR_SLOTS[i];
    const rightSlot = GEAR_SLOTS[i + 1];
    const leftVal   = lookup[leftSlot]?.point_value  ?? 0;
    const rightVal  = lookup[rightSlot]?.point_value ?? 0;

    html += `
      <tr>
        <td class="slot-name">${escHtml(leftSlot)}</td>
        <td>
          <input
            type="number"
            class="gear-input"
            data-slot="${escHtml(leftSlot)}"
            value="${leftVal}"
            min="0"
            step="1"
          >
        </td>
        <td class="slot-name">${escHtml(rightSlot)}</td>
        <td>
          <input
            type="number"
            class="gear-input"
            data-slot="${escHtml(rightSlot)}"
            value="${rightVal}"
            min="0"
            step="1"
          >
        </td>
      </tr>`;
  }

  tbody.innerHTML = html;
}

$('#save-epgp-btn').addEventListener('click', async () => {
  const btn = $('#save-epgp-btn');
  btn.disabled = true;

  const gear_values = Array.from($$('.gear-input')).map(input => ({
    slot_name:   input.dataset.slot,
    point_value: parseInt(input.value, 10) || 0,
  }));

  try {
    const res  = await fetch('/api/epgp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gear_values }),
    });
    const data = await res.json();

    if (data.success) {
      showMessage('epgp', 'success', `✓ ${data.message}`);
    } else {
      showMessage('epgp', 'error', `✗ ${data.error || 'Save failed'}`);
    }
  } catch (err) {
    showMessage('epgp', 'error', `✗ Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

// ================================================================
//  ADMIN TAB
// ================================================================
async function loadAdminSettings() {
  try {
    const res  = await fetch('/api/settings');
    const data = await res.json();
    if (data.api_key) {
      $('#api-key-input').value = data.api_key;
    }
  } catch {
    // Key may just not be set yet; fail silently
  }
}

// Toggle API key visibility
$('#toggle-api-key').addEventListener('click', () => {
  const input = $('#api-key-input');
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  $('#toggle-api-key').textContent = isPassword ? '🙈' : '👁';
});

$('#save-admin-btn').addEventListener('click', async () => {
  const btn    = $('#save-admin-btn');
  const apiKey = $('#api-key-input').value.trim();

  if (!apiKey) {
    showMessage('admin', 'error', '✗ API key cannot be empty.');
    return;
  }

  btn.disabled = true;

  try {
    const res  = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'wowaudit_api_key', value: apiKey }),
    });
    const data = await res.json();

    if (data.success) {
      showMessage('admin', 'success', `✓ ${data.message}`);
    } else {
      showMessage('admin', 'error', `✗ ${data.error || 'Save failed'}`);
    }
  } catch (err) {
    showMessage('admin', 'error', `✗ Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

// ================================================================
//  INIT — load default tab
// ================================================================
(function init() {
  tabLoaded.roster = true;
  loadRoster();
})();
