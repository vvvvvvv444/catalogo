/* Impostazioni del catalogo.
   Finche' supabaseUrl e supabaseKey sono vuoti l'app gira in "modalita' prova":
   i dati restano solo nel browser di questo computer. */
window.CONFIG = {
  // Da Supabase > Project Settings > API (vedi GUIDA.html)
  supabaseUrl: '',   // es. 'https://abcdefgh.supabase.co'
  supabaseKey: '',   // la chiave "anon public" (e' fatta per stare nel sito)

  categorie: [
    { id: 'scarpe',    nome: 'Scarpe',       icona: 'scarpe' },
    { id: 'borse',     nome: 'Borse',        icona: 'borse' },
    { id: 'accessori', nome: 'Accessori',    icona: 'accessori' },
    { id: 'gioielli',  nome: 'Gioielli',     icona: 'gioielli' },
    { id: 'capelli',   nome: 'Cura capelli', icona: 'capelli' },
    { id: 'skincare',  nome: 'Skin care',    icona: 'skincare' },
    { id: 'trucchi',   nome: 'Trucchi',      icona: 'trucchi' }
  ],

  generi: [
    { id: 'donna',   nome: 'Donna' },
    { id: 'uomo',    nome: 'Uomo' },
    { id: 'unisex',  nome: 'Unisex' },
    { id: 'bambini', nome: 'Bambini' }
  ]
};
