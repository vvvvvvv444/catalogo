/* Icone a linea (24x24), disegnate qui per non dipendere da nessuno. */
(function () {
  const P = {
    tutti: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    scarpe: '<path d="M2.5 17.5h19v1.5a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1z"/><path d="M2.5 17.5V8.5a1 1 0 0 1 1-1h2.2l1.8 2.5 2.5-1 7.2 4.3c2.6.6 4.3 2 4.3 4.2"/><path d="M11 11.5l1.5-1M13.5 13l1.5-1"/>',
    borse: '<path d="M5 8.5h14l-1.2 11a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
    accessori: '<circle cx="6.5" cy="14" r="3.5"/><circle cx="17.5" cy="14" r="3.5"/><path d="M10 13.2c1.3-.9 2.7-.9 4 0M3 14 2 9.5M21 14l1-4.5"/>',
    gioielli: '<path d="M6.5 4h11l3.5 5-9 11L3 9z"/><path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/>',
    capelli: '<path d="M9.5 2.5h5v3h-5z"/><path d="M8.5 5.5h7l1.5 3.5v11a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 20V9z"/><path d="M7 12h10"/>',
    skincare: '<rect x="4" y="6" width="16" height="4" rx="1.2"/><path d="M5 10h14v8.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M9 14.5h6"/>',
    trucchi: '<path d="M8.5 12h7v9h-7z"/><path d="M9.5 12V6.5l5-3.5V12"/><path d="M8.5 16h7"/>',
    orologio: '<circle cx="12" cy="12" r="5.5"/><path d="M12 9.5V12l1.8 1.2M9 6.8 9.8 3h4.4l.8 3.8M9 17.2l.8 3.8h4.4l.8-3.8"/>',
    profumo: '<rect x="6" y="9" width="12" height="12" rx="2.5"/><path d="M10 9V6.5h4V9M11 6.5V4h2v2.5M9 14h6"/>',
    maglia: '<path d="M8 3.5 4 6l-1.5 4.5 3 1.2L7 10v10.5h10V10l1.5 1.7 3-1.2L20 6l-4-2.5c-.6 1.6-2.1 2.6-4 2.6s-3.4-1-4-2.6z"/>',
    regalo: '<rect x="4" y="9" width="16" height="11.5" rx="1"/><path d="M3 9h18M12 9v11.5M12 9c-1.5-3-5-4-5.5-1.8C6 9 12 9 12 9zm0 0c1.5-3 5-4 5.5-1.8C18 9 12 9 12 9z"/>',
    pennello: '<path d="M14.5 4.5l5 5-7.5 7.5-5-5z"/><path d="M7 12c-2 .5-3.5 2.5-3.5 5.5 0 1 .2 2 .5 2.5.5.3 1.5.5 2.5.5 3 0 5-1.5 5.5-3.5"/>',
    posta: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    cerca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sacca: '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
    utente: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
    ingranaggio: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    esci: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    filtro: '<path d="M3 5h18M6 12h12M10 19h4"/>',
    chiudi: '<path d="M6 6l12 12M18 6 6 18"/>',
    indietro: '<path d="M15 18l-6-6 6-6"/>',
    avanti: '<path d="M9 18l6-6-6-6"/>',
    matita: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    cestino: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    piu: '<path d="M12 5v14M5 12h14"/>',
    foto: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/>',
    whatsapp: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9.2 8.6c.2-.4.5-.4.7-.4h.5c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .4-.1.6l-.5.6c.6 1.1 1.4 1.9 2.5 2.5l.6-.5c.2-.2.4-.2.6-.1l1.5.7c.2.1.3.3.3.5v.5c0 .3-.2.6-.5.8-.8.5-2 .5-3.6-.4-1.4-.8-2.6-2-3.3-3.4-.7-1.4-.4-2.4.2-3.2z"/>',
    copia: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    stella: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
    marchio: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.5"/>',
    persone: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 2.9-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2.1.6 3.5 2.3 3.5 5.2"/>',
    lucchetto: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    spunta: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    su: '<path d="m6 15 6-6 6 6"/>',
    giu: '<path d="m6 9 6 6 6-6"/>'
  };
  window.ICONE = P;
  window.icona = function (nome, classe) {
    return '<svg class="ico ' + (classe || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[nome] || P.tutti) + '</svg>';
  };
})();
