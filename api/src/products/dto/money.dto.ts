import { IsNumber, IsString, Length, Min } from 'class-validator';

/**
 * Denaro in unità minori (§sei decimali). NON più intero obbligato: un importo
 * nato da uno scorporo IVA porta una coda decimale — fino a 4 cifre di
 * centesimo, cioè 6 decimali di euro, quanto ne memorizzano le colonne
 * `NUMERIC(16,6)`. È quella coda a far tornare il prezzo digitato quando lo si
 * rimostra ivato.
 *
 * Oltre le 4 cifre si rifiuta: non sarebbe precisione, sarebbe il rumore di un
 * calcolo che qualcuno ha lasciato passare senza arrotondare.
 */
export class MoneyDto {
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  amountMinor!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;
}
