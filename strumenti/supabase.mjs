// Parla con Supabase usando la chiave d'accesso in .segreti/supabase.txt (mai stampata).
// Uso: node strumenti/supabase.mjs <comando> [file.sql]
//   stato | sql <file> | auth-leggi | auth-senza-conferma | chiavi
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = readFileSync(join(radice, '.segreti', 'supabase.txt'), 'utf8').trim();
const REF = 'xzwqzuicezmfjupjmmkh';
const API = 'https://api.supabase.com/v1/projects/' + REF;

async function chiama(metodo, percorso, corpo) {
  const r = await fetch(API + percorso, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const testo = await r.text();
  let dati; try { dati = JSON.parse(testo); } catch { dati = testo; }
  if (!r.ok) { console.error('ERRORE', r.status, typeof dati === 'string' ? dati : JSON.stringify(dati)); process.exit(1); }
  return dati;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'stato') {
  const p = await chiama('GET', '');
  console.log({ nome: p.name, stato: p.status, regione: p.region, creato: p.created_at });
} else if (cmd === 'sql') {
  const q = arg.endsWith('.sql') || arg.endsWith('.txt') ? readFileSync(arg, 'utf8') : arg;
  console.log(JSON.stringify(await chiama('POST', '/database/query', { query: q }), null, 1));
} else if (cmd === 'auth-leggi') {
  const a = await chiama('GET', '/config/auth');
  console.log({ conferma_email_spenta: a.mailer_autoconfirm, iscrizioni_chiuse: a.disable_signup, email_attiva: a.external_email_enabled, site_url: a.site_url, password_minima: a.password_min_length });
} else if (cmd === 'auth-senza-conferma') {
  const a = await chiama('PATCH', '/config/auth', { mailer_autoconfirm: true, disable_signup: false, external_email_enabled: true });
  console.log({ conferma_email_spenta: a.mailer_autoconfirm, iscrizioni_chiuse: a.disable_signup });
} else if (cmd === 'chiavi') {
  const k = await chiama('GET', '/api-keys?reveal=false');
  // stampa solo le chiavi PUBBLICHE (anon / publishable); le segrete non si toccano
  for (const x of k) if (x.type === 'publishable' || x.name === 'anon') console.log(x.type, x.name, x.api_key);
} else {
  console.log('comandi: stato | sql <file> | auth-leggi | auth-senza-conferma | chiavi');
}
