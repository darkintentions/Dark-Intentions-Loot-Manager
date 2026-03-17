/* ================================================================
   Dark Intentions Loot Manager — Frontend App
   ================================================================ */

'use strict';

// ── DOM helpers ──────────────────────────────────────────────────
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Auth Handling ────────────────────────────────────────────────
let currentUser = null;
let authToken = localStorage.getItem('auth_token');

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  options.headers = headers;
  const response = await fetch(url, options);
  
  if (response.status === 401) {
    // Session expired or invalid
    authToken = null;
    currentUser = null;
    localStorage.removeItem('auth_token');
    updateAuthUI();
    const activeTabPanel = document.querySelector('.tab-panel.active');
    const currentTab = activeTabPanel ? activeTabPanel.id.replace('tab-', '') : '';
    if (['epgp', 'admin', 'logs', 'users'].includes(currentTab)) {
      switchTab('roster');
    }
  }
  return response;
}

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

function formatDateWithDay(dateString) {
  if (!dateString) return '';
  // Ensure we handle both YYYY-MM-DD and full ISO/Local strings
  const date = new Date(dateString.includes(' ') ? dateString : dateString + 'T12:00:00'); 
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[date.getDay()];
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${dayName}, ${yyyy}-${mm}-${dd}`;
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
  // For signups, always load to get latest data
  if (name === 'signups') {
    loadSignups().catch(err => showMessage('signups', 'error', `✗ Failed to load signups: ${err.message}`));
    return;
  }

  if (!tabLoaded[name]) {
    tabLoaded[name] = true;
    switch (name) {
      case 'roster': loadRoster(); break;
      case 'loot': loadLootHistory(); break;
      case 'epgp': loadEpgp(); break;
      case 'admin': loadAdminSettings(); break;
      case 'logs': loadLogs(); break;
      case 'users': loadUsers(); break;
      case 'attendance': loadAttendance(); break;
      case 'on-time': loadOnTime(); break;
    }
  }
  // Always force reload logs and attendance
  if (name === 'logs') {
    tabLoaded.logs = false;
    loadLogs();
  }
  if (name === 'attendance') {
    tabLoaded.attendance = false;
    loadAttendance();
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
    const res  = await apiFetch('/api/roster');
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
    const res = await apiFetch(`/api/transaction-history?name=${encodeURIComponent(characterName)}`);
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
      apiFetch(`/api/item-info?id=${id}`)
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

  // Pre-fill form with current values
  amountInput.value = transaction.amount || 0;
  reasonInput.value = transaction.reason || '';
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
    const res = await apiFetch(`/api/transaction-history?id=${transactionId}&type=${transactionType}`, {
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
      
      // Reload the roster totals then the history modal
      await loadRoster();
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
    const res  = await apiFetch('/api/roster', { method: 'POST' });
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
    const res  = await apiFetch('/api/epgp');
    const data = await res.json();

    if (data.error) throw new Error(data.error);
    renderEpgpTable(data.gear_values || []);
    
    // Populate Vault Settings
    if (data.vault_settings) {
      $('#min-vault-level-input').value = data.vault_settings.min_vault_level || '272';
      $('#vault-1-ep-input').value = data.vault_settings.vault_1_ep || '1';
      $('#vault-2-ep-input').value = data.vault_settings.vault_2_ep || '1';
      $('#vault-3-ep-input').value = data.vault_settings.vault_3_ep || '1';
      
      // Populate Sign Up EP
      if ($('#signup-ep-input')) {
        $('#signup-ep-input').value = data.vault_settings.signup_ep || '1';
      }
      if ($('#signup-reason-input')) {
        $('#signup-reason-input').value = data.vault_settings.signup_reason || 'On Time';
      }
      
      // Populate On Time EP
      if ($('#ontime-ep-input')) {
        $('#ontime-ep-input').value = data.vault_settings.on_time_ep || '1';
      }
      if ($('#ontime-reason-input')) {
        $('#ontime-reason-input').value = data.vault_settings.on_time_reason || 'Early Sign Up';
      }
      
      // Populate Default GP
      if ($('#default-gp-input')) {
        $('#default-gp-input').value = data.vault_settings.default_gp || '2';
      }

      // Enhanced Manual EP Awards: Populate datalist
      const reasonList = $('#reason-suggestions');
      if (reasonList) {
        reasonList.innerHTML = '';
        const reasons = [
          data.vault_settings.signup_reason || 'On Time',
          data.vault_settings.on_time_reason || 'Early Sign Up'
        ];
        reasons.forEach(r => {
          const option = document.createElement('option');
          option.value = r;
          reasonList.appendChild(option);
        });
      }
      
      // Store special reasons for later comparison
      window.specialReasons = {
        signup: data.vault_settings.signup_reason || 'On Time',
        ontime: data.vault_settings.on_time_reason || 'Early Sign Up'
      };
    }

    populateOnTimeBonus();
    populateGpBulk();
    await loadCustomEpButtons();
    
    // Add Vault Settings save listener
    const saveVaultBtn = $('#save-vault-settings-btn');
    if (saveVaultBtn) {
      // Remove old listener if exists
      const newBtn = saveVaultBtn.cloneNode(true);
      saveVaultBtn.parentNode.replaceChild(newBtn, saveVaultBtn);
      
      newBtn.addEventListener('click', async () => {
        const vault_settings = {
          min_vault_level: $('#min-vault-level-input').value,
          vault_1_ep: $('#vault-1-ep-input').value,
          vault_2_ep: $('#vault-2-ep-input').value,
          vault_3_ep: $('#vault-3-ep-input').value
        };

        newBtn.disabled = true;
        const originalHtml = newBtn.innerHTML;
        newBtn.innerHTML = '<span class="btn-spinner"></span> Saving…';

        try {
          const sRes = await apiFetch('/api/epgp', {
            method: 'POST',
            body: JSON.stringify({ vault_settings })
          });
          const sData = await sRes.json();
          if (sData.success) {
            showMessage('epgp', 'success', '✓ Vault settings saved successfully');
            clearUnsavedChanges();
          } else {
            throw new Error(sData.error || 'Failed to save vault settings');
          }
        } catch (err) {
          showMessage('epgp', 'error', `✗ Error: ${err.message}`);
        } finally {
          newBtn.disabled = false;
          newBtn.innerHTML = originalHtml;
        }
      });
    }

    // Add Sign Up Settings save listener
    const saveSignupBtn = $('#save-signup-settings-btn');
    if (saveSignupBtn) {
      // Remove old listener if exists
      const newBtn = saveSignupBtn.cloneNode(true);
      saveSignupBtn.parentNode.replaceChild(newBtn, saveSignupBtn);
      
      newBtn.addEventListener('click', async () => {
        const vault_settings = {
          signup_ep: $('#signup-ep-input').value,
          signup_reason: $('#signup-reason-input').value
        };

        newBtn.disabled = true;
        const originalHtml = newBtn.innerHTML;
        newBtn.innerHTML = '<span class="btn-spinner"></span> Saving…';

        try {
          const sRes = await apiFetch('/api/epgp', {
            method: 'POST',
            body: JSON.stringify({ vault_settings })
          });
          const sData = await sRes.json();
          if (sData.success) {
            showMessage('epgp', 'success', '✓ Sign Up settings saved successfully');
            clearUnsavedChanges();
          } else {
            throw new Error(sData.error || 'Failed to save settings');
          }
        } catch (err) {
          showMessage('epgp', 'error', `✗ Error: ${err.message}`);
        } finally {
          newBtn.disabled = false;
          newBtn.innerHTML = originalHtml;
        }
      });
    }

    // Add On Time Settings save listener
    const saveOntimeBtn = $('#save-ontime-settings-btn');
    if (saveOntimeBtn) {
      const newBtn = saveOntimeBtn.cloneNode(true);
      saveOntimeBtn.parentNode.replaceChild(newBtn, saveOntimeBtn);
      
      newBtn.addEventListener('click', async () => {
        const vault_settings = {
          on_time_ep: $('#ontime-ep-input').value,
          on_time_reason: $('#ontime-reason-input').value
        };

        newBtn.disabled = true;
        const originalHtml = newBtn.innerHTML;
        newBtn.innerHTML = '<span class="btn-spinner"></span> Saving…';

        try {
          const sRes = await apiFetch('/api/epgp', {
            method: 'POST',
            body: JSON.stringify({ vault_settings })
          });
          const sData = await sRes.json();
          if (sData.success) {
            showMessage('epgp', 'success', '✓ On Time settings saved successfully');
            clearUnsavedChanges();
          } else {
            throw new Error(sData.error || 'Failed to save settings');
          }
        } catch (err) {
          showMessage('epgp', 'error', `✗ Error: ${err.message}`);
        } finally {
          newBtn.disabled = false;
          newBtn.innerHTML = originalHtml;
        }
      });
    }

    // Add Default GP save listener
    const saveDefaultGpBtn = $('#save-default-gp-btn');
    if (saveDefaultGpBtn) {
      const newBtn = saveDefaultGpBtn.cloneNode(true);
      saveDefaultGpBtn.parentNode.replaceChild(newBtn, saveDefaultGpBtn);
      
      newBtn.addEventListener('click', async () => {
        const defaultGp = $('#default-gp-input').value.trim();
        if (!defaultGp || isNaN(defaultGp) || parseInt(defaultGp) < 0) {
          showMessage('epgp', 'error', '✗ Default GP must be a non-negative number.');
          return;
        }

        newBtn.disabled = true;
        const originalHtml = newBtn.innerHTML;
        newBtn.innerHTML = '<span class="btn-spinner"></span> Saving…';

        try {
          const sRes = await apiFetch('/api/epgp', {
            method: 'POST',
            body: JSON.stringify({ 
              vault_settings: { default_gp: defaultGp } 
            })
          });
          const sData = await sRes.json();
          if (sData.success) {
            showMessage('epgp', 'success', `✓ Default GP updated to ${defaultGp}`);
            clearUnsavedChanges();
          } else {
            throw new Error(sData.error || 'Failed to save settings');
          }
        } catch (err) {
          showMessage('epgp', 'error', `✗ Error: ${err.message}`);
        } finally {
          newBtn.disabled = false;
          newBtn.innerHTML = originalHtml;
        }
      });
    }

  } catch (err) {
    showMessage('epgp', 'error', `✗ Error loading EPGP data: ${err.message}`);
    renderEpgpTable([]);
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

function populateGpBulk() {
  const tbody = $('#edit-gp-bulk-tbody');
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
        <td><input type="checkbox" class="gp-bulk-checkbox" value="${char1.name}"></td>
        <td>${escHtml(char1.name)}</td>
        ${char2 ? `
          <td><input type="checkbox" class="gp-bulk-checkbox" value="${char2.name}"></td>
          <td>${escHtml(char2.name)}</td>
        ` : `
          <td></td>
          <td></td>
        `}
        ${char3 ? `
          <td><input type="checkbox" class="gp-bulk-checkbox" value="${char3.name}"></td>
          <td>${escHtml(char3.name)}</td>
        ` : `
          <td></td>
          <td></td>
        `}
        ${char4 ? `
          <td><input type="checkbox" class="gp-bulk-checkbox" value="${char4.name}"></td>
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
    const res  = await apiFetch('/api/epgp', {
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

// Edit EP - Select/Unselect Everyone Button
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

// Edit EP - Give Points Button
$('#give-bonus-btn').addEventListener('click', async () => {
  const btn = $('#give-bonus-btn');
  const bonusEp = parseInt($('#bonus-ep-input').value, 10);
  const reason = $('#bonus-reason-input').value.trim();
  const specialDate = $('#bonus-date-input').value;

  if (isNaN(bonusEp) || bonusEp <= 0) {
    showMessage('epgp', 'error', '✗ Please enter a valid EP amount');
    return;
  }

  if (!reason) {
    showMessage('epgp', 'error', '✗ Please enter a reason');
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
    const isSpecial = window.specialReasons && (reason === window.specialReasons.signup || reason === window.specialReasons.ontime);
    const finalReason = reason + (isSpecial ? '' : ' (Manually Modified)');
    const finalTimestamp = specialDate ? new Date(specialDate).toISOString() : new Date().toISOString();

    const allCharacterNames = Array.from($$('.bonus-checkbox')).map(cb => cb.value);

    const response = await apiFetch('/api/ep-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        names: selectedCharacters,
        ep: bonusEp,
        reason: finalReason,
        timestamp: finalTimestamp,
        isSpecial: isSpecial,
        specialDate: specialDate,
        allNames: allCharacterNames
      }),
    });

    const data = await response.json();

    if (data.success) {
      showMessage('epgp', 'success', `✓ EP awarded to ${selectedCharacters.length} member(s)`);
      $('#bonus-ep-input').value = '';
      $('#bonus-reason-input').value = '';
      $('#bonus-date-input').value = '';
      $('#bonus-date-input').classList.add('hidden');
      $$('.bonus-checkbox').forEach(checkbox => { checkbox.checked = false; });
      $('#select-everyone-btn').innerHTML = '<span class="btn-icon">✓</span> Select Everyone';
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

// Enhanced Manual EP Awards: Toggle date picker
if ($('#bonus-reason-input') && $('#bonus-date-input')) {
  $('#bonus-reason-input').addEventListener('input', () => {
    const val = $('#bonus-reason-input').value.trim();
    if (window.specialReasons && (val === window.specialReasons.signup || val === window.specialReasons.ontime)) {
      $('#bonus-date-input').classList.remove('hidden');
      if (!$('#bonus-date-input').value) {
        $('#bonus-date-input').value = new Date().toISOString().split('T')[0];
      }
    } else {
      $('#bonus-date-input').classList.add('hidden');
    }
  });
}

// Edit GP - Select/Unselect Everyone Button
$('#select-everyone-gp-btn').addEventListener('click', () => {
  const btn = $('#select-everyone-gp-btn');
  const isSelecting = btn.textContent.includes('Select');

  $$('.gp-bulk-checkbox').forEach(checkbox => {
    checkbox.checked = isSelecting;
  });

  if (isSelecting) {
    btn.innerHTML = '<span class="btn-icon">✕</span> Unselect Everyone';
  } else {
    btn.innerHTML = '<span class="btn-icon">✓</span> Select Everyone';
  }
});

// Edit GP - Give Points Button
$('#give-gp-btn').addEventListener('click', async () => {
  const btn = $('#give-gp-btn');
  const gpAmount = parseInt($('#bulk-gp-input').value, 10);
  const reason = $('#bulk-gp-reason-input').value.trim();

  if (isNaN(gpAmount) || gpAmount <= 0) {
    showMessage('epgp', 'error', '✗ Please enter a valid GP amount');
    return;
  }

  if (!reason) {
    showMessage('epgp', 'error', '✗ Please enter a reason');
    return;
  }

  const selectedCharacters = Array.from($$('.gp-bulk-checkbox:checked'))
    .map(checkbox => checkbox.value);

  if (selectedCharacters.length === 0) {
    showMessage('epgp', 'error', '✗ Please select at least one character');
    return;
  }

  btn.disabled = true;

  try {
    const response = await apiFetch('/api/gp-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        names: selectedCharacters,
        gp: gpAmount,
        reason: reason + ' (Manually Modified)',
        timestamp: new Date().toISOString(),
      }),
    });

    const data = await response.json();

    if (data.success) {
      showMessage('epgp', 'success', `✓ GP awarded to ${selectedCharacters.length} member(s)`);
      $('#bulk-gp-input').value = '';
      $('#bulk-gp-reason-input').value = '';
      $$('.gp-bulk-checkbox').forEach(checkbox => { checkbox.checked = false; });
      $('#select-everyone-gp-btn').innerHTML = '<span class="btn-icon">✓</span> Select Everyone';
      await loadRoster();
      clearUnsavedChanges();
    } else {
      showMessage('epgp', 'error', `✗ ${data.error || 'Failed to award GP'}`);
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
    const res  = await apiFetch('/api/settings');
    const data = await res.json();
    if (data.api_key) {
      $('#api-key-input').value = data.api_key;
    }
    if (data.default_gp) {
      $('#default-gp-input').value = data.default_gp;
    }
    if (data.enable_logging) {
      const isEnabled = data.enable_logging === 'true';
      $('#enable-logging-toggle').checked = isEnabled;
      $('#enable-logging-label').textContent = isEnabled ? 'Enabled' : 'Disabled';
      $('#enable-logging-label').style.color = isEnabled ? '#4caf73' : '#e05555';
    }
  } catch {
    // Settings may just not be set yet; fail silently
  }

  // Populate character dropdowns
  await populateCharacterDeleteSelect();
  await populateMergeDropdowns();
}

async function populateMergeDropdowns() {
  const sourceSelect = $('#merge-source-select');
  const targetSelect = $('#merge-target-select');
  if (!sourceSelect || !targetSelect) return;

  try {
    // 1. Load Roster (Targets)
    const rosterRes = await apiFetch('/api/roster');
    const rosterData = await rosterRes.json();

    targetSelect.innerHTML = '<option value="">— Select active character —</option>';
    if (rosterData.roster && rosterData.roster.length > 0) {
      rosterData.roster
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(char => {
          const option = document.createElement('option');
          option.value = char.name;
          option.textContent = char.name;
          targetSelect.appendChild(option);
        });
    }

    // 2. Load Orphans (Sources)
    const orphanRes = await apiFetch('/api/roster/orphans');
    const orphanData = await orphanRes.json();

    if (orphanData.success && orphanData.orphans) {
      sourceSelect.innerHTML = '<option value="">— Select orphaned character —</option>';
      if (orphanData.orphans.length === 0) {
        sourceSelect.innerHTML = '<option value="">(No orphans found)</option>';
      } else {
        orphanData.orphans.forEach(name => {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          sourceSelect.appendChild(option);
        });
      }
    } else {
      sourceSelect.innerHTML = '<option value="">Error loading</option>';
    }

  } catch (err) {
    console.error('Failed to populate merge dropdowns:', err);
  }
}

$('#rename-character-btn').addEventListener('click', async () => {
  const oldName = $('#merge-source-select').value;
  const newName = $('#merge-target-select').value;
  const btn = $('#rename-character-btn');

  if (!oldName || !newName) {
    showMessage('admin', 'error', '✗ Please select both source and target names');
    return;
  }

  const confirmed = await showConfirm({
    title: 'Merge Character history',
    message: `Merge all logs from "${oldName}" into "${newName}"? This action cannot be easily undone.`,
    confirmText: 'Confirm Merge',
  });

  if (!confirmed) return;

  btn.disabled = true;

  try {
    const res = await apiFetch('/api/character-rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
    });

    const data = await res.json();
    if (data.success) {
      showMessage('admin', 'success', `✓ ${data.message}`);
      await populateMergeDropdowns();
      loadRoster();
    } else {
      showMessage('admin', 'error', `✗ ${data.error || 'Merge failed'}`);
    }
  } catch (err) {
    showMessage('admin', 'error', `✗ Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});

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
    const res  = await apiFetch('/api/settings', {
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

// Save enable logging setting
$('#enable-logging-toggle').addEventListener('change', (e) => {
  const isEnabled = e.target.checked;
  $('#enable-logging-label').textContent = isEnabled ? 'Enabled' : 'Disabled';
  $('#enable-logging-label').style.color = isEnabled ? '#4caf73' : '#e05555';
  markUnsavedChanges();
});

$('#save-logging-btn').addEventListener('click', async () => {
  const btn = $('#save-logging-btn');
  const isEnabled = $('#enable-logging-toggle').checked;

  btn.disabled = true;

  try {
    const res = await apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'enable_logging', value: String(isEnabled) }),
    });
    const data = await res.json();

    if (data.success) {
      showMessage('admin', 'success', `✓ System logging ${isEnabled ? 'enabled' : 'disabled'}`);
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
    const res = await apiFetch('/api/roster');
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
    const res = await apiFetch(`/api/character-delete?name=${encodeURIComponent(characterName)}`, {
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
    const res = await apiFetch('/api/roster-delete', {
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
    const res = await apiFetch('/api/custom-ep-buttons');
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
        const res = await apiFetch('/api/ep-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
          name: selectedChar,
          ep: buttonEp,
          reason: (buttonDescription || buttonName) + ' (Manually Modified)',
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
    const res = await apiFetch('/api/custom-ep-buttons', {
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

  if (!amount || isNaN(parseInt(amount))) {
    showMessage('roster', 'error', '✗ Please enter a valid amount');
    return;
  }

  saveEditTransactionBtn.disabled = true;

  try {
    const res = await apiFetch(`/api/transaction-history?id=${id}&type=${type}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseInt(amount), reason }),
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
    const res = await apiFetch('/api/wowaudit-period');
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
    const res = await apiFetch('/api/sync-loot-from-wowaudit', { method: 'POST' });
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
    const res = await apiFetch('/api/loot-history');
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
//  SIGN UPS TAB — Fetch and Display Raid Signups
// ================================================================

async function loadSignups() {
  const container = $('#signups-container');
  if (!container) return;
  
  container.innerHTML = '<div class="empty-row text-center" style="padding: 20px;">Loading sign ups...</div>';

  try {
    const res = await apiFetch(`/api/signups`);
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to load signups');
    }
    
    const signups = data.signups || [];
    renderSignups(signups);
  } catch (err) {
    showMessage('signups', 'error', `✗ Error loading signups: ${err.message}`);
    container.innerHTML = `<div class="empty-row text-center" style="padding: 20px; color: #ff4444;">Error: ${escHtml(err.message)}</div>`;
  }
}

function getSignupStatusClass(status) {
  if (!status || status === 'Unknown') return 'status-unknown';
  if (status === 'Present' || status === 'Accepted' || status === 'On time' || status === 'On Time') return 'status-present';
  if (status === 'Absent' || status === 'Declined' || status === 'Late or Absent' || status === 'Late/Absent') return 'status-absent';
  if (status === 'Tentative' || status === 'Late') return 'status-tentative';
  return 'status-tentative';
}

function renderSignups(signups) {
  const container = $('#signups-container');
  if (!container) return;

  if (signups.length === 0) {
    container.innerHTML = '<div class="empty-row text-center" style="padding: 20px;">No sign ups data available yet.</div>';
    return;
  }

  // Group by Date
  const grouped = {};
  signups.forEach(s => {
    if (!grouped[s.date]) {
      grouped[s.date] = [];
    }
    grouped[s.date].push(s);
  });

  // Sort dates descending
  const dates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  let html = '';
  dates.forEach((date, i) => {
    const records = grouped[date];
    // Start expanded for the most recent date, collapsed for others
    const collapsedClass = i === 0 ? '' : 'collapsed';
    const displayStyle = i === 0 ? '' : 'style="display: none;"';

    html += `
      <div class="collapsible-section" style="margin-bottom: 10px;">
        <button class="collapsible-header ${collapsedClass}" data-target="signups-${date}" style="width: 100%; text-align: left; padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); cursor: pointer; color: #e1e1e6;">
          <span class="collapse-icon">${i === 0 ? '▼' : '▶'}</span>
          <strong style="margin-left: 10px; font-size: 1.1em;">Raid Date: ${formatDateWithDay(date)} <span style="font-weight: normal; font-size: 0.9em; color: #aaa;">(${records.length} Signups)</span></strong>
        </button>
        <div id="signups-${date}" class="collapsible-content" ${displayStyle}>
          <table class="data-table" style="table-layout: fixed; width: 100%;">
            <colgroup>
              <col style="width: 25%;">
              <col style="width: 15%;">
              <col style="width: 10%;">
              <col style="width: 2px;">
              <col style="width: 25%;">
              <col style="width: 15%;">
              <col style="width: 10%;">
            </colgroup>
            <thead>
              <tr>
                <th>Character</th>
                <th>Status</th>
                <th>EP</th>
                <th style="border-left: 2px solid rgba(255,255,255,0.1); padding: 0;"></th>
                <th>Character</th>
                <th>Status</th>
                <th>EP</th>
              </tr>
            </thead>
            <tbody>
              ${(() => {
                let rows = '';
                for (let j = 0; j < records.length; j += 2) {
                  const r1 = records[j];
                  const r2 = records[j + 1];

                  const getCellHtml = (r) => {
                    const statusClass = r ? getSignupStatusClass(r.status) : '';
                    const epBadge = r ? (r.ep_awarded 
                      ? `<span style="color: #4CAF50; font-weight: bold;">+${r.ep_awarded}</span>` 
                      : (r.status !== 'Unknown' ? '<span style="color: #FFC107; font-size: 0.85em;">Pending</span>' : '<span style="color: #888; font-size: 0.85em;">—</span>')) : '';
                    const classCssName = r ? classCss(r.class) : '';
                    
                    return `
                      <td>${r ? `<strong class="${classCssName}">${escHtml(r.character_name)}</strong>` : ''}</td>
                      <td class="${statusClass}">${r ? escHtml(r.status) : ''}</td>
                      <td>${epBadge}</td>
                    `;
                  };

                  rows += `
                    <tr>
                      ${getCellHtml(r1)}
                      <td style="border-left: 2px solid rgba(255,255,255,0.1); padding: 0; width: 0;"></td>
                      ${getCellHtml(r2)}
                    </tr>
                  `;
                }
                return rows;
              })()}
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Add click listeners to new collapsible headers
  container.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const isCollapsed = header.classList.contains('collapsed');
      const targetId = header.getAttribute('data-target');
      const targetContent = document.getElementById(targetId);
      
      if (isCollapsed) {
        header.classList.remove('collapsed');
        header.querySelector('.collapse-icon').textContent = '▼';
        targetContent.style.display = 'block';
      } else {
        header.classList.add('collapsed');
        header.querySelector('.collapse-icon').textContent = '▶';
        targetContent.style.display = 'none';
      }
    });
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
//  SYSTEM LOGS TAB
// ================================================================
let systemLogs = [];

async function loadLogs() {
  const tbody = $('#logs-tbody');
  tbody.innerHTML = '<tr class="empty-row"><td colspan="5" class="loading">Loading logs...</td></tr>';
  
  try {
    const res = await apiFetch('/api/logs');
    const data = await res.json();
    if (data.success) {
      systemLogs = data.logs || [];
      renderLogs();
    } else {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Error: ${escHtml(data.error)}</td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Network Error: ${escHtml(err.message)}</td></tr>`;
  }
}

function renderLogs() {
  const tbody = $('#logs-tbody');
  const filterCat = $('#log-category-filter').value;
  
  const filtered = filterCat === 'All' ? systemLogs : systemLogs.filter(L => L.category === filterCat);
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No logs found.</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(log => {
    const time = new Date(log.timestamp).toLocaleString();
    const levelClass = `log-${(log.level || 'info').toLowerCase()}`;
    const detailsBtn = log.details ? 
      `<button class="btn btn-secondary btn-small view-log-details-btn" data-log-id="${log.id}">Details</button>` : 
      '<span class="color-text-muted">—</span>';
      
    // Store JSON in an invisible data attribute to parse easily later
    const encodedDetails = log.details ? escHtml(log.details) : '';
      
    return `
      <tr>
        <td style="white-space:nowrap;">${time}</td>
        <td><strong>${escHtml(log.category)}</strong></td>
        <td><span class="log-level-badge ${levelClass}">${escHtml(log.level)}</span></td>
        <td style="max-width: 400px; white-space: normal;">${escHtml(log.message)}</td>
        <td data-details="${encodedDetails}">${detailsBtn}</td>
      </tr>
    `;
  }).join('');
  
  // Attach listeners to details buttons
  $$('.view-log-details-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const td = btn.closest('td');
      const detailsStr = td.getAttribute('data-details');
      let prettyJson = detailsStr;
      try {
        prettyJson = JSON.stringify(JSON.parse(detailsStr), null, 2);
      } catch (e) {
        // Not valid JSON, keep string
      }
      $('#log-details-json').textContent = prettyJson;
      $('#log-details-modal').classList.remove('hidden');
    });
  });
}

$('#refresh-logs-btn').addEventListener('click', loadLogs);

$('#clear-logs-btn').addEventListener('click', async () => {
  const confirmed = await showConfirm({
    title: 'Clear System Logs',
    message: 'Are you sure you want to permanently delete all system logs? This cannot be undone.',
    confirmText: 'Clear Logs',
    confirmClass: 'btn-danger'
  });

  if (!confirmed) return;

  const btn = $('#clear-logs-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span> Clearing…';

  try {
    const res = await apiFetch('/api/logs', { method: 'DELETE' });
    const data = await res.json();

    if (data.success) {
      showMessage('logs', 'success', '✓ System logs cleared');
      await loadLogs();
    } else {
      showMessage('logs', 'error', `✗ ${data.error || 'Failed to clear logs'}`);
    }
  } catch (err) {
    showMessage('logs', 'error', `✗ Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🗑</span> Clear Logs';
  }
});
$('#log-category-filter').addEventListener('change', renderLogs);

// Modal handlers
$('#close-log-details-btn').addEventListener('click', () => $('#log-details-modal').classList.add('hidden'));
$('#log-details-ok-btn').addEventListener('click', () => $('#log-details-modal').classList.add('hidden'));
$('#log-details-modal').addEventListener('click', (e) => {
  if (e.target === $('#log-details-modal')) {
    $('#log-details-modal').classList.add('hidden');
  }
});

// ================================================================
//  ON TIME TAB
// ================================================================
/**
 * Load On Time history
 */
async function loadOnTime() {
  const container = $('#attendance-container');
  if (!container) return;
  container.innerHTML = '<div class="empty-row text-center" style="padding: 20px;">Loading attendance data...</div>';

  try {
    const res = await apiFetch('/api/attendance');
    const data = await res.json();

    if (!data.success) throw new Error(data.error || 'Failed to load');

    if (data.snapshots.length === 0) {
      container.innerHTML = '<div class="empty-row text-center" style="padding: 20px;">No attendance data recorded yet.</div>';
      return;
    }

    let html = '';
    data.snapshots.forEach((snap, index) => {
      const presentCount = snap.members.filter(m => m.attended).length;
      const totalCount = snap.members.length;
      const dateStr = new Date(snap.date).toLocaleString();
      
      // First one expanded, others collapsed
      const collapsedClass = index === 0 ? '' : 'collapsed';
      const displayStyle = index === 0 ? '' : 'style="display: none;"';

      const members = snap.members;
      let rowsHtml = '';
      for (let j = 0; j < members.length; j += 2) {
        const m1 = members[j];
        const m2 = members[j + 1];

        const getCellHtml = (m) => {
          if (!m) return '<td></td><td></td><td></td>';
          const className = classCss(m.class);
          const statusClass = m.attended ? 'status-present' : 'status-absent';
          const statusText = m.attended ? 'On Time' : 'Late/Absent';
          const epText = m.attended ? '<span style="color: #4CAF50; font-weight: bold;">+1</span>' : '<span style="color: #888; font-size: 0.85em;">—</span>';

          return `
            <td><strong class="${className}">${escHtml(m.name)}</strong></td>
            <td class="${statusClass}">${statusText}</td>
            <td>${epText}</td>
          `;
        };

        rowsHtml += `
          <tr>
            ${getCellHtml(m1)}
            <td style="border-left: 2px solid rgba(255,255,255,0.1); padding: 0; width: 0;"></td>
            ${getCellHtml(m2)}
          </tr>
        `;
      }

      html += `
        <div class="collapsible-section" style="margin-bottom: 10px;">
          <button class="collapsible-header ${collapsedClass}" data-target="attendance-${index}" style="width: 100%; text-align: left; padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); cursor: pointer; color: #e1e1e6;">
            <span class="collapse-icon">${index === 0 ? '▼' : '▶'}</span>
            <strong style="margin-left: 10px; font-size: 1.1em;">Raid Date: ${formatDateWithDay(snap.date)} <span style="font-weight: normal; font-size: 0.9em; color: #aaa;">(${presentCount} / ${totalCount} On Time)</span></strong>
          </button>
          <div id="attendance-${index}" class="collapsible-content" ${displayStyle}>
            <table class="data-table" style="table-layout: fixed; width: 100%;">
              <colgroup>
                <col style="width: 25%;">
                <col style="width: 15%;">
                <col style="width: 10%;">
                <col style="width: 2px;">
                <col style="width: 25%;">
                <col style="width: 15%;">
                <col style="width: 10%;">
              </colgroup>
              <thead>
                <tr>
                  <th>Character</th>
                  <th>Status</th>
                  <th>EP</th>
                  <th style="border-left: 2px solid rgba(255,255,255,0.1); padding: 0;"></th>
                  <th>Character</th>
                  <th>Status</th>
                  <th>EP</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      `;
      });
      
      container.innerHTML = html;

      // Add click listeners to new collapsible headers
      container.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', () => {
          const isCollapsed = header.classList.contains('collapsed');
          const targetId = header.getAttribute('data-target');
          const targetContent = document.getElementById(targetId);
          
          if (isCollapsed) {
            header.classList.remove('collapsed');
            header.querySelector('.collapse-icon').textContent = '▼';
            targetContent.style.display = 'block';
          } else {
            header.classList.add('collapsed');
            header.querySelector('.collapse-icon').textContent = '▶';
            targetContent.style.display = 'none';
          }
        });
      });

    } catch (err) {
      container.innerHTML = `<div class="empty-row text-center text-error" style="padding: 20px;">Error: ${escHtml(err.message)}</div>`;
    }
}

// ================================================================
//  AUTHENTICATION & USER MANAGEMENT
// ================================================================

async function loadSession() {
  if (!authToken) return updateAuthUI();
  try {
    const res = await apiFetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
    } else {
      authToken = null;
      currentUser = null;
      localStorage.removeItem('auth_token');
    }
  } catch (err) {
    console.error('Failed to validate session:', err);
  }
  updateAuthUI();
}

function updateAuthUI() {
  const loginBtn = $('#auth-login-btn');
  const logoutBtn = $('#auth-logout-btn');
  const nameLabel = $('#auth-user-name');

  if (currentUser) {
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    nameLabel.textContent = currentUser.username;
    nameLabel.classList.remove('hidden');
    
    if (currentUser.is_admin) {
      $$('.admin-only').forEach(el => el.classList.remove('hidden'));
    }
  } else {
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    nameLabel.classList.add('hidden');
    $$('.admin-only').forEach(el => el.classList.add('hidden'));
  }
}

// ── Login / Logout Handlers ─────────────────────────────────────
$('#auth-login-btn').addEventListener('click', () => {
  $('#login-username').value = '';
  $('#login-password').value = '';
  $('#login-message').classList.add('hidden');
  $('#login-modal').classList.remove('hidden');
  $('#login-username').focus();
});

$('#auth-logout-btn').addEventListener('click', async () => {
  if (authToken) {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  }
  authToken = null;
  currentUser = null;
  localStorage.removeItem('auth_token');
  updateAuthUI();
  const activeTabPanel = document.querySelector('.tab-panel.active');
  const currentTab = activeTabPanel ? activeTabPanel.id.replace('tab-', '') : '';
  if (['epgp', 'admin', 'logs', 'users'].includes(currentTab)) {
    switchTab('roster');
  }
});

$('#close-login-modal-btn').addEventListener('click', () => $('#login-modal').classList.add('hidden'));

$('#login-submit-btn').addEventListener('click', async () => {
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  const msg = $('#login-message');

  if (!username || !password) {
    msg.textContent = 'Please enter both username and password';
    msg.className = 'message error';
    return;
  }

  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('auth_token', authToken);
      $('#login-modal').classList.add('hidden');
      updateAuthUI();
    } else {
      msg.textContent = data.error || 'invalid login';
      msg.className = 'message error';
    }
  } catch (err) {
    msg.textContent = 'invalid login';
    msg.className = 'message error';
  }
});

// ── Users Tab Logic ─────────────────────────────────────────────
async function loadUsers() {
  const tbody = $('#users-tbody');
  const msg = $('#users-message');
  msg.classList.add('hidden');
  tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading accounts...</td></tr>';

  try {
    const res = await apiFetch('/api/users');
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'Failed to load users');

    if (data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center">No accounts found</td></tr>';
      return;
    }

    tbody.innerHTML = data.users.map(u => `
      <tr>
        <td><strong>${escHtml(u.username)}</strong></td>
        <td>${new Date(u.created_at).toLocaleString()}</td>
        <td>
          <label class="switch">
            <input type="checkbox" class="toggle-admin-cb" data-id="${u.id}" ${u.is_admin ? 'checked' : ''} ${u.id === currentUser.id ? 'disabled' : ''}>
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <button class="btn btn-danger btn-sm delete-user-btn" data-id="${u.id}" ${u.id === currentUser.id ? 'disabled' : ''}>Delete</button>
        </td>
      </tr>
    `).join('');

    // Attach Toggle Listeners
    $$('.toggle-admin-cb').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const isAdmin = e.target.checked;
        try {
          const ures = await apiFetch(`/api/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_admin: isAdmin })
          });
          if (!ures.ok) {
            e.target.checked = !isAdmin; // revert
            showMessage('users', 'error', 'Failed to update admin status');
          }
        } catch (err) {
          e.target.checked = !isAdmin; // revert
        }
      });
    });

    // Attach Delete Listeners
    $$('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        const confirmed = await showConfirm({
          title: 'Delete User',
          message: 'Are you sure you want to permanently delete this account?'
        });
        if (!confirmed) return;
        
        try {
          const dres = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
          if (dres.ok) {
            loadUsers();
            showMessage('users', 'success', 'Account deleted');
          } else {
            const errData = await dres.json();
            showMessage('users', 'error', errData.error || 'Failed to delete');
          }
        } catch(err) {
          showMessage('users', 'error', 'Network error');
        }
      });
    });

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-error">Failed to load</td></tr>';
    showMessage('users', 'error', err.message);
  }
}

