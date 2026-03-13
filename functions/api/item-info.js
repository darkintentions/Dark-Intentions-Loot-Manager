/**
 * /api/item-info
 * GET — fetch item information from WoWhead tooltip API
 * Returns: name, icon, slot, armorType, droppedBy, instance, difficulty
 */

// Cache item information to avoid repeated requests
const itemCache = {};
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Slot ID to name mapping (WoWhead g_items slot values)
const SLOT_MAP = {
  1: 'Head', 2: 'Neck', 3: 'Shoulder', 4: 'Shirt',
  5: 'Chest', 6: 'Waist', 7: 'Legs', 8: 'Feet',
  9: 'Wrist', 10: 'Hands', 11: 'Finger', 12: 'Trinket',
  13: 'One-Hand', 14: 'Shield', 15: 'Ranged', 16: 'Back',
  17: 'Two-Hand', 18: 'Bag', 20: 'Chest', 21: 'Main Hand',
  22: 'Off Hand', 23: 'Held In Off-hand', 25: 'Thrown',
  26: 'Ranged',
};

// Armor subclass ID to name mapping
const ARMOR_TYPE_MAP = {
  0: 'Miscellaneous',
  1: 'Cloth',
  2: 'Leather',
  3: 'Mail',
  4: 'Plate',
  6: 'Shield',
};

/**
 * Parse the WoWhead tooltip HTML to extract structured item data
 */
