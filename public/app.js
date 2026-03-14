/* ================================================================
   Dark Intentions Loot Manager — Frontend App
   ================================================================ */

'use strict';

// ── DOM helpers ──────────────────────────────────────────────────
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Custom alert modal ──────────────────────────────────────────
function showAlert(message, title = 'Notice') {
  const modal = $('#alert-modal');
  $('#alert-modal-title').textContent = title;
  $('#alert-modal-message').textContent = message;
  modal.classList.remove('hidden');
  const okBtn = $('#alert-modal-ok');
  okBtn.focus();
  const close = () => modal.classList.add('hidden');
  okBtn.onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
}

// ── Custom confirm modal (returns Promise<boolean>) ─────────────
// options: { title, message, confirmText, cancelText, inputPlaceholder, inputMatch }
// If inputPlaceholder is set, shows a text input the user must fill.
// If inputMatch is set, the confirm button only works when input matches that string.
function showConfirm({ title = 'Confirm', message = '', confirmText = 'Confirm', cancelText = 'Cancel', inputPlaceholder = '', inputMatch = '' } = {}) {
  return new Promise((resolve) => {
    const modal = $('#confirm-modal');
    const msgEl = $('#confirm-modal-message');
    const titleEl = $('#confirm-modal-title');
    const okBtn = $('#confirm-modal-ok');
    const cancelBtn = $('#confirm-modal-cancel');
    const inputEl = $('#confirm-modal-input');

    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    // Input field setup
    if (inputPlaceholder) {
      inputEl.classList.remove('hidden');
      inputEl.value = '';
      inputEl.placeholder = inputPlaceholder;
    } else {
      inputEl.classList.add('hidden');
    }

    modal.classList.remove('hidden');

    if (inputPlaceholder) {
      inputEl.focus();
    } else {
      okBtn.focus();
    }

    function cleanup(result) {
      modal.classList.add('hidden');
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      modal.onclick = null;
      inputEl.oninput = null;
      resolve(result);
    }

    okBtn.onclick = () => {
      if (inputMatch && inputEl.value !== inputMatch) return;
      cleanup(true);
    };
    cancelBtn.onclick = () => cleanup(false);
    modal.onclick = (e) => { if (e.target === modal) cleanup(false); };

    // If inputMatch is set, disable confirm until it matches
    if (inputMatch) {
      okBtn.disabled = true;
      inputEl.oninput = () => {
        okBtn.disabled = inputEl.value !== inputMatch;
      };
    } else {
      okBtn.disabled = false;
    }
  });
}

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
//  TAB SWITCHING & UNSAVED CHANGES
// ================================================================
const tabLoaded = {};
let unsavedChanges = false;

function markUnsavedChanges() {
  unsavedChanges = true;
}

function clearUnsavedChanges() {
  unsavedChanges = false;
}

async function switchTab(name) {
  // Check for unsaved changes before switching
  if (unsavedChanges) {
    const confirmed = await showConfirm({
      title: 'Unsaved Changes',
      message: 'You have unsaved changes. Do you want to leave without saving?',
      confirmText: 'Leave',
      cancelText: 'Stay',
    });
    if (!confirmed) return;
  }

  $$('.nav-item').forEach(li => li.classList.remove('active'));
  $$('.tab-panel').forEach(panel => panel.classList.remove('active'));

  $(`.nav-item[data-tab="${name}"]`).classList.add('active');
  $(`#tab-${name}`).classList.add('active');

  // Clear unsaved flag when switching tabs
  clearUnsavedChanges();

  // Lazy-load tab data on first visit
  // For attendance, always sync to get latest data
  if (name === 'attendance') {
    syncAttendance().catch(err => showMessage('attendance', 'error', `✗ Auto-sync failed: ${err.message}`));
    return;
  }

  if (!tabLoaded[name]) {
    tabLoaded[name] = true;
    if (name === 'roster') loadRoster();
    if (name === 'loot')   loadLootHistory();
    if (name === 'epgp')   loadEpgp();
    if (name === 'admin')  loadAdminSettings();
  }
}

$$('.nav-item').forEach(li => {
  li.addEventListener('click', () => switchTab(li.dataset.tab));
});

