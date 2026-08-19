import { effect, inject } from '@angular/core';
import type { FormControl } from '@angular/forms';

import { OperationalLocationsService } from '../services/operational-locations.service';

/** I due ganci che cambiano da una maschera all'altra. */
export interface DefaultLocationPrefillOptions {
  /** Il campo Sede della testata. */
  readonly control: FormControl<string>;
  /** Documento già esistente: la sede è la sua, non si tocca. */
  readonly isEdit: () => boolean;
  /**
   * Scrittura programmatica. Un valore predefinito NON è una modifica
   * dell'operatore: senza questo gancio il documento nascerebbe «con modifiche
   * non salvate» e il guard di uscita chiederebbe conferma per una cosa che
   * l'operatore non ha fatto. Ogni maschera sopprime il dirty a modo suo — chi
   * con un flag, chi con un metodo — quindi il gesto arriva da fuori.
   */
  readonly write: (apply: () => void) => void;
}

/**
 * **Sede predefinita in testata** (specifica numerazione §1-bis, 13/08/2026).
 *
 * Se l'operatore ha una sede predefinita assegnata, il campo esce compilato con
 * quella. Se non ce l'ha, il campo resta vuoto e la sede si sceglie.
 *
 * **Perché non è il «fallback automatico» che il dominio vieta.** Il servizio
 * dice, per la sua `defaultLocation`, di non usarla mai come «prima sede
 * disponibile»: quel divieto riguarda l'INVENTARE una sede. Qui non si inventa
 * niente — la sede predefinita è un dato che qualcuno ha assegnato
 * esplicitamente a quell'utente, ed è già filtrata sulle sedi in cui può
 * scrivere. Il commesso del negozio di Napoli non deve confermare a ogni
 * documento di stare a Napoli.
 *
 * E chi lavora su più sedi una predefinita non ce l'ha: per lui il campo resta
 * vuoto e la scelta è esplicita ogni volta — che è il comportamento giusto
 * proprio nel caso in cui la sede è ambigua.
 *
 * **Superato** il suggerimento cliccabile «Suggerita: Milano» sotto il campo:
 * con la predefinita il campo è già pieno, senza predefinita non c'è nulla da
 * suggerire. Non serviva in nessuno dei due casi.
 *
 * Da chiamare in un contesto di iniezione (inizializzatore di campo o
 * costruttore): registra un `effect`, perché il profilo utente e l'elenco sedi
 * arrivano dalla rete e la predefinita può comparire dopo il primo render.
 */
export function prefillDefaultLocation(options: DefaultLocationPrefillOptions): void {
  const operationalLocations = inject(OperationalLocationsService);

  effect(() => {
    const defaultLocationId = operationalLocations.defaultLocation()?.id;
    // Niente predefinita, documento già esistente, o campo già compilato (dal
    // precompilato di una conversione, o dall'operatore): non si tocca.
    if (!defaultLocationId || options.isEdit() || options.control.value) {
      return;
    }
    options.write(() => options.control.setValue(defaultLocationId));
  });
}
