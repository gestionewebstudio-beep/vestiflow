import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

import { TENANT_LICENSED_LOCATION_MAX } from '../../common/tenant-location-license.constants';

export class SetLicensedLocationsDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(0)
  @ArrayMaxSize(TENANT_LICENSED_LOCATION_MAX)
  @IsUUID('4', { each: true })
  locationIds!: string[];
}