// Warn before closing/reloading if there are unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (unsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
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
        <td><span class="status-badge status-${escHtml(status)}">${escHtml(status)}</span></td>
      </tr>
      <tr class="roster-detail-row hidden" id="${charId}">
        <td colspan="6">
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
                <button class="btn btn-secondary view-history-btn" data-character="${escHtml(c.name)}" style="padding: 11px 23px; font-size: 14px; margin-left: auto;">📜 View EP/GP History</button>
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
  await populateHistoryModal(transactions, characterName);
  modal.classList.remove('hidden');
}

async function formatReasonWithLinks(reason) {
  if (!reason) return '(no reason)';

  // If the reason already contains HTML link tags, extract the URL and clean it up
  const existingHtmlLinkRegex = /<a\s+href="(https:\/\/www\.wowhead\.com\/item=\d+[^"]*)"\s*[^>]*>[^<]*<\/a>\s*-?\s*/g;
  let cleanReason = reason.replace(existingHtmlLinkRegex, '$1 ');

  // Find WoWhead URLs (either plain text or extracted from HTML) and replace with clean item links
  const wowheadUrlRegex = /(https:\/\/www\.wowhead\.com\/item=\d+(?:[?&#]\S+)?)/g;
  let result = cleanReason;
  const links = [];

  // Replace URLs with placeholder
  const placeholderPrefix = '__WOWHEAD_';
  const placeholderSuffix = '__';

  // Collect all item IDs to fetch names for
  const itemIds = [];
  const matches = [...cleanReason.matchAll(wowheadUrlRegex)];

  for (const match of matches) {
    const itemId = match[0].match(/item=(\d+)/)[1];
    if (!itemIds.includes(itemId)) {
      itemIds.push(itemId);
    }
  }

  // Fetch all item names in parallel
  const itemNames = {};
  try {
    const namePromises = itemIds.map(id =>
      fetch(`/api/item-info?id=${id}`)
        .then(r => r.json())
        .then(data => {
          itemNames[id] = data.name || id;
        })
        .catch(() => {
          itemNames[id] = id; // Fallback to ID if fetch fails
        })
    );
    await Promise.all(namePromises);
  } catch (err) {
    console.error('Error fetching item names:', err);
    // If fetch fails, we'll fall back to showing item IDs
  }

  result = result.replace(wowheadUrlRegex, (match) => {
    const itemId = match.match(/item=(\d+)/)[1];
    const itemName = itemNames[itemId] || itemId;
    // Create link with item name (WoWhead tooltip will work based on the href URL)
    links.push(`<a href="${match}" target="_blank" class="wowhead-link">${escHtml(itemName)}</a>`);
    return placeholderPrefix + (links.length - 1) + placeholderSuffix;
  });

  // Escape the entire reason text
  result = escHtml(result);

  // Replace placeholders back with actual links
  links.forEach((link, i) => {
    const placeholder = escHtml(placeholderPrefix + i + placeholderSuffix);
    result = result.replace(placeholder, link);
  });

  return result;
}

async function populateHistoryModal(transactions, characterName) {
  const titleEl = $('#transaction-history-title');
  const listEl = $('#transaction-list');

  titleEl.textContent = `Transaction History — ${escHtml(characterName)}`;

  if (transactions.length === 0) {
    listEl.innerHTML = '<div class="transaction-list-empty">No transaction history for this character</div>';
    return;
  }

  // Format all transaction reasons in parallel
  const formattedReasons = await Promise.all(
    transactions.map(t => formatReasonWithLinks(t.reason))
  );

  listEl.innerHTML = transactions.map((t, index) => {
    const badge = t.type.toUpperCase();
    const badgeClass = t.type === 'ep' ? 'ep' : 'gp';
    const formattedTime = new Date(t.timestamp).toLocaleString();
    const amount = t.amount ?? 0;
    const reasonHTML = formattedReasons[index];

    // Store original data in data attributes for later retrieval
    const originalAmount = escHtml(String(t.amount ?? 0));
    const originalReason = escHtml(t.reason || '');
    const originalTimestamp = escHtml(t.timestamp || '');

    return `
      <div class="transaction-item" data-transaction-id="${t.id}" data-transaction-type="${t.type}"
           data-original-amount="${originalAmount}" data-original-reason="${originalReason}"
           data-original-timestamp="${originalTimestamp}">
        <button class="transaction-icon-btn edit-transaction-btn" data-transaction-id="${t.id}" data-transaction-type="${t.type}" title="Edit">✎</button>
        <div class="transaction-content">
          <span class="transaction-type-badge ${badgeClass}">${badge}</span>
          <div class="transaction-details">
            <span class="transaction-amount">${amount > 0 ? '+' : ''}${amount}</span>
            <span class="transaction-reason">${reasonHTML}</span>
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
        // Read original data from attributes (not from rendered DOM)
        const amount = transItem.dataset.originalAmount;
        const reason = transItem.dataset.originalReason;
        const timestamp = transItem.dataset.originalTimestamp;
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

  // Refresh WoWhead tooltips for dynamically added content
  if (window.__WowheadPower) {
    window.__WowheadPower.refreshLinks();
  }
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
  const confirmed = await showConfirm({
    title: 'Delete Transaction',
    message: 'Delete this transaction? This cannot be undone.',
    confirmText: 'Delete',
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/transaction-history?id=${transactionId}&type=${transactionType}`, {
      method: 'DELETE',
    });

    // Check content-type before parsing JSON
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      showMessage('roster', 'error', `✗ Server error: ${res.status} - ${text || 'No response'}`);
      return;
    }

    const data = await res.json();

    if (data.success) {
      showMessage('roster', 'success', '✓ Transaction deleted');
      // Reload the history modal
      const historyModal = $('#transaction-history-modal');
      if (!historyModal.classList.contains('hidden')) {
        await openTransactionHistoryModal(characterName);
      }
    } else {
      showMessage('roster', 'error', `✗ ${data.error || 'Delete failed'}`);
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

$('#export-pr-btn').addEventListener('click', () => {
  if (!rosterData || rosterData.length === 0) {
    showMessage('roster', 'error', '✗ No roster data to export');
    return;
  }

  // Build CSV lines: "Name-Realm,PR"
  const lines = rosterData.map(c => {
    const ep = c.ep ?? 0;
    const gp = c.gp ?? 0;
    const pr = gp > 0 ? (ep / gp).toFixed(2) : '0.00';
    const realm = c.realm || 'Unknown';
    return `${c.name}-${realm},${pr}`;
  });

  const csv = lines.join('\n');

  // Open a styled modal window with the CSV content
  showExportModal(csv);
});

function showExportModal(content) {
  // Remove existing export modal if any
  const existing = $('#export-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'export-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Export Roster PR</h2>
        <button id="close-export-modal" class="btn-close">✕</button>
      </div>
      <div class="modal-body">
        <textarea id="export-textarea" class="export-textarea" readonly>${escHtml(content)}</textarea>
      </div>
      <div class="modal-footer">
        <button id="copy-export-btn" class="btn btn-primary">
          <span class="btn-icon">📋</span> Copy to Clipboard
        </button>
        <button id="cancel-export-btn" class="btn btn-secondary">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Auto-select all text
  const textarea = $('#export-textarea');
  textarea.focus();
  textarea.select();

  // Copy button
  $('#copy-export-btn').addEventListener('click', () => {
    textarea.select();
    navigator.clipboard.writeText(content).then(() => {
      $('#copy-export-btn').innerHTML = '<span class="btn-icon">✓</span> Copied!';
      setTimeout(() => {
        $('#copy-export-btn').innerHTML = '<span class="btn-icon">📋</span> Copy to Clipboard';
      }, 2000);
    });
  });

  // Close handlers
  $('#close-export-modal').addEventListener('click', () => modal.remove());
  $('#cancel-export-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
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
    populateRosterDropdowns();
    populateOnTimeBonus();
    await loadCustomEpButtons();
  } catch (err) {
    showMessage('epgp', 'error', `✗ Error loading EPGP data: ${err.message}`);
    renderEpgpTable([]);
  }
}

function populateRosterDropdowns() {
  const epSelect = $('#ep-name-select');
  const gpSelect = $('#gp-name-select');

  // Clear existing options
  epSelect.innerHTML = '<option value="">— Select a character —</option>';
  gpSelect.innerHTML = '<option value="">— Select a character —</option>';

  // Add roster members, sorted alphabetically, excluding Social rank
  if (rosterData && rosterData.length > 0) {
    const characters = rosterData
      .filter(c => c.rank && c.rank.toLowerCase() !== 'social')
      .sort((a, b) => a.name.localeCompare(b.name));

    characters.forEach(member => {
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
}

function populateOnTimeBonus() {
  const tbody = $('#on-time-bonus-tbody');
  tbody.innerHTML = '';

  if (rosterData && rosterData.length > 0) {
    const characters = rosterData
      .filter(c => c.rank && c.rank.toLowerCase() !== 'social')
      .sort((a, b) => a.name.localeCompare(b.name));

    // Create 8-column layout (4 characters per row)
    for (let i = 0; i < characters.length; i += 4) {
      const char1 = characters[i];
      const char2 = characters[i + 1];
      const char3 = characters[i + 2];
      const char4 = characters[i + 3];

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><input type="checkbox" class="bonus-checkbox" value="${char1.name}"></td>
        <td>${escHtml(char1.name)}</td>
        ${char2 ? `
          <td><input type="checkbox" class="bonus-checkbox" value="${char2.name}"></td>
          <td>${escHtml(char2.name)}</td>
        ` : `
          <td></td>
          <td></td>
        `}
        ${char3 ? `
          <td><input type="checkbox" class="bonus-checkbox" value="${char3.name}"></td>
          <td>${escHtml(char3.name)}</td>
        ` : `
          <td></td>
          <td></td>
        `}
        ${char4 ? `
          <td><input type="checkbox" class="bonus-checkbox" value="${char4.name}"></td>
          <td>${escHtml(char4.name)}</td>
        ` : `
          <td></td>
          <td></td>
        `}
      `;
      tbody.appendChild(row);
    }
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

  // Attach change listeners to newly created gear inputs
  $$('table.gear-table input').forEach(input => {
    input.addEventListener('change', markUnsavedChanges);
    input.addEventListener('input', markUnsavedChanges);
  });
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
      clearUnsavedChanges();
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
      // Reload roster to update PR values
      await loadRoster();
      clearUnsavedChanges();
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
  const itemId = $('#gp-item-id-input').value.trim();
  let reason = $('#gp-reason-input').value.trim();

  if (!name) {
    showMessage('epgp', 'error', '✗ Please select a character');
    return;
  }

  if (isNaN(gp)) {
    showMessage('epgp', 'error', '✗ Please enter a valid GP value');
    return;
  }

  // If item ID is provided, prepend the WoWhead URL to the reason
  if (itemId) {
    const wowheadUrl = `https://www.wowhead.com/item=${itemId}`;
    reason = wowheadUrl + (reason ? ` - ${reason}` : '');
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
      $('#gp-item-id-input').value = '';
      $('#gp-reason-input').value = '';
      // Reload roster to update PR values
      await loadRoster();
      clearUnsavedChanges();
    } else {
      showMessage('epgp', 'error', `✗ ${data.error || 'Save failed'}`);
    }
  } catch (err) {
    showMessage('epgp', 'error', `✗ Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

// On Time Bonus - Select/Unselect Everyone Button
$('#select-everyone-btn').addEventListener('click', () => {
  const btn = $('#select-everyone-btn');
  const isSelecting = btn.textContent.includes('Select');

  $$('.bonus-checkbox').forEach(checkbox => {
    checkbox.checked = isSelecting;
  });

  if (isSelecting) {
    btn.innerHTML = '<span class="btn-icon">✕</span> Unselect Everyone';
  } else {
    btn.innerHTML = '<span class="btn-icon">✓</span> Select Everyone';
  }
});

// On Time Bonus - Give Bonus Button
$('#give-bonus-btn').addEventListener('click', async () => {
  const btn = $('#give-bonus-btn');
  const bonusEp = parseInt($('#bonus-ep-input').value, 10);

  if (isNaN(bonusEp) || bonusEp <= 0) {
    showMessage('epgp', 'error', '✗ Please enter a valid EP amount');
    return;
  }

  const selectedCharacters = Array.from($$('.bonus-checkbox:checked'))
    .map(checkbox => checkbox.value);

  if (selectedCharacters.length === 0) {
    showMessage('epgp', 'error', '✗ Please select at least one character');
    return;
  }

  btn.disabled = true;

  try {
    // Award EP to each selected character
    const promises = selectedCharacters.map(name =>
      fetch('/api/ep-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          ep: bonusEp,
          reason: 'On Time Bonus',
          timestamp: new Date().toISOString(),
        }),
      }).then(r => r.json())
    );

    const results = await Promise.all(promises);
    const allSuccess = results.every(r => r.success);

    if (allSuccess) {
      showMessage('epgp', 'success', `✓ On Time Bonus awarded to ${selectedCharacters.length} member(s)`);
      $('#bonus-ep-input').value = '';
      $$('.bonus-checkbox').forEach(checkbox => { checkbox.checked = false; });
      $('#select-everyone-btn').innerHTML = '<span class="btn-icon">✓</span> Select Everyone';
      await loadRoster();
      clearUnsavedChanges();
    } else {
      showMessage('epgp', 'error', '✗ Some members failed to receive bonus');
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

  // Populate character delete dropdown
  await populateCharacterDeleteSelect();
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
      clearUnsavedChanges();
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
      clearUnsavedChanges();
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
//  CHARACTER DELETION (DANGER ZONE)
// ================================================================

// Populate character select dropdown
async function populateCharacterDeleteSelect() {
  const select = $('#delete-character-select');

  try {
    const res = await fetch('/api/roster');
    const data = await res.json();

    select.innerHTML = '<option value="">— Select a character —</option>';

    if (data.roster && data.roster.length > 0) {
      // Filter out Social rank members and sort by name
      const characters = data.roster
        .filter(c => c.rank && c.rank.toLowerCase() !== 'social')
        .sort((a, b) => a.name.localeCompare(b.name));

      characters.forEach(char => {
        const option = document.createElement('option');
        option.value = char.name;
        option.textContent = char.name;
        select.appendChild(option);
      });
    }
  } catch (err) {
    select.innerHTML = '<option value="">Error loading characters</option>';
  }
}

// Update delete button disabled state based on selection
$('#delete-character-select').addEventListener('change', (e) => {
  const btn = $('#delete-character-btn');
  btn.disabled = !e.target.value;
});

// Delete character with confirmation
$('#delete-character-btn').addEventListener('click', async () => {
  const select = $('#delete-character-select');
  const characterName = select.value;

  if (!characterName) {
    showMessage('admin', 'error', '✗ Please select a character');
    return;
  }

  const confirmed = await showConfirm({
    title: 'Delete Character',
    message: `Are you sure you want to delete "${characterName}"? This will remove them from the roster and delete all their EP/GP transactions. This action CANNOT be undone.`,
    confirmText: 'Delete',
  });

  if (!confirmed) return;

  const btn = $('#delete-character-btn');
  btn.disabled = true;

  try {
    const res = await fetch(`/api/character-delete?name=${encodeURIComponent(characterName)}`, {
      method: 'POST',
    });

    // Check content-type before parsing JSON
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      showMessage('admin', 'error', `✗ Server error: ${res.status} - ${text || 'No response'}`);
      return;
    }

    const data = await res.json();

    if (data.success) {
      showMessage('admin', 'success', `✓ ${data.message}`);
      // Reload roster and refill the select dropdown
      await populateCharacterDeleteSelect();
      select.value = '';
      btn.disabled = true;
      // Reload roster to update display
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

// Delete roster with confirmation
$('#delete-roster-btn').addEventListener('click', async () => {
  const confirmed = await showConfirm({
    title: 'Delete Entire Roster',
    message: 'This will delete ALL characters, ALL EP/GP transaction logs, and permanently wipe all roster-related data. This action CANNOT be undone. Type "DELETE" to confirm.',
    confirmText: 'Delete Everything',
    inputPlaceholder: 'Type DELETE to confirm',
    inputMatch: 'DELETE',
  });

  if (!confirmed) return;

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
      <select class="form-select ep-char-select" data-button-id="${button.id}">
        <option value="">— Select a character —</option>
        ${rosterData.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
      </select>
      <button class="btn btn-primary award-custom-ep-btn" data-button-id="${button.id}" data-button-name="${escHtml(button.name)}" data-button-ep="${button.ep}" data-button-description="${escHtml(button.description)}" title="${escHtml(button.description)}">
        <span class="btn-icon">⭐</span> ${escHtml(button.name)}
      </button>
    </div>
  `).join('');

  // Attach event listeners to award buttons
  $$('.award-custom-ep-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const buttonId = btn.dataset.buttonId;
      const buttonName = btn.dataset.buttonName;
      const buttonDescription = btn.dataset.buttonDescription;
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
            reason: buttonDescription || buttonName,
            timestamp: timestamp,
          }),
        });

        const data = await res.json();
        if (data.success) {
          showMessage('epgp', 'success', `✓ Awarded ${buttonEp} EP to ${selectedChar}`);
          charSelect.value = '';
          // Reload roster to update PR values
          await loadRoster();
          clearUnsavedChanges();
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
    const res = await fetch(`/api/transaction-history?id=${id}&type=${type}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseInt(amount), reason, timestamp }),
    });

    const data = await res.json();

    if (data.success) {
      showMessage('roster', 'success', '✓ Transaction updated');
      editTransactionModal.classList.add('hidden');
      clearUnsavedChanges();
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
//  UNSAVED CHANGES — Form Input Listeners
// ================================================================
// Track changes in EPGP forms
['#ep-name-select', '#ep-value-input', '#ep-reason-input',
 '#gp-name-select', '#gp-value-input', '#gp-reason-input'].forEach(sel => {
  const el = $(sel);
  if (el) {
    el.addEventListener('change', markUnsavedChanges);
    el.addEventListener('input', markUnsavedChanges);
  }
});

// Track changes in Admin forms
['#api-key-input', '#default-gp-input'].forEach(sel => {
  const el = $(sel);
  if (el) {
    el.addEventListener('change', markUnsavedChanges);
    el.addEventListener('input', markUnsavedChanges);
  }
});

// Track changes in transaction edit modal
['#edit-transaction-amount', '#edit-transaction-reason', '#edit-transaction-timestamp'].forEach(sel => {
  const el = $(sel);
  if (el) {
    el.addEventListener('change', markUnsavedChanges);
    el.addEventListener('input', markUnsavedChanges);
  }
});

// ================================================================
//  LOOT TAB — Sync and Display Loot History
// ================================================================
async function syncWowAuditPeriod() {
  try {
    const res = await fetch('/api/wowaudit-period');
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to sync period');
    }
    return data.period;
  } catch (err) {
    throw new Error(`Failed to sync WoWAudit period: ${err.message}`);
  }
}

async function syncLootFromWoWAudit() {
  try {
    const res = await fetch('/api/sync-loot-from-wowaudit', { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Sync failed');
    }
    return data;
  } catch (err) {
    throw new Error(`Failed to sync loot: ${err.message}`);
  }
}

async function loadLootHistory() {
  try {
    const res = await fetch('/api/loot-history');
    const data = await res.json();
    const items = data.history_items || [];
    renderLootTable(items);
  } catch (err) {
    showMessage('loot', 'error', `✗ Error loading loot history: ${err.message}`);
    renderLootTable([]);
  }
}

function renderLootTable(items) {
  const tbody = $('#loot-tbody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No loot history. Click "Sync Loot from WoWAudit" to load data.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr>
      <td><strong>${escHtml(item.name)}</strong></td>
      <td>${escHtml(item.slot || '—')}</td>
      <td>${escHtml(item.quality || '—')}</td>
      <td>${escHtml(item.awarded_by_name || 'Unknown')}</td>
      <td>${item.awarded_at ? new Date(item.awarded_at).toLocaleDateString() : '—'}</td>
    </tr>
  `).join('');
}

$('#sync-loot-btn').addEventListener('click', async () => {
  const btn = $('#sync-loot-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> Syncing…';

  try {
    // Sync loot (endpoint handles period fetch internally)
    const syncData = await syncLootFromWoWAudit();

    // Check if any loot was actually synced
    if (syncData.inserted === 0) {
      showAlert('No loot uploaded to WoWAudit yet!', 'No Loot Found');
    } else {
      showMessage('loot', 'success', `✓ ${syncData.message}`);
    }

    // Load and display the loot
    await loadLootHistory();
  } catch (err) {
    showMessage('loot', 'error', `✗ ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🔄</span> Sync Loot from WoWAudit';
  }
});

// ================================================================
//  ATTENDANCE TAB — Fetch and Display Raid Signups
// ================================================================
function getWeekCodeForDate(date) {
  // March 16, 2026 (Monday) = week code 2538856
  // Each week after that increases by 1
  const baseDate = new Date('2026-03-16');
  baseDate.setHours(0, 0, 0, 0);
  const baseWeekCode = 2538856;
  const timeDiff = date.getTime() - baseDate.getTime();
  const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  const weeksDiff = Math.floor(daysDiff / 7);
  return baseWeekCode + weeksDiff;
}

function getUpcomingWeekCode() {
  // Get the week code for the NEXT Monday
  // Every Monday, show the following week
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Calculate days until next Monday
  // Monday = 1, so if today is Monday, next Monday is 7 days away
  // If today is Sunday = 0, next Monday is 1 day away
  // If today is Tuesday = 2, next Monday is 6 days away, etc.
  const daysUntilNextMonday = (8 - dayOfWeek) % 7 || 7;

  const nextMonday = new Date(today);
  nextMonday.setDate(nextMonday.getDate() + daysUntilNextMonday);

  return getWeekCodeForDate(nextMonday);
}

async function syncAttendance() {
  try {
    const weekCode = getUpcomingWeekCode();
    const res = await fetch(`/api/attendance-sync?week_code=${weekCode}`, { method: 'POST' });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`${res.status} - ${text || 'No response'}`);
    }
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Sync failed');
    }
    return { weekCode, data };
  } catch (err) {
    throw new Error(`Failed to sync attendance: ${err.message}`);
  }
}

async function loadAttendance(weekCode) {
  try {
    const res = await fetch(`/api/attendance?week_code=${weekCode}`);
    const data = await res.json();
    const records = data.attendance || [];
    renderAttendanceTable(records);
    return records;
  } catch (err) {
    showMessage('attendance', 'error', `✗ Error loading attendance: ${err.message}`);
    renderAttendanceTable([]);
    return [];
  }
}

function getStatusClass(status) {
  if (!status || status === 'Unknown') return 'status-unknown';
  if (status === 'Present') return 'status-present';
  if (status === 'Absent') return 'status-absent';
  if (status === 'Tentative') return 'status-tentative';
  return 'status-tentative'; // default to yellow for other statuses
}

function getStatusDisplay(status) {
  if (!status || status === 'Unknown') return 'SIGN UP!';
  return status;
}

function renderAttendanceTable(records) {
  const tbody = $('#attendance-tbody');
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No attendance data. Click "Sync Attendance" to load.</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(record => {
    const statusClass = getStatusClass(record.status);
    const statusDisplay = getStatusDisplay(record.status);
    return `
      <tr>
        <td><strong>${escHtml(record.character_name)}</strong></td>
        <td>${escHtml(record.realm || '—')}</td>
        <td>${escHtml(record.class || '—')}</td>
        <td>${escHtml(record.role || '—')}</td>
        <td class="${statusClass}">${escHtml(statusDisplay)}</td>
      </tr>
    `;
  }).join('');
}

const syncAttendanceBtn = $('#sync-attendance-btn');
if (syncAttendanceBtn) {
  syncAttendanceBtn.addEventListener('click', async () => {
    syncAttendanceBtn.disabled = true;
    syncAttendanceBtn.innerHTML = '<span class="btn-icon">⏳</span> Syncing…';

    try {
      const { weekCode, data } = await syncAttendance();

      if (data.inserted === 0) {
        showAlert('No raid signups found for this week.', 'No Data');
      } else {
        showMessage('attendance', 'success', `✓ ${data.message}`);
      }

      await loadAttendance(weekCode);
    } catch (err) {
      showMessage('attendance', 'error', `✗ ${err.message}`);
    } finally {
      syncAttendanceBtn.disabled = false;
      syncAttendanceBtn.innerHTML = '<span class="btn-icon">🔄</span> Sync Attendance';
    }
  });
}

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
