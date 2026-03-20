import { ensureTablesExist } from '../db-init.js';
import { logEvent } from '../utils/logger.js';

/**
 * Fetch item slot name from WoWhead XML
 * Example: <inventorySlot id="17">Two-Hand</inventorySlot>
 */
async function fetchWowheadSlot(itemId) {
  if (!itemId || itemId === 0) return '';
  
  try {
    const url = `https://www.wowhead.com/item=${itemId}&xml`;
    const response = await fetch(url);
    if (!response.ok) return '';
    
    const xml = await response.text();
    // Parse <inventorySlot id="X">Slot Name</inventorySlot>
    const match = xml.match(/<inventorySlot id="\d+">(.*?)<\/inventorySlot>/);
    return match ? match[1] : '';
  } catch (err) {
    console.error(`Error fetching WoWhead XML for item ${itemId}:`, err);
    return '';
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
    let gpAwardedCount = 0;
    const now = new Date().toISOString();
    
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
        const rclcId = item.id || item.lootCouncilID || `${charKey}-${item.itemID || item.itemId || 0}-${item.date}-${item.time}`;
        
        // Skip existing items to improve performance
        if (existingIds.has(rclcId.toString())) continue;
        
        // Skip Normal difficulty if specified (User requirement)
        const difficulty = item.difficulty || item.difficultyID || '';
        if (typeof difficulty === 'string' && difficulty.toLowerCase().includes('normal')) {
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

          // FETCH SLOT FROM WOWHEAD XML
          let itemSlot = '';
          if (typeCode === 'TOKEN') {
            itemSlot = 'TOKEN';
          } else if (itemId > 0) {
            if (slotCache.has(itemId)) {
              itemSlot = slotCache.get(itemId);
            } else {
              itemSlot = await fetchWowheadSlot(itemId);
              slotCache.set(itemId, itemSlot);
            }
          }

          // Fallback to JSON slot if XML failed and it's not a TOKEN
          if (!itemSlot && typeCode !== 'TOKEN') {
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

          // GP Award (Only if character matched)
          const slotKey = itemSlot.toLowerCase();
          const gpAmount = gearMap.get(slotKey) || 0;

          if (charInfo && gpAmount > 0) {
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
                difficulty, instance, boss, typeCode, note
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              item.note || ''
            )
          );
          insertedCount++;
          existingIds.add(rclcId.toString()); 
        } catch (e) {
          errors.push(`Error processing item ${rclcId} for ${charKey}: ${e.message}`);
        }
      }
    }

    // 6. Execute Batch
    if (batchStatements.length > 0) {
      await env.DB.batch([...gpStatements, ...batchStatements]);
    }

    await logEvent(env, 'success', 'Loot', `Imported ${insertedCount} loot items from JSON file (${gpAwardedCount} GP awards)`, { insertedCount, gpAwardedCount, errors });

    return new Response(JSON.stringify({
      success: true,
      message: `✓ Successfully imported ${insertedCount} loot items and awarded GP for ${gpAwardedCount} items.`,
      inserted: insertedCount,
      gpAwarded: gpAwardedCount,
      errors: errors.length > 0 ? errors : null
    }), { headers });

  } catch (err) {
    await logEvent(env, 'error', 'API', `JSON Loot Import failed: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
