import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Corpo facoltativo dello spostamento nel cestino.
 *
 * ⚠️ **Il motivo NON e' obbligatorio**, e non e' una dimenticanza: `docs/24`
 *    §1.1 chiede la reversibilita' e il doppio avviso per l'eliminazione
 *    definitiva, non una causale per il cestino. Imporla qui costringerebbe a
 *    scrivere qualcosa per un'operazione che si annulla in un clic.
 */
export class TrashProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly reason?: string;
}
