// Crea l'account "aiutante" (scrive titoli e descrizioni dal PC di casa) e salva le credenziali
// in .segreti/aiutante.json, escluso da git. Da lanciare solo con la registrazione aperta.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = readFileSync(join(radice, 'js', 'config.js'), 'utf8');
const URL = cfg.match(/supabaseUrl: '([^']+)'/)[1], KEY = cfg.match(/supabaseKey: '([^']+)'/)[1];
const file = join(radice, '.segreti', 'aiutante.json');
if (existsSync(file)) { console.log('esiste gia\': ' + file); process.exit(0); }

const email = 'aiutante-vetrina-' + randomBytes(4).toString('hex') + '@example.com';
const password = randomBytes(18).toString('base64url');
const r = await fetch(URL + '/auth/v1/signup', {
  method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, data: { nome: 'Aiutante (descrizioni)' } })
});
const j = await r.json();
if (!r.ok || !j.access_token) { console.error('ERRORE', r.status, j.msg || j.error_description || j.message); process.exit(1); }
writeFileSync(file, JSON.stringify({ email, password }, null, 1));
console.log('creato aiutante:', email, '(password in .segreti/aiutante.json)');
