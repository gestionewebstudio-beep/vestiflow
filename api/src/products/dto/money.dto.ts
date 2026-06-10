import { IsInt, IsString, Length, Min } from 'class-validator';

/** Denaro in unità minori intere (regole-gestionale: mai float). */
export class MoneyDto {
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;
}
