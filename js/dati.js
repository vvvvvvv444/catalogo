/* Dati del catalogo: due motori con gli stessi comandi.
   - Supabase (quello vero): se config.js ha indirizzo e chiave.
   - Prova: tutto nel browser di questo computer, per vedere la struttura. */
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
    const [grande, piccola] = await Promise.all([disegna(img, 1400, 0.85), disegna(img, 500, 0.8)]);
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
      [/already registered|already exists/i, 'Questa email è già registrata: usa "Entra".'],
      [/Password should be at least/i, 'La password deve avere almeno 6 caratteri.'],
      [/Email not confirmed/i, 'Email non ancora confermata.'],
      [/Unable to validate email|invalid format|email address .* is invalid/i, 'Email non valida.'],
      [/rate limit|too many/i, 'Troppi tentativi: riprova fra qualche minuto.'],
      [/Failed to fetch|NetworkError|Load failed/i, 'Connessione assente: controlla internet.'],
      [/row-level security|permission denied|Unauthorized/i, 'Permesso negato.'],
      [/duplicate key/i, 'Esiste già un elemento con questo nome.']
    ];
    for (const [re, it] of t) if (re.test(m)) return new Error(it);
    return new Error(m);
  }

  // ======================= SUPABASE =======================
  function motoreSupabase() {
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
    const firme = new Map(); // percorso foto -> { url, scade }
    const ok = r => { if (r.error) throw traduci(r.error); return r.data; };

    return {
      demo: false,

      async utente() {
        const { data } = await sb.auth.getSession();
        const s = data.session;
        if (!s) return null;
        const [a, c] = await Promise.all([
          sb.rpc('e_admin'),
          sb.from('clienti').select('nome, stato').eq('user_id', s.user.id).maybeSingle()
        ]);
        const admin = a.data === true;
        return {
          id: s.user.id, email: s.user.email, admin,
          nome: (c.data && c.data.nome) || '',
          stato: admin ? 'approvato' : ((c.data && c.data.stato) || 'in_attesa')
        };
      },
      async entra(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
      async registra(d) {
        const data = ok(await sb.auth.signUp({
          email: d.email, password: d.password,
          options: { data: { nome: d.nome, telefono: d.telefono } }
        }));
        if (!data.session) throw new Error('Richiesta ricevuta, ma Supabase vuole la conferma via email: nelle impostazioni di Supabase va spenta "Confirm email" (vedi guida).');
      },
      async esci() { await sb.auth.signOut(); },

      async impostazioni() { return ok(await sb.from('impostazioni').select('*').eq('id', 1).maybeSingle()) || {}; },
      async salvaImpostazioni(v) { ok(await sb.from('impostazioni').update(v).eq('id', 1)); },

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
      // Le foto sono private: ogni indirizzo e' firmato e scade dopo 6 ore.
      async urlFoto(ids, miniatura) {
        const suff = miniatura ? '_m.jpg' : '.jpg';
        const adesso = Date.now(), fuori = {}, mancano = [];
        for (const id of ids) {
          const f = firme.get(id + suff);
          if (f && f.scade > adesso) fuori[id] = f.url; else mancano.push(id + suff);
        }
        for (let i = 0; i < mancano.length; i += 100) {
          const r = await sb.storage.from('foto').createSignedUrls(mancano.slice(i, i + 100), 6 * 3600);
          if (r.error) throw traduci(r.error);
          for (const x of r.data) {
            if (!x.signedUrl || !x.path) continue;
            firme.set(x.path, { url: x.signedUrl, scade: adesso + 5 * 3600 * 1000 });
            fuori[x.path.slice(0, -suff.length)] = x.signedUrl;
          }
        }
        return fuori;
      },

      async clienti() { return ok(await sb.from('clienti').select('*').order('creato', { ascending: false })); },
      async statoCliente(id, stato) { ok(await sb.from('clienti').update({ stato }).eq('user_id', id)); }
    };
  }

  // ======================= PROVA (solo browser) =======================
  function segnaposto(catId) {
    const tinte = { scarpe: '#fde2e4', borse: '#e2ecfd', accessori: '#e6f6ea', gioielli: '#fff4d6', capelli: '#efe4fb', skincare: '#e0f5f4', trucchi: '#fde6f3' };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="' + (tinte[catId] || '#eee') +
      '"/><g transform="translate(110 95) scale(7.5)" fill="none" stroke="#9a3b45" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">' +
      (window.ICONE[catId] || window.ICONE.tutti) + '</g><text x="200" y="360" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#9a3b45" opacity=".6">FOTO DI ESEMPIO</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function semina() {
    const marchi = ['Atelier Rosa', 'Nordico', 'Brillo', 'Verde Puro', 'Velvet Lab'].map((nome, i) => ({ id: 'm' + i, nome }));
    let n = 0;
    const P = (nome, mi, categoria, genere, prezzo, prezzo_pieno, descrizione, extra) => Object.assign({
      id: 'p' + (++n), nome, marchio_id: 'm' + mi, categoria, genere, prezzo, prezzo_pieno, descrizione,
      dettagli: '', taglie: '', colori: '', foto: ['seme-' + categoria], disponibile: true, in_evidenza: false,
      codice: 'ES-' + String(n).padStart(3, '0'), ordine: 0, creato: new Date(Date.now() - n * 3600e3).toISOString()
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
      P('Palette ombretti 12 colori', 4, 'trucchi', 'donna', 22, 30, 'Dodici tonalità fra opache e brillanti, facili da sfumare.')
    ];
    const foto = {};
    C.categorie.forEach(c => { const u = segnaposto(c.id); foto['seme-' + c.id] = { g: u, m: u }; });
    const giorni = d => new Date(Date.now() - d * 864e5).toISOString();
    return {
      marchi, prodotti, foto, sessione: null,
      impostazioni: { nome_negozio: 'Il mio Catalogo', sottotitolo: 'Scarpe, borse, gioielli e bellezza', whatsapp: '', messaggio_benvenuto: 'Benvenuta! Scegli quello che ti piace e mandami la richiesta su WhatsApp.' },
      clienti: [
        { user_id: 'c1', nome: 'Giulia Bianchi', email: 'giulia@esempio.it', telefono: '333 1234567', stato: 'in_attesa', creato: giorni(0) },
        { user_id: 'c2', nome: 'Marco Verdi', email: 'marco@esempio.it', telefono: '', stato: 'in_attesa', creato: giorni(1) },
        { user_id: 'c3', nome: 'Sara Neri', email: 'sara@esempio.it', telefono: '347 7654321', stato: 'approvato', creato: giorni(5) }
      ]
    };
  }

  function motoreProva() {
    const CHIAVE = 'catalogo-prova-v1';
    let db = null;
    try { db = JSON.parse(localStorage.getItem(CHIAVE)); } catch (e) { /* vuoto */ }
    if (!db) db = semina();
    const salva = () => {
      try { localStorage.setItem(CHIAVE, JSON.stringify(db)); }
      catch (e) { throw new Error('Spazio del browser pieno: la modalità prova tiene poche foto.'); }
    };
    const copia = x => JSON.parse(JSON.stringify(x));

    return {
      demo: true,
      async utente() { return db.sessione ? copia(db.sessione) : null; },
      async entra(chi) {
        db.sessione = chi === 'cliente'
          ? { id: 'c3', email: 'sara@esempio.it', admin: false, nome: 'Sara Neri', stato: 'approvato' }
          : { id: 'admin', email: 'venditrice@esempio.it', admin: true, nome: 'Amministrazione', stato: 'approvato' };
        salva();
      },
      async registra(d) {
        const id = 'c' + Date.now();
        db.clienti.unshift({ user_id: id, nome: d.nome, email: d.email, telefono: d.telefono || '', stato: 'in_attesa', creato: new Date().toISOString() });
        db.sessione = { id, email: d.email, admin: false, nome: d.nome, stato: 'in_attesa' };
        salva();
      },
      async esci() { db.sessione = null; salva(); },
      async ricomincia() { localStorage.removeItem(CHIAVE); },

      async impostazioni() { return copia(db.impostazioni); },
      async salvaImpostazioni(v) { Object.assign(db.impostazioni, v); salva(); },

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
        const i = r.id ? db.prodotti.findIndex(x => x.id === r.id) : -1;
        if (i >= 0) db.prodotti[i] = r;
        else { r.id = 'p' + Date.now(); r.creato = r.aggiornato; db.prodotti.unshift(r); }
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
      async urlFoto(ids, miniatura) {
        const fuori = {};
        ids.forEach(id => { const f = db.foto[id]; if (f) fuori[id] = miniatura ? f.m : f.g; });
        return fuori;
      },

      async clienti() { return copia(db.clienti); },
      async statoCliente(id, stato) {
        const c = db.clienti.find(x => x.user_id === id);
        if (c) c.stato = stato;
        salva();
      }
    };
  }

  const vero = !!(C.supabaseUrl && C.supabaseKey);
  if (vero && !window.supabase) {
    window.DATI_ERRORE = 'Non riesco a scaricare la libreria di Supabase: controlla la connessione.';
  }
  window.DATI = vero && window.supabase ? motoreSupabase() : motoreProva();
  window.DATI_VERO = vero;
})();
