import { ensureTablesExist } from '../db-init.js';
import { logEvent } from '../utils/logger.js';

/**
 * Fetch item slot name from WoWhead XML
 * Example: <inventorySlot id="17">Two-Hand</inventorySlot>
 * Returns { slot: string, tooltip: string }
 */
async function fetchWowheadData(itemId) {
  if (!itemId || itemId === 0) return { slot: '', tooltip: '' };
  
  try {
    const url = `https://www.wowhead.com/item=${itemId}&xml`;
    const response = await fetch(url);
    if (!response.ok) return { slot: '', tooltip: '' };
    
    const xml = await response.text();
    // Support self-closing <inventorySlot id="X"/> or full <inventorySlot id="X">Name</inventorySlot>
    const slotMatch = xml.match(/<inventorySlot id="(\d+)"(?:\s*\/>|>(.*?)<\/inventorySlot>)/);
    // Support both <tooltip> and <htmlTooltip>
    const tooltipMatch = xml.match(/<(?:html)?Tooltip>(.*?)<\/(?:html)?Tooltip>/s);
    
    return {
      slot: slotMatch ? (slotMatch[2] || '') : '',
      slotId: slotMatch ? slotMatch[1] : null,
      tooltip: tooltipMatch ? tooltipMatch[1] : ''
    };
  } catch (err) {
    console.error(`Error fetching WoWhead XML for item ${itemId}:`, err);
    return { slot: '', tooltip: '' };
  }
}

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
  }

  await ensureTablesExist(env);

  try {
    const rawData = await request.json();
    
    // 1. Flatten the JSON if it's nested under factionrealm
    let playersData = rawData;
    if (rawData.factionrealm && typeof rawData.factionrealm === 'object') {
      playersData = {};
      for (const realmData of Object.values(rawData.factionrealm)) {
        if (typeof realmData === 'object') {
          for (const [charKey, items] of Object.entries(realmData)) {
            playersData[charKey] = items;
          }
        }
      }
    }

    if (!playersData || typeof playersData !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid JSON format. Expected an object with character keys.' }), { status: 400, headers });
    }

    // 2. Fetch Roster to map "Player-Realm" to character_id and name
    const { results: rosterRows } = await env.DB.prepare("SELECT character_id, name, realm FROM roster").all();
    const characterMap = new Map(); // Key: "name-realm" (normalized), Value: { id, name }
    for (const row of rosterRows) {
      // RCLC strips spaces from realm names in keys (e.g. "Moon Guard" -> "MoonGuard")
      const normalizedRealm = row.realm.replace(/\s+/g, '');
      const key = `${row.name}-${normalizedRealm}`.toLowerCase();
      characterMap.set(key, { id: row.character_id, name: row.name });
    }

    // 3. Fetch Gear Values for GP mapping
    const { results: gearRows } = await env.DB.prepare("SELECT slot_name, point_value FROM epgp_gear_values").all();
    const gearMap = new Map();
    for (const row of gearRows) {
      gearMap.set(row.slot_name.toLowerCase(), row.point_value);
    }

    // 4. Fetch existing RCLootCouncil IDs to avoid duplicates
    const { results: existingLoot } = await env.DB.prepare("SELECT rclootcouncil_id FROM loot_history").all();
    const existingIds = new Set(existingLoot.map(l => l.rclootcouncil_id));

    let insertedCount = 0;
    let updatedCount = 0;
    let gpAwardedCount = 0;
    const now = new Date().toISOString();
    const errors = [];
    const insertedItems = [];
    
    // Simple cache to avoid redundant WoWhead requests during this sync
    const slotCache = new Map();

    // 5. Process the data
    const batchStatements = [];
    const gpStatements = [];

    for (const [charKey, items] of Object.entries(playersData)) {
      if (!Array.isArray(items)) continue;

      // Normalize incoming key for matching (RCLC strips spaces from realms in keys)
      const normalizedCharKey = charKey.replace(/\s+/g, '').toLowerCase();
      const charInfo = characterMap.get(normalizedCharKey);
      
      for (const item of items) {
        // Map RCLootCouncil fields
        const rclcId = (item.id || item.lootCouncilID || `${charKey}-${item.itemID || item.itemId || 0}-${item.date}-${item.time}`).toString();
        
        // Track whether this is a new entry or an update to fill missing fields
        const isNew = !existingIds.has(rclcId);
        
        // Skip Normal difficulty if specified (User requirement: 'normal' or ID 14)
        const difficulty = (item.difficulty || item.difficultyID || '').toString();
        if (difficulty.toLowerCase().includes('normal') || difficulty === "14") {
          continue;
        }

        // Skip specific responses (User requirement: "Personal Loot - Non tradeable")
        const response = item.response || '';
        if (response === "Personal Loot - Non tradeable") {
          continue;
        }

        try {
          // Parse item ID and Name from lootWon link (Robust ID extraction)
          const lootWon = item.lootWon || '';
          const idMatch = lootWon.match(/item:(\d+)/i);
          const nameMatch = lootWon.match(/\|h\[(.*?)\]\|h/);
          
          const itemId = idMatch ? parseInt(idMatch[1], 10) : (item.itemID || item.itemId || 0);
          const itemName = nameMatch ? nameMatch[1] : (item.itemName || 'Unknown Item');
          
          const instance = item.instance || item.zone || '';
          const boss = item.boss || item.encounter || '';
          const typeCode = item.typeCode || '';
          const response = item.response || '';

          // FETCH SLOT FROM WOWHEAD XML
          let itemSlot = '';
          if (typeCode === 'TOKEN' || (item.itemSlot || '').toUpperCase() === 'TOKEN') {
            itemSlot = 'TOKEN';
          } else if (itemId > 0) {
            let data;
            if (slotCache.has(itemId)) {
              data = slotCache.get(itemId);
            } else {
              data = await fetchWowheadData(itemId);
              slotCache.set(itemId, data);
            }

            // High-precision logic for Slot ID 0
            if (data.slotId === "0" || data.slot === "Token") {
              const tooltipLower = (data.tooltip || '').toLowerCase();
              if (tooltipLower.includes('synthesize') || data.slot === "Token") {
                itemSlot = 'TOKEN';
              } else if (tooltipLower.includes('decor')) {
                itemSlot = 'DECOR';
              } else {
                itemSlot = data.slot;
              }
            } else {
              itemSlot = data.slot;
            }
          }

          // Fallback to JSON slot if XML failed and it's not a TOKEN
          if (!itemSlot) {
            itemSlot = item.itemSlot || '';
          }
          
          // Parse date/time
          let awardedAt = '';
          if (item.date && item.time) {
             const parts = item.date.split('/');
             if (parts.length === 3) {
               if (parts[0].length === 4) { // YYYY/MM/DD
                 awardedAt = `${parts[0]}-${parts[1]}-${parts[2]} ${item.time}`;
               } else { // MM/DD/YY
                 const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                 awardedAt = `${year}-${parts[0]}-${parts[1]} ${item.time}`;
               }
             }
          }

          // GP Award (Only if character matched AND this is a NEW item)
          // Map both "TOKEN" and "tier token" to the "tier token" key in settings
          const normalizedSlot = (itemSlot || '').toLowerCase();
          const slotKey = (normalizedSlot === 'token' || normalizedSlot === 'tier token') ? 'token' : normalizedSlot;
          const gpAmount = gearMap.get(slotKey) || 0;

          if (isNew && charInfo && gpAmount > 0) {
            gpStatements.push(
              env.DB.prepare(`
                INSERT INTO gp_log (name, gp, reason, timestamp)
                VALUES (?, ?, ?, ?)
              `).bind(charInfo.name, gpAmount, `Awarded ${itemName} (Loot History)`, now)
            );
            gpAwardedCount++;
          }

          batchStatements.push(
            env.DB.prepare(`
              INSERT OR REPLACE INTO loot_history (
                rclootcouncil_id, item_id, slot, 
                character_id, awarded_at, 
                difficulty, instance, boss, typeCode, response, note, gp_value
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              rclcId.toString(),
              itemId,
              itemSlot,
              charInfo ? charInfo.id : 0,
              awardedAt,
              difficulty,
              instance,
              boss,
              typeCode || '',
              response,
              item.note || '',
              gpAmount
            )
          );
          
          if (isNew) {
            insertedCount++;
            insertedItems.push({ name: itemName, char: charInfo ? charInfo.name : charKey, gp: gpAmount });
            existingIds.add(rclcId); 
          } else {
            updatedCount++;
          }
        } catch (e) {
          errors.push(`Error processing item ${rclcId} for ${charKey}: ${e.message}`);
        }
      }
    }

    // 6. Execute Batch and Purge
    const allStatements = [...gpStatements, ...batchStatements];
    
    // Always add the purge to ensure existing records are removed even if no new items are synced
    allStatements.push(env.DB.prepare(`
      DELETE FROM loot_history 
      WHERE (LOWER(difficulty) LIKE '%normal%' AND LOWER(difficulty) NOT LIKE '%heroic%')
         OR CAST(difficulty AS INTEGER) = 14
         OR response = 'Personal Loot - Non tradeable'
    `));

    await env.DB.batch(allStatements);

    await logEvent(env, 'success', 'Loot', `Processed ${insertedCount + updatedCount} loot items (${insertedCount} new, ${updatedCount} updated, ${gpAwardedCount} GP)`, { insertedCount, updatedCount, gpAwardedCount, errors });

    return new Response(JSON.stringify({
      success: true,
      message: `✓ Success: ${insertedCount} new items, ${updatedCount} records updated, ${gpAwardedCount} items awarded GP.`,
      inserted: insertedCount,
      updated: updatedCount,
      gpAwarded: gpAwardedCount,
      insertedItems: insertedItems,
      errors: errors.length > 0 ? errors : null
    }), { headers });

  } catch (err) {
    await logEvent(env, 'error', 'API', `JSON Loot Import failed: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
