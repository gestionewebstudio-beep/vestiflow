/**
 * L'ECONOMIA di un ordine, letta dove la legge ogni schermata — in sola lettura:
 *   · l'Ordine (elenco Ordini Shopify / dettaglio): totali, IVA, stato pagamento, date, righe;
 *   · i RIMBORSI persistiti (`sales_order_refunds`) con le RIGHE (`sales_order_refund_lines`):
 *     tipo, importi, IVA, data, e per riga quantità e reintegro;
 *   · l'ORDINE COME LO LEGGONO LE SCHERMATE (`SalesOrdersService.list` e `getById` da
 *     titolare): rettifiche sommate, totale aggiornato, per riga ordinati · annullati · spediti;
 *   · la VENDITA ONLINE come la legge il dettaglio (`OnlineSalesService.getDetail`);
 *   · il RIEPILOGO del Registro (`getSummary`: rettifiche e annullamenti contati) e le righe
 *     dell'ordine nel CSV per il commercialista;
 *   · la VENDITA ONLINE: riferimento, totali, IVA, righe, date;
 *   · il REGISTRO CORRISPETTIVI (`buildRegisterRows`, stesse righe dell'export per il
 *     commercialista): le righe dell'ordine con segno, e la somma;
 *   · il CRUSCOTTO (`BusinessAnalyticsService`, quello vero, da titolare) per il giorno
 *     dell'evasione: vendite, pezzi netti, valore netto delle vendite, margine — con le
 *     rettifiche persistite alla loro data (13/09/2026).
 *
 *   node scripts/collaudo-esegui.mjs collaudo-economia-ordine.runner.cjs '#1014'
 */
'use strict';

