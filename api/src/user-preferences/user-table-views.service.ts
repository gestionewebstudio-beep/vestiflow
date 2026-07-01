import { Injectable } from '@nestjs/common';
import type { UserTableViewPreference } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { assertTableViewId } from './table-view-id.util';
import { parseAndValidateTableViewState, serializeTableViewState } from './table-view-state.util';

@Injectable()
export class UserTableViewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTableView(
    tenantId: string,
    userId: string,
    viewId: string,
  ): Promise<UserTableViewPreference | null> {
    assertTableViewId(viewId);

    const row = await this.prisma.userTableViewPreference.findUnique({
      where: {
        tenantId_userId_viewId: { tenantId, userId, viewId },
      },
    });

    if (!row) {
      return null;
    }

    try {
      const normalized = serializeTableViewState(parseAndValidateTableViewState(row.stateJson));
      if (normalized === row.stateJson) {
        return row;
      }
      return { ...row, stateJson: normalized };
    } catch {
      return null;
    }
  }

  async upsertTableView(
    tenantId: string,
    userId: string,
    viewId: string,
    stateJson: string,
  ): Promise<UserTableViewPreference> {
    assertTableViewId(viewId);
    const normalized = serializeTableViewState(parseAndValidateTableViewState(stateJson));

    return this.prisma.userTableViewPreference.upsert({
      where: {
        tenantId_userId_viewId: { tenantId, userId, viewId },
      },
      create: { tenantId, userId, viewId, stateJson: normalized },
      update: { stateJson: normalized },
    });
  }
}