// Create User Modal Handlers
$('#create-user-btn').addEventListener('click', () => {
  $('#new-username').value = '';
  $('#new-password').value = '';
  $('#new-is-admin').checked = false;
  $('#create-user-message').classList.add('hidden');
  $('#create-user-modal').classList.remove('hidden');
  $('#new-username').focus();
});

$('#close-user-modal-btn').addEventListener('click', () => $('#create-user-modal').classList.add('hidden'));
$('#cancel-user-modal-btn').addEventListener('click', () => $('#create-user-modal').classList.add('hidden'));

$('#create-user-submit-btn').addEventListener('click', async () => {
  const username = $('#new-username').value.trim();
  const password = $('#new-password').value;
  const isAdmin = $('#new-is-admin').checked;
  const msg = $('#create-user-message');

  if (!username || !password) {
    msg.textContent = 'Username and password required';
    msg.className = 'message error';
    return;
  }

  try {
    const res = await apiFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, is_admin: isAdmin })
    });
    const data = await res.json();
    if (res.ok) {
      $('#create-user-modal').classList.add('hidden');
      showMessage('users', 'success', 'Account created successfully');
      loadUsers();
    } else {
      msg.textContent = data.error || 'Failed to create account';
      msg.className = 'message error';
    }
  } catch (err) {
    msg.textContent = 'Network error';
    msg.className = 'message error';
  }
});

// ================================================================
//  INIT — load default tab
// ================================================================
async function init() {
  await loadSession();
  tabLoaded.roster = true;
  loadRoster();
}
init();
