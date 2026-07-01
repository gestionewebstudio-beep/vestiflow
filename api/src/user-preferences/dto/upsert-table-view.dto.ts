import { IsString, MaxLength } from 'class-validator';

import { MAX_TABLE_VIEW_STATE_JSON_BYTES } from '../table-view.constants';

export class UpsertTableViewDto {
  @IsString()
  @MaxLength(MAX_TABLE_VIEW_STATE_JSON_BYTES)
  stateJson!: string;
}
