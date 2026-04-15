/**
 * Converts a Mudlet JSON map export to a compact format for the mobile app.
 * Usage: node scripts/convert-map.js <input.json> <output.json>
 */
const fs = require('fs');

const input = process.argv[2] || '../mapa.json';
const output = process.argv[3] || 'src/assets/map-reinos.json';

console.log(`Reading ${input}...`);
const data = JSON.parse(fs.readFileSync(input, 'utf8'));

// Direction name mapping (Mudlet English -> short keys)
const DIR_MAP = {
  'north': 'n', 'south': 's', 'east': 'e', 'west': 'w',
  'northeast': 'ne', 'northwest': 'nw', 'southeast': 'se', 'southwest': 'sw',
  'up': 'ar', 'down': 'ab',
};

const mainArea = data.areas.find(a => a.id === 2) || data.areas.find(a => a.roomCount > 100);
if (!mainArea) {
  console.error('No main area found');
  process.exit(1);
}

console.log(`Processing area "${mainArea.name}" with ${mainArea.roomCount} rooms...`);

// Build environment color map
const envColors = {};
for (const ec of data.customEnvColors || []) {
  const [r, g, b] = ec.color24RGB;
  envColors[ec.id] = '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
}
console.log(`  Environment colors: ${Object.keys(envColors).length}`);

const rooms = {};
for (const room of mainArea.rooms) {
  // Parse name: strip exit info in brackets for cleaner storage
  let name = room.name || '';
  const bracketMatch = name.match(/^(.*?)\s*\[.*\]$/);
  const shortName = bracketMatch ? bracketMatch[1].trim() : name;

  // Build exits: { direction: destRoomId }
  const exits = {};
  for (const exit of (room.exits || [])) {
    const dir = DIR_MAP[exit.name] || exit.name;
    exits[dir] = exit.exitId;
  }

  const entry = {
    n: shortName,                    // name
    x: room.coordinates[0],         // x
    y: room.coordinates[1],         // y
    z: room.coordinates[2],         // z
    e: exits,                        // exits {dir: roomId}
  };

  // Add color if available
  const color = envColors[room.environment];
  if (color) entry.c = color;

  rooms[room.id] = entry;

  // Store full name with exits for matching
  if (name !== shortName) {
    rooms[room.id].fn = name;
  }
}

// Build name index: { "name [exits]" => [roomId, ...] }
// This helps match rooms by the string the MUD sends via GMCP
const nameIndex = {};
for (const [id, room] of Object.entries(rooms)) {
  const fullName = room.fn || room.n;
  if (!nameIndex[fullName]) nameIndex[fullName] = [];
  nameIndex[fullName].push(Number(id));

  // Also index by short name
  if (room.fn) {
    if (!nameIndex[room.n]) nameIndex[room.n] = [];
    nameIndex[room.n].push(Number(id));
  }
}

const result = { rooms, nameIndex };
const json = JSON.stringify(result);

console.log(`Writing ${output}...`);
console.log(`  Rooms: ${Object.keys(rooms).length}`);
console.log(`  Name index entries: ${Object.keys(nameIndex).length}`);
console.log(`  File size: ${(json.length / 1024 / 1024).toFixed(1)} MB`);

fs.writeFileSync(output, json);
console.log('Done!');
