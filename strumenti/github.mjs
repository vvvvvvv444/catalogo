// Pubblica la vetrina sul GitHub della titolare usando .segreti/github.txt (mai stampata).
// Uso: node strumenti/github.mjs chi | pubblica | stato
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = readFileSync(join(radice, '.segreti', 'github.txt'), 'utf8').trim();
const REPO = 'catalogo';
const api = async (metodo, percorso, corpo) => {
  const r = await fetch('https://api.github.com' + percorso, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'vetrina' },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { stato: r.status, j, scopes: r.headers.get('x-oauth-scopes') };
};

const cmd = process.argv[2];
const io = await api('GET', '/user');
if (io.stato !== 200) { console.error('Chiave non valida:', io.stato, io.j && io.j.message); process.exit(1); }
const utente = io.j.login;

if (cmd === 'chi') {
  console.log({ utente, nome: io.j.name, permessi: io.scopes });
} else if (cmd === 'pubblica') {
  const c = await api('POST', '/user/repos', { name: REPO, description: 'Vetrina', homepage: `https://${utente}.github.io/${REPO}/`, private: false, has_issues: false, has_wiki: false, has_projects: false });
  console.log('repository:', c.stato === 201 ? 'creato' : c.stato === 422 ? 'esisteva gia\'' : 'ERRORE ' + c.stato + ' ' + JSON.stringify(c.j));
  if (c.stato !== 201 && c.stato !== 422) process.exit(1);
  const basic = Buffer.from('x-access-token:' + TOKEN).toString('base64');
  const git = (...a) => execFileSync('git', ['-C', radice, '-c', 'http.extraHeader=Authorization: Basic ' + basic, ...a], { stdio: ['ignore', 'ignore', 'pipe'] });
  // la sveglia salva ultima-sveglia.txt online: prima si prende quello, poi si carica il nostro
  if (c.stato === 422) git('pull', '--rebase', `https://github.com/${utente}/${REPO}.git`, 'main');
  git('push', `https://github.com/${utente}/${REPO}.git`, 'main:main');
  console.log('file caricati');
  const p = await api('POST', `/repos/${utente}/${REPO}/pages`, { source: { branch: 'main', path: '/' } });
  console.log('pubblicazione:', p.stato === 201 ? 'accesa' : p.stato === 409 ? 'era gia\' accesa' : 'ERRORE ' + p.stato + ' ' + JSON.stringify(p.j));
  console.log('link:', `https://${utente}.github.io/${REPO}/`);
} else if (cmd === 'stato') {
  const p = await api('GET', `/repos/${utente}/${REPO}/pages`);
  const b = await api('GET', `/repos/${utente}/${REPO}/pages/builds/latest`);
  const w = await api('GET', `/repos/${utente}/${REPO}/actions/workflows`);
  console.log({ pagina: p.j.html_url, stato: p.j.status, ultimaCostruzione: b.j.status, sveglie: (w.j.workflows || []).map(x => x.name + ': ' + x.state) });
} else if (cmd === 'sveglia') {
  const d = await api('POST', `/repos/${utente}/${REPO}/actions/workflows/sveglia.yml/dispatches`, { ref: 'main' });
  console.log('sveglia lanciata:', d.stato === 204 ? 'si' : 'ERRORE ' + d.stato + ' ' + JSON.stringify(d.j));
} else if (cmd === 'esiti') {
  const r = await api('GET', `/repos/${utente}/${REPO}/actions/runs?per_page=5`);
  for (const x of r.j.workflow_runs || []) console.log(x.name, '|', x.status, '|', x.conclusion, '|', x.created_at);
} else {
  console.log('comandi: chi | pubblica | stato | sveglia | esiti');
}
