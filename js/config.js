/* Impostazioni del catalogo.
   Finche' supabaseUrl e supabaseKey sono vuoti l'app gira in "modalita' prova":
   i dati restano solo nel browser di questo computer. */
window.CONFIG = {
  // Da Supabase > Project Settings > API (vedi GUIDA.html)
  supabaseUrl: 'https://xzwqzuicezmfjupjmmkh.supabase.co',
  supabaseKey: 'sb_publishable_fXk1qBnkgUn0UVQf5vqLCg_mun3mK5f', // chiave PUBBLICA: e' fatta per stare nel sito

  categorie: [
    // "uno" = titolo provvisorio delle foto appena caricate, finche' non arriva quello vero
    { id: 'scarpe',    nome: 'Scarpe',       uno: 'Scarpe',       icona: 'scarpe' },
    { id: 'borse',     nome: 'Borse',        uno: 'Borsa',        icona: 'borse' },
    { id: 'accessori', nome: 'Accessori',    uno: 'Accessorio',   icona: 'accessori' },
    { id: 'gioielli',  nome: 'Gioielli',     uno: 'Gioiello',     icona: 'gioielli' },
    { id: 'capelli',   nome: 'Cura capelli', uno: 'Cura capelli', icona: 'capelli' },
    { id: 'skincare',  nome: 'Skin care',    uno: 'Skin care',    icona: 'skincare' },
    { id: 'trucchi',   nome: 'Trucchi',      uno: 'Trucco',       icona: 'trucchi' }
  ],

  generi: [
    { id: 'donna',   nome: 'Donna' },
    { id: 'uomo',    nome: 'Uomo' },
    { id: 'unisex',  nome: 'Unisex' },
    { id: 'bambini', nome: 'Bambini' }
  ]
};
