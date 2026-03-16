const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'public', 'app.js');
let content = fs.readFileSync(p, 'utf8');

// The replacement logic:
content = content.replace(/fetch\('\/api/g, "apiFetch('/api");
content = content.replace(/fetch\(`\/api/g, "apiFetch(`/api");

fs.writeFileSync(p, content, 'utf8');
console.log('Replaced fetch calls with apiFetch wrappers in app.js');
