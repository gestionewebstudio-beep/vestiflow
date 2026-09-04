import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import { TENANT_PERMISSIONS_KEY } from '../common/auth/tenant-permissions.decorator';
import { StoreSalesController } from '../store-sales/store-sales.controller';

import { CashSessionsController } from './cash-sessions.controller';

/**
 * La SUPERFICIE esposta dalla Cassa (tranche C3).
 *
 * ⭐ Si guardano i **metadati delle rotte**, non il comportamento: quale
 * permesso una rotta chiede, e quali verbi esistono, sono decisioni che devono
 * poter essere lette senza montare l'applicazione — e che cambiando in silenzio
 * aprirebbero un endpoint a chi non deve.
 */

type Metodo = string;

function rotte(controller: object): { nome: Metodo; verbo: number; percorso: string }[] {
  const proto = Object.getPrototypeOf(controller) as object;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== 'constructor')
    .map((nome) => {
      const handler = (proto as Record<string, unknown>)[nome];
      const verbo = Reflect.getMetadata(METHOD_METADATA, handler as object) as number | undefined;
      const percorso = Reflect.getMetadata(PATH_METADATA, handler as object) as string | undefined;
      return verbo === undefined ? null : { nome, verbo, percorso: percorso ?? '' };
    })
    .filter((r): r is { nome: Metodo; verbo: number; percorso: string } => r !== null);
}

function permessiDi(controller: object, metodo: string): string[] {
  const proto = Object.getPrototypeOf(controller) as object;
  const handler = (proto as Record<string, unknown>)[metodo];
  return (
    (Reflect.getMetadata(TENANT_PERMISSIONS_KEY, handler as object) as string[] | undefined) ?? []
  );
}

describe('CashSessionsController — la superficie esposta', () => {
  const controller = Object.create(CashSessionsController.prototype) as object;

  /**
   * ⛔ Il contratto append-only: una sessione sbagliata si CHIUDE, un movimento
   * sbagliato si corregge con un movimento OPPOSTO. La guardia statica
   * `check:cassa-append-only` lo tiene sulla build; questa prova lo tiene sui
   * metadati, che è dove il difetto si manifesterebbe.
   */
  it('NON espone verbi di cancellazione o modifica', () => {
    const vietati = rotte(controller).filter((r) =>
      [RequestMethod.DELETE, RequestMethod.PUT, RequestMethod.PATCH].includes(r.verbo),
    );

    expect(vietati).toEqual([]);
  });

  it('ogni rotta ha una porta: nessuna resta aperta', () => {
    for (const r of rotte(controller)) {
      expect(permessiDi(controller, r.nome), `rotta ${r.nome}`).not.toHaveLength(0);
    }
  });

  /**
   * ⭐ Aprire la cassa è una responsabilità diversa dal vendere: dichiara il
   * fondo e firma la quadratura.
   */
  it('aprire e cambiare dispositivo chiedono `retail.cash_session`', () => {
    expect(permessiDi(controller, 'open')).toEqual([TenantPermission.RetailCashSession]);
    expect(permessiDi(controller, 'changeDevice')).toEqual([TenantPermission.RetailCashSession]);
  });

  /**
   * ⭐ Separato di proposito: prelevare contante è più delicato che aprire, e
   * chi sta al banco può dover aprire senza poter prelevare.
   */
  it('versamenti e prelievi chiedono `retail.cash_drawer`, non quello della sessione', () => {
    expect(permessiDi(controller, 'addMovement')).toEqual([TenantPermission.RetailCashDrawer]);
    expect(permessiDi(controller, 'addMovement')).not.toContain(TenantPermission.RetailCashSession);
  });

  it('le sole letture chiedono `retail.register`', () => {
    for (const metodo of ['current', 'movements', 'deviceChanges']) {
      expect(permessiDi(controller, metodo), metodo).toEqual([TenantPermission.RetailRegister]);
    }
  });

  /**
   * ⛔ Il vecchio ramo aveva `PUT /fiscal-devices/{locationId}`, che con più
   * dispositivi non sa quale modificare (`docs/25` §10, garanzia 7). Qui
   * l'oggetto delle rotte è la SESSIONE.
   */
  it('nessuna rotta è identificata dalla sola sede', () => {
    const percorsi = rotte(controller).map((r) => r.percorso);

    for (const p of percorsi) {
      expect(p, `percorso «${p}»`).not.toContain('locationId');
    }
    // Le rotte per sessione la portano nel percorso.
    expect(percorsi).toContain(':id/movements');
    expect(percorsi).toContain(':id/device');
  });
});

describe('Vendita al banco — indipendente dai permessi della Cassa', () => {
  const store = Object.create(StoreSalesController.prototype) as object;

  /**
   * ⭐ La condizione del mandato: chi vende al banco continua a lavorare anche
   * senza i due permessi nuovi. Sono due flussi distinti (`docs/25` §1), e
   * legarli qui rifarebbe il nodo che C0 ha sciolto.
   */
  it('nessuna rotta chiede `retail.cash_session` o `retail.cash_drawer`', () => {
    for (const r of rotte(store)) {
      const p = permessiDi(store, r.nome);
      expect(p, `rotta ${r.nome}`).not.toContain(TenantPermission.RetailCashSession);
      expect(p, `rotta ${r.nome}`).not.toContain(TenantPermission.RetailCashDrawer);
    }
  });
});
