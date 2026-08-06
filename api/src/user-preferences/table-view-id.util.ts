import { BadRequestException } from '@nestjs/common';

import { TABLE_VIEW_IDS, type TableViewId } from './table-view.constants';

const VIEW_ID_SET = new Set<string>(TABLE_VIEW_IDS);

export function assertTableViewId(viewId: string): TableViewId {
  if (!VIEW_ID_SET.has(viewId)) {
    throw new BadRequestException('viewId tabella non valido');
  }
  return viewId as TableViewId;
}
