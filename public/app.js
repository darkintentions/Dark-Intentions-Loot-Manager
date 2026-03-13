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

// ── All 15 WoW gear slots (display order) ───────────────────────
const GEAR_SLOTS = [
  'Head',      'Neck',
  'Shoulder',  'Back',
  'Chest',     'Wrist',
  'Hands',     'Waist',
  'Legs',      'Feet',
  'Ring',      'Trinket',
  'Main Hand', 'Off Hand',
  'Tier',      'Ranged',
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
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No matching roster members.</td></tr>';
    return;
  }

  tbody.innerHTML = roster.map(c => {
    const css    = classCss(c.class);
    const status = (c.status || 'active').toLowerCase();
    const ep = c.ep ?? 0;
    const gp = c.gp ?? 0;
    const pr = gp > 0 ? (ep / gp).toFixed(2) : '—';
    const charId = `roster-char-${escHtml(c.name)}`;

    return `
      <tr class="roster-row" data-character="${escHtml(c.name)}">
        <td>${pr}</td>
        <td><span class="char-name ${css}">${escHtml(c.name)}</span></td>
        <td>${escHtml(c.realm || '—')}</td>
        <td class="${css}">${escHtml(c.class || '—')}</td>
        <td>${escHtml(c.role || '—')}</td>
        <td>${ep}</td>
        <td>${gp}</td>
        <td><span class="status-badge status-${escHtml(status)}">${escHtml(status)}</span></td>
      </tr>
      <tr class="roster-detail-row hidden" id="${charId}">
        <td colspan="8">
          <div class="detail-content">
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">Priority Ratio:</span>
                <span class="detail-value">${pr}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Earned Points (EP):</span>
                <span class="detail-value">${ep}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Gear Points (GP):</span>
                <span class="detail-value">${gp}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">History:</span>
                <button class="btn btn-secondary view-history-btn" data-character="${escHtml(c.name)}" style="padding: 8px 16px; font-size: 12px;">📜 View History</button>
              </div>
            </div>
          </div>
        </td>
      </tr>`;
  }).join('');

  // Add click handlers for expandable rows
  $$('.roster-row').forEach(row => {
    row.addEventListener('click', () => {
      const charName = row.dataset.character;
      const detailRow = $(`#roster-char-${charName}`);
      if (detailRow) {
        detailRow.classList.toggle('hidden');
      }
    });
  });

  // Add click handlers for View History buttons
  $$('.view-history-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const characterName = btn.dataset.character;
      await openTransactionHistoryModal(characterName);
    });
  });
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
    let aVal, bVal;

    // Handle PR (Priority Ratio) calculation
    if (key === 'pr') {
      const aEp = a.ep ?? 0;
      const aGp = a.gp ?? 0;
      const bEp = b.ep ?? 0;
      const bGp = b.gp ?? 0;
      aVal = aGp > 0 ? aEp / aGp : -1;
      bVal = bGp > 0 ? bEp / bGp : -1;
      const cmp = aVal - bVal;
      return rosterSortDir === 'asc' ? cmp : -cmp;
    }

    // Handle numeric fields
    if (key === 'ep' || key === 'gp') {
      aVal = a[key] ?? 0;
      bVal = b[key] ?? 0;
      const cmp = aVal - bVal;
      return rosterSortDir === 'asc' ? cmp : -cmp;
    }

    // Default string sorting
    aVal = String(a[key] || '').toLowerCase();
    bVal = String(b[key] || '').toLowerCase();
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

// ── Transaction History Functions ──────────────────────────────────

async function loadTransactionHistory(characterName) {
  try {
    const res = await fetch(`/api/transaction-history?name=${encodeURIComponent(characterName)}`);
    const data = await res.json();
    if (data.transactions) {
      return data.transactions;
    } else {
      showMessage('roster', 'error', '✗ Failed to load transaction history');
      return [];
    }
  } catch (err) {
    showMessage('roster', 'error', `✗ Network error: ${err.message}`);
    return [];
  }
}

async function openTransactionHistoryModal(characterName) {
  const modal = $('#transaction-history-modal');
  const transactions = await loadTransactionHistory(characterName);
  populateHistoryModal(transactions, characterName);
  modal.classList.remove('hidden');
}

