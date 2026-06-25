import { Module } from '@nestjs/common';

import { LocationLicensingService } from './location-licensing.service';

@Module({
  providers: [LocationLicensingService],
  exports: [LocationLicensingService],
})
export class LocationLicensingModule {}
