import { IsString, MaxLength, MinLength } from 'class-validator';

/** Rinomina di un allegato: cambia solo il nome mostrato, mai i byte. */
export class RenameAttachmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;
}
