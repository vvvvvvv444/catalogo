/* Dati della vetrina: due motori con gli stessi comandi.
   - Supabase (quello vero): se config.js ha indirizzo e chiave.
   - Prova: tutto nel browser di questo computer, per vedere la struttura.
   Chi guarda usa vetrina(codice); solo l'amministratrice legge e scrive le tabelle. */
(function () {
  const C = window.CONFIG;

  // ---------- foto: rimpicciolite nel browser prima di caricarle ----------
  async function apriImmagine(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* si prova sotto */ }
    }
    return new Promise((ok, ko) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ko(new Error('La foto "' + file.name + '" non si apre: usa JPG o PNG.'));
      img.src = URL.createObjectURL(file);
    });
  }
  function disegna(img, lato, qualita) {
    const w = img.width, h = img.height;
    const k = Math.min(1, lato / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return new Promise(ok => c.toBlob(ok, 'image/jpeg', qualita));
  }
  async function riduci(file) {
    const img = await apriImmagine(file);
    const [grande, piccola] = await Promise.all([disegna(img, 1600, 0.85), disegna(img, 600, 0.8)]);
    if (img.close) img.close();
    return { grande, piccola };
  }
  function comeDataUrl(b) {
    return new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
  }
  function nuovoId() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function traduci(e) {
    const m = (e && e.message) || String(e);
    const t = [
      [/Invalid login credentials/i, 'Email o password sbagliate.'],
      [/Registrazione chiusa|Database error saving new user/i, 'La registrazione è chiusa: l\'account della titolare esiste già.'],
      [/already registered|already exists/i, 'Questa email è già registrata: usa "Entra".'],
      [/Password should be at least/i, 'La password deve avere almeno 6 caratteri.'],
      [/Unable to validate email|invalid format|email address .* is invalid/i, 'Email non valida.'],
      [/rate limit|too many/i, 'Troppi tentativi: riprova fra qualche minuto.'],
      [/Failed to fetch|NetworkError|Load failed/i, 'Connessione assente: controlla internet.'],
      [/row-level security|permission denied|Unauthorized|Permesso negato/i, 'Permesso negato.'],
      [/duplicate key/i, 'Esiste già un elemento con questo nome.']
    ];
    for (const [re, it] of t) if (re.test(m)) return new Error(it);
    return new Error(m);
  }

  // ======================= SUPABASE =======================
  function motoreSupabase() {
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
    const baseFoto = C.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/foto/';
    const ok = r => { if (r.error) throw traduci(r.error); return r.data; };

    return {
      demo: false,

      async negozio() { return ok(await sb.rpc('negozio')) || {}; },
      async vetrina(codice) { return ok(await sb.rpc('vetrina', { codice })); },

      async utente() {
        const { data } = await sb.auth.getSession();
        const s = data.session;
        if (!s) return null;
        const a = await sb.rpc('e_admin');
        return { id: s.user.id, email: s.user.email, admin: a.data === true };
      },
      async entra(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
      async registra(d) {
        const data = ok(await sb.auth.signUp({ email: d.email, password: d.password, options: { data: { nome: d.nome } } }));
        if (!data.session) throw new Error('Account creato, ma Supabase chiede la conferma via email: va spenta "Confirm email".');
      },
      async esci() { await sb.auth.signOut(); },

      async impostazioni() { return ok(await sb.from('impostazioni').select('*').eq('id', 1).maybeSingle()) || {}; },
      async salvaImpostazioni(v) { ok(await sb.from('impostazioni').update(v).eq('id', 1)); },
      async nuovoCodice() { return ok(await sb.rpc('nuovo_codice')); },

      async marchi() { return ok(await sb.from('marchi').select('*').order('nome')); },
      async salvaMarchio(m) {
        if (m.id) return ok(await sb.from('marchi').update({ nome: m.nome }).eq('id', m.id).select().single());
        return ok(await sb.from('marchi').insert({ nome: m.nome }).select().single());
      },
      async eliminaMarchio(id) { ok(await sb.from('marchi').delete().eq('id', id)); },

      async prodotti() {
        return ok(await sb.from('prodotti').select('*').order('ordine').order('creato', { ascending: false }));
      },
      async salvaProdotto(p) {
        const riga = Object.assign({}, p);
        delete riga.creato; delete riga.aggiornato;
        if (!riga.id) delete riga.id;
        return ok(await sb.from('prodotti').upsert(riga).select().single());
      },
      async eliminaProdotto(p) {
        ok(await sb.from('prodotti').delete().eq('id', p.id));
        if (p.foto && p.foto.length) await this.eliminaFoto(p.foto);
      },

      async caricaFoto(file) {
        const { grande, piccola } = await riduci(file);
        const id = nuovoId();
        const su = (nome, blob) => sb.storage.from('foto').upload(nome, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
        const [r1, r2] = await Promise.all([su(id + '.jpg', grande), su(id + '_m.jpg', piccola)]);
        if (r1.error) throw traduci(r1.error);
        if (r2.error) throw traduci(r2.error);
        return id;
      },
      async eliminaFoto(ids) {
        if (!ids.length) return;
        await sb.storage.from('foto').remove(ids.flatMap(id => [id + '.jpg', id + '_m.jpg']));
      },
      urlFoto(id, miniatura) { return baseFoto + encodeURIComponent(id) + (miniatura ? '_m.jpg' : '.jpg'); },

      async inviaRichiesta(codice, r) {
        ok(await sb.rpc('invia_richiesta', { codice, p_nome: r.nome, p_contatto: r.contatto, p_messaggio: r.messaggio, p_articoli: r.articoli }));
      },
      async richieste() { return ok(await sb.from('richieste').select('*').order('creato', { ascending: false }).limit(500)); },
      async segnaRichiesta(id, letta) { ok(await sb.from('richieste').update({ letta }).eq('id', id)); },
      async eliminaRichiesta(id) { ok(await sb.from('richieste').delete().eq('id', id)); }
    };
  }

  // ======================= PROVA (solo browser) =======================
  function segnaposto(catId) {
    const tinte = { scarpe: '#f3e3e1', borse: '#e3e8f3', accessori: '#e5efe6', gioielli: '#f5eedb', capelli: '#ece5f3', skincare: '#e0efee', trucchi: '#f4e2ec' };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="' + (tinte[catId] || '#eee') +
      '"/><g transform="translate(60 105) scale(7.5)" fill="none" stroke="#7a4b50" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">' +
      (window.ICONE[catId] || window.ICONE.tutti) + '</g><text x="150" y="360" text-anchor="middle" font-family="sans-serif" font-size="17" letter-spacing="2" fill="#7a4b50" opacity=".6">FOTO DI ESEMPIO</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function semina() {
    const marchi = ['Atelier Rosa', 'Nordico', 'Brillo', 'Verde Puro', 'Velvet Lab'].map((nome, i) => ({ id: 'm' + i, nome }));
    let n = 0;
    const P = (nome, mi, categoria, genere, prezzo, prezzo_pieno, descrizione, extra) => Object.assign({
      id: 'p' + (++n), nome, marchio_id: mi == null ? null : 'm' + mi, categoria, genere, prezzo, prezzo_pieno, descrizione,
      dettagli: '', taglie: '', colori: '', foto: ['seme-' + categoria], disponibile: true, in_evidenza: false, visibile: true, da_descrivere: false,
      codice: categoria.slice(0, 2).toUpperCase() + '-' + String(n).padStart(3, '0'), ordine: 0, creato: new Date(Date.now() - n * 3600e3).toISOString()
    }, extra || {});
    const prodotti = [
      P('Sneaker in pelle bianca', 1, 'scarpe', 'donna', 79.9, 99.9, 'Sneaker bassa in pelle liscia, suola in gomma leggera e soletta imbottita: comoda tutto il giorno, sta bene con jeans e gonne.', { taglie: '36, 37, 38, 39, 40', colori: 'Bianco, Bianco/Oro', in_evidenza: true, dettagli: 'Tomaia in pelle\nSuola in gomma\nPlantare estraibile' }),
      P('Mocassino classico', 1, 'scarpe', 'uomo', 89, null, 'Mocassino in pelle scamosciata con cucitura a mano, elegante ma morbido.', { taglie: '40, 41, 42, 43, 44', colori: 'Blu, Cuoio' }),
      P('Sandalo con tacco medio', 0, 'scarpe', 'donna', 59.5, null, 'Sandalo con cinturino alla caviglia e tacco da 6 cm, stabile e femminile.', { taglie: '36, 37, 38, 39', colori: 'Nero, Nude', disponibile: false }),
      P('Borsa a spalla in ecopelle', 0, 'borse', 'donna', 45, 65, 'Borsa capiente con tasca interna con zip e tracolla regolabile.', { colori: 'Nero, Cammello, Bordeaux', in_evidenza: true }),
      P('Zaino urbano impermeabile', 1, 'borse', 'unisex', 55, null, 'Zaino con scomparto imbottito per il portatile e tessuto che non teme la pioggia.', { colori: 'Grigio, Nero' }),
      P('Occhiali da sole tartarugati', 4, 'accessori', 'unisex', 29.9, 39.9, 'Montatura in acetato effetto tartaruga, lenti con protezione UV400.'),
      P('Cintura in pelle', 1, 'accessori', 'uomo', 34, null, 'Cintura in pelle pieno fiore con fibbia satinata.', { taglie: '90, 95, 100, 105' }),
      P('Orecchini a cerchio dorati', 2, 'gioielli', 'donna', 24.9, null, 'Cerchi leggeri in acciaio anallergico con bagno oro.', { in_evidenza: true }),
      P('Collana con ciondolo cuore', 2, 'gioielli', 'donna', 32, 40, 'Catena sottile con ciondolo a cuore, regolabile da 40 a 45 cm.'),
      P('Bracciale da uomo in acciaio', 2, 'gioielli', 'uomo', 27, null, 'Bracciale a maglia piatta in acciaio spazzolato.'),
      P('Shampoo nutriente 250 ml', 3, 'capelli', 'unisex', 12.5, null, 'Shampoo delicato con oli vegetali per capelli secchi o trattati.'),
      P('Maschera ristrutturante', 3, 'capelli', 'donna', 18.9, 22, 'Maschera intensiva da lasciare in posa 5 minuti: capelli morbidi e lucidi.'),
      P('Siero viso vitamina C', 3, 'skincare', 'unisex', 24, 29, 'Siero leggero che uniforma il colorito; si assorbe subito.', { in_evidenza: true }),
      P('Crema idratante giorno', 4, 'skincare', 'donna', 19.9, null, 'Crema per tutti i tipi di pelle, non unge, base perfetta per il trucco.'),
      P('Rossetto opaco lunga tenuta', 4, 'trucchi', 'donna', 14.9, null, 'Rossetto cremoso dal finish opaco che resta fino a 8 ore.', { colori: 'Rosso, Nude, Malva' }),
      P('Palette ombretti 12 colori', 4, 'trucchi', 'donna', 22, 30, 'Dodici tonalità fra opache e brillanti, facili da sfumare.'),
      P('Nuovo arrivo', null, 'borse', 'donna', null, null, '', { da_descrivere: true })
    ];
    const foto = {};
    C.categorie.forEach(c => { const u = segnaposto(c.id); foto['seme-' + c.id] = { g: u, m: u }; });
    return {
      marchi, prodotti, foto, sessione: null,
      impostazioni: { nome_negozio: 'La mia Vetrina', sottotitolo: 'Scarpe, borse, gioielli e bellezza', whatsapp: '', messaggio_benvenuto: 'Guarda con calma e dimmi i codici di quello che ti piace.', codice_vetrina: 'prova-prova-prova-1234', registrazione_aperta: false, aspetto: {}, categorie: null, mostra_whatsapp: false, richieste_attive: false },
      richieste: [
        { id: 'r1', creato: new Date(Date.now() - 36e5).toISOString(), letta: false, nome: 'Giulia', contatto: '333 1234567', messaggio: 'Ciao! La borsa c\'è anche in nero?', articoli: [{ id: 'p4', nome: 'Borsa a spalla in ecopelle', colore: 'Nero', qta: 1, prezzo: 45 }] },
        { id: 'r2', creato: new Date(Date.now() - 864e5).toISOString(), letta: true, nome: 'Marco', contatto: '@marco.ig', messaggio: 'Prezzo per due paia?', articoli: [{ id: 'p2', nome: 'Mocassino classico', taglia: '42', qta: 2, prezzo: 89 }] }
      ]
    };
  }

  function motoreProva() {
    const CHIAVE = 'vetrina-prova-v3';
    let db = null;
    try { db = JSON.parse(localStorage.getItem(CHIAVE)); } catch (e) { /* vuoto */ }
    if (!db) db = semina();
    const salva = () => {
      try { localStorage.setItem(CHIAVE, JSON.stringify(db)); }
      catch (e) { throw new Error('Spazio del browser pieno: la modalità prova tiene poche foto.'); }
    };
    const copia = x => JSON.parse(JSON.stringify(x));
    const i = db.impostazioni;

    return {
      demo: true,
      async negozio() { return { nome_negozio: i.nome_negozio, sottotitolo: i.sottotitolo, registrazione_aperta: false, aspetto: i.aspetto || {} }; },
      async vetrina(codice) {
        if (codice !== i.codice_vetrina) return null;
        return copia({
          impostazioni: { nome_negozio: i.nome_negozio, sottotitolo: i.sottotitolo, messaggio_benvenuto: i.messaggio_benvenuto,
            aspetto: i.aspetto || {}, categorie: i.categorie || null, richieste_attive: !!i.richieste_attive, mostra_whatsapp: !!i.mostra_whatsapp, whatsapp: i.mostra_whatsapp ? i.whatsapp : '' },
          marchi: db.marchi, prodotti: db.prodotti.filter(p => p.visibile !== false)
        });
      },
      async utente() { return db.sessione ? copia(db.sessione) : null; },
      async entra() { db.sessione = { id: 'admin', email: 'titolare@esempio.it', admin: true }; salva(); },
      async registra() { throw new Error('In modalità prova non serve registrarsi.'); },
      async esci() { db.sessione = null; salva(); },
      async ricomincia() { localStorage.removeItem(CHIAVE); },

      async impostazioni() { return copia(i); },
      async salvaImpostazioni(v) { Object.assign(i, v); salva(); },
      async nuovoCodice() { i.codice_vetrina = 'prova-' + Math.random().toString(36).slice(2, 14) + '-x'; salva(); return i.codice_vetrina; },

      async marchi() { return copia(db.marchi).sort((a, b) => a.nome.localeCompare(b.nome)); },
      async salvaMarchio(m) {
        if (db.marchi.some(x => x.nome.toLowerCase() === m.nome.toLowerCase() && x.id !== m.id)) throw new Error('Esiste già un marchio con questo nome.');
        let r = m.id && db.marchi.find(x => x.id === m.id);
        if (r) r.nome = m.nome; else { r = { id: 'm' + Date.now(), nome: m.nome }; db.marchi.push(r); }
        salva(); return copia(r);
      },
      async eliminaMarchio(id) {
        db.marchi = db.marchi.filter(x => x.id !== id);
        db.prodotti.forEach(p => { if (p.marchio_id === id) p.marchio_id = null; });
        salva();
      },

      async prodotti() { return copia(db.prodotti); },
      async salvaProdotto(p) {
        const r = Object.assign({}, p, { aggiornato: new Date().toISOString() });
        const k = r.id ? db.prodotti.findIndex(x => x.id === r.id) : -1;
        if (k >= 0) db.prodotti[k] = r;
        else {
          r.id = 'p' + Date.now() + Math.random().toString(36).slice(2, 5); r.creato = r.aggiornato;
          if (!r.codice) { db.numero = (db.numero || 100) + 1; r.codice = (r.categoria.replace(/[^a-z]/gi, '') + 'XX').slice(0, 2).toUpperCase() + '-' + String(db.numero).padStart(3, '0'); }
          db.prodotti.unshift(r);
        }
        salva(); return copia(r);
      },
      async eliminaProdotto(p) {
        db.prodotti = db.prodotti.filter(x => x.id !== p.id);
        await this.eliminaFoto(p.foto || []);
      },

      async caricaFoto(file) {
        const { grande, piccola } = await riduci(file);
        const id = 'f' + Date.now() + Math.random().toString(36).slice(2, 6);
        db.foto[id] = { g: await comeDataUrl(grande), m: await comeDataUrl(piccola) };
        salva(); return id;
      },
      async eliminaFoto(ids) {
        ids.forEach(id => { if (!String(id).startsWith('seme-')) delete db.foto[id]; });
        salva();
      },
      urlFoto(id, miniatura) { const f = db.foto[id]; return f ? (miniatura ? f.m : f.g) : ''; },

      async inviaRichiesta(codice, r) {
        if (codice !== i.codice_vetrina) throw new Error('Link non valido');
        if (!i.richieste_attive) throw new Error('Le richieste dalla vetrina sono spente');
        if ((r.nome || '').trim().length < 2) throw new Error('Manca il nome');
        (db.richieste = db.richieste || []).unshift(Object.assign({ id: 'r' + Date.now(), creato: new Date().toISOString(), letta: false }, r));
        salva();
      },
      async richieste() { return copia(db.richieste || []); },
      async segnaRichiesta(id, letta) { const r = (db.richieste || []).find(x => x.id === id); if (r) r.letta = letta; salva(); },
      async eliminaRichiesta(id) { db.richieste = (db.richieste || []).filter(x => x.id !== id); salva(); }
    };
  }

  const vero = !!(C.supabaseUrl && C.supabaseKey);
  if (vero && !window.supabase) window.DATI_ERRORE = 'Non riesco a scaricare la libreria di Supabase: controlla la connessione.';
  window.DATI = vero && window.supabase ? motoreSupabase() : motoreProva();
})();
