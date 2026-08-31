import { readFileSync, writeFileSync } from 'node:fs';

const sost = (F, coppie) => {
  let t = readFileSync(F, 'utf8');
  const eol = t.includes('\r\n') ? '\r\n' : '\n';
  const N = (s) => s.split('\n').join(eol);
  for (const [a, b] of coppie) {
    const x = N(a);
    const n = t.split(x).length - 1;
    if (n !== 1) {
      console.error(`STOP ${F} (${n}): ${a.slice(0, 60)}`);
      process.exit(1);
    }
    t = t.replace(x, N(b));
  }
  writeFileSync(F, t, 'utf8');
  console.log(`  ok  ${F}`);
};

const aggiungiMetodo = (F, metodo) => {
  let t = readFileSync(F, 'utf8');
  const eol = t.includes('\r\n') ? '\r\n' : '\n';
  const chiusura = t.lastIndexOf('}');
  t = t.slice(0, chiusura) + metodo.split('\n').join(eol) + t.slice(chiusura);
  writeFileSync(F, t, 'utf8');
  console.log(`  ok  ${F}`);
};

// ══ CLIENTI ═══════════════════════════════════════════════════════════════
aggiungiMetodo(
  'api/src/customers/customers.service.ts',
  `
  /**
   * ⭐ **Duplica la scheda cliente**: una copia con codice proprio, che si apre
   * per rifinire ciò che deve essere diverso — la stessa forma del duplica
   * prodotto.
   *
   * ⛔ **Partita IVA e codice fiscale NON si copiano** (\`partyDuplicateData\`): due
   * anagrafiche con la stessa partita IVA non sono una copia, sono un errore.
   *
   * ⚠️ **Non si copia lo storico**, e non è una scelta: documenti, ordini e
   * vendite appartengono al soggetto che li ha fatti. La copia è un soggetto
   * nuovo, e nasce senza passato.
   */
  async duplicate(tenantId: string, id: string): Promise<{ readonly id: string }> {
    const original = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      include: { party: true },
    });
    if (!original) {
      throw new NotFoundException('Cliente non trovato.');
    }

    return this.prisma.$transaction(async (tx) => {
      const code = await this.allocateNextCustomerCode(tx, tenantId);
      const party = await tx.party.create({
        data: partyDuplicateData(original.party, tenantId),
      });
      const copia = await tx.customer.create({
        data: {
          tenantId,
          partyId: party.id,
          code,
          isActive: original.isActive,
          // Le condizioni commerciali SI copiano: sono il motivo per cui si
          // duplica invece di creare da zero.
          customerDiscount: original.customerDiscount,
          paymentMethod: original.paymentMethod,
          paymentTerms: original.paymentTerms,
          transportResponsible: original.transportResponsible,
          documentCreationAlert: original.documentCreationAlert,
          documentCreationNote: original.documentCreationNote,
          commercialNotes: original.commercialNotes,
          // ⛔ \`shopifyCustomerId\` NO: quel legame è dell'originale, e il canale
          //    non conosce la copia.
        },
        select: { id: true },
      });
      return copia;
    });
  }
`,
);

sost('api/src/customers/customers.service.ts', [
  [
    `import { PrismaService } from '../prisma/prisma.service';`,
    `import { partyDuplicateData } from '../common/party-duplicate.util';
import { PrismaService } from '../prisma/prisma.service';`,
  ],
]);

sost('api/src/customers/customers.controller.ts', [
  [
    `  @Delete(':id')`,
    `  /**
   * ⭐ **Duplica**: una scheda nuova col prossimo codice, che si apre per
   * rifinirla. Partita IVA e codice fiscale non si copiano — vedi il servizio.
   */
  @Post(':id/duplicate')
  duplicate(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<{ readonly id: string }> {
    return this.customers.duplicate(tenantId, id);
  }

  @Delete(':id')`,
  ],
]);

// ══ FORNITORI ═════════════════════════════════════════════════════════════
aggiungiMetodo(
  'api/src/supplier-orders/suppliers.service.ts',
  `
  /**
   * ⭐ **Duplica la scheda fornitore**, con la stessa forma dei clienti e dei
   * prodotti: copia con codice proprio, che si apre per rifinirla.
   *
   * ⛔ **Partita IVA e codice fiscale non si copiano** (\`partyDuplicateData\`).
   *
   * ⚠️ **Non si copiano i legami prodotto-fornitore**: dicono «questo articolo lo
   * compro da lui a questo prezzo», e sono un'affermazione sul fornitore
   * originale — non su una scheda appena creata di cui non si è ancora comprato
   * niente.
   */
  async duplicate(tenantId: string, id: string): Promise<{ readonly id: string }> {
    const original = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
      include: { party: true },
    });
    if (!original) {
      throw new NotFoundException('Fornitore non trovato');
    }

    return this.prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: partyDuplicateData(original.party, tenantId),
      });
      const copia = await tx.supplier.create({
        data: {
          tenantId,
          partyId: party.id,
          isActive: original.isActive,
          defaultVatCodeId: original.defaultVatCodeId,
          paymentTerms: original.paymentTerms,
          freightTerms: original.freightTerms,
        },
        select: { id: true },
      });
      return copia;
    });
  }
`,
);

sost('api/src/supplier-orders/suppliers.service.ts', [
  [
    `import { PrismaService } from '../prisma/prisma.service';`,
    `import { partyDuplicateData } from '../common/party-duplicate.util';
import { PrismaService } from '../prisma/prisma.service';`,
  ],
]);

sost('api/src/supplier-orders/suppliers.controller.ts', [
  [
    `  @Delete(':id')`,
    `  /**
   * ⭐ **Duplica**: una scheda nuova che si apre per rifinirla. Partita IVA e
   * codice fiscale non si copiano — vedi il servizio.
   */
  @Post(':id/duplicate')
  duplicate(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<{ readonly id: string }> {
    return this.suppliers.duplicate(tenantId, id);
  }

  @Delete(':id')`,
  ],
]);
