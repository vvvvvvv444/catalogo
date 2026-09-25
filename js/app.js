/* Il catalogo: negozio, scheda prodotto, lista richieste, pannello di amministrazione. */
(function () {
  const C = window.CONFIG;
  const D = window.DATI;
  const $app = document.getElementById('app');
  const S = { utente: null, imp: {}, marchi: [], prodotti: [], clienti: [], caricati: false };
  const scorrimenti = {};

  // ---------------------------------------------------------------- utilità
  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
  const EURO = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const euro = n => numero(n) == null ? '' : EURO.format(n);
  const cat = id => C.categorie.find(c => c.id === id) || { id, nome: id || '—', icona: 'tutti' };
  const gen = id => C.generi.find(g => g.id === id) || { id, nome: id || '—' };
  const marchio = id => S.marchi.find(m => m.id === id);
  const semplice = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const elenco = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  const sconto = p => (numero(p.prezzo_pieno) > numero(p.prezzo) && numero(p.prezzo) > 0) ? Math.round((1 - p.prezzo / p.prezzo_pieno) * 100) : 0;
  const nomeNegozio = () => S.imp.nome_negozio || 'Catalogo';
  const linkCatalogo = () => location.origin + location.pathname;

  let timerAvviso;
  function avviso(testo, tipo) {
    const el = document.getElementById('avviso');
    el.textContent = testo;
    el.className = 'avviso ' + (tipo || '');
    el.hidden = false;
    clearTimeout(timerAvviso);
    timerAvviso = setTimeout(() => { el.hidden = true; }, tipo === 'errore' ? 6000 : 2600);
  }

  async function riempiFoto(radice) {
    const imgs = [...(radice || $app).querySelectorAll('img[data-foto]:not([src])')];
    if (!imgs.length) return;
    const m = new Set(), g = new Set();
    imgs.forEach(i => (i.dataset.t === 'g' ? g : m).add(i.dataset.foto));
    try {
      const [um, ug] = await Promise.all([m.size ? D.urlFoto([...m], true) : {}, g.size ? D.urlFoto([...g], false) : {}]);
      imgs.forEach(i => { const u = (i.dataset.t === 'g' ? ug : um)[i.dataset.foto]; if (u) i.src = u; });
    } catch (e) { console.warn('foto', e); }
  }
  const fotoTag = (id, t, alt) => id
    ? '<img data-foto="' + h(id) + '" data-t="' + (t || 'm') + '" alt="' + h(alt || '') + '" loading="lazy" decoding="async">'
    : '<div class="senza-foto">' + icona('foto') + '</div>';

  // ---------------------------------------------------------------- richiesta (per ogni visitatore)
  const RICH = 'catalogo-richiesta';
  function richiesta() { try { return JSON.parse(localStorage.getItem(RICH)) || []; } catch (e) { return []; } }
  function salvaRichiesta(r) { try { localStorage.setItem(RICH, JSON.stringify(r)); } catch (e) { /* niente */ } }
  function contaRichiesta() { return richiesta().filter(x => S.prodotti.some(p => p.id === x.id)).reduce((a, x) => a + x.qta, 0); }

  function numeroWhatsapp() {
    let n = String(S.imp.whatsapp || '').replace(/\D/g, '');
    if (n.startsWith('00')) n = n.slice(2);
    if (n.length === 10 && n.startsWith('3')) n = '39' + n;
    return n;
  }
  function apriWhatsapp(testo) {
    const n = numeroWhatsapp();
    if (!n) return avviso('Il numero WhatsApp non è ancora impostato.', 'errore');
    window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(testo), '_blank', 'noopener');
  }

  // ---------------------------------------------------------------- indirizzi
  function leggiIndirizzo() {
    const [percorso, qs] = location.hash.slice(1).split('?');
    return { pezzi: (percorso || '/').split('/').filter(Boolean), par: new URLSearchParams(qs || '') };
  }
  function filtriDa(par) {
    return {
      cat: par.get('cat') || '', gen: par.get('gen') || '', m: par.getAll('m'), q: par.get('q') || '',
      ord: par.get('ord') || '', min: par.get('min') || '', max: par.get('max') || '', disp: par.get('disp') === '1'
    };
  }
  function linkFiltri(f, cambi) {
    const x = Object.assign({}, f, cambi || {});
    const p = new URLSearchParams();
    if (x.cat) p.set('cat', x.cat);
    if (x.gen) p.set('gen', x.gen);
    (x.m || []).forEach(m => p.append('m', m));
    if (x.q) p.set('q', x.q);
    if (x.ord) p.set('ord', x.ord);
    if (x.min) p.set('min', x.min);
    if (x.max) p.set('max', x.max);
    if (x.disp) p.set('disp', '1');
    const s = p.toString();
    return '#/' + (s ? '?' + s : '');
  }
  const filtriVuoti = f => !f.cat && !f.gen && !f.m.length && !f.q && !f.min && !f.max && !f.disp;

  function filtra(f, salta) {
    const q = semplice(f.q).split(/\s+/).filter(Boolean);
    const min = numero(f.min), max = numero(f.max);
    return S.prodotti.filter(p => {
      if (salta !== 'cat' && f.cat && p.categoria !== f.cat) return false;
      if (salta !== 'gen' && f.gen && p.genere !== f.gen) return false;
      if (salta !== 'm' && f.m.length && !f.m.includes(p.marchio_id)) return false;
      if (f.disp && !p.disponibile) return false;
      if (min != null && !(numero(p.prezzo) >= min)) return false;
      if (max != null && !(numero(p.prezzo) <= max)) return false;
      if (q.length) {
        const mm = marchio(p.marchio_id);
        const testo = semplice([p.nome, p.descrizione, p.codice, p.colori, mm && mm.nome, cat(p.categoria).nome, gen(p.genere).nome].join(' '));
        if (!q.every(w => testo.includes(w))) return false;
      }
      return true;
    });
  }
  function ordina(lista, ord) {
    const l = lista.slice();
    const pz = p => numero(p.prezzo) == null ? Infinity : Number(p.prezzo);
    if (ord === 'prezzo-su') l.sort((a, b) => pz(a) - pz(b));
    else if (ord === 'prezzo-giu') l.sort((a, b) => (pz(b) === Infinity ? -1 : pz(b)) - (pz(a) === Infinity ? -1 : pz(a)));
    else if (ord === 'nuovi') l.sort((a, b) => String(b.creato).localeCompare(String(a.creato)));
    else if (ord === 'sconto') l.sort((a, b) => sconto(b) - sconto(a));
    else l.sort((a, b) => (b.disponibile - a.disponibile) || (b.in_evidenza - a.in_evidenza) || ((a.ordine || 0) - (b.ordine || 0)) || String(b.creato).localeCompare(String(a.creato)));
    return l;
  }

  // ---------------------------------------------------------------- guscio comune
  function testata(f) {
    f = f || filtriDa(new URLSearchParams());
    const n = contaRichiesta();
    const attesa = S.utente.admin ? S.clienti.filter(c => c.stato === 'in_attesa').length : 0;
    return '<header class="testata"><div class="contenitore testata-riga">' +
      '<a class="logo" href="#/" title="' + h(nomeNegozio()) + '">' + h(nomeNegozio()) + '</a>' +
      '<form class="cerca" data-form="cerca" role="search"><input name="q" type="search" placeholder="Cerca prodotti, marchi…" value="' + h(f.q) + '" aria-label="Cerca"><button aria-label="Cerca">' + icona('cerca') + '</button></form>' +
      '<nav class="azioni">' +
        '<a class="icona-btn" href="#/marchi">' + icona('marchio') + '<span>Marchi</span></a>' +
        '<a class="icona-btn" href="#/richiesta">' + icona('sacca') + '<span>Richiesta</span>' + (n ? '<b class="pallino">' + n + '</b>' : '') + '</a>' +
        (S.utente.admin ? '<a class="icona-btn" href="#/admin">' + icona('ingranaggio') + '<span>Gestisci</span>' + (attesa ? '<b class="pallino">' + attesa + '</b>' : '') + '</a>' : '') +
        '<button class="icona-btn" data-az="esci" title="Esci (' + h(S.utente.email) + ')">' + icona('esci') + '<span>Esci</span></button>' +
      '</nav></div>' +
      '<div class="contenitore"><nav class="categorie">' +
        '<a class="cat' + (!f.cat ? ' attiva' : '') + '" href="' + linkFiltri(f, { cat: '', m: [] }) + '"><span class="cat-ico">' + icona('tutti') + '</span>Tutto</a>' +
        C.categorie.map(c => '<a class="cat' + (f.cat === c.id ? ' attiva' : '') + '" href="' + linkFiltri(f, { cat: c.id }) + '"><span class="cat-ico">' + icona(c.icona) + '</span>' + h(c.nome) + '</a>').join('') +
      '</nav></div></header>' +
      (D.demo ? '<div class="nastro-prova">Modalità prova: i dati restano solo su questo computer. <button data-az="ricomincia">Ricomincia da capo</button></div>' : '');
  }
  function disegna(html, f) {
    $app.innerHTML = testata(f) + '<main class="contenitore">' + html + '</main>';
    riempiFoto();
  }

  function scheda(p) {
    const mm = marchio(p.marchio_id), sc = sconto(p);
    return '<a class="card' + (p.disponibile ? '' : ' esaurito') + '" href="#/p/' + h(p.id) + '">' +
      '<div class="card-foto">' + fotoTag(p.foto && p.foto[0], 'm', p.nome) +
        (sc ? '<span class="badge-sconto">-' + sc + '%</span>' : '') +
        (p.disponibile ? '' : '<span class="badge-esaurito">Esaurito</span>') + '</div>' +
      '<div class="card-testo">' +
        (mm ? '<div class="card-marchio">' + h(mm.nome) + '</div>' : '') +
        '<div class="card-nome">' + h(p.nome) + '</div>' +
        '<div class="card-prezzo">' + (numero(p.prezzo) != null ? '<b>' + euro(p.prezzo) + '</b>' : '<span class="su-richiesta">Prezzo su richiesta</span>') +
          (sc ? '<s>' + euro(p.prezzo_pieno) + '</s>' : '') + '</div>' +
      '</div></a>';
  }

  // ---------------------------------------------------------------- NEGOZIO
  function paginaNegozio(par) {
    const f = filtriDa(par);
    const lista = ordina(filtra(f), f.ord);
    const vuoti = filtriVuoti(f);
    const conta = (campo, val) => filtra(f, campo).filter(p => (campo === 'm' ? p.marchio_id : campo === 'cat' ? p.categoria : p.genere) === val).length;

    const pannello =
      '<aside class="filtri" id="filtri"><div class="filtri-testa"><b>Filtri</b><button class="icona-btn" data-az="chiudi-filtri" aria-label="Chiudi">' + icona('chiudi') + '</button></div>' +
      '<div class="filtro-gruppo"><h4>Categoria</h4>' +
        '<a class="filtro-voce' + (!f.cat ? ' sel' : '') + '" href="' + linkFiltri(f, { cat: '' }) + '">Tutte</a>' +
        C.categorie.map(c => { const n = conta('cat', c.id); return n || f.cat === c.id ? '<a class="filtro-voce' + (f.cat === c.id ? ' sel' : '') + '" href="' + linkFiltri(f, { cat: c.id }) + '">' + h(c.nome) + '<i>' + n + '</i></a>' : ''; }).join('') +
      '</div>' +
      '<div class="filtro-gruppo"><h4>Genere</h4>' +
        '<a class="filtro-voce' + (!f.gen ? ' sel' : '') + '" href="' + linkFiltri(f, { gen: '' }) + '">Tutti</a>' +
        C.generi.map(g => { const n = conta('gen', g.id); return n || f.gen === g.id ? '<a class="filtro-voce' + (f.gen === g.id ? ' sel' : '') + '" href="' + linkFiltri(f, { gen: g.id }) + '">' + h(g.nome) + '<i>' + n + '</i></a>' : ''; }).join('') +
      '</div>' +
      '<div class="filtro-gruppo"><h4>Marchio</h4>' +
        S.marchi.map(m => {
          const n = conta('m', m.id), sel = f.m.includes(m.id);
          if (!n && !sel) return '';
          const nuovi = sel ? f.m.filter(x => x !== m.id) : f.m.concat(m.id);
          return '<a class="filtro-voce spunta' + (sel ? ' sel' : '') + '" href="' + linkFiltri(f, { m: nuovi }) + '"><span class="casella">' + (sel ? icona('spunta') : '') + '</span>' + h(m.nome) + '<i>' + n + '</i></a>';
        }).join('') +
      '</div>' +
      '<form class="filtro-gruppo" data-form="prezzo"><h4>Prezzo (€)</h4><div class="prezzo-da-a">' +
        '<input name="min" type="number" min="0" step="1" placeholder="da" value="' + h(f.min) + '"><span>–</span>' +
        '<input name="max" type="number" min="0" step="1" placeholder="a" value="' + h(f.max) + '"><button class="btn piccolo">OK</button></div></form>' +
      '<div class="filtro-gruppo"><a class="filtro-voce spunta' + (f.disp ? ' sel' : '') + '" href="' + linkFiltri(f, { disp: !f.disp }) + '"><span class="casella">' + (f.disp ? icona('spunta') : '') + '</span>Solo disponibili</a></div>' +
      (!vuoti ? '<a class="btn contorno largo" href="#/">Togli tutti i filtri</a>' : '') +
      '</aside><div class="velo" data-az="chiudi-filtri"></div>';

    let testa = '';
    if (vuoti) {
      const evid = ordina(S.prodotti.filter(p => p.in_evidenza && p.disponibile));
      const marchiUsati = S.marchi.filter(m => S.prodotti.some(p => p.marchio_id === m.id));
      testa =
        '<section class="vetrina"><div><h1>' + h(nomeNegozio()) + '</h1>' +
          (S.imp.sottotitolo ? '<p class="vetrina-sotto">' + h(S.imp.sottotitolo) + '</p>' : '') +
          (S.imp.messaggio_benvenuto ? '<p>' + h(S.imp.messaggio_benvenuto) + '</p>' : '') + '</div>' +
          '<div class="vetrina-generi">' + C.generi.filter(g => S.prodotti.some(p => p.genere === g.id)).map(g => '<a href="' + linkFiltri(f, { gen: g.id }) + '">' + h(g.nome) + '</a>').join('') + '</div></section>' +
        (evid.length ? '<section class="blocco"><div class="blocco-testa"><h2>' + icona('stella') + ' In evidenza</h2></div><div class="fila">' + evid.map(scheda).join('') + '</div></section>' : '') +
        (marchiUsati.length ? '<section class="blocco"><div class="blocco-testa"><h2>Marchi</h2><a href="#/marchi">Vedi tutti</a></div><div class="fila-marchi">' +
          marchiUsati.map(m => '<a class="chip-marchio" href="' + linkFiltri(f, { m: [m.id] }) + '"><b>' + h(m.nome.slice(0, 1)) + '</b>' + h(m.nome) + '</a>').join('') + '</div></section>' : '');
    }

    const titolo = f.q ? 'Risultati per “' + h(f.q) + '”'
      : f.cat ? h(cat(f.cat).nome) + (f.gen ? ' · ' + h(gen(f.gen).nome) : '')
      : f.gen ? h(gen(f.gen).nome) : f.m.length === 1 && marchio(f.m[0]) ? h(marchio(f.m[0]).nome) : 'Tutti i prodotti';
    const schede = C.generi.filter(g => filtra(f, 'gen').some(p => p.genere === g.id));
    const ords = [['', 'Consigliati'], ['nuovi', 'Novità'], ['prezzo-su', 'Prezzo: dal più basso'], ['prezzo-giu', 'Prezzo: dal più alto'], ['sconto', 'Sconto maggiore']];

    const corpo =
      '<div class="negozio">' + pannello + '<section class="risultati">' + testa +
        '<div class="risultati-testa"><h2>' + titolo + ' <small>' + lista.length + (lista.length === 1 ? ' prodotto' : ' prodotti') + '</small></h2>' +
          '<div class="risultati-comandi"><button class="btn contorno piccolo solo-telefono" data-az="apri-filtri">' + icona('filtro') + ' Filtri</button>' +
          '<select data-az="ordina" aria-label="Ordina">' + ords.map(o => '<option value="' + o[0] + '"' + (f.ord === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div></div>' +
        (schede.length > 1 || f.gen ? '<div class="schede-genere"><a class="' + (!f.gen ? 'sel' : '') + '" href="' + linkFiltri(f, { gen: '' }) + '">Tutti</a>' +
          schede.map(g => '<a class="' + (f.gen === g.id ? 'sel' : '') + '" href="' + linkFiltri(f, { gen: g.id }) + '">' + h(g.nome) + '</a>').join('') + '</div>' : '') +
        (lista.length ? '<div class="griglia">' + lista.map(scheda).join('') + '</div>'
          : '<div class="vuoto">' + icona('cerca') + '<p>Nessun prodotto trovato.</p>' + (!vuoti ? '<a class="btn" href="#/">Mostra tutto</a>' : '') + '</div>') +
      '</section></div>';
    disegna(corpo, f);
  }

  // ---------------------------------------------------------------- MARCHI
  function paginaMarchi() {
    const righe = S.marchi.map(m => ({ m, n: S.prodotti.filter(p => p.marchio_id === m.id).length })).filter(x => x.n);
    disegna('<div class="pagina"><h1>Marchi</h1>' +
      (righe.length ? '<div class="griglia-marchi">' + righe.map(x => {
        const p = S.prodotti.find(p => p.marchio_id === x.m.id && p.foto && p.foto.length);
        return '<a class="tessera-marchio" href="' + linkFiltri(filtriDa(new URLSearchParams()), { m: [x.m.id] }) + '">' +
          '<div class="tessera-foto">' + fotoTag(p && p.foto[0], 'm', x.m.nome) + '</div><b>' + h(x.m.nome) + '</b><span>' + x.n + ' prodotti</span></a>';
      }).join('') + '</div>' : '<div class="vuoto"><p>Nessun marchio ancora.</p></div>') + '</div>');
  }

  // ---------------------------------------------------------------- SCHEDA PRODOTTO
  function paginaProdotto(id) {
    const p = S.prodotti.find(x => x.id === id);
    if (!p) return disegna('<div class="vuoto"><p>Prodotto non trovato.</p><a class="btn" href="#/">Torna al catalogo</a></div>');
    const mm = marchio(p.marchio_id), sc = sconto(p), foto = p.foto || [];
    const taglie = elenco(p.taglie), colori = elenco(p.colori);
    const dettagli = String(p.dettagli || '').split('\n').map(x => x.trim()).filter(Boolean);
    const simili = ordina(S.prodotti.filter(x => x.id !== p.id && ((mm && x.marchio_id === p.marchio_id) || x.categoria === p.categoria))).slice(0, 10);
    const f0 = filtriDa(new URLSearchParams());
    const scelta = (nome, voci) => voci.length ? '<div class="opzioni"><h4>' + nome + '</h4><div class="chips" data-gruppo="' + nome.toLowerCase() + '">' +
      voci.map((v, i) => '<button type="button" class="chip' + (voci.length === 1 && i === 0 ? ' sel' : '') + '" data-az="scegli" data-valore="' + h(v) + '">' + h(v) + '</button>').join('') + '</div></div>' : '';

    disegna(
      '<nav class="briciole"><a href="#/">Catalogo</a> › <a href="' + linkFiltri(f0, { cat: p.categoria }) + '">' + h(cat(p.categoria).nome) + '</a>' +
        (mm ? ' › <a href="' + linkFiltri(f0, { m: [mm.id] }) + '">' + h(mm.nome) + '</a>' : '') + '</nav>' +
      '<article class="prodotto" data-id="' + h(p.id) + '">' +
        '<div class="galleria">' +
          '<div class="galleria-scorri" id="scorri">' + (foto.length ? foto.map((x, i) => '<div class="galleria-foto" data-az="ingrandisci" data-i="' + i + '">' + fotoTag(x, 'g', p.nome) + '</div>').join('') : '<div class="galleria-foto">' + fotoTag(null) + '</div>') + '</div>' +
          (sc ? '<span class="badge-sconto grande">-' + sc + '%</span>' : '') +
          (foto.length > 1 ? '<div class="miniature">' + foto.map((x, i) => '<button class="mini' + (i === 0 ? ' sel' : '') + '" data-az="vai-foto" data-i="' + i + '">' + fotoTag(x, 'm', '') + '</button>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="info">' +
          (mm ? '<a class="info-marchio" href="' + linkFiltri(f0, { m: [mm.id] }) + '">' + h(mm.nome) + '</a>' : '') +
          '<h1>' + h(p.nome) + '</h1>' +
          '<div class="etichette"><span>' + h(cat(p.categoria).nome) + '</span><span>' + h(gen(p.genere).nome) + '</span>' + (p.codice ? '<span>Cod. ' + h(p.codice) + '</span>' : '') + '</div>' +
          '<div class="riquadro-prezzo">' + (numero(p.prezzo) != null ? '<b>' + euro(p.prezzo) + '</b>' : '<b class="su-richiesta">Prezzo su richiesta</b>') +
            (sc ? '<s>' + euro(p.prezzo_pieno) + '</s><span class="risparmio">Risparmi ' + euro(p.prezzo_pieno - p.prezzo) + '</span>' : '') + '</div>' +
          (p.disponibile ? '' : '<div class="nota-esaurito">Al momento esaurito: puoi comunque chiedere quando torna.</div>') +
          scelta('Taglia', taglie) + scelta('Colore', colori) +
          '<div class="opzioni"><h4>Quantità</h4><div class="quantita"><button type="button" data-az="qta" data-d="-1">−</button><input id="qta" type="number" min="1" value="1" aria-label="Quantità"><button type="button" data-az="qta" data-d="1">+</button></div></div>' +
          '<div class="bottoni-acquisto">' +
            '<button class="btn grande" data-az="aggiungi">' + icona('sacca') + ' Aggiungi alla richiesta</button>' +
            '<button class="btn grande verde" data-az="chiedi">' + icona('whatsapp') + ' Chiedi su WhatsApp</button></div>' +
          (S.utente.admin ? '<a class="btn contorno largo" href="#/admin/prodotto/' + h(p.id) + '">' + icona('matita') + ' Modifica questo prodotto</a>' : '') +
          (p.descrizione ? '<section class="descrizione"><h3>Descrizione</h3>' + h(p.descrizione).split(/\n{2,}/).map(x => '<p>' + x.replace(/\n/g, '<br>') + '</p>').join('') + '</section>' : '') +
          (dettagli.length ? '<section class="descrizione"><h3>Dettagli</h3><ul>' + dettagli.map(d => '<li>' + h(d) + '</li>').join('') + '</ul></section>' : '') +
        '</div></article>' +
      (simili.length ? '<section class="blocco"><div class="blocco-testa"><h2>Potrebbe piacerti anche</h2></div><div class="fila">' + simili.map(scheda).join('') + '</div></section>' : '')
    );

    const sc2 = document.getElementById('scorri');
    if (sc2) sc2.addEventListener('scroll', () => {
      const i = Math.round(sc2.scrollLeft / sc2.clientWidth);
      document.querySelectorAll('.mini').forEach((b, j) => b.classList.toggle('sel', i === j));
    }, { passive: true });
  }

  function sceltaProdotto() {
    const art = document.querySelector('.prodotto');
    const val = g => { const s = art.querySelector('[data-gruppo="' + g + '"] .chip.sel'); return s ? s.dataset.valore : ''; };
    const serve = g => !!art.querySelector('[data-gruppo="' + g + '"]');
    const p = S.prodotti.find(x => x.id === art.dataset.id);
    const x = { id: p.id, taglia: val('taglia'), colore: val('colore'), qta: Math.max(1, parseInt(document.getElementById('qta').value, 10) || 1) };
    if (serve('taglia') && !x.taglia) { avviso('Scegli la taglia.', 'errore'); return null; }
    if (serve('colore') && !x.colore) { avviso('Scegli il colore.', 'errore'); return null; }
    return { p, x };
  }
  function rigaTesto(p, x) {
    const mm = marchio(p.marchio_id);
    const extra = [x.taglia && 'taglia ' + x.taglia, x.colore && 'colore ' + x.colore].filter(Boolean).join(', ');
    return '• ' + p.nome + (mm ? ' (' + mm.nome + ')' : '') + (p.codice ? ' [' + p.codice + ']' : '') + (extra ? ' – ' + extra : '') +
      ' – ' + x.qta + ' pz' + (numero(p.prezzo) != null ? ' – ' + euro(p.prezzo * x.qta) : '');
  }

  // ---------------------------------------------------------------- RICHIESTA
  function paginaRichiesta() {
    const r = richiesta().filter(x => S.prodotti.some(p => p.id === x.id));
    const tot = r.reduce((a, x) => { const p = S.prodotti.find(p => p.id === x.id); return a + (numero(p.prezzo) || 0) * x.qta; }, 0);
    disegna('<div class="pagina stretta"><h1>La tua richiesta</h1>' +
      (r.length ? '<div class="lista-richiesta">' + r.map((x, i) => {
        const p = S.prodotti.find(p => p.id === x.id), mm = marchio(p.marchio_id);
        return '<div class="riga-richiesta"><a href="#/p/' + h(p.id) + '" class="rr-foto">' + fotoTag(p.foto && p.foto[0], 'm', p.nome) + '</a>' +
          '<div class="rr-testo"><a href="#/p/' + h(p.id) + '"><b>' + h(p.nome) + '</b></a><small>' + [mm && h(mm.nome), x.taglia && 'Taglia ' + h(x.taglia), x.colore && h(x.colore)].filter(Boolean).join(' · ') + '</small>' +
          '<div class="rr-prezzo">' + (numero(p.prezzo) != null ? euro(p.prezzo) : 'Prezzo su richiesta') + '</div></div>' +
          '<div class="quantita piccola"><button data-az="rr-qta" data-i="' + i + '" data-d="-1">−</button><span>' + x.qta + '</span><button data-az="rr-qta" data-i="' + i + '" data-d="1">+</button></div>' +
          '<button class="icona-btn" data-az="rr-togli" data-i="' + i + '" aria-label="Togli">' + icona('cestino') + '</button></div>';
      }).join('') + '</div>' +
      '<div class="totale"><span>Totale indicativo</span><b>' + euro(tot) + '</b></div>' +
      '<p class="nota">Il totale è indicativo: disponibilità, spedizione e pagamento li concordi direttamente su WhatsApp.</p>' +
      '<button class="btn grande verde largo" data-az="invia-richiesta">' + icona('whatsapp') + ' Invia la richiesta su WhatsApp</button>' +
      '<button class="btn contorno largo" data-az="svuota">Svuota la richiesta</button>'
      : '<div class="vuoto">' + icona('sacca') + '<p>La richiesta è vuota.</p><a class="btn" href="#/">Guarda il catalogo</a></div>') +
      '</div>');
  }

  // ---------------------------------------------------------------- AMMINISTRAZIONE
  function adminGuscio(voce, html) {
    const attesa = S.clienti.filter(c => c.stato === 'in_attesa').length;
    const voci = [['', 'Prodotti', 'foto'], ['marchi', 'Marchi', 'marchio'], ['clienti', 'Clienti', 'persone'], ['impostazioni', 'Impostazioni', 'ingranaggio']];
    disegna('<div class="admin"><nav class="admin-menu">' +
      voci.map(v => '<a class="' + (voce === v[0] ? 'sel' : '') + '" href="#/admin' + (v[0] ? '/' + v[0] : '') + '">' + icona(v[2]) + v[1] +
        (v[0] === 'clienti' && attesa ? '<b class="pallino in-linea">' + attesa + '</b>' : '') + '</a>').join('') +
      '</nav><section class="admin-corpo">' + html + '</section></div>');
  }

  function adminProdotti() {
    const lista = ordina(S.prodotti, 'nuovi');
    adminGuscio('', '<div class="admin-testa"><h1>Prodotti <small>' + lista.length + '</small></h1><a class="btn" href="#/admin/prodotto/nuovo">' + icona('piu') + ' Nuovo prodotto</a></div>' +
      '<div class="admin-barra"><input type="search" id="admin-cerca" placeholder="Cerca per nome, marchio, codice…">' +
      '<select id="admin-cat"><option value="">Tutte le categorie</option>' + C.categorie.map(c => '<option value="' + c.id + '">' + h(c.nome) + '</option>').join('') + '</select></div>' +
      '<p class="nota">Il prezzo si cambia direttamente qui sotto: scrivi e premi Invio (o esci dalla casella).</p>' +
      (lista.length ? '<div class="admin-lista">' + lista.map(p => {
        const mm = marchio(p.marchio_id);
        const testo = semplice([p.nome, mm && mm.nome, p.codice].join(' '));
        return '<div class="admin-riga" data-id="' + h(p.id) + '" data-testo="' + h(testo) + '" data-cat="' + h(p.categoria) + '">' +
          '<a class="ar-foto" href="#/admin/prodotto/' + h(p.id) + '">' + fotoTag(p.foto && p.foto[0], 'm', '') + '</a>' +
          '<div class="ar-testo"><a href="#/admin/prodotto/' + h(p.id) + '"><b>' + h(p.nome) + '</b></a><small>' +
            [mm ? h(mm.nome) : '<i>senza marchio</i>', h(cat(p.categoria).nome), h(gen(p.genere).nome), p.codice && h(p.codice)].filter(Boolean).join(' · ') + '</small></div>' +
          '<label class="ar-prezzo">€ <input type="number" step="0.01" min="0" value="' + (numero(p.prezzo) != null ? p.prezzo : '') + '" data-az="prezzo-veloce" placeholder="—"></label>' +
          '<div class="ar-interruttori">' +
            '<label class="interruttore" title="Disponibile"><input type="checkbox" data-az="campo-veloce" data-campo="disponibile"' + (p.disponibile ? ' checked' : '') + '><span></span>Disponibile</label>' +
            '<label class="interruttore" title="In evidenza"><input type="checkbox" data-az="campo-veloce" data-campo="in_evidenza"' + (p.in_evidenza ? ' checked' : '') + '><span></span>In evidenza</label></div>' +
          '<div class="ar-azioni"><a class="icona-btn" href="#/p/' + h(p.id) + '" title="Vedi come cliente">' + icona('cerca') + '</a>' +
            '<a class="icona-btn" href="#/admin/prodotto/' + h(p.id) + '" title="Modifica">' + icona('matita') + '</a>' +
            '<button class="icona-btn pericolo" data-az="elimina-prodotto" title="Elimina">' + icona('cestino') + '</button></div></div>';
      }).join('') + '</div>' : '<div class="vuoto"><p>Nessun prodotto: comincia dal pulsante “Nuovo prodotto”.</p></div>'));

    const cerca = document.getElementById('admin-cerca'), sel = document.getElementById('admin-cat');
    const applica = () => {
      const q = semplice(cerca.value).split(/\s+/).filter(Boolean);
      document.querySelectorAll('.admin-riga').forEach(r => {
        r.hidden = (sel.value && r.dataset.cat !== sel.value) || !q.every(w => r.dataset.testo.includes(w));
      });
    };
    cerca.addEventListener('input', applica);
    sel.addEventListener('change', applica);
  }

  // Bozza del prodotto in modifica
  let bozza = null;
  function adminProdotto(id) {
    if (!bozza || bozza.idPagina !== id) {
      const base = id === 'nuovo'
        ? { nome: '', marchio_id: null, categoria: C.categorie[0].id, genere: C.generi[0].id, prezzo: null, prezzo_pieno: null, descrizione: '', dettagli: '', taglie: '', colori: '', foto: [], disponibile: true, in_evidenza: false, codice: '', ordine: 0 }
        : S.prodotti.find(p => p.id === id);
      if (!base) return adminGuscio('', '<div class="vuoto"><p>Prodotto non trovato.</p><a class="btn" href="#/admin">Torna ai prodotti</a></div>');
      bozza = { idPagina: id, p: JSON.parse(JSON.stringify(base)), caricateOra: [], daTogliere: [], inCaricamento: 0 };
    }
    const p = bozza.p;
    const opz = (lista, val) => lista.map(x => '<option value="' + h(x.id) + '"' + (x.id === val ? ' selected' : '') + '>' + h(x.nome) + '</option>').join('');
    adminGuscio('', '<div class="admin-testa"><h1>' + (id === 'nuovo' ? 'Nuovo prodotto' : 'Modifica prodotto') + '</h1><a class="btn contorno" href="#/admin" data-az="annulla-bozza">Annulla</a></div>' +
      '<form class="modulo" data-form="prodotto" autocomplete="off">' +
        '<fieldset><legend>Foto</legend><p class="nota">La prima foto è la copertina. Puoi caricarne più di una insieme; si rimpiccioliscono da sole.</p>' +
          '<div class="foto-bozza" id="foto-bozza">' + fotoBozza() + '</div></fieldset>' +
        '<fieldset><legend>Il prodotto</legend>' +
          '<label class="campo largo">Nome *<input name="nome" required maxlength="140" value="' + h(p.nome) + '" placeholder="Es. Sneaker in pelle bianca"></label>' +
          '<label class="campo">Marchio<select name="marchio_id" data-az="scegli-marchio"><option value="">— senza marchio —</option>' + opz(S.marchi, p.marchio_id) + '<option value="__nuovo">+ Nuovo marchio…</option></select></label>' +
          '<label class="campo">Codice<input name="codice" maxlength="40" value="' + h(p.codice) + '" placeholder="facoltativo"></label>' +
          '<label class="campo">Categoria *<select name="categoria">' + opz(C.categorie, p.categoria) + '</select></label>' +
          '<label class="campo">Genere *<select name="genere">' + opz(C.generi, p.genere) + '</select></label>' +
        '</fieldset>' +
        '<fieldset><legend>Prezzo</legend>' +
          '<label class="campo">Prezzo di vendita (€)<input name="prezzo" type="number" step="0.01" min="0" value="' + (numero(p.prezzo) != null ? p.prezzo : '') + '" placeholder="vuoto = su richiesta"></label>' +
          '<label class="campo">Prezzo pieno, prima dello sconto (€)<input name="prezzo_pieno" type="number" step="0.01" min="0" value="' + (numero(p.prezzo_pieno) != null ? p.prezzo_pieno : '') + '" placeholder="facoltativo"></label>' +
        '</fieldset>' +
        '<fieldset><legend>Varianti</legend>' +
          '<label class="campo">Taglie / misure<input name="taglie" value="' + h(p.taglie) + '" placeholder="Es. 36, 37, 38 oppure S, M, L"></label>' +
          '<label class="campo">Colori<input name="colori" value="' + h(p.colori) + '" placeholder="Es. Nero, Bianco"></label>' +
        '</fieldset>' +
        '<fieldset><legend>Descrizione</legend>' +
          '<label class="campo largo">Descrizione<textarea name="descrizione" rows="5" placeholder="Com\'è, a chi è adatto, perché piace">' + h(p.descrizione) + '</textarea></label>' +
          '<label class="campo largo">Dettagli (uno per riga)<textarea name="dettagli" rows="4" placeholder="Materiale: pelle&#10;Suola in gomma">' + h(p.dettagli) + '</textarea></label>' +
        '</fieldset>' +
        '<fieldset><legend>Visibilità</legend>' +
          '<label class="interruttore"><input type="checkbox" name="disponibile"' + (p.disponibile ? ' checked' : '') + '><span></span>Disponibile</label>' +
          '<label class="interruttore"><input type="checkbox" name="in_evidenza"' + (p.in_evidenza ? ' checked' : '') + '><span></span>In evidenza (in cima al catalogo)</label>' +
        '</fieldset>' +
        '<div class="modulo-piede"><button class="btn grande" type="submit">' + icona('spunta') + ' Salva</button>' +
          (id !== 'nuovo' ? '<button class="btn contorno pericolo" type="button" data-az="elimina-bozza">' + icona('cestino') + ' Elimina prodotto</button>' : '') + '</div>' +
      '</form>');
  }
  function fotoBozza() {
    const f = bozza.p.foto;
    return f.map((id, i) => '<div class="fb"><div class="fb-img">' + fotoTag(id, 'm', '') + (i === 0 ? '<span class="fb-copertina">Copertina</span>' : '') + '</div>' +
      '<div class="fb-comandi"><button type="button" data-az="foto-su" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + ' title="Più avanti">' + icona('indietro') + '</button>' +
      '<button type="button" data-az="foto-giu" data-i="' + i + '"' + (i === f.length - 1 ? ' disabled' : '') + ' title="Più indietro">' + icona('avanti') + '</button>' +
      '<button type="button" data-az="foto-togli" data-i="' + i + '" title="Togli">' + icona('cestino') + '</button></div></div>').join('') +
      (bozza.inCaricamento ? '<div class="fb attesa"><div class="fb-img"><span class="rotella"></span></div><small>Carico ' + bozza.inCaricamento + '…</small></div>' : '') +
      '<label class="fb aggiungi">' + icona('piu') + '<span>Aggiungi foto</span><input type="file" accept="image/*" multiple data-az="carica-foto" hidden></label>';
  }
  function ridisegnaFotoBozza() {
    const el = document.getElementById('foto-bozza');
    if (el) { el.innerHTML = fotoBozza(); riempiFoto(el); }
  }
  function leggiModulo(form) {
    const v = n => form.elements[n].value.trim();
    Object.assign(bozza.p, {
      nome: v('nome'), marchio_id: v('marchio_id') && v('marchio_id') !== '__nuovo' ? v('marchio_id') : null, codice: v('codice'),
      categoria: v('categoria'), genere: v('genere'), prezzo: numero(v('prezzo')), prezzo_pieno: numero(v('prezzo_pieno')),
      taglie: v('taglie'), colori: v('colori'), descrizione: form.elements.descrizione.value.trim(), dettagli: form.elements.dettagli.value.trim(),
      disponibile: form.elements.disponibile.checked, in_evidenza: form.elements.in_evidenza.checked
    });
  }
  async function lasciaBozza(salvata) {
    if (!bozza) return;
    const via = salvata ? bozza.daTogliere : bozza.caricateOra;
    bozza = null;
    if (via.length) try { await D.eliminaFoto(via); } catch (e) { console.warn(e); }
  }

  function adminMarchi() {
    adminGuscio('marchi', '<div class="admin-testa"><h1>Marchi <small>' + S.marchi.length + '</small></h1></div>' +
      '<form class="admin-barra" data-form="nuovo-marchio"><input name="nome" placeholder="Nome del nuovo marchio" required maxlength="60"><button class="btn">' + icona('piu') + ' Aggiungi</button></form>' +
      '<p class="nota">Per cambiare un nome, scrivi nella casella e premi Invio.</p>' +
      '<div class="admin-lista">' + S.marchi.map(m => {
        const n = S.prodotti.filter(p => p.marchio_id === m.id).length;
        return '<div class="admin-riga semplice" data-id="' + h(m.id) + '"><input class="rinomina" value="' + h(m.nome) + '" data-az="rinomina-marchio" maxlength="60">' +
          '<small>' + n + ' prodotti</small><button class="icona-btn pericolo" data-az="elimina-marchio" title="Elimina">' + icona('cestino') + '</button></div>';
      }).join('') + '</div>');
  }

  function adminClienti() {
    const gruppi = [['in_attesa', 'In attesa di approvazione'], ['approvato', 'Possono vedere il catalogo'], ['bloccato', 'Bloccati']];
    const data = d => d ? new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    adminGuscio('clienti', '<div class="admin-testa"><h1>Clienti</h1><button class="btn contorno" data-az="aggiorna-clienti">Aggiorna</button></div>' +
      '<p class="nota">Chi apre il link si registra da solo; qui decidi tu chi può vedere il catalogo. Puoi bloccare chiunque in ogni momento.</p>' +
      gruppi.map(g => {
        const l = S.clienti.filter(c => c.stato === g[0]);
        if (!l.length && g[0] === 'bloccato') return '';
        return '<h3 class="gruppo-titolo">' + g[1] + ' <small>' + l.length + '</small></h3>' +
          (l.length ? '<div class="admin-lista">' + l.map(c => '<div class="admin-riga cliente" data-id="' + h(c.user_id) + '">' +
            '<div class="ar-testo"><b>' + h(c.nome || '(senza nome)') + '</b><small>' + [h(c.email), c.telefono && h(c.telefono), 'dal ' + data(c.creato)].filter(Boolean).join(' · ') + '</small></div>' +
            '<div class="ar-azioni">' +
              (c.stato !== 'approvato' ? '<button class="btn piccolo verde" data-az="stato-cliente" data-stato="approvato">' + icona('spunta') + ' Approva</button>' : '') +
              (c.stato !== 'bloccato' ? '<button class="btn piccolo contorno pericolo" data-az="stato-cliente" data-stato="bloccato">Blocca</button>' : '') +
            '</div></div>').join('') + '</div>' : '<p class="nota">Nessuno.</p>');
      }).join(''));
  }

  function adminImpostazioni() {
    const i = S.imp;
    adminGuscio('impostazioni', '<div class="admin-testa"><h1>Impostazioni</h1></div>' +
      '<div class="riquadro-link"><h3>' + icona('lucchetto') + ' Il link da mandare ai clienti</h3>' +
        '<div class="link-riga"><input readonly value="' + h(linkCatalogo()) + '" id="link-catalogo"><button class="btn" data-az="copia-link">' + icona('copia') + ' Copia</button></div>' +
        '<p class="nota">È sempre lo stesso. Chi lo apre deve registrarsi e aspettare che tu lo approvi nella pagina Clienti.</p></div>' +
      '<form class="modulo" data-form="impostazioni"><fieldset><legend>Negozio</legend>' +
        '<label class="campo largo">Nome del negozio<input name="nome_negozio" maxlength="60" value="' + h(i.nome_negozio) + '"></label>' +
        '<label class="campo largo">Frase sotto il nome<input name="sottotitolo" maxlength="120" value="' + h(i.sottotitolo) + '"></label>' +
        '<label class="campo largo">Messaggio di benvenuto<textarea name="messaggio_benvenuto" rows="3" maxlength="400">' + h(i.messaggio_benvenuto) + '</textarea></label>' +
        '<label class="campo">Numero WhatsApp per le richieste<input name="whatsapp" inputmode="tel" value="' + h(i.whatsapp) + '" placeholder="Es. 333 1234567"></label>' +
      '</fieldset><div class="modulo-piede"><button class="btn grande">' + icona('spunta') + ' Salva</button></div></form>');
  }

  function paginaAdmin(pezzi) {
    if (pezzi[0] !== 'prodotto' && bozza) lasciaBozza(false);
    if (pezzi[0] === 'prodotto') return adminProdotto(pezzi[1] || 'nuovo');
    if (pezzi[0] === 'marchi') return adminMarchi();
    if (pezzi[0] === 'clienti') return adminClienti();
    if (pezzi[0] === 'impostazioni') return adminImpostazioni();
    return adminProdotti();
  }

  // ---------------------------------------------------------------- ACCESSO
  function paginaAccesso(scheda) {
    scheda = scheda || 'entra';
    const prova = D.demo
      ? '<div class="accesso-prova"><p><b>Modalità prova</b>: il database vero non è ancora collegato. Prova le due parti:</p>' +
        '<button class="btn largo" data-az="prova-admin">Entra come venditrice (gestione)</button>' +
        '<button class="btn contorno largo" data-az="prova-cliente">Entra come cliente approvata</button>' +
        '<button class="link" data-az="scheda-accesso" data-scheda="registra">Prova a chiedere l\'accesso come cliente nuovo</button></div>'
      : '';
    $app.innerHTML = '<div class="accesso"><div class="accesso-card">' +
      '<div class="accesso-lucchetto">' + icona('lucchetto') + '</div>' +
      '<h1>' + h(nomeNegozio()) + '</h1>' + (S.imp.sottotitolo ? '<p class="accesso-sotto">' + h(S.imp.sottotitolo) + '</p>' : '') +
      '<p class="nota">Catalogo riservato: entra con il tuo account oppure chiedi l\'accesso.</p>' +
      (D.demo && scheda === 'entra' ? prova :
      '<div class="schede-accesso"><button class="' + (scheda === 'entra' ? 'sel' : '') + '" data-az="scheda-accesso" data-scheda="entra">Entra</button>' +
        '<button class="' + (scheda === 'registra' ? 'sel' : '') + '" data-az="scheda-accesso" data-scheda="registra">Chiedi l\'accesso</button></div>' +
      (scheda === 'entra'
        ? '<form class="modulo compatto" data-form="entra"><label class="campo largo">Email<input name="email" type="email" required autocomplete="email"></label>' +
          '<label class="campo largo">Password<input name="password" type="password" required autocomplete="current-password"></label>' +
          '<button class="btn grande largo">Entra</button><p class="nota">Password dimenticata? Scrivi alla venditrice.</p></form>'
        : '<form class="modulo compatto" data-form="registra"><label class="campo largo">Nome e cognome *<input name="nome" required maxlength="80" autocomplete="name"></label>' +
          '<label class="campo largo">Telefono<input name="telefono" inputmode="tel" maxlength="30" autocomplete="tel"></label>' +
          '<label class="campo largo">Email *<input name="email" type="email" required autocomplete="email"></label>' +
          '<label class="campo largo">Scegli una password * <small>(almeno 6 caratteri)</small><input name="password" type="password" required minlength="6" autocomplete="new-password"></label>' +
          '<button class="btn grande largo">Chiedi l\'accesso</button><p class="nota">La venditrice riceve la richiesta e ti dà l\'accesso. Nome e telefono le servono per riconoscerti.</p></form>')) +
      '</div></div>';
  }

  function paginaAttesa() {
    const bloccato = S.utente.stato === 'bloccato';
    $app.innerHTML = '<div class="accesso"><div class="accesso-card">' +
      '<div class="accesso-lucchetto">' + icona(bloccato ? 'lucchetto' : 'persone') + '</div>' +
      '<h1>' + h(nomeNegozio()) + '</h1>' +
      (bloccato ? '<p>Il tuo accesso non è attivo. Per informazioni scrivi alla venditrice.</p>'
        : '<p>Ciao <b>' + h(S.utente.nome || S.utente.email) + '</b>, la tua richiesta è arrivata.</p><p class="nota">Appena la venditrice ti approva potrai vedere il catalogo. Puoi chiudere questa pagina e riaprire il link più tardi.</p>' +
          '<button class="btn grande largo" data-az="ricontrolla">Controlla di nuovo</button>') +
      '<button class="btn contorno largo" data-az="esci">Esci</button></div></div>';
  }

  // ---------------------------------------------------------------- avvio e percorsi
  async function caricaTutto() {
    const [m, p, c] = await Promise.all([D.marchi(), D.prodotti(), S.utente.admin ? D.clienti() : []]);
    S.marchi = m || []; S.prodotti = (p || []).map(x => Object.assign({ foto: [] }, x, { foto: x.foto || [] })); S.clienti = c || [];
    S.caricati = true;
  }

  async function mostra() {
    const { pezzi, par } = leggiIndirizzo();
    if (window.DATI_ERRORE) { $app.innerHTML = '<div class="accesso"><div class="accesso-card"><h1>Qualcosa non va</h1><p>' + h(window.DATI_ERRORE) + '</p><button class="btn" onclick="location.reload()">Riprova</button></div></div>'; return; }
    if (!S.utente) return paginaAccesso(par.get('scheda'));
    if (!S.utente.admin && S.utente.stato !== 'approvato') return paginaAttesa();
    try { if (!S.caricati) await caricaTutto(); }
    catch (e) { $app.innerHTML = '<div class="accesso"><div class="accesso-card"><h1>Non riesco a caricare il catalogo</h1><p>' + h(e.message) + '</p><button class="btn" onclick="location.reload()">Riprova</button></div></div>'; return; }
    if (pezzi[0] === 'p') paginaProdotto(pezzi[1]);
    else if (pezzi[0] === 'richiesta') paginaRichiesta();
    else if (pezzi[0] === 'marchi') paginaMarchi();
    else if (pezzi[0] === 'admin' && S.utente.admin) paginaAdmin(pezzi.slice(1));
    else paginaNegozio(par);
  }

  let hashPrima = location.hash;
  window.addEventListener('hashchange', async () => {
    scorrimenti[hashPrima] = window.scrollY;
    hashPrima = location.hash;
    await mostra();
    window.scrollTo(0, scorrimenti[location.hash] || 0);
  });

  async function dopoAccesso() {
    S.utente = await D.utente();
    S.caricati = false;
    if (location.hash.includes('scheda=')) history.replaceState(null, '', location.pathname);
    await mostra();
  }

  // ---------------------------------------------------------------- clic
  document.addEventListener('click', async ev => {
    const el = ev.target.closest('[data-az]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const az = el.dataset.az;
    try {
      if (az === 'esci') { await D.esci(); S.utente = null; S.caricati = false; history.replaceState(null, '', location.pathname); mostra(); }
      else if (az === 'ricomincia') { if (confirm('Cancello tutte le prove e rimetto i prodotti di esempio?')) { await D.ricomincia(); location.reload(); } }
      else if (az === 'prova-admin' || az === 'prova-cliente') { await D.entra(az === 'prova-admin' ? 'admin' : 'cliente'); await dopoAccesso(); }
      else if (az === 'scheda-accesso') paginaAccesso(el.dataset.scheda);
      else if (az === 'ricontrolla') { S.utente = await D.utente(); await mostra(); if (S.utente && S.utente.stato === 'in_attesa') avviso('Non ancora approvato: riprova più tardi.'); }
      else if (az === 'apri-filtri') document.body.classList.add('filtri-aperti');
      else if (az === 'chiudi-filtri') document.body.classList.remove('filtri-aperti');
      // scheda prodotto
      else if (az === 'scegli') { el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === el)); }
      else if (az === 'qta') { const q = document.getElementById('qta'); q.value = Math.max(1, (parseInt(q.value, 10) || 1) + Number(el.dataset.d)); }
      else if (az === 'vai-foto') { const s = document.getElementById('scorri'); s.scrollTo({ left: s.clientWidth * Number(el.dataset.i), behavior: 'smooth' }); }
      else if (az === 'ingrandisci') apriLente(Number(el.dataset.i));
      else if (az === 'chiudi-lente') document.querySelector('.lente') && document.querySelector('.lente').remove();
      else if (az === 'aggiungi') {
        const s = sceltaProdotto(); if (!s) return;
        const r = richiesta();
        const uguale = r.find(x => x.id === s.x.id && x.taglia === s.x.taglia && x.colore === s.x.colore);
        if (uguale) uguale.qta += s.x.qta; else r.push(s.x);
        salvaRichiesta(r);
        const n = contaRichiesta();
        const b = document.querySelector('a[href="#/richiesta"]');
        if (b) { let pl = b.querySelector('.pallino'); if (!pl) { pl = document.createElement('b'); pl.className = 'pallino'; b.appendChild(pl); } pl.textContent = n; }
        avviso('Aggiunto alla richiesta ✓', 'ok');
      }
      else if (az === 'chiedi') {
        const s = sceltaProdotto(); if (!s) return;
        apriWhatsapp('Ciao! Mi interessa questo prodotto del catalogo:\n' + rigaTesto(s.p, s.x) + '\n\n' + (S.utente.nome ? '— ' + S.utente.nome : ''));
      }
      // richiesta
      else if (az === 'rr-qta' || az === 'rr-togli') {
        const r = richiesta().filter(x => S.prodotti.some(p => p.id === x.id)), i = Number(el.dataset.i);
        if (az === 'rr-togli') r.splice(i, 1); else r[i].qta = Math.max(1, r[i].qta + Number(el.dataset.d));
        salvaRichiesta(r); paginaRichiesta();
      }
      else if (az === 'svuota') { if (confirm('Svuoto la richiesta?')) { salvaRichiesta([]); paginaRichiesta(); } }
      else if (az === 'invia-richiesta') {
        const r = richiesta().filter(x => S.prodotti.some(p => p.id === x.id));
        const tot = r.reduce((a, x) => a + (numero(S.prodotti.find(p => p.id === x.id).prezzo) || 0) * x.qta, 0);
        apriWhatsapp('Ciao! Vorrei questi prodotti del catalogo:\n' + r.map(x => rigaTesto(S.prodotti.find(p => p.id === x.id), x)).join('\n') +
          '\n\nTotale indicativo: ' + euro(tot) + '\n' + (S.utente.nome ? '— ' + S.utente.nome : ''));
      }
      // amministrazione
      else if (az === 'elimina-prodotto' || az === 'elimina-bozza') {
        const id = az === 'elimina-bozza' ? bozza.p.id : el.closest('[data-id]').dataset.id;
        const p = S.prodotti.find(x => x.id === id);
        if (!confirm('Elimino per sempre “' + p.nome + '” e le sue foto?')) return;
        if (az === 'elimina-bozza') await lasciaBozza(false);
        await D.eliminaProdotto(p);
        S.prodotti = S.prodotti.filter(x => x.id !== id);
        avviso('Prodotto eliminato.', 'ok');
        if (location.hash === '#/admin') adminProdotti(); else location.hash = '#/admin';
      }
      else if (az === 'annulla-bozza') { ev.preventDefault(); await lasciaBozza(false); location.hash = '#/admin'; }
      else if (az === 'foto-su' || az === 'foto-giu') {
        const f = bozza.p.foto, i = Number(el.dataset.i), j = az === 'foto-su' ? i - 1 : i + 1;
        [f[i], f[j]] = [f[j], f[i]]; ridisegnaFotoBozza();
      }
      else if (az === 'foto-togli') {
        const id = bozza.p.foto.splice(Number(el.dataset.i), 1)[0];
        if (bozza.caricateOra.includes(id)) { bozza.caricateOra = bozza.caricateOra.filter(x => x !== id); D.eliminaFoto([id]); }
        else bozza.daTogliere.push(id);
        ridisegnaFotoBozza();
      }
      else if (az === 'elimina-marchio') {
        const id = el.closest('[data-id]').dataset.id, m = marchio(id);
        const n = S.prodotti.filter(p => p.marchio_id === id).length;
        if (!confirm('Elimino il marchio “' + m.nome + '”?' + (n ? '\n' + n + ' prodotti resteranno senza marchio.' : ''))) return;
        await D.eliminaMarchio(id);
        S.marchi = S.marchi.filter(x => x.id !== id);
        S.prodotti.forEach(p => { if (p.marchio_id === id) p.marchio_id = null; });
        adminMarchi(); avviso('Marchio eliminato.', 'ok');
      }
      else if (az === 'stato-cliente') {
        const id = el.closest('[data-id]').dataset.id;
        await D.statoCliente(id, el.dataset.stato);
        S.clienti.find(c => c.user_id === id).stato = el.dataset.stato;
        adminClienti(); avviso(el.dataset.stato === 'approvato' ? 'Approvato: ora vede il catalogo.' : 'Bloccato.', 'ok');
      }
      else if (az === 'aggiorna-clienti') { S.clienti = await D.clienti(); adminClienti(); }
      else if (az === 'copia-link') {
        const t = document.getElementById('link-catalogo');
        try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); }
        avviso('Link copiato.', 'ok');
      }
    } catch (e) { avviso(e.message, 'errore'); }
  });

  // modifiche veloci (prezzo, interruttori, ordinamento, marchi)
  document.addEventListener('change', async ev => {
    const el = ev.target, az = el.dataset.az;
    if (!az) return;
    try {
      if (az === 'ordina') {
        const f = filtriDa(leggiIndirizzo().par); f.ord = el.value; location.hash = linkFiltri(f);
      }
      else if (az === 'prezzo-veloce' || az === 'campo-veloce') {
        const riga = el.closest('[data-id]'), p = S.prodotti.find(x => x.id === riga.dataset.id);
        const cambio = az === 'prezzo-veloce' ? { prezzo: numero(el.value) } : { [el.dataset.campo]: el.checked };
        const salvato = await D.salvaProdotto(Object.assign({}, p, cambio));
        Object.assign(p, salvato || cambio);
        riga.classList.remove('salvata'); void riga.offsetWidth; riga.classList.add('salvata');
      }
      else if (az === 'rinomina-marchio') {
        const id = el.closest('[data-id]').dataset.id, nome = el.value.trim();
        if (!nome) { el.value = marchio(id).nome; return; }
        const r = await D.salvaMarchio({ id, nome });
        marchio(id).nome = r.nome; S.marchi.sort((a, b) => a.nome.localeCompare(b.nome));
        avviso('Nome aggiornato.', 'ok');
      }
      else if (az === 'scegli-marchio' && el.value === '__nuovo') {
        const nome = (prompt('Nome del nuovo marchio:') || '').trim();
        leggiModulo(el.form);
        if (nome) {
          const r = await D.salvaMarchio({ nome });
          S.marchi.push(r); S.marchi.sort((a, b) => a.nome.localeCompare(b.nome));
          bozza.p.marchio_id = r.id;
        }
        adminProdotto(bozza.idPagina);
      }
      else if (az === 'carica-foto') {
        const files = [...el.files]; el.value = '';
        bozza.inCaricamento += files.length; ridisegnaFotoBozza();
        const b = bozza;
        for (const file of files) {
          try {
            const id = await D.caricaFoto(file);
            b.p.foto.push(id); b.caricateOra.push(id);
          } catch (e) { avviso(e.message, 'errore'); }
          b.inCaricamento--;
          if (bozza === b) ridisegnaFotoBozza();
        }
      }
    } catch (e) {
      avviso(e.message, 'errore');
      if (az === 'prezzo-veloce' || az === 'campo-veloce') { const p = S.prodotti.find(x => x.id === el.closest('[data-id]').dataset.id); if (az === 'prezzo-veloce') el.value = p.prezzo == null ? '' : p.prezzo; else el.checked = !!p[el.dataset.campo]; }
    }
  });
  // Invio dentro il prezzo veloce = salva subito
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target.matches('[data-az="prezzo-veloce"], [data-az="rinomina-marchio"]')) { ev.preventDefault(); ev.target.blur(); }
    if (ev.key === 'Escape') { const l = document.querySelector('.lente'); if (l) l.remove(); document.body.classList.remove('filtri-aperti'); }
  });

  // ---------------------------------------------------------------- moduli
  document.addEventListener('submit', async ev => {
    const form = ev.target, tipo = form.dataset.form;
    if (!tipo) return;
    ev.preventDefault();
    const bottone = form.querySelector('button[type="submit"], button:not([type])');
    const val = n => (form.elements[n] ? form.elements[n].value.trim() : '');
    try {
      if (bottone) bottone.disabled = true;
      if (tipo === 'cerca') { const f = filtriDa(new URLSearchParams()); f.q = val('q'); location.hash = linkFiltri(f); }
      else if (tipo === 'prezzo') { const f = filtriDa(leggiIndirizzo().par); f.min = val('min'); f.max = val('max'); location.hash = linkFiltri(f); }
      else if (tipo === 'entra') { await D.entra(val('email'), form.elements.password.value); await dopoAccesso(); }
      else if (tipo === 'registra') {
        await D.registra({ nome: val('nome'), telefono: val('telefono'), email: val('email'), password: form.elements.password.value });
        await dopoAccesso();
      }
      else if (tipo === 'prodotto') {
        leggiModulo(form);
        if (bozza.inCaricamento) { avviso('Aspetta che le foto finiscano di caricarsi.', 'errore'); return; }
        if (!bozza.p.nome) { avviso('Manca il nome.', 'errore'); return; }
        const salvato = await D.salvaProdotto(bozza.p);
        const i = S.prodotti.findIndex(x => x.id === salvato.id);
        if (i >= 0) S.prodotti[i] = salvato; else S.prodotti.unshift(salvato);
        await lasciaBozza(true);
        avviso('Salvato ✓', 'ok');
        location.hash = '#/admin';
      }
      else if (tipo === 'nuovo-marchio') {
        const r = await D.salvaMarchio({ nome: val('nome') });
        S.marchi.push(r); S.marchi.sort((a, b) => a.nome.localeCompare(b.nome));
        adminMarchi(); avviso('Marchio aggiunto.', 'ok');
      }
      else if (tipo === 'impostazioni') {
        const v = { nome_negozio: val('nome_negozio') || 'Catalogo', sottotitolo: val('sottotitolo'), messaggio_benvenuto: form.elements.messaggio_benvenuto.value.trim(), whatsapp: val('whatsapp') };
        await D.salvaImpostazioni(v);
        Object.assign(S.imp, v); document.title = nomeNegozio();
        adminImpostazioni(); avviso('Impostazioni salvate ✓', 'ok');
      }
    } catch (e) { avviso(e.message, 'errore'); }
    finally { if (bottone && document.contains(bottone)) bottone.disabled = false; }
  });

  // ---------------------------------------------------------------- foto a tutto schermo
  function apriLente(i) {
    const art = document.querySelector('.prodotto'); if (!art) return;
    const p = S.prodotti.find(x => x.id === art.dataset.id), foto = p.foto || [];
    if (!foto.length) return;
    let k = i;
    const lente = document.createElement('div');
    lente.className = 'lente';
    const draw = () => {
      lente.innerHTML = '<button class="lente-chiudi" data-az="chiudi-lente" aria-label="Chiudi">' + icona('chiudi') + '</button>' +
        (foto.length > 1 ? '<button class="lente-freccia sx" aria-label="Precedente">' + icona('indietro') + '</button><button class="lente-freccia dx" aria-label="Successiva">' + icona('avanti') + '</button>' : '') +
        fotoTag(foto[k], 'g', p.nome) + (foto.length > 1 ? '<div class="lente-conta">' + (k + 1) + ' / ' + foto.length + '</div>' : '');
      riempiFoto(lente);
    };
    lente.addEventListener('click', e => {
      if (e.target.closest('.sx')) { k = (k - 1 + foto.length) % foto.length; draw(); }
      else if (e.target.closest('.dx')) { k = (k + 1) % foto.length; draw(); }
      else if (e.target === lente) lente.remove();
    });
    document.body.appendChild(lente); draw();
  }

  // ---------------------------------------------------------------- partenza
  (async function avvio() {
    try { S.imp = (await D.impostazioni()) || {}; } catch (e) { S.imp = {}; }
    document.title = nomeNegozio();
    try { S.utente = await D.utente(); } catch (e) { S.utente = null; }
    await mostra();
  })();
})();
