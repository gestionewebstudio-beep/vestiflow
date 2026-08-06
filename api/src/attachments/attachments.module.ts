import { Module } from '@nestjs/common';

import { AttachmentsService } from './attachments.service';

/**
 * Sottosistema Allegati generico (riusabile). Espone il solo service: gli
 * endpoint restano sui controller delle entità (documenti, ordini) così i
 * rispettivi gate di accesso/permessi/scope-location non vengono aggirati.
 */
@Module({
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