function populateHistoryModal(transactions, characterName) {
  const titleEl = $('#transaction-history-title');
  const listEl = $('#transaction-list');

  titleEl.textContent = `Transaction History — ${escHtml(characterName)}`;

  if (transactions.length === 0) {
    listEl.innerHTML = '<div class="transaction-list-empty">No transaction history for this character</div>';
    return;
  }

  listEl.innerHTML = transactions.map(t => {
    const badge = t.type.toUpperCase();
    const badgeClass = t.type === 'ep' ? 'ep' : 'gp';
    const formattedTime = new Date(t.timestamp).toLocaleString();
    const amount = t.amount ?? 0;

    return `
      <div class="transaction-item" data-transaction-id="${t.id}" data-transaction-type="${t.type}">
        <button class="transaction-icon-btn edit-transaction-btn" data-transaction-id="${t.id}" data-transaction-type="${t.type}" title="Edit">✎</button>
        <div class="transaction-content">
          <span class="transaction-type-badge ${badgeClass}">${badge}</span>
          <div class="transaction-details">
            <span class="transaction-amount">${amount > 0 ? '+' : ''}${amount} points</span>
            <span class="transaction-reason">${escHtml(t.reason || '(no reason)')}</span>
            <span class="transaction-timestamp">${formattedTime}</span>
          </div>
        </div>
        <button class="transaction-icon-btn delete-btn delete-transaction-btn" data-transaction-id="${t.id}" data-transaction-type="${t.type}" title="Delete">🗑</button>
      </div>
    `;
  }).join('');

  // Attach event listeners to edit buttons
  $$('.edit-transaction-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.transactionId;
      const type = btn.dataset.transactionType;
      const transItem = $(`.transaction-item[data-transaction-id="${id}"][data-transaction-type="${type}"]`);
      if (transItem) {
        const amount = transItem.querySelector('.transaction-amount').textContent.replace(/[^\d-]/g, '');
        const reason = transItem.querySelector('.transaction-reason').textContent;
        const timestamp = transItem.querySelector('.transaction-timestamp').textContent;
        openEditTransactionModal(id, type, { amount, reason, timestamp }, characterName);
      }
    });
  });

  // Attach event listeners to delete buttons
  $$('.delete-transaction-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.transactionId;
      const type = btn.dataset.transactionType;
      deleteTransaction(id, type, characterName);
    });
  });
}

