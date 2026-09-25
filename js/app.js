/* La vetrina: chi ha il link (?v=codice) guarda; la titolare entra e gestisce. */
(function () {
  const C = window.CONFIG;
  const D = window.DATI;
  const $app = document.getElementById('app');
  const S = { modo: null, utente: null, imp: {}, marchi: [], prodotti: [], codice: '' };
  const scorrimenti = {};
  const A_BLOCCHI = 48; // quante schede disegnare alla volta

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
  const nomeNegozio = () => S.imp.nome_negozio || 'Vetrina';
  const admin = () => S.modo === 'admin';
  const linkVetrina = codice => location.origin + location.pathname + '?v=' + encodeURIComponent(codice || S.imp.codice_vetrina || '');

  let timerAvviso;
  function avviso(testo, tipo) {
    const el = document.getElementById('avviso');
    el.textContent = testo;
    el.className = 'avviso ' + (tipo || '');
    el.hidden = false;
    clearTimeout(timerAvviso);
    timerAvviso = setTimeout(() => { el.hidden = true; }, tipo === 'errore' ? 6000 : 2600);
  }
  const fotoTag = (id, grande, alt) => {
    const u = id ? D.urlFoto(id, !grande) : '';
    return u ? '<img src="' + h(u) + '" alt="' + h(alt || '') + '" loading="lazy" decoding="async">' : '<div class="senza-foto">' + icona('foto') + '</div>';
  };

  // ---------------------------------------------------------------- richiesta (per ogni visitatore)
  const RICH = 'vetrina-richiesta';
  function richiesta() { try { return (JSON.parse(localStorage.getItem(RICH)) || []).filter(x => S.prodotti.some(p => p.id === x.id)); } catch (e) { return []; } }
  function salvaRichiesta(r) { try { localStorage.setItem(RICH, JSON.stringify(r)); } catch (e) { /* niente */ } }
  const contaRichiesta = () => richiesta().reduce((a, x) => a + x.qta, 0);

  function numeroWhatsapp() {
    let n = String(S.imp.whatsapp || '').replace(/\D/g, '');
    if (n.startsWith('00')) n = n.slice(2);
    if (n.length === 10 && n.startsWith('3')) n = '39' + n;
    return n;
  }
  function apriWhatsapp(testo) {
    const n = numeroWhatsapp();
    if (!n) return avviso('Il numero WhatsApp della vetrina non è ancora impostato.', 'errore');
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
  const nessunFiltro = () => filtriDa(new URLSearchParams());
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
  // in vetrina l'amministratrice vede solo cio' che vedono i clienti
  const inVetrina = () => admin() ? S.prodotti.filter(p => p.visibile !== false) : S.prodotti;

  function filtra(f, salta) {
    const q = semplice(f.q).split(/\s+/).filter(Boolean);
    const min = numero(f.min), max = numero(f.max);
    return inVetrina().filter(p => {
      if (salta !== 'cat' && f.cat && p.categoria !== f.cat) return false;
      if (salta !== 'gen' && f.gen && p.genere !== f.gen) return false;
      if (salta !== 'm' && f.m.length && !f.m.includes(p.marchio_id || '_')) return false;
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
    f = f || nessunFiltro();
    const n = contaRichiesta();
    const daDescr = admin() ? S.prodotti.filter(p => p.da_descrivere).length : 0;
    return '<header class="testata"><div class="contenitore testata-riga">' +
      '<a class="logo" href="#/" title="' + h(nomeNegozio()) + '">' + h(nomeNegozio()) + '</a>' +
      '<form class="cerca" data-form="cerca" role="search"><input name="q" type="search" placeholder="Cerca prodotti, marchi…" value="' + h(f.q) + '" aria-label="Cerca"><button aria-label="Cerca">' + icona('cerca') + '</button></form>' +
      '<nav class="azioni">' +
        '<a class="icona-btn" href="#/marchi">' + icona('marchio') + '<span>Marchi</span></a>' +
        '<a class="icona-btn" href="#/richiesta">' + icona('sacca') + '<span>Scelti</span>' + (n ? '<b class="pallino">' + n + '</b>' : '') + '</a>' +
        (admin() ? '<a class="icona-btn evidenziato" href="#/admin/carica">' + icona('foto') + '<span>Carica</span></a>' +
          '<a class="icona-btn" href="#/admin">' + icona('ingranaggio') + '<span>Gestisci</span>' + (daDescr ? '<b class="pallino grigio">' + daDescr + '</b>' : '') + '</a>' : '') +
      '</nav></div>' +
      '<div class="contenitore"><nav class="categorie">' +
        '<a class="cat' + (!f.cat ? ' attiva' : '') + '" href="' + linkFiltri(f, { cat: '', m: [] }) + '"><span class="cat-ico">' + icona('tutti') + '</span>Tutto</a>' +
        C.categorie.map(c => '<a class="cat' + (f.cat === c.id ? ' attiva' : '') + '" href="' + linkFiltri(f, { cat: c.id }) + '"><span class="cat-ico">' + icona(c.icona) + '</span>' + h(c.nome) + '</a>').join('') +
      '</nav></div></header>' +
      (D.demo ? '<div class="nastro-prova">Modalità prova: i dati restano solo su questo computer. <button data-az="ricomincia">Ricomincia da capo</button></div>' : '');
  }
  function disegna(html, f) {
    $app.innerHTML = testata(f) + '<main class="contenitore">' + html + '</main>';
  }

  function scheda(p) {
    const mm = marchio(p.marchio_id), sc = sconto(p);
    return '<a class="card' + (p.disponibile ? '' : ' esaurito') + '" href="#/p/' + h(p.id) + '">' +
      '<div class="card-foto">' + fotoTag(p.foto && p.foto[0], false, p.nome) +
        (sc ? '<span class="badge-sconto">-' + sc + '%</span>' : '') +
        (p.disponibile ? '' : '<span class="badge-esaurito">Esaurito</span>') +
        (p.foto && p.foto.length > 1 ? '<span class="badge-foto">' + p.foto.length + '</span>' : '') + '</div>' +
      '<div class="card-testo">' +
        '<div class="card-nome">' + h(p.nome) + '</div>' +
        '<div class="card-prezzo">' + (numero(p.prezzo) != null ? '<b' + (sc ? ' class="saldo"' : '') + '>' + euro(p.prezzo) + '</b>' : '<span class="su-richiesta">Prezzo su richiesta</span>') +
          (sc ? '<s>' + euro(p.prezzo_pieno) + '</s>' : '') + '</div>' +
      '</div></a>';
  }

  // griglia che si allunga scorrendo (la vetrina puo' essere immensa)
  let osservatore = null;
  function grigliaInfinita(lista) {
    if (osservatore) { osservatore.disconnect(); osservatore = null; }
    const griglia = document.getElementById('griglia'), fondo = document.getElementById('fondo');
    if (!griglia) return;
    let fatti = 0;
    const altri = () => {
      griglia.insertAdjacentHTML('beforeend', lista.slice(fatti, fatti + A_BLOCCHI).map(scheda).join(''));
      fatti += A_BLOCCHI;
      if (fatti >= lista.length && osservatore) { osservatore.disconnect(); fondo.hidden = true; }
    };
    altri();
    if (fatti < lista.length && 'IntersectionObserver' in window) {
      osservatore = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) altri(); }, { rootMargin: '900px' });
      osservatore.observe(fondo);
    } else if (fatti < lista.length) { while (fatti < lista.length) altri(); }
    else fondo.hidden = true;
  }

  // ---------------------------------------------------------------- VETRINA
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
      (S.marchi.length ? '<div class="filtro-gruppo"><h4>Marchio</h4>' +
        S.marchi.map(m => {
          const n = conta('m', m.id), sel = f.m.includes(m.id);
          if (!n && !sel) return '';
          const nuovi = sel ? f.m.filter(x => x !== m.id) : f.m.concat(m.id);
          return '<a class="filtro-voce spunta' + (sel ? ' sel' : '') + '" href="' + linkFiltri(f, { m: nuovi }) + '"><span class="casella">' + (sel ? icona('spunta') : '') + '</span>' + h(m.nome) + '<i>' + n + '</i></a>';
        }).join('') + '</div>' : '') +
      '<form class="filtro-gruppo" data-form="prezzo"><h4>Prezzo (€)</h4><div class="prezzo-da-a">' +
        '<input name="min" type="number" min="0" step="1" placeholder="da" value="' + h(f.min) + '"><span>–</span>' +
        '<input name="max" type="number" min="0" step="1" placeholder="a" value="' + h(f.max) + '"><button class="btn piccolo">OK</button></div></form>' +
      '<div class="filtro-gruppo"><a class="filtro-voce spunta' + (f.disp ? ' sel' : '') + '" href="' + linkFiltri(f, { disp: !f.disp }) + '"><span class="casella">' + (f.disp ? icona('spunta') : '') + '</span>Solo disponibili</a></div>' +
      (!vuoti ? '<a class="btn contorno largo" href="#/">Togli tutti i filtri</a>' : '') +
      '</aside><div class="velo" data-az="chiudi-filtri"></div>';

    let testa = '';
    if (vuoti) {
      const evid = ordina(inVetrina().filter(p => p.in_evidenza && p.disponibile));
      const marchiUsati = S.marchi.filter(m => inVetrina().some(p => p.marchio_id === m.id));
      testa =
        '<section class="vetrina"><div><h1>' + h(nomeNegozio()) + '</h1>' +
          (S.imp.sottotitolo ? '<p class="vetrina-sotto">' + h(S.imp.sottotitolo) + '</p>' : '') +
          (S.imp.messaggio_benvenuto ? '<p>' + h(S.imp.messaggio_benvenuto) + '</p>' : '') + '</div>' +
          '<div class="vetrina-generi">' + C.generi.filter(g => inVetrina().some(p => p.genere === g.id)).map(g => '<a href="' + linkFiltri(f, { gen: g.id }) + '">' + h(g.nome) + '</a>').join('') + '</div></section>' +
        (evid.length ? '<section class="blocco"><div class="blocco-testa"><h2>' + icona('stella') + ' In evidenza</h2></div><div class="fila">' + evid.map(scheda).join('') + '</div></section>' : '');
    }
    // espositore: prima la categoria, poi il marchio (se non si cerca e non si e' scelto un marchio)
    const perReparti = !f.q && !f.m.length;

    const titolo = f.q ? 'Risultati per “' + h(f.q) + '”'
      : f.cat ? h(cat(f.cat).nome) + (f.gen ? ' · ' + h(gen(f.gen).nome) : '')
      : f.m.length === 1 ? (f.cat ? h(cat(f.cat).nome) + ' · ' : '') + (marchio(f.m[0]) ? h(marchio(f.m[0]).nome) : 'Altri')
      : f.gen ? h(gen(f.gen).nome) : 'La vetrina';
    const schede = C.generi.filter(g => filtra(f, 'gen').some(p => p.genere === g.id));
    const ords = [['', 'Consigliati'], ['nuovi', 'Novità'], ['prezzo-su', 'Prezzo: dal più basso'], ['prezzo-giu', 'Prezzo: dal più alto'], ['sconto', 'Sconto maggiore']];

    disegna(
      '<div class="negozio">' + pannello + '<section class="risultati">' + testa +
        '<div class="risultati-testa"><h2>' + titolo + ' <small>' + lista.length + (lista.length === 1 ? ' prodotto' : ' prodotti') + '</small></h2>' +
          '<div class="risultati-comandi"><button class="btn contorno piccolo solo-telefono" data-az="apri-filtri">' + icona('filtro') + ' Filtri</button>' +
          '<select data-az="ordina" aria-label="Ordina">' + ords.map(o => '<option value="' + o[0] + '"' + (f.ord === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div></div>' +
        (schede.length > 1 || f.gen ? '<div class="schede-genere"><a class="' + (!f.gen ? 'sel' : '') + '" href="' + linkFiltri(f, { gen: '' }) + '">Tutti</a>' +
          schede.map(g => '<a class="' + (f.gen === g.id ? 'sel' : '') + '" href="' + linkFiltri(f, { gen: g.id }) + '">' + h(g.nome) + '</a>').join('') + '</div>' : '') +
        (lista.length && perReparti ? espositore(lista, f)
          : lista.length ? '<div class="griglia" id="griglia"></div><div id="fondo" class="fondo"><span class="rotella"></span></div>'
          : '<div class="vuoto">' + icona('cerca') + '<p>' + (S.prodotti.length ? 'Nessun prodotto trovato.' : 'La vetrina è ancora vuota.') + '</p>' +
            (!vuoti ? '<a class="btn" href="#/">Mostra tutto</a>' : admin() ? '<a class="btn" href="#/admin/carica">' + icona('foto') + ' Carica le prime foto</a>' : '') + '</div>') +
      '</section></div>', f);
    if (!perReparti) grigliaInfinita(lista);
  }

  const PER_FILA = 12;
  function gruppiMarchio(lista) {
    const g = new Map();
    lista.forEach(p => { const k = p.marchio_id && marchio(p.marchio_id) ? p.marchio_id : '_'; if (!g.has(k)) g.set(k, []); g.get(k).push(p); });
    return [...g.entries()].map(([k, prodotti]) => ({ id: k, nome: k === '_' ? 'Altri' : marchio(k).nome, prodotti }))
      .sort((a, b) => (a.id === '_') - (b.id === '_') || a.nome.localeCompare(b.nome));
  }
  function espositore(lista, f) {
    const reparti = f.cat ? [cat(f.cat)] : C.categorie;
    return reparti.map(c => {
      const inCat = lista.filter(p => p.categoria === c.id);
      if (!inCat.length) return '';
      const gruppi = gruppiMarchio(inCat);
      const soloAltri = gruppi.length === 1 && gruppi[0].id === '_';
      return '<section class="reparto">' +
        (f.cat ? '' : '<div class="reparto-testa"><a href="' + linkFiltri(f, { cat: c.id }) + '"><h2>' + icona(c.icona) + h(c.nome) + '</h2></a>' +
          '<a class="vedi" href="' + linkFiltri(f, { cat: c.id }) + '">Vedi tutto <b>' + inCat.length + '</b> ›</a></div>') +
        gruppi.map(g => {
          const link = linkFiltri(f, { cat: c.id, m: [g.id] });
          const testa = soloAltri ? '' : '<div class="gruppo-testa"><a href="' + link + '"><h3>' + h(g.nome) + '</h3></a>' +
            (f.cat || g.prodotti.length <= PER_FILA ? '<small>' + g.prodotti.length + '</small>' : '<a class="vedi" href="' + link + '">Vedi tutti <b>' + g.prodotti.length + '</b> ›</a>') + '</div>';
          return '<div class="gruppo">' + testa + (f.cat
            ? '<div class="griglia">' + g.prodotti.map(scheda).join('') + '</div>'
            : '<div class="fila">' + g.prodotti.slice(0, PER_FILA).map(scheda).join('') +
              (g.prodotti.length > PER_FILA ? '<a class="card altri" href="' + link + '"><span>+' + (g.prodotti.length - PER_FILA) + '</span>Vedi tutti</a>' : '') + '</div>') + '</div>';
        }).join('') + '</section>';
    }).join('');
  }

  // ---------------------------------------------------------------- MARCHI
  function paginaMarchi() {
    const righe = S.marchi.map(m => ({ m, n: inVetrina().filter(p => p.marchio_id === m.id).length })).filter(x => x.n);
    disegna('<div class="pagina"><h1>Marchi</h1>' +
      (righe.length ? '<div class="griglia-marchi">' + righe.map(x => {
        const p = inVetrina().find(p => p.marchio_id === x.m.id && p.foto && p.foto.length);
        return '<a class="tessera-marchio" href="' + linkFiltri(nessunFiltro(), { m: [x.m.id] }) + '">' +
          '<div class="tessera-foto">' + fotoTag(p && p.foto[0], false, x.m.nome) + '</div><b>' + h(x.m.nome) + '</b><span>' + x.n + (x.n === 1 ? ' prodotto' : ' prodotti') + '</span></a>';
      }).join('') + '</div>' : '<div class="vuoto"><p>Nessun marchio ancora.</p></div>') + '</div>');
  }

  // ---------------------------------------------------------------- SCHEDA PRODOTTO
  function paginaProdotto(id) {
    const p = S.prodotti.find(x => x.id === id);
    if (!p) return disegna('<div class="vuoto"><p>Prodotto non trovato.</p><a class="btn" href="#/">Torna alla vetrina</a></div>');
    const mm = marchio(p.marchio_id), sc = sconto(p), foto = p.foto || [];
    const taglie = elenco(p.taglie), colori = elenco(p.colori);
    const dettagli = String(p.dettagli || '').split('\n').map(x => x.trim()).filter(Boolean);
    const simili = ordina(inVetrina().filter(x => x.id !== p.id && ((mm && x.marchio_id === p.marchio_id) || x.categoria === p.categoria))).slice(0, 12);
    const f0 = nessunFiltro();
    const scelta = (nome, voci) => voci.length ? '<div class="opzioni"><h4>' + nome + '</h4><div class="chips" data-gruppo="' + nome.toLowerCase() + '">' +
      voci.map(v => '<button type="button" class="chip' + (voci.length === 1 ? ' sel' : '') + '" data-az="scegli" data-valore="' + h(v) + '">' + h(v) + '</button>').join('') + '</div></div>' : '';

    disegna(
      '<nav class="briciole"><a href="#/">Vetrina</a> › <a href="' + linkFiltri(f0, { cat: p.categoria }) + '">' + h(cat(p.categoria).nome) + '</a>' +
        (mm ? ' › <a href="' + linkFiltri(f0, { m: [mm.id] }) + '">' + h(mm.nome) + '</a>' : '') + '</nav>' +
      '<article class="prodotto" data-id="' + h(p.id) + '">' +
        '<div class="galleria">' +
          '<div class="galleria-scorri" id="scorri">' + (foto.length ? foto.map((x, i) => '<div class="galleria-foto" data-az="ingrandisci" data-i="' + i + '">' + fotoTag(x, true, p.nome) + '</div>').join('') : '<div class="galleria-foto">' + fotoTag(null) + '</div>') + '</div>' +
          (sc ? '<span class="badge-sconto grande">-' + sc + '%</span>' : '') +
          (foto.length > 1 ? '<div class="puntini">' + foto.map((x, i) => '<i class="' + (i === 0 ? 'sel' : '') + '"></i>').join('') + '</div>' +
            '<div class="miniature">' + foto.map((x, i) => '<button class="mini' + (i === 0 ? ' sel' : '') + '" data-az="vai-foto" data-i="' + i + '">' + fotoTag(x, false, '') + '</button>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="info">' +
          (mm ? '<a class="info-marchio" href="' + linkFiltri(f0, { m: [mm.id] }) + '">' + h(mm.nome) + '</a>' : '') +
          '<h1>' + h(p.nome) + '</h1>' +
          '<div class="riquadro-prezzo">' + (numero(p.prezzo) != null ? '<b' + (sc ? ' class="saldo"' : '') + '>' + euro(p.prezzo) + '</b>' : '<b class="su-richiesta">Prezzo su richiesta</b>') +
            (sc ? '<s>' + euro(p.prezzo_pieno) + '</s><span class="risparmio">-' + sc + '%</span>' : '') + '</div>' +
          '<div class="etichette"><span>' + h(cat(p.categoria).nome) + '</span><span>' + h(gen(p.genere).nome) + '</span>' + (p.codice ? '<span>Cod. ' + h(p.codice) + '</span>' : '') + '</div>' +
          (p.disponibile ? '' : '<div class="nota-esaurito">Al momento esaurito: puoi comunque chiedere quando torna.</div>') +
          scelta('Taglia', taglie) + scelta('Colore', colori) +
          '<div class="opzioni"><h4>Quantità</h4><div class="quantita"><button type="button" data-az="qta" data-d="-1">−</button><input id="qta" type="number" min="1" value="1" aria-label="Quantità"><button type="button" data-az="qta" data-d="1">+</button></div></div>' +
          '<div class="bottoni-acquisto">' +
            '<button class="btn grande nero" data-az="aggiungi">' + icona('sacca') + ' Aggiungi ai scelti</button>' +
            '<button class="btn grande verde" data-az="chiedi">' + icona('whatsapp') + ' Chiedi su WhatsApp</button></div>' +
          (admin() ? '<a class="btn contorno largo" href="#/admin/prodotto/' + h(p.id) + '">' + icona('matita') + ' Modifica questo prodotto</a>' : '') +
          (p.descrizione ? '<section class="descrizione"><h3>Descrizione</h3>' + h(p.descrizione).split(/\n{2,}/).map(x => '<p>' + x.replace(/\n/g, '<br>') + '</p>').join('') + '</section>' : '') +
          (dettagli.length ? '<section class="descrizione"><h3>Dettagli</h3><ul>' + dettagli.map(d => '<li>' + h(d) + '</li>').join('') + '</ul></section>' : '') +
        '</div></article>' +
      (simili.length ? '<section class="blocco"><div class="blocco-testa"><h2>Potrebbe piacerti anche</h2></div><div class="fila">' + simili.map(scheda).join('') + '</div></section>' : '')
    );

    const sc2 = document.getElementById('scorri');
    if (sc2) sc2.addEventListener('scroll', () => {
      const i = Math.round(sc2.scrollLeft / sc2.clientWidth);
      document.querySelectorAll('.mini').forEach((b, j) => b.classList.toggle('sel', i === j));
      document.querySelectorAll('.puntini i').forEach((b, j) => b.classList.toggle('sel', i === j));
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
      ' – ' + x.qta + ' pz' + (numero(p.prezzo) != null ? ' – ' + euro(p.prezzo * x.qta) : '') +
      '\n  ' + location.origin + location.pathname + (S.codice ? '?v=' + S.codice : '') + '#/p/' + p.id;
  }

  // ---------------------------------------------------------------- SCELTI (richiesta)
  function paginaRichiesta() {
    const r = richiesta();
    const tot = r.reduce((a, x) => { const p = S.prodotti.find(p => p.id === x.id); return a + (numero(p.prezzo) || 0) * x.qta; }, 0);
    disegna('<div class="pagina stretta"><h1>I tuoi scelti</h1>' +
      (r.length ? '<div class="lista-richiesta">' + r.map((x, i) => {
        const p = S.prodotti.find(p => p.id === x.id), mm = marchio(p.marchio_id);
        return '<div class="riga-richiesta"><a href="#/p/' + h(p.id) + '" class="rr-foto">' + fotoTag(p.foto && p.foto[0], false, p.nome) + '</a>' +
          '<div class="rr-testo"><a href="#/p/' + h(p.id) + '"><b>' + h(p.nome) + '</b></a><small>' + [mm && h(mm.nome), x.taglia && 'Taglia ' + h(x.taglia), x.colore && h(x.colore)].filter(Boolean).join(' · ') + '</small>' +
          '<div class="rr-prezzo">' + (numero(p.prezzo) != null ? euro(p.prezzo) : 'Prezzo su richiesta') + '</div></div>' +
          '<div class="quantita piccola"><button data-az="rr-qta" data-i="' + i + '" data-d="-1">−</button><span>' + x.qta + '</span><button data-az="rr-qta" data-i="' + i + '" data-d="1">+</button></div>' +
          '<button class="icona-btn" data-az="rr-togli" data-i="' + i + '" aria-label="Togli">' + icona('cestino') + '</button></div>';
      }).join('') + '</div>' +
      '<div class="totale"><span>Totale indicativo</span><b>' + euro(tot) + '</b></div>' +
      '<p class="nota">Disponibilità, spedizione e pagamento si concordano su WhatsApp.</p>' +
      '<button class="btn grande verde largo" data-az="invia-richiesta">' + icona('whatsapp') + ' Invia la scelta su WhatsApp</button>' +
      '<button class="btn contorno largo" data-az="svuota">Svuota</button>'
      : '<div class="vuoto">' + icona('sacca') + '<p>Non hai ancora scelto niente.</p><a class="btn" href="#/">Guarda la vetrina</a></div>') +
      '</div>');
  }

  // ---------------------------------------------------------------- AMMINISTRAZIONE
  function adminGuscio(voce, html) {
    const daDescr = S.prodotti.filter(p => p.da_descrivere).length;
    const voci = [['', 'Prodotti', 'tutti'], ['carica', 'Carica foto', 'foto'], ['marchi', 'Marchi', 'marchio'], ['impostazioni', 'Link e impostazioni', 'ingranaggio']];
    disegna('<div class="admin"><nav class="admin-menu">' +
      voci.map(v => '<a class="' + (voce === v[0] ? 'sel' : '') + '" href="#/admin' + (v[0] ? '/' + v[0] : '') + '">' + icona(v[2]) + v[1] +
        (v[0] === '' && daDescr ? '<b class="pallino grigio in-linea" title="da descrivere">' + daDescr + '</b>' : '') + '</a>').join('') +
      '<button class="admin-esci" data-az="esci">' + icona('esci') + 'Esci</button>' +
      '</nav><section class="admin-corpo">' + html + '</section></div>');
  }

  function adminProdotti(par) {
    const vista = par.get('vista') || '';
    const lista = ordina(S.prodotti, 'nuovi').filter(p => vista === 'descrivere' ? p.da_descrivere : vista === 'nascosti' ? p.visibile === false : true);
    const nDescr = S.prodotti.filter(p => p.da_descrivere).length, nNasc = S.prodotti.filter(p => p.visibile === false).length;
    adminGuscio('', '<div class="admin-testa"><h1>Prodotti <small>' + S.prodotti.length + '</small></h1><a class="btn" href="#/admin/carica">' + icona('foto') + ' Carica foto</a></div>' +
      '<div class="schede-genere piccole"><a class="' + (!vista ? 'sel' : '') + '" href="#/admin">Tutti</a>' +
        '<a class="' + (vista === 'descrivere' ? 'sel' : '') + '" href="#/admin?vista=descrivere">Da descrivere <i>' + nDescr + '</i></a>' +
        '<a class="' + (vista === 'nascosti' ? 'sel' : '') + '" href="#/admin?vista=nascosti">Nascosti <i>' + nNasc + '</i></a></div>' +
      '<div class="admin-barra"><input type="search" id="admin-cerca" placeholder="Cerca per nome, marchio, codice…">' +
      '<select id="admin-cat"><option value="">Tutte le categorie</option>' + C.categorie.map(c => '<option value="' + c.id + '">' + h(c.nome) + '</option>').join('') + '</select>' +
      '<a class="btn contorno" href="#/admin/prodotto/nuovo">' + icona('piu') + ' Scheda vuota</a></div>' +
      '<p class="nota">Il prezzo si cambia direttamente qui: scrivi e premi Invio. “Da descrivere” vuol dire che nome e descrizione li scrive l\'aiutante.</p>' +
      (lista.length ? '<div class="admin-lista">' + lista.map(p => {
        const mm = marchio(p.marchio_id);
        const testo = semplice([p.nome, mm && mm.nome, p.codice].join(' '));
        return '<div class="admin-riga" data-id="' + h(p.id) + '" data-testo="' + h(testo) + '" data-cat="' + h(p.categoria) + '">' +
          '<a class="ar-foto" href="#/admin/prodotto/' + h(p.id) + '">' + fotoTag(p.foto && p.foto[0], false, '') + '</a>' +
          '<div class="ar-testo"><a href="#/admin/prodotto/' + h(p.id) + '"><b>' + h(p.nome) + '</b></a>' +
            (p.da_descrivere ? '<span class="etichetta-descr">da descrivere</span>' : '') + (p.visibile === false ? '<span class="etichetta-descr nascosto">nascosto</span>' : '') +
            '<small>' + [mm ? h(mm.nome) : '', h(cat(p.categoria).nome), h(gen(p.genere).nome), p.foto && p.foto.length + ' foto'].filter(Boolean).join(' · ') + '</small></div>' +
          '<label class="ar-prezzo">€ <input type="number" step="0.01" min="0" inputmode="decimal" value="' + (numero(p.prezzo) != null ? p.prezzo : '') + '" data-az="prezzo-veloce" placeholder="—"></label>' +
          '<div class="ar-interruttori">' +
            '<label class="interruttore"><input type="checkbox" data-az="campo-veloce" data-campo="disponibile"' + (p.disponibile ? ' checked' : '') + '><span></span>Disponibile</label>' +
            '<label class="interruttore"><input type="checkbox" data-az="campo-veloce" data-campo="in_evidenza"' + (p.in_evidenza ? ' checked' : '') + '><span></span>In evidenza</label></div>' +
          '<div class="ar-azioni"><a class="icona-btn" href="#/p/' + h(p.id) + '" title="Vedi in vetrina">' + icona('cerca') + '</a>' +
            '<a class="icona-btn" href="#/admin/prodotto/' + h(p.id) + '" title="Modifica">' + icona('matita') + '</a>' +
            '<button class="icona-btn pericolo" data-az="elimina-prodotto" title="Elimina">' + icona('cestino') + '</button></div></div>';
      }).join('') + '</div>' : '<div class="vuoto"><p>' + (vista ? 'Nessuno.' : 'La vetrina è vuota: comincia da “Carica foto”.') + '</p></div>'));

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

  // ---------- carica foto (pensata per il telefono) ----------
  const carico = { cat: '', gen: 'donna', stesso: false, prezzo: '', lavori: [], attivo: false };
  function adminCarica() {
    const pronti = carico.lavori.filter(l => l.stato === 'fatto').length, errori = carico.lavori.filter(l => l.stato === 'errore').length;
    adminGuscio('carica', '<div class="admin-testa"><h1>Carica foto</h1></div>' +
      '<div class="carica">' +
        '<section class="carica-passo"><h3><span>1</span> Che cosa sono?</h3><div class="scelta-categorie">' +
          C.categorie.map(c => '<button type="button" class="scelta-cat' + (carico.cat === c.id ? ' sel' : '') + '" data-az="carica-cat" data-id="' + c.id + '">' + icona(c.icona) + '<span>' + h(c.nome) + '</span></button>').join('') +
        '</div></section>' +
        '<section class="carica-passo"><h3><span>2</span> Per chi?</h3><div class="chips">' +
          C.generi.map(g => '<button type="button" class="chip grande' + (carico.gen === g.id ? ' sel' : '') + '" data-az="carica-gen" data-id="' + g.id + '">' + h(g.nome) + '</button>').join('') +
        '</div></section>' +
        '<section class="carica-passo"><h3><span>3</span> Le foto</h3>' +
          '<label class="interruttore"><input type="checkbox" data-az="carica-stesso"' + (carico.stesso ? ' checked' : '') + '><span></span>Sono tutte lo <b>stesso</b> prodotto (più angolazioni)</label>' +
          '<p class="nota">' + (carico.stesso ? 'Tutte le foto che scegli diventano <b>un solo prodotto</b>.' : 'Ogni foto diventa <b>un prodotto</b>. Puoi sceglierne tante insieme.') + '</p>' +
          '<label class="campo stretto">Prezzo per tutte (facoltativo)<input type="number" inputmode="decimal" step="0.01" min="0" data-az="carica-prezzo" value="' + h(carico.prezzo) + '" placeholder="lo metti dopo"></label>' +
          '<label class="btn grande largo scegli-foto' + (!carico.cat || carico.attivo ? ' spento' : '') + '">' + icona('foto') + (carico.attivo ? ' Sto caricando…' : ' Scegli le foto') +
            '<input type="file" accept="image/*" multiple data-az="carica-file" hidden' + (!carico.cat || carico.attivo ? ' disabled' : '') + '></label>' +
          (!carico.cat ? '<p class="nota centro">Prima scegli che cosa sono (passo 1).</p>' : '') +
        '</section>' +
        (carico.lavori.length ? '<section class="carica-passo"><h3>Caricate: ' + pronti + ' di ' + carico.lavori.length + (errori ? ' · <span class="rosso">' + errori + ' non riuscite</span>' : '') + '</h3>' +
          '<div class="carica-griglia">' + carico.lavori.map(l => '<div class="cg ' + l.stato + '">' + (l.anteprima ? '<img src="' + l.anteprima + '" alt="">' : '') +
            '<span>' + (l.stato === 'fatto' ? icona('spunta') : l.stato === 'errore' ? '!' : '<i class="rotella"></i>') + '</span></div>').join('') + '</div>' +
          (!carico.attivo && pronti ? '<div class="box-ok">Fatto! Le trovi in vetrina. Titolo, marchio e descrizione li aggiunge l\'aiutante: finché non ci sono, si vedono col nome della categoria.</div>' +
            '<div class="modulo-piede"><button class="btn contorno" data-az="carica-pulisci">Carica altre</button><a class="btn" href="#/">Vai alla vetrina</a></div>' : '') +
        '</section>' : '') +
      '</div>');
  }
  async function caricaFile(files) {
    if (!files.length) return;
    carico.attivo = true;
    const prezzo = numero(carico.prezzo), cat0 = carico.cat, gen0 = carico.gen, stesso = carico.stesso;
    const lavori = files.map(f => ({ file: f, stato: 'attesa', anteprima: URL.createObjectURL(f) }));
    carico.lavori = carico.lavori.concat(lavori);
    const ridisegna = () => { if (leggiIndirizzo().pezzi[1] === 'carica') adminCarica(); };
    ridisegna();
    const idsInsieme = [];
    const nuovo = foto => ({ nome: cat(cat0).uno || 'Nuovo arrivo', marchio_id: null, categoria: cat0, genere: gen0, prezzo, prezzo_pieno: null, descrizione: '', dettagli: '', taglie: '', colori: '', foto, disponibile: true, in_evidenza: false, visibile: true, da_descrivere: true, codice: '', ordine: 0 });
    for (const l of lavori) {
      try {
        const id = await D.caricaFoto(l.file);
        if (stesso) idsInsieme.push(id);
        else S.prodotti.unshift(await D.salvaProdotto(nuovo([id])));
        l.stato = 'fatto';
      } catch (e) { l.stato = 'errore'; avviso(e.message, 'errore'); }
      ridisegna();
    }
    if (stesso && idsInsieme.length) {
      try { S.prodotti.unshift(await D.salvaProdotto(nuovo(idsInsieme))); }
      catch (e) { avviso(e.message, 'errore'); D.eliminaFoto(idsInsieme); lavori.forEach(l => { l.stato = 'errore'; }); }
    }
    carico.attivo = false;
    ridisegna();
  }

  // ---------- scheda completa di un prodotto ----------
  let bozza = null;
  function adminProdotto(id) {
    if (!bozza || bozza.idPagina !== id) {
      const base = id === 'nuovo'
        ? { nome: '', marchio_id: null, categoria: C.categorie[0].id, genere: C.generi[0].id, prezzo: null, prezzo_pieno: null, descrizione: '', dettagli: '', taglie: '', colori: '', foto: [], disponibile: true, in_evidenza: false, visibile: true, da_descrivere: false, codice: '', ordine: 0 }
        : S.prodotti.find(p => p.id === id);
      if (!base) return adminGuscio('', '<div class="vuoto"><p>Prodotto non trovato.</p><a class="btn" href="#/admin">Torna ai prodotti</a></div>');
      bozza = { idPagina: id, p: JSON.parse(JSON.stringify(base)), caricateOra: [], daTogliere: [], inCaricamento: 0 };
    }
    const p = bozza.p;
    const opz = (lista, val) => lista.map(x => '<option value="' + h(x.id) + '"' + (x.id === val ? ' selected' : '') + '>' + h(x.nome) + '</option>').join('');
    adminGuscio('', '<div class="admin-testa"><h1>' + (id === 'nuovo' ? 'Scheda nuova' : 'Modifica prodotto') + '</h1><a class="btn contorno" href="#/admin" data-az="annulla-bozza">Annulla</a></div>' +
      '<form class="modulo" data-form="prodotto" autocomplete="off">' +
        '<fieldset><legend>Foto</legend><p class="nota">La prima foto è la copertina. Le frecce cambiano l\'ordine.</p>' +
          '<div class="foto-bozza" id="foto-bozza">' + fotoBozza() + '</div></fieldset>' +
        '<fieldset><legend>Il prodotto</legend>' +
          '<label class="campo largo">Nome *<input name="nome" required maxlength="140" value="' + h(p.nome) + '" placeholder="Es. Sneaker in pelle bianca"></label>' +
          '<label class="campo">Marchio<select name="marchio_id" data-az="scegli-marchio"><option value="">— senza marchio —</option>' + opz(S.marchi, p.marchio_id) + '<option value="__nuovo">+ Nuovo marchio…</option></select></label>' +
          '<label class="campo">Codice<input name="codice" maxlength="40" value="' + h(p.codice) + '" placeholder="facoltativo"></label>' +
          '<label class="campo">Categoria *<select name="categoria">' + opz(C.categorie, p.categoria) + '</select></label>' +
          '<label class="campo">Genere *<select name="genere">' + opz(C.generi, p.genere) + '</select></label>' +
        '</fieldset>' +
        '<fieldset><legend>Prezzo</legend>' +
          '<label class="campo">Prezzo di vendita (€)<input name="prezzo" type="number" inputmode="decimal" step="0.01" min="0" value="' + (numero(p.prezzo) != null ? p.prezzo : '') + '" placeholder="vuoto = su richiesta"></label>' +
          '<label class="campo">Prezzo pieno, prima dello sconto (€)<input name="prezzo_pieno" type="number" inputmode="decimal" step="0.01" min="0" value="' + (numero(p.prezzo_pieno) != null ? p.prezzo_pieno : '') + '" placeholder="facoltativo"></label>' +
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
          '<label class="interruttore"><input type="checkbox" name="visibile"' + (p.visibile !== false ? ' checked' : '') + '><span></span>Visibile in vetrina</label>' +
          '<label class="interruttore"><input type="checkbox" name="disponibile"' + (p.disponibile ? ' checked' : '') + '><span></span>Disponibile (spento = “esaurito”)</label>' +
          '<label class="interruttore"><input type="checkbox" name="in_evidenza"' + (p.in_evidenza ? ' checked' : '') + '><span></span>In evidenza (in cima alla vetrina)</label>' +
          '<label class="interruttore"><input type="checkbox" name="da_descrivere"' + (p.da_descrivere ? ' checked' : '') + '><span></span>Da descrivere (ci pensa l\'aiutante)</label>' +
        '</fieldset>' +
        '<div class="modulo-piede"><button class="btn grande" type="submit">' + icona('spunta') + ' Salva</button>' +
          (id !== 'nuovo' ? '<button class="btn contorno pericolo" type="button" data-az="elimina-bozza">' + icona('cestino') + ' Elimina prodotto</button>' : '') + '</div>' +
      '</form>');
  }
  function fotoBozza() {
    const f = bozza.p.foto;
    return f.map((id, i) => '<div class="fb"><div class="fb-img">' + fotoTag(id, false, '') + (i === 0 ? '<span class="fb-copertina">Copertina</span>' : '') + '</div>' +
      '<div class="fb-comandi"><button type="button" data-az="foto-su" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + ' title="Più avanti">' + icona('indietro') + '</button>' +
      '<button type="button" data-az="foto-giu" data-i="' + i + '"' + (i === f.length - 1 ? ' disabled' : '') + ' title="Più indietro">' + icona('avanti') + '</button>' +
      '<button type="button" data-az="foto-togli" data-i="' + i + '" title="Togli">' + icona('cestino') + '</button></div></div>').join('') +
      (bozza.inCaricamento ? '<div class="fb attesa"><div class="fb-img"><span class="rotella"></span></div><small>Carico ' + bozza.inCaricamento + '…</small></div>' : '') +
      '<label class="fb aggiungi">' + icona('piu') + '<span>Aggiungi foto</span><input type="file" accept="image/*" multiple data-az="carica-foto" hidden></label>';
  }
  function ridisegnaFotoBozza() {
    const el = document.getElementById('foto-bozza');
    if (el) el.innerHTML = fotoBozza();
  }
  function leggiModulo(form) {
    const v = n => form.elements[n].value.trim();
    Object.assign(bozza.p, {
      nome: v('nome'), marchio_id: v('marchio_id') && v('marchio_id') !== '__nuovo' ? v('marchio_id') : null, codice: v('codice'),
      categoria: v('categoria'), genere: v('genere'), prezzo: numero(v('prezzo')), prezzo_pieno: numero(v('prezzo_pieno')),
      taglie: v('taglie'), colori: v('colori'), descrizione: form.elements.descrizione.value.trim(), dettagli: form.elements.dettagli.value.trim(),
      visibile: form.elements.visibile.checked, disponibile: form.elements.disponibile.checked,
      in_evidenza: form.elements.in_evidenza.checked, da_descrivere: form.elements.da_descrivere.checked
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
      (S.marchi.length ? '<div class="admin-lista">' + S.marchi.map(m => {
        const n = S.prodotti.filter(p => p.marchio_id === m.id).length;
        return '<div class="admin-riga semplice" data-id="' + h(m.id) + '"><input class="rinomina" value="' + h(m.nome) + '" data-az="rinomina-marchio" maxlength="60">' +
          '<small>' + n + ' prodotti</small><button class="icona-btn pericolo" data-az="elimina-marchio" title="Elimina">' + icona('cestino') + '</button></div>';
      }).join('') + '</div>' : ''));
  }

  function adminImpostazioni() {
    const i = S.imp, link = linkVetrina();
    adminGuscio('impostazioni', '<div class="admin-testa"><h1>Link e impostazioni</h1></div>' +
      '<div class="riquadro-link"><h3>' + icona('lucchetto') + ' Il link della vetrina</h3>' +
        '<div class="link-riga"><input readonly value="' + h(link) + '" id="link-vetrina"></div>' +
        '<div class="link-bottoni"><button class="btn" data-az="copia-link">' + icona('copia') + ' Copia</button>' +
          (navigator.share ? '<button class="btn verde" data-az="condividi-link">' + icona('whatsapp') + ' Manda</button>' : '') +
          '<a class="btn contorno" href="' + h(link) + '&anteprima=1" target="_blank" rel="noopener">' + icona('cerca') + ' Guarda come un cliente</a></div>' +
        '<p class="nota">Chi ha questo link vede la vetrina, senza registrarsi. Chi non ce l\'ha non vede niente.</p>' +
        '<details class="cambia-link"><summary>Il link sta girando troppo?</summary><p class="nota">Puoi cambiarlo: il vecchio smette subito di funzionare e dovrai mandare quello nuovo alle persone che vuoi tenere.</p>' +
          '<button class="btn contorno pericolo" data-az="nuovo-codice">Cambia il link</button></details></div>' +
      '<form class="modulo" data-form="impostazioni"><fieldset><legend>La vetrina</legend>' +
        '<label class="campo largo">Nome della vetrina<input name="nome_negozio" maxlength="60" value="' + h(i.nome_negozio) + '"></label>' +
        '<label class="campo largo">Frase sotto il nome<input name="sottotitolo" maxlength="120" value="' + h(i.sottotitolo) + '"></label>' +
        '<label class="campo largo">Messaggio di benvenuto<textarea name="messaggio_benvenuto" rows="3" maxlength="400">' + h(i.messaggio_benvenuto) + '</textarea></label>' +
        '<label class="campo">Il tuo numero WhatsApp (per ricevere le scelte)<input name="whatsapp" inputmode="tel" value="' + h(i.whatsapp) + '" placeholder="Es. 333 1234567"></label>' +
      '</fieldset><div class="modulo-piede"><button class="btn grande">' + icona('spunta') + ' Salva</button></div></form>');
  }

  function paginaAdmin(pezzi, par) {
    if (pezzi[0] !== 'prodotto' && bozza) lasciaBozza(false);
    if (pezzi[0] === 'prodotto') return adminProdotto(pezzi[1] || 'nuovo');
    if (pezzi[0] === 'carica') return adminCarica();
    if (pezzi[0] === 'marchi') return adminMarchi();
    if (pezzi[0] === 'impostazioni') return adminImpostazioni();
    return adminProdotti(par);
  }

  // ---------------------------------------------------------------- PAGINE D'INGRESSO
  function cartoncino(html) { $app.innerHTML = '<div class="accesso"><div class="accesso-card">' + html + '</div></div>'; }
  function paginaPrivata(neg) {
    cartoncino('<div class="accesso-lucchetto">' + icona('lucchetto') + '</div><h1>' + h(neg.nome_negozio || 'Vetrina') + '</h1>' +
      (neg.sottotitolo ? '<p class="accesso-sotto">' + h(neg.sottotitolo) + '</p>' : '') +
      '<p>Questa vetrina è privata.<br>Per vederla ti serve il link di invito.</p>' +
      (D.demo ? '<div class="accesso-prova"><p><b>Modalità prova</b> (il database vero non è collegato):</p>' +
        '<a class="btn largo" href="?v=prova-prova-prova-1234">Guarda come un cliente col link</a>' +
        '<button class="btn contorno largo" data-az="prova-admin">Entra come titolare</button></div>' : '') +
      (neg.registrazione_aperta ? '<a class="btn grande largo" href="#/entra?nuovo=1">Sono la titolare: crea il mio account</a>'
        : '<a class="link" href="#/entra">Sono la titolare: entra</a>'));
  }
  function paginaLinkScaduto() {
    cartoncino('<div class="accesso-lucchetto">' + icona('lucchetto') + '</div><h1>Link non più valido</h1>' +
      '<p>Questo link è stato cambiato. Chiedi quello nuovo a chi te l\'ha mandato.</p>');
  }
  function paginaEntra(nuovo, neg) {
    nuovo = nuovo && neg.registrazione_aperta;
    cartoncino('<div class="accesso-lucchetto">' + icona('lucchetto') + '</div><h1>' + h(neg.nome_negozio || 'Vetrina') + '</h1>' +
      (nuovo
        ? '<p class="nota">Crea l\'account della titolare. Si può fare <b>una volta sola</b>: dopo la porta si chiude.</p>' +
          '<form class="modulo compatto" data-form="registra"><label class="campo largo">Il tuo nome<input name="nome" required maxlength="80" autocomplete="name"></label>' +
          '<label class="campo largo">Email<input name="email" type="email" required autocomplete="email"></label>' +
          '<label class="campo largo">Scegli una password <small>(almeno 8 caratteri)</small><input name="password" type="password" required minlength="8" autocomplete="new-password"></label>' +
          '<button class="btn grande largo">Crea il mio account</button></form>'
        : '<p class="nota">Solo per la titolare.</p><form class="modulo compatto" data-form="entra"><label class="campo largo">Email<input name="email" type="email" required autocomplete="email"></label>' +
          '<label class="campo largo">Password<input name="password" type="password" required autocomplete="current-password"></label>' +
          '<button class="btn grande largo">Entra</button></form>') +
      '<a class="link" href="#/">← Indietro</a>');
  }

  // ---------------------------------------------------------------- avvio e percorsi
  async function caricaAdmin() {
    const [imp, m, p] = await Promise.all([D.impostazioni(), D.marchi(), D.prodotti()]);
    S.imp = imp || {}; S.marchi = m || []; S.prodotti = (p || []).map(x => Object.assign({}, x, { foto: x.foto || [] }));
    S.codice = S.imp.codice_vetrina || '';
  }

  let neg = null;
  async function decidiModo() {
    const qs = new URLSearchParams(location.search);
    S.codice = qs.get('v') || '';
    const anteprima = qs.get('anteprima') === '1';
    S.utente = anteprima ? null : await D.utente().catch(() => null);
    if (S.utente && S.utente.admin) { S.modo = 'admin'; await caricaAdmin(); return; }
    if (S.codice) {
      const v = await D.vetrina(S.codice);
      if (v) {
        S.modo = 'visita'; S.imp = v.impostazioni || {}; S.marchi = v.marchi || [];
        S.prodotti = (v.prodotti || []).map(x => Object.assign({}, x, { foto: x.foto || [] }));
        return;
      }
      S.modo = 'scaduto'; return;
    }
    S.modo = 'fuori';
    neg = await D.negozio().catch(() => ({}));
  }

  async function mostra() {
    const { pezzi, par } = leggiIndirizzo();
    if (window.DATI_ERRORE) return cartoncino('<h1>Qualcosa non va</h1><p>' + h(window.DATI_ERRORE) + '</p><button class="btn" onclick="location.reload()">Riprova</button>');
    if (S.modo === 'scaduto' && pezzi[0] !== 'entra') return paginaLinkScaduto();
    if (S.modo === 'fuori' || S.modo === 'scaduto') {
      if (!neg) neg = await D.negozio().catch(() => ({}));
      document.title = neg.nome_negozio || 'Vetrina';
      return pezzi[0] === 'entra' ? paginaEntra(par.get('nuovo') === '1', neg) : paginaPrivata(neg);
    }
    document.title = nomeNegozio();
    if (pezzi[0] === 'p') paginaProdotto(pezzi[1]);
    else if (pezzi[0] === 'richiesta') paginaRichiesta();
    else if (pezzi[0] === 'marchi') paginaMarchi();
    else if (pezzi[0] === 'admin' && admin()) paginaAdmin(pezzi.slice(1), par);
    else paginaNegozio(par);
  }

  let hashPrima = location.hash;
  window.addEventListener('hashchange', async () => {
    scorrimenti[hashPrima] = window.scrollY;
    hashPrima = location.hash;
    document.body.classList.remove('filtri-aperti');
    await mostra();
    window.scrollTo(0, scorrimenti[location.hash] || 0);
  });

  async function riparti(hash) {
    $app.innerHTML = '<div class="partenza"><span class="rotella"></span></div>';
    try { await decidiModo(); } catch (e) { return cartoncino('<h1>Non riesco ad aprire la vetrina</h1><p>' + h(e.message) + '</p><button class="btn" onclick="location.reload()">Riprova</button>'); }
    if (hash != null && location.hash !== hash) { location.hash = hash; return; }
    await mostra();
  }

  // ---------------------------------------------------------------- clic
  document.addEventListener('click', async ev => {
    const el = ev.target.closest('[data-az]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const az = el.dataset.az;
    try {
      if (az === 'esci') { await D.esci(); S.modo = null; neg = null; history.replaceState(null, '', location.pathname); await riparti(); }
      else if (az === 'ricomincia') { if (confirm('Cancello tutte le prove e rimetto i prodotti di esempio?')) { await D.ricomincia(); location.reload(); } }
      else if (az === 'prova-admin') { await D.entra(); await riparti('#/'); }
      else if (az === 'apri-filtri') document.body.classList.add('filtri-aperti');
      else if (az === 'chiudi-filtri') document.body.classList.remove('filtri-aperti');
      // scheda prodotto
      else if (az === 'scegli') { el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === el)); }
      else if (az === 'qta') { const q = document.getElementById('qta'); q.value = Math.max(1, (parseInt(q.value, 10) || 1) + Number(el.dataset.d)); }
      else if (az === 'vai-foto') { const s = document.getElementById('scorri'); s.scrollTo({ left: s.clientWidth * Number(el.dataset.i), behavior: 'smooth' }); }
      else if (az === 'ingrandisci') apriLente(Number(el.dataset.i));
      else if (az === 'chiudi-lente') { const l = document.querySelector('.lente'); if (l) l.remove(); }
      else if (az === 'aggiungi') {
        const s = sceltaProdotto(); if (!s) return;
        const r = richiesta();
        const uguale = r.find(x => x.id === s.x.id && x.taglia === s.x.taglia && x.colore === s.x.colore);
        if (uguale) uguale.qta += s.x.qta; else r.push(s.x);
        salvaRichiesta(r);
        const b = document.querySelector('a[href="#/richiesta"]');
        if (b) { let pl = b.querySelector('.pallino'); if (!pl) { pl = document.createElement('b'); pl.className = 'pallino'; b.appendChild(pl); } pl.textContent = contaRichiesta(); }
        avviso('Aggiunto ai scelti ✓', 'ok');
      }
      else if (az === 'chiedi') {
        const s = sceltaProdotto(); if (!s) return;
        apriWhatsapp('Ciao! Mi interessa questo prodotto della vetrina:\n' + rigaTesto(s.p, s.x));
      }
      // scelti
      else if (az === 'rr-qta' || az === 'rr-togli') {
        const r = richiesta(), i = Number(el.dataset.i);
        if (az === 'rr-togli') r.splice(i, 1); else r[i].qta = Math.max(1, r[i].qta + Number(el.dataset.d));
        salvaRichiesta(r); paginaRichiesta();
      }
      else if (az === 'svuota') { if (confirm('Svuoto i scelti?')) { salvaRichiesta([]); paginaRichiesta(); } }
      else if (az === 'invia-richiesta') {
        const r = richiesta();
        const tot = r.reduce((a, x) => a + (numero(S.prodotti.find(p => p.id === x.id).prezzo) || 0) * x.qta, 0);
        apriWhatsapp('Ciao! Dalla vetrina ho scelto:\n' + r.map(x => rigaTesto(S.prodotti.find(p => p.id === x.id), x)).join('\n') +
          (tot ? '\n\nTotale indicativo: ' + euro(tot) : ''));
      }
      // carica foto
      else if (az === 'carica-cat') { carico.cat = el.dataset.id; adminCarica(); }
      else if (az === 'carica-gen') { carico.gen = el.dataset.id; adminCarica(); }
      else if (az === 'carica-pulisci') { carico.lavori.forEach(l => URL.revokeObjectURL(l.anteprima)); carico.lavori = []; adminCarica(); }
      // amministrazione
      else if (az === 'elimina-prodotto' || az === 'elimina-bozza') {
        const id = az === 'elimina-bozza' ? bozza.p.id : el.closest('[data-id]').dataset.id;
        const p = S.prodotti.find(x => x.id === id);
        if (!confirm('Elimino per sempre “' + p.nome + '” e le sue foto?')) return;
        if (az === 'elimina-bozza') await lasciaBozza(false);
        await D.eliminaProdotto(p);
        S.prodotti = S.prodotti.filter(x => x.id !== id);
        avviso('Prodotto eliminato.', 'ok');
        if (location.hash.startsWith('#/admin/prodotto')) location.hash = '#/admin'; else paginaAdmin([], leggiIndirizzo().par);
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
      else if (az === 'copia-link') {
        const t = document.getElementById('link-vetrina');
        try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); }
        avviso('Link copiato: incollalo in WhatsApp.', 'ok');
      }
      else if (az === 'condividi-link') {
        try { await navigator.share({ title: nomeNegozio(), text: 'Guarda la mia vetrina:', url: linkVetrina() }); } catch (e) { /* annullato */ }
      }
      else if (az === 'nuovo-codice') {
        if (!confirm('Cambio il link? Chi ha quello vecchio non vedrà più la vetrina.')) return;
        S.imp.codice_vetrina = S.codice = await D.nuovoCodice();
        adminImpostazioni(); avviso('Link cambiato. Ricordati di mandare quello nuovo.', 'ok');
      }
    } catch (e) { avviso(e.message, 'errore'); }
  });

  // modifiche veloci (prezzo, interruttori, ordinamento, marchi, file)
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
      else if (az === 'carica-stesso') { carico.stesso = el.checked; adminCarica(); }
      else if (az === 'carica-prezzo') { carico.prezzo = el.value; }
      else if (az === 'carica-file') { const files = [...el.files]; el.value = ''; await caricaFile(files); }
      else if (az === 'carica-foto') {
        const files = [...el.files]; el.value = '';
        bozza.inCaricamento += files.length; ridisegnaFotoBozza();
        const b = bozza;
        for (const file of files) {
          try { const id = await D.caricaFoto(file); b.p.foto.push(id); b.caricateOra.push(id); }
          catch (e) { avviso(e.message, 'errore'); }
          b.inCaricamento--;
          if (bozza === b) ridisegnaFotoBozza();
        }
      }
    } catch (e) {
      avviso(e.message, 'errore');
      if (az === 'prezzo-veloce' || az === 'campo-veloce') { const p = S.prodotti.find(x => x.id === el.closest('[data-id]').dataset.id); if (az === 'prezzo-veloce') el.value = p.prezzo == null ? '' : p.prezzo; else el.checked = !!p[el.dataset.campo]; }
    }
  });
  document.addEventListener('input', ev => { if (ev.target.dataset.az === 'carica-prezzo') carico.prezzo = ev.target.value; });
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
      if (tipo === 'cerca') { const f = nessunFiltro(); f.q = val('q'); location.hash = linkFiltri(f); }
      else if (tipo === 'prezzo') { const f = filtriDa(leggiIndirizzo().par); f.min = val('min'); f.max = val('max'); location.hash = linkFiltri(f); }
      else if (tipo === 'entra') { await D.entra(val('email'), form.elements.password.value); await riparti('#/admin'); }
      else if (tipo === 'registra') {
        await D.registra({ nome: val('nome'), email: val('email'), password: form.elements.password.value });
        await riparti('#/admin/impostazioni');
        avviso('Account creato: adesso sei la titolare ✓', 'ok');
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
        const v = { nome_negozio: val('nome_negozio') || 'Vetrina', sottotitolo: val('sottotitolo'), messaggio_benvenuto: form.elements.messaggio_benvenuto.value.trim(), whatsapp: val('whatsapp') };
        await D.salvaImpostazioni(v);
        Object.assign(S.imp, v); document.title = nomeNegozio();
        adminImpostazioni(); avviso('Salvato ✓', 'ok');
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
        fotoTag(foto[k], true, p.nome) + (foto.length > 1 ? '<div class="lente-conta">' + (k + 1) + ' / ' + foto.length + '</div>' : '');
    };
    lente.addEventListener('click', e => {
      if (e.target.closest('.sx')) { k = (k - 1 + foto.length) % foto.length; draw(); }
      else if (e.target.closest('.dx')) { k = (k + 1) % foto.length; draw(); }
      else if (e.target === lente) lente.remove();
    });
    document.body.appendChild(lente); draw();
  }

  riparti();
})();
