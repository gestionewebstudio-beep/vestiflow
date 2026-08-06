import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Cifratura simmetrica del token OAuth Shopify a riposo.
 * La chiave deriva da SHOPIFY_TOKEN_ENCRYPTION_KEY (env, mai in repo).
 */
@Injectable()
export class ShopifyCryptoService {
  private readonly key: Buffer | null;

  constructor(private readonly config: ConfigService) {
    const secret = this.config.get<string>('SHOPIFY_TOKEN_ENCRYPTION_KEY');
    this.key = secret ? scryptSync(secret, 'vestiflow-shopify-token', 32) : null;
  }

  isConfigured(): boolean {
    return this.key !== null;
  }

  encrypt(plainText: string): string {
    if (!this.key) {
      throw new ServiceUnavailableException('Cifratura token Shopify non configurata');
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(payload: string): string {
    if (!this.key) {
      throw new ServiceUnavailableException('Cifratura token Shopify non configurata');
    }
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new ServiceUnavailableException('Token Shopify corrotto');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
