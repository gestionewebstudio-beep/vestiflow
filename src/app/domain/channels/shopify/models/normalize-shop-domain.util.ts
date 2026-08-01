/** Normalizza URL o dominio incollato dall'utente in `nome.myshopify.com`. */
export function normalizeShopDomainInput(shop: string): string {
  let value = shop.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '');
  value = value.split('/')[0] ?? value;
  value = value.replace(/\.$/, '');
  if (!value.endsWith('.myshopify.com')) {
    value = `${value}.myshopify.com`;
  }
  return value;
}
