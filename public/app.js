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
let rosterData = [];
let rosterSortKey = null;
let rosterSortDir = 'asc';

async function loadRoster() {
  const tbody = $('#roster-tbody');
  tbody.innerHTML = '<tr class="empty-row"><td colspan="5" class="loading">Loading roster…</td></tr>';

  try {
    const res  = await fetch('/api/roster');
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    if (data.roster && data.roster.length > 0) {
      // Filter out Social rank members
      rosterData = data.roster.filter(c =>
        c.rank && c.rank.toLowerCase() !== 'social'
      );
      renderRoster(rosterData);
    } else {
      tbody.innerHTML =
        '<tr class="empty-row"><td colspan="5">No roster data. Click "Sync from WoWAudit" to load characters.</td></tr>';
    }
  } catch (err) {
    tbody.innerHTML =
      `<tr class="empty-row"><td colspan="5">Error loading roster: ${escHtml(err.message)}</td></tr>`;
  }
}

function renderRoster(roster) {
  const tbody = $('#roster-tbody');
  if (roster.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No matching roster members.</td></tr>';
    return;
  }

  tbody.innerHTML = roster.map(c => {
    const css    = classCss(c.class);
    const status = (c.status || 'active').toLowerCase();

    return `
      <tr>
        <td><span class="char-name ${css}">${escHtml(c.name)}</span></td>
        <td>${escHtml(c.realm || '—')}</td>
        <td class="${css}">${escHtml(c.class || '—')}</td>
        <td>${escHtml(c.role || '—')}</td>
        <td><span class="status-badge status-${escHtml(status)}">${escHtml(status)}</span></td>
      </tr>`;
  }).join('');
}

function sortRoster(key) {
  if (rosterSortKey === key) {
    rosterSortDir = rosterSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    rosterSortKey = key;
    rosterSortDir = 'asc';
  }

  // Update header styles
  $$('.sortable-header').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
  $(`.sortable-header[data-sort="${key}"]`).classList.add(`sort-${rosterSortDir}`);

  // Sort data
  const sorted = [...rosterData].sort((a, b) => {
    const aVal = String(a[key] || '').toLowerCase();
    const bVal = String(b[key] || '').toLowerCase();
    const cmp = aVal.localeCompare(bVal);
    return rosterSortDir === 'asc' ? cmp : -cmp;
  });

  renderRoster(sorted);
}

function filterRoster(query) {
  const q = query.toLowerCase();
  const filtered = rosterData.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.realm || '').toLowerCase().includes(q) ||
    (c.class || '').toLowerCase().includes(q) ||
    (c.role || '').toLowerCase().includes(q) ||
    (c.rank || '').toLowerCase().includes(q)
  );

  renderRoster(filtered);
}

// Sort header listeners
$$('.sortable-header').forEach(h => {
  h.addEventListener('click', () => sortRoster(h.dataset.sort));
});

// Filter input listener
$('#roster-search').addEventListener('input', (e) => {
  filterRoster(e.target.value);
});

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
    populateRosterDropdowns();
  } catch (err) {
    showMessage('epgp', 'error', `✗ Error loading EPGP data: ${err.message}`);
    renderEpgpTable([]);
  }
}

function populateRosterDropdowns() {
  const epSelect = $('#ep-name-select');
  const gpSelect = $('#gp-name-select');

  // Clear existing options except the default one
  while (epSelect.children.length > 1) epSelect.removeChild(epSelect.lastChild);
  while (gpSelect.children.length > 1) gpSelect.removeChild(gpSelect.lastChild);

  // Add roster members
  rosterData.forEach(member => {
    const epOption = document.createElement('option');
    epOption.value = member.name;
    epOption.textContent = member.name;
    epSelect.appendChild(epOption);

    const gpOption = document.createElement('option');
    gpOption.value = member.name;
    gpOption.textContent = member.name;
    gpSelect.appendChild(gpOption);
  });
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

// EP Log Button
$('#edit-ep-btn').addEventListener('click', async () => {
  const btn = $('#edit-ep-btn');
  const name = $('#ep-name-select').value.trim();
  const ep = parseInt($('#ep-value-input').value, 10);
  const reason = $('#ep-reason-input').value.trim();

  if (!name) {
    showMessage('epgp', 'error', '✗ Please select a character');
    return;
  }

  if (isNaN(ep)) {
    showMessage('epgp', 'error', '✗ Please enter a valid EP value');
    return;
  }

  btn.disabled = true;

  try {
    const res = await fetch('/api/ep-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        ep,
        reason,
        timestamp: new Date().toISOString(),
      }),
    });
    const data = await res.json();

    if (data.success) {
      showMessage('epgp', 'success', `✓ ${data.message}`);
      $('#ep-name-select').value = '';
      $('#ep-value-input').value = '';
      $('#ep-reason-input').value = '';
    } else {
      showMessage('epgp', 'error', `✗ ${data.error || 'Save failed'}`);
    }
  } catch (err) {
    showMessage('epgp', 'error', `✗ Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

// GP Log Button
$('#edit-gp-btn').addEventListener('click', async () => {
  const btn = $('#edit-gp-btn');
  const name = $('#gp-name-select').value.trim();
  const gp = parseInt($('#gp-value-input').value, 10);
  const reason = $('#gp-reason-input').value.trim();

  if (!name) {
    showMessage('epgp', 'error', '✗ Please select a character');
    return;
  }

  if (isNaN(gp)) {
    showMessage('epgp', 'error', '✗ Please enter a valid GP value');
    return;
  }

  btn.disabled = true;

  try {
    const res = await fetch('/api/gp-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        gp,
        reason,
        timestamp: new Date().toISOString(),
      }),
    });
    const data = await res.json();

    if (data.success) {
      showMessage('epgp', 'success', `✓ ${data.message}`);
      $('#gp-name-select').value = '';
      $('#gp-value-input').value = '';
      $('#gp-reason-input').value = '';
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
//  COLLAPSIBLE SECTIONS
// ================================================================
$$('.collapsible-header').forEach(header => {
  header.addEventListener('click', () => {
    header.classList.toggle('collapsed');
  });
});

// ================================================================
//  INIT — load default tab
// ================================================================
(function init() {
  tabLoaded.roster = true;
  loadRoster();
})();