function openEditTransactionModal(transactionId, transactionType, transaction, characterName) {
  const modal = $('#edit-transaction-modal');
  const amountInput = $('#edit-transaction-amount');
  const reasonInput = $('#edit-transaction-reason');
  const timestampInput = $('#edit-transaction-timestamp');

  // Pre-fill form with current values
  amountInput.value = transaction.amount || 0;
  reasonInput.value = transaction.reason || '';

  // Format timestamp for datetime-local input
  if (transaction.timestamp) {
    const date = new Date(transaction.timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    timestampInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
  } else {
    timestampInput.value = '';
  }

  // Store data for submission
  modal.dataset.transactionId = transactionId;
  modal.dataset.transactionType = transactionType;
  modal.dataset.characterName = characterName;

  modal.classList.remove('hidden');
}

async function deleteTransaction(transactionId, transactionType, characterName) {
  if (!window.confirm('Delete this transaction? This cannot be undone.')) {
    return;
  }

  try {
    const res = await fetch(`/api/transaction-history/${transactionId}/${transactionType}`, {
      method: 'DELETE',
    });
    const data = await res.json();

    if (data.success) {
      showMessage('roster', 'success', '✓ Transaction deleted');
      // Reload the history modal
      const historyModal = $('#transaction-history-modal');
      if (!historyModal.classList.contains('hidden')) {
        await openTransactionHistoryModal(characterName);
      }
    } else {
      showMessage('roster', 'error', `✗ ${data.error}`);
    }
  } catch (err) {
    showMessage('roster', 'error', `✗ Network error: ${err.message}`);
  }
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
    await loadCustomEpButtons();
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
    if (data.default_gp) {
      $('#default-gp-input').value = data.default_gp;
    }
  } catch {
    // Settings may just not be set yet; fail silently
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

// Save default GP setting
$('#save-default-gp-btn').addEventListener('click', async () => {
  const btn = $('#save-default-gp-btn');
  const defaultGp = $('#default-gp-input').value.trim();

  if (!defaultGp || isNaN(defaultGp) || parseInt(defaultGp) < 0) {
    showMessage('admin', 'error', '✗ Default GP must be a non-negative number.');
    return;
  }

  btn.disabled = true;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'default_gp', value: defaultGp }),
    });
    const data = await res.json();

    if (data.success) {
      showMessage('admin', 'success', `✓ Default GP updated to ${defaultGp}`);
    } else {
      showMessage('admin', 'error', `✗ ${data.error || 'Save failed'}`);
    }
  } catch (err) {
    showMessage('admin', 'error', `✗ Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

// Delete roster with confirmation
$('#delete-roster-btn').addEventListener('click', async () => {
  const confirmed = window.confirm(
    'Are you absolutely sure?\n\n' +
    'This will:\n' +
    '• Delete ALL characters from the roster\n' +
    '• Delete ALL EP/GP transaction logs\n' +
    '• Permanently wipe all roster-related data\n\n' +
    'This action CANNOT be undone.\n\n' +
    'Type "DELETE" to confirm:'
  );

  if (!confirmed) return;

  // Prompt for confirmation word
  const confirmWord = window.prompt('Type "DELETE" to permanently delete the roster:');
  if (confirmWord !== 'DELETE') {
    showMessage('admin', 'error', '✗ Deletion cancelled. Type "DELETE" to confirm.');
    return;
  }

  const btn = $('#delete-roster-btn');
  btn.disabled = true;

  try {
    const res = await fetch('/api/roster-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();

    if (data.success) {
      showMessage('admin', 'success', `✓ ${data.message}`);
      // Reload roster to show empty state
      loadRoster();
    } else {
      showMessage('admin', 'error', `✗ ${data.error || 'Deletion failed'}`);
    }
  } catch (err) {
    showMessage('admin', 'error', `✗ Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

// ================================================================
//  CUSTOM EP BUTTONS
// ================================================================
let customEpButtons = [];

async function loadCustomEpButtons() {
  try {
    const res = await fetch('/api/custom-ep-buttons');
    const data = await res.json();
    customEpButtons = data;
    renderCustomEpButtons();
  } catch (err) {
    console.error('Error loading custom EP buttons:', err);
  }
}

function renderCustomEpButtons() {
  const container = $('#custom-ep-buttons-container');
  if (!container) return;

  if (customEpButtons.length === 0) {
    container.innerHTML = '<p class="color-text-muted">No custom buttons created yet. Create one in the Admin tab.</p>';
    return;
  }

  container.innerHTML = customEpButtons.map(button => `
    <div class="custom-ep-button-row">
      <select class="form-input ep-char-select" data-button-id="${button.id}">
        <option value="">Select Character</option>
        ${rosterData.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
      </select>
      <button class="btn btn-primary award-custom-ep-btn" data-button-id="${button.id}" data-button-name="${escHtml(button.name)}" data-button-ep="${button.ep}" title="${escHtml(button.description)}">
        <span class="btn-icon">⭐</span> ${escHtml(button.name)}
      </button>
    </div>
  `).join('');

  // Attach event listeners to award buttons
  $$('.award-custom-ep-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const buttonId = btn.dataset.buttonId;
      const buttonName = btn.dataset.buttonName;
      const buttonEp = parseInt(btn.dataset.buttonEp);
      const charSelect = $(`.ep-char-select[data-button-id="${buttonId}"]`);
      const selectedChar = charSelect.value;

      if (!selectedChar) {
        showMessage('epgp', 'error', '✗ Please select a character');
        return;
      }

      btn.disabled = true;

      try {
        const timestamp = new Date().toISOString();
        const res = await fetch('/api/ep-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: selectedChar,
            ep: buttonEp,
            reason: buttonName,
            timestamp: timestamp,
          }),
        });

        const data = await res.json();
        if (data.success) {
          showMessage('epgp', 'success', `✓ Awarded ${buttonEp} EP to ${selectedChar}`);
          charSelect.value = '';
        } else {
          showMessage('epgp', 'error', `✗ ${data.error || 'Failed to award EP'}`);
        }
      } catch (err) {
        showMessage('epgp', 'error', `✗ Network error: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

// Modal for creating custom EP buttons
const customEpModal = $('#custom-ep-modal');
const openCustomEpBtn = $('#open-custom-ep-btn');
const closeCustomEpModalBtn = $('#close-custom-ep-modal');
const saveCustomEpBtn = $('#save-custom-ep-btn');
const cancelCustomEpBtn = $('#cancel-custom-ep-btn');

openCustomEpBtn.addEventListener('click', () => {
  customEpModal.classList.remove('hidden');
});

closeCustomEpModalBtn.addEventListener('click', () => {
  customEpModal.classList.add('hidden');
  resetCustomEpForm();
});

cancelCustomEpBtn.addEventListener('click', () => {
  customEpModal.classList.add('hidden');
  resetCustomEpForm();
});

function resetCustomEpForm() {
  $('#custom-ep-name').value = '';
  $('#custom-ep-description').value = '';
  $('#custom-ep-points').value = '0';
}

saveCustomEpBtn.addEventListener('click', async () => {
  const name = $('#custom-ep-name').value.trim();
  const description = $('#custom-ep-description').value.trim();
  const ep = $('#custom-ep-points').value;

  if (!name) {
    alert('Button name is required');
    return;
  }

  saveCustomEpBtn.disabled = true;

  try {
    const res = await fetch('/api/custom-ep-buttons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, ep: parseInt(ep) || 0 }),
    });

    const data = await res.json();
    if (data.success) {
      showMessage('admin', 'success', '✓ Custom EP button created');
      customEpModal.classList.add('hidden');
      resetCustomEpForm();
      await loadCustomEpButtons();
    } else {
      showMessage('admin', 'error', `✗ ${data.error || 'Failed to create button'}`);
    }
  } catch (err) {
    showMessage('admin', 'error', `✗ Network error: ${err.message}`);
  } finally {
    saveCustomEpBtn.disabled = false;
  }
});

// Close modal when clicking outside
customEpModal.addEventListener('click', (e) => {
  if (e.target === customEpModal) {
    customEpModal.classList.add('hidden');
    resetCustomEpForm();
  }
});

// ================================================================
//  TRANSACTION HISTORY MODAL
// ================================================================

// View History button listeners (added dynamically in renderRoster)
// We set them up after each render call

const transactionHistoryModal = $('#transaction-history-modal');
const closeTransactionHistoryBtn = $('#close-transaction-history-btn');
const editTransactionModal = $('#edit-transaction-modal');
const closeEditTransactionBtn = $('#close-edit-transaction-btn');
const saveEditTransactionBtn = $('#save-edit-transaction-btn');
const cancelEditTransactionBtn = $('#cancel-edit-transaction-btn');

closeTransactionHistoryBtn.addEventListener('click', () => {
  transactionHistoryModal.classList.add('hidden');
});

transactionHistoryModal.addEventListener('click', (e) => {
  if (e.target === transactionHistoryModal) {
    transactionHistoryModal.classList.add('hidden');
  }
});

closeEditTransactionBtn.addEventListener('click', () => {
  editTransactionModal.classList.add('hidden');
});

cancelEditTransactionBtn.addEventListener('click', () => {
  editTransactionModal.classList.add('hidden');
});

editTransactionModal.addEventListener('click', (e) => {
  if (e.target === editTransactionModal) {
    editTransactionModal.classList.add('hidden');
  }
});

saveEditTransactionBtn.addEventListener('click', async () => {
  const id = editTransactionModal.dataset.transactionId;
  const type = editTransactionModal.dataset.transactionType;
  const characterName = editTransactionModal.dataset.characterName;
  const amount = $('#edit-transaction-amount').value.trim();
  const reason = $('#edit-transaction-reason').value.trim();
  const timestamp = $('#edit-transaction-timestamp').value;

  if (!amount || isNaN(parseInt(amount))) {
    showMessage('roster', 'error', '✗ Please enter a valid amount');
    return;
  }

  saveEditTransactionBtn.disabled = true;

  try {
    const res = await fetch(`/api/transaction-history/${id}/${type}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseInt(amount), reason, timestamp }),
    });

    const data = await res.json();

    if (data.success) {
      showMessage('roster', 'success', '✓ Transaction updated');
      editTransactionModal.classList.add('hidden');
      // Reload history modal
      await openTransactionHistoryModal(characterName);
    } else {
      showMessage('roster', 'error', `✗ ${data.error}`);
    }
  } catch (err) {
    showMessage('roster', 'error', `✗ Network error: ${err.message}`);
  } finally {
    saveEditTransactionBtn.disabled = false;
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
