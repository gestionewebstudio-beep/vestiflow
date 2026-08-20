/**
 * Fa scaricare un blob con un nome file.
 *
 * ⛔ **Era copiata in CINQUE componenti** — elenco documenti, dettaglio
 * documento, anteprima di stampa, dettaglio ordine fornitore, elenco ordini
 * cliente — e l'elenco Ordini fornitore stava per essere il sesto.
 *
 * ⚠️ **La sanificazione del nome non è cosmetica.** Un riferimento documento
 * può contenere `/` o `:`, e finiscono nel nome del file: su Windows il
 * download fallisce in silenzio, sugli altri sistemi si crea un percorso. La
 * sostituzione con `-` è la ragione principale per cui questa funzione deve
 * esistere una volta sola: cinque copie sono cinque occasioni di dimenticarla.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.replace(/[^\w\s.-]/g, '-');
  anchor.click();
  // Rilasciato subito: il click ha già avviato il download, e non revocarlo
  // lascia il blob in memoria finché la pagina non si chiude.
  URL.revokeObjectURL(url);
}