async function main() {
  const [numero] = process.argv.slice(2);
  if (!numero) {
    throw new Error("indica l'ordine, es. '#1014'");
  }
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { CorrispettiviService } = require('../dist/corrispettivi/corrispettivi.service');
  const { CorrispettiviExportService } = require('../dist/corrispettivi/corrispettivi-export.service');
  const { SalesOrdersService } = require('../dist/sales-orders/sales-orders.service');
  const { OnlineSalesService } = require('../dist/online-sales/online-sales.service');
  const { toUserProfileDto } = require('../dist/auth/dto/user-profile.dto');
  const { BusinessAnalyticsService } = require('../dist/analytics/business-analytics.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo') {
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    }
    const conn = await prisma.shopifyConnection.findFirstOrThrow({ select: { tenantId: true } });
    const tenantId = conn.tenantId;
    const eur = (m) => (m / 100).toFixed(2).replace('.', ',') + ' €';
    const ora = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '—');

    const o = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId, orderNumber: numero },
      select: {
        id: true,
        financialStatus: true,
        fulfillmentStatus: true,
        placedAt: true,
        fulfilledAt: true,
        cancelledAt: true,
        currency: true,
        subtotalMinor: true,
        discountMinor: true,
        shippingMinor: true,
        taxMinor: true,
        totalMinor: true,
        lines: {
          select: { title: true, quantity: true, totalMinor: true, lineVatTotalMinor: true, vatSnapshot: true },
        },
        refunds: {
          select: {
            kind: true,
            occurredAt: true,
            subtotalMinor: true,
            taxMinor: true,
            shippingMinor: true,
            adjustmentMinor: true,
            totalMinor: true,
            note: true,
            externalRefundId: true,
            lines: {
              select: {
                externalLineId: true,
                quantity: true,
                restockType: true,
                subtotalMinor: true,
                taxMinor: true,
                salesOrderLineId: true,
              },
            },
          },
          orderBy: { occurredAt: 'asc' },
        },
      },
    });
    console.log(`── ORDINE ${numero} (elenco Ordini Shopify / dettaglio)`);
    console.log(
      `   pagamento ${o.financialStatus} · evasione ${o.fulfillmentStatus} · ordinato ${ora(o.placedAt)} · evaso ${ora(o.fulfilledAt)} · annullato ${ora(o.cancelledAt)}`,
    );
    console.log(
      `   subtotale ${eur(o.subtotalMinor)} · sconto ${eur(o.discountMinor)} · spedizione ${eur(o.shippingMinor)} · IVA ${eur(o.taxMinor)} · TOTALE ${eur(o.totalMinor)}`,
    );
    for (const l of o.lines) {
      const aliquota = l.vatSnapshot && typeof l.vatSnapshot === 'object' ? (l.vatSnapshot.ratePercent ?? l.vatSnapshot.rate ?? '?') : '?';
      console.log(`   riga «${l.title}» ×${l.quantity} · totale ${eur(l.totalMinor)} · IVA riga ${eur(l.lineVatTotalMinor)} (aliquota ${aliquota})`);
    }
    console.log(`── RIMBORSI persistiti: ${o.refunds.length}`);
    for (const r of o.refunds) {
      console.log(
        `   ${ora(r.occurredAt)} ${r.kind} · imponibile ${eur(r.subtotalMinor)} · IVA ${eur(r.taxMinor)} · spedizione ${eur(r.shippingMinor)} · rettifica ${eur(r.adjustmentMinor)} · TOTALE ${eur(r.totalMinor)} · ${r.externalRefundId}${r.note ? ` · «${r.note}»` : ''}`,
      );
      for (const l of r.lines) {
        console.log(
          `      riga rimborsata ${l.externalLineId} ×${l.quantity} · reintegro ${l.restockType} · imponibile ${eur(l.subtotalMinor)} · IVA ${eur(l.taxMinor)} · riga ordine ${l.salesOrderLineId ? 'collegata' : 'NON collegata'}`,
        );
      }
    }

    // ── l'ordine come lo leggono elenco e dettaglio, da titolare ──
    const titolare = await prisma.user.findFirstOrThrow({
      where: { tenantId, role: 'owner', isActive: true },
      include: {
        stores: true,
        tenant: {
          select: {
            name: true,
            channelProfile: true,
            featureSettings: { select: { manualUnloadEnabled: true } },
          },
        },
        locations: { include: { location: { select: { id: true, name: true } } } },
        defaultLocation: { select: { id: true, name: true } },
      },
    });
    const profilo = toUserProfileDto(titolare, false);
    const ordini = app.get(SalesOrdersService);
    const elenco = await ordini.list(tenantId, { page: 1, pageSize: 200, search: numero }, profilo);
    const rigaElenco = elenco.items.find((r) => r.orderNumber === numero);
    console.log(`── ELENCO Ordini (list da titolare): ${rigaElenco ? 'riga trovata' : 'RIGA ASSENTE'}`);
    if (rigaElenco) {
      console.log(
        `   totale ${eur(rigaElenco.totalMinor)} · rettifiche ${eur(rigaElenco.refundTotalMinor ?? 0)} (${rigaElenco.refundCount ?? 0}) · totale aggiornato ${eur(rigaElenco.totalMinor - (rigaElenco.refundTotalMinor ?? 0))} · sede «${rigaElenco.locationName ?? '—'}»`,
      );
    }
    const dettaglio = await ordini.getById(tenantId, o.id, profilo);
    console.log(
      `── DETTAGLIO Ordine (getById da titolare): rettifiche ${dettaglio.refunds?.length ?? 0} · somma ${eur(dettaglio.refundTotalMinor ?? 0)} · sede «${dettaglio.locationName ?? '—'}»`,
    );
    for (const l of dettaglio.lines) {
      console.log(
        `   riga «${l.title}» ordinati ${l.quantity} · annullati ${l.cancelledQuantity ?? '?'} · spediti ${l.shippedQuantity ?? '?'}`,
      );
    }

    const vendita = await prisma.onlineSale.findUnique({
      where: { salesOrderId: o.id },
      select: {
        reference: true,
        orderPlacedAt: true,
        fulfilledAt: true,
        paymentStatus: true,
        inventoryStatus: true,
        refundedAt: true,
        subtotalMinor: true,
        discountMinor: true,
        shippingMinor: true,
        taxMinor: true,
        totalMinor: true,
        lines: { select: { description: true, quantity: true, subtotalMinor: true, taxMinor: true, totalMinor: true } },
        documents: { select: { type: true, reference: true, status: true } },
      },
    });
    console.log(`── VENDITA ONLINE: ${vendita ? vendita.reference : 'NESSUNA'}`);
    if (vendita) {
      console.log(
        `   ordinata ${ora(vendita.orderPlacedAt)} · evasa ${ora(vendita.fulfilledAt)} · pagamento (foto) ${vendita.paymentStatus} · magazzino ${vendita.inventoryStatus} · rimborsata dopo ${ora(vendita.refundedAt)}`,
      );
      console.log(
        `   subtotale ${eur(vendita.subtotalMinor)} · sconto ${eur(vendita.discountMinor)} · spedizione ${eur(vendita.shippingMinor)} · IVA ${eur(vendita.taxMinor)} · TOTALE ${eur(vendita.totalMinor)}`,
      );
      for (const l of vendita.lines) {
        console.log(`   riga «${l.description}» ×${l.quantity} · imponibile ${eur(l.subtotalMinor)} · IVA ${eur(l.taxMinor)} · totale ${eur(l.totalMinor)}`);
      }
      console.log(`   documenti collegati: ${vendita.documents.map((d) => `${d.type} ${d.reference} (${d.status})`).join(', ') || 'nessuno'}`);
      const venditaId = (
        await prisma.onlineSale.findUniqueOrThrow({ where: { salesOrderId: o.id }, select: { id: true } })
      ).id;
      const det = await app.get(OnlineSalesService).getDetail(tenantId, venditaId, profilo);
      console.log(
        `   come la legge il DETTAGLIO: valore originario ${eur(det.totalMinor)} · rettifiche ${eur(det.refundTotalMinor)} (${det.refunds.length}) · totale aggiornato ${eur(det.updatedTotalMinor)} · sede «${det.locationName ?? '—'}»`,
      );
      for (const l of det.lines) {
        console.log(
          `   riga «${l.description}» ordinati ${l.orderedQuantity} · annullati ${l.cancelledQuantity} · spediti ${l.shippedQuantity}`,
        );
      }
    }

    // ── il Registro: le stesse righe dell'elenco e dell'export ──
    const corrispettivi = app.get(CorrispettiviService);
    const giorno = new Date(o.fulfilledAt ?? o.placedAt);
    const da = new Date(giorno);
    da.setUTCDate(da.getUTCDate() - 1);
    const a = new Date(giorno);
    a.setUTCDate(a.getUTCDate() + 1);
    const righe = await corrispettivi.buildRegisterRows(tenantId, {
      placedFrom: da.toISOString().slice(0, 10),
      placedTo: a.toISOString().slice(0, 10),
      page: 1,
      pageSize: 500,
    });
    const mie = righe.filter((r) => r.orderNumber === numero);
    console.log(`── REGISTRO CORRISPETTIVI (righe di ${numero} nel periodo ${da.toISOString().slice(0, 10)}…${a.toISOString().slice(0, 10)}): ${mie.length}`);
    let somma = 0;
    for (const r of mie) {
      somma += r.totalMinor;
      console.log(
        `   ${ora(r.occurredAt)} ${r.kind}${r.refundKind ? ` (${r.refundKind})` : ''} · imponibile ${eur(r.taxableMinor)} · IVA ${eur(r.taxMinor)} · totale ${eur(r.totalMinor)} · sede «${r.locationName ?? '—'}» · pagamento ${r.financialStatus ?? '—'}`,
      );
    }
    console.log(`   SOMMA delle righe di ${numero}: ${eur(somma)}`);
    const filtro = {
      placedFrom: da.toISOString().slice(0, 10),
      placedTo: a.toISOString().slice(0, 10),
      page: 1,
      pageSize: 500,
    };
    const riepilogo = await corrispettivi.getSummary(tenantId, filtro);
    console.log(
      `── RIEPILOGO del Registro nel periodo: rettifiche ${riepilogo.refundCount} (${eur(riepilogo.refundTotalMinor)}) · annullamenti ${riepilogo.cancellationCount} (${eur(riepilogo.cancellationTotalMinor)}) · totale ${eur(riepilogo.totalMinor)} · netto ${eur(riepilogo.netTotalMinor)}`,
    );
    const csv = await app.get(CorrispettiviExportService).exportAccountantCsv(tenantId, filtro);
    const righeCsv = csv.split(/\r?\n/).filter((r) => r.includes(numero));
    console.log(`── CSV per il commercialista: ${righeCsv.length} righe di ${numero}`);
    for (const r of righeCsv) console.log(`   ${r}`);

    // ── il Cruscotto VERO, per il giorno dell'evasione ──
    const giornoIso = giorno.toISOString().slice(0, 10);
    const cruscotto = await app
      .get(BusinessAnalyticsService)
      .getSummary(tenantId, { period: 'custom', from: giornoIso, to: giornoIso }, profilo);
    console.log(
      `── CRUSCOTTO (BusinessAnalyticsService, il ${giornoIso}): ${cruscotto.sales.transactionCount} vendite · ${cruscotto.sales.unitsSold} pezzi netti · valore netto ${eur(cruscotto.revenue.totalMinor)} · margine ${cruscotto.margin.grossMinor === null ? '—' : eur(cruscotto.margin.grossMinor)}`,
    );
    for (const prodotto of cruscotto.topProducts) {
      console.log(`   prodotto ${prodotto.sku} «${prodotto.title}» · ${prodotto.unitsSold} pezzi · ${eur(prodotto.revenueMinor)}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