function parseTooltipHTML(tooltip) {
  const result = {};

  // Extract difficulty — appears between <!--ndstart--> and <!--ndend-->
  // e.g. "Mythic", "Heroic", "Normal", "LFR", "Awakened Mythic", "Mythic+"
  const diffMatch = tooltip.match(/<!--ndstart-->(.+?)<!--ndend-->/s);
  if (diffMatch) {
    const diffHTML = diffMatch[1];
    // Pull all text from <span> tags inside and combine
    const spanTexts = [];
    const spanRegex = /<span[^>]*>([^<]+)<\/span>/g;
    let m;
    while ((m = spanRegex.exec(diffHTML)) !== null) {
      const text = m[1].trim();
      if (text) spanTexts.push(text);
    }
    if (spanTexts.length > 0) {
      result.difficulty = spanTexts.join(' ');
    }
  }

  // Extract slot — appears as <td>SlotName</td> in the first table
  const slotMatch = tooltip.match(/<table width="100%"><tr><td>([^<]+)<\/td>/);
  if (slotMatch) {
    result.slot = slotMatch[1].trim();
  }

  // Extract armor type — appears inside <!--scstartX:Y--> tags
  const armorMatch = tooltip.match(/<!--scstart\d+:\d+--><span[^>]*>([^<]+)<\/span><!--scend-->/);
  if (armorMatch) {
    result.armorType = armorMatch[1].trim();
  }

  // Extract dropped by — appears in whtt-droppedby div
  const droppedByMatch = tooltip.match(/whtt-droppedby">Dropped by: ([^<]+)<\/div>/);
  if (droppedByMatch) {
    result.droppedBy = droppedByMatch[1].trim();
  }

  // Extract drop chance
  const dropChanceMatch = tooltip.match(/whtt-dropchance">Drop Chance: ([^<]+)<\/div>/);
  if (dropChanceMatch) {
    result.dropChance = dropChanceMatch[1].trim();
  }

  return result;
}

/**
 * Fetch the full WoWhead page HTML to extract instance/zone data from g_items
 */
async function fetchInstanceData(itemId) {
  try {
    const response = await fetch(`https://www.wowhead.com/item=${itemId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) return {};

    const html = await response.text();
    const result = {};

    // Extract g_items data which contains sourcemore with zone IDs
    const gItemsMatch = html.match(new RegExp(`WH\\.Gatherer\\.addData\\(3,\\s*${itemId},\\s*({[^}]+})`));
    if (gItemsMatch) {
      try {
        const itemData = JSON.parse(gItemsMatch[1]);

        // Get slot from numeric ID if tooltip didn't provide it
        if (itemData.slot && SLOT_MAP[itemData.slot]) {
          result.slotId = itemData.slot;
          result.slotName = SLOT_MAP[itemData.slot];
        }

        // Get armor type from subclass
        if (itemData.subclass !== undefined && ARMOR_TYPE_MAP[itemData.subclass] !== undefined) {
          result.armorTypeId = itemData.subclass;
          result.armorTypeName = ARMOR_TYPE_MAP[itemData.subclass];
        }
      } catch (e) {
        // JSON parse failed, skip
      }
    }

    // Try to extract NPC/boss data from the "Dropped by" tab/listview
    // WoWhead embeds boss names and zone names in listview data
    const npcListMatch = html.match(/new Listview\(\{[^}]*id:\s*'dropped-by'[^]*?data:\s*(\[[^\]]*\])/s);
    if (npcListMatch) {
      try {
        const npcData = JSON.parse(npcListMatch[1]);
        if (npcData.length > 0 && npcData[0].location) {
          result.zoneIds = npcData[0].location;
        }
      } catch (e) {
        // parse failed
      }
    }

    // Try to extract instance/raid name from breadcrumb or page content
    const breadcrumbMatch = html.match(/class="breadcrumb[^"]*"[^>]*>.*?<a[^>]*>([^<]+)<\/a>\s*›\s*<a[^>]*>([^<]+)<\/a>/s);
    if (breadcrumbMatch) {
      result.instance = breadcrumbMatch[2].trim();
    }

    // Try zone-based instance lookup from sourcemore
    const sourcemoreMatch = html.match(/"sourcemore":\s*\[{"z":(\d+)}\]/);
    if (sourcemoreMatch) {
      result.zoneId = parseInt(sourcemoreMatch[1]);
    }

    return result;
  } catch (err) {
    console.error('Error fetching instance data:', err);
    return {};
  }
}

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const itemId = url.searchParams.get('id');

      if (!itemId || isNaN(parseInt(itemId))) {
        return new Response(
          JSON.stringify({ error: 'Valid item ID required' }),
          { status: 400, headers }
        );
      }

      // Optional bonus IDs (comma-separated) — used to determine difficulty
      const bonusIds = url.searchParams.get('bonus') || '';
      const cacheKey = bonusIds ? `${itemId}:${bonusIds}` : itemId;

      // Check cache first
      if (itemCache[cacheKey] && Date.now() - itemCache[cacheKey].timestamp < CACHE_DURATION) {
        return new Response(
          JSON.stringify(itemCache[cacheKey].data),
          { headers }
        );
      }

      // Fetch tooltip data from WoWhead tooltip API (fast, reliable)
      let tooltipUrl = `https://nether.wowhead.com/tooltip/item/${itemId}?dataEnv=1&locale=0`;
      if (bonusIds) {
        tooltipUrl += `&bonus=${bonusIds}`;
      }
      const tooltipRes = await fetch(tooltipUrl);

      if (!tooltipRes.ok) {
        return new Response(
          JSON.stringify({ error: 'Item not found on WoWhead' }),
          { status: 404, headers }
        );
      }

      const tooltipJson = await tooltipRes.json();
      const tooltipData = parseTooltipHTML(tooltipJson.tooltip || '');

      // Fetch the full page for instance/zone data
      const pageData = await fetchInstanceData(itemId);

      // Build comprehensive item data
      const itemData = {
        id: parseInt(itemId),
        name: tooltipJson.name || `Item ${itemId}`,
        icon: tooltipJson.icon || null,
        quality: tooltipJson.quality || 0,
        slot: tooltipData.slot || pageData.slotName || null,
        armorType: tooltipData.armorType || pageData.armorTypeName || null,
        droppedBy: tooltipData.droppedBy || null,
        dropChance: tooltipData.dropChance || null,
        difficulty: tooltipData.difficulty || null,
      };

      // Cache the result
      itemCache[cacheKey] = {
        data: itemData,
        timestamp: Date.now(),
      };

      return new Response(
        JSON.stringify(itemData),
        { headers }
      );
    } catch (err) {
      console.error('Error fetching item info:', err);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch item information' }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
