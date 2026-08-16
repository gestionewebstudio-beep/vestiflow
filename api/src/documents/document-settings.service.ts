import { Injectable } from '@nestjs/common';
import { DocumentType, type DocumentTypeSetting } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  SETTINGS_CARD_DOCUMENT_TYPES,
  defaultTypeSetting,
  type ResolvedDocumentTypeSetting,
} from './document-defaults';
import type { UpdateDocumentTypeSettingDto } from './dto/update-document-type-setting.dto';

/**
 * Configurazione documenti abilitati e serie/numerazione per tenant (§2.2).
 * Espone sempre tutti i tipi: quelli non ancora personalizzati usano i default.
 */
@Injectable()
export class DocumentSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listResolved(tenantId: string): Promise<ResolvedDocumentTypeSetting[]> {
    const stored = await this.prisma.documentTypeSetting.findMany({ where: { tenantId } });
    const byType = new Map(stored.map((setting) => [setting.type, setting]));
    return SETTINGS_CARD_DOCUMENT_TYPES.map((type) => this.resolve(type, byType.get(type)));
  }

  async getResolved(tenantId: string, type: DocumentType): Promise<ResolvedDocumentTypeSetting> {
    const stored = await this.prisma.documentTypeSetting.findUnique({
      where: { tenantId_type: { tenantId, type } },
    });
    return this.resolve(type, stored ?? undefined);
  }

  async update(
    tenantId: string,
    type: DocumentType,
    dto: UpdateDocumentTypeSettingDto,
  ): Promise<ResolvedDocumentTypeSetting> {
    const updated = await this.prisma.documentTypeSetting.upsert({
      where: { tenantId_type: { tenantId, type } },
      create: {
        tenantId,
        type,
        ...this.sanitize(dto),
      },
      update: this.sanitize(dto),
    });
    return this.resolve(type, updated);
  }

  private sanitize(dto: UpdateDocumentTypeSettingDto): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (dto.printTitle !== undefined) data['printTitle'] = dto.printTitle.trim() || null;
    if (dto.autoNumbering !== undefined) data['autoNumbering'] = dto.autoNumbering;
    if (dto.numberPrefix !== undefined) data['numberPrefix'] = dto.numberPrefix.trim() || null;
    if (dto.defaultSeries !== undefined) data['defaultSeries'] = dto.defaultSeries.trim() || 'A';
    if (dto.defaultNotes !== undefined) data['defaultNotes'] = dto.defaultNotes.trim() || null;
    return data;
  }

  private resolve(type: DocumentType, stored?: DocumentTypeSetting): ResolvedDocumentTypeSetting {
    const defaults = defaultTypeSetting(type);
    if (!stored) {
      return defaults;
    }
    return {
      type,
      printTitle: stored.printTitle?.trim() || defaults.printTitle,
      autoNumbering: stored.autoNumbering,
      numberPrefix: stored.numberPrefix?.trim() || defaults.numberPrefix,
      defaultSeries: stored.defaultSeries || defaults.defaultSeries,
      defaultNotes: stored.defaultNotes ?? null,
    };
  }
}
