import { describe, expect, it } from 'vitest';

import { etichettaMotivoAllineamento } from './shopify-allinea-motivo.util';

describe('etichettaMotivoAllineamento', () => {
  it('⭐ «livello non disponibile» e «errore di lettura» restano DUE voci', () => {
    // ⛔ La prima è un'assenza constatata, la seconda un esito ignoto: fuse,
    //    chi legge non saprebbe se il canale ha detto «non ce l'ho» o non ha
    //    detto niente — e sono due rimedi diversi.
    expect(etichettaMotivoAllineamento('livello_non_disponibile')).toBe('Livello non disponibile');
    expect(etichettaMotivoAllineamento('errore_di_lettura')).toBe('Errore di lettura');
  });

  it('⭐ «errore di lettura» non è «scrittura con esito incerto»', () => {
    // ⛔ Nel primo caso non è partito niente e ripetere è innocuo; nel secondo
    //    una scrittura era prenotata e può essere andata a segno.
    expect(etichettaMotivoAllineamento('scrittura_esito_incerto')).toBe(
      'Scrittura con esito incerto',
    );
  });

  it('⭐ ogni motivo ha la sua etichetta, e nessuna è vuota', () => {
    const motivi = [
      'livello_non_disponibile',
      'collegamento_escluso',
      'base_non_stabilita',
      'richiesta_rifiutata',
      'divergenza_accertata',
      'errore_di_lettura',
      'scrittura_esito_incerto',
      'negozio_non_connesso',
      'permesso_mancante',
      'sincronizzazione_spenta',
      'variante_non_collegata',
      'sede_non_collegata',
      'stato_cambiato',
      'rinvio_attivo',
    ] as const;

    for (const motivo of motivi) {
      const etichetta = etichettaMotivoAllineamento(motivo);
      expect(etichetta.length).toBeGreaterThan(0);
      // ⭐ E non è lo slug grezzo: quello è il ripiego, non la regola.
      expect(etichetta).not.toBe(motivo);
    }
  });

  it('⛔ un motivo SCONOSCIUTO non si nasconde: si mostra grezzo', () => {
    // ⚠️ Se il server ne aggiunge uno e qui manca, una casella vuota
    //    nasconderebbe la causa. Meglio uno slug che si legge male di una riga
    //    senza perché.
    expect(etichettaMotivoAllineamento('motivo_che_non_esiste')).toBe('motivo_che_non_esiste');
  });
});
