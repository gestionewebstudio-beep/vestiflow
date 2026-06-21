import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

@Injectable()
export class TikTokCryptoService {
  private readonly key: Buffer | null;

  constructor(private readonly config: ConfigService) {
    const secret = this.config.get<string>('TIKTOK_TOKEN_ENCRYPTION_KEY');
    this.key = secret ? scryptSync(secret, 'vestiflow-tiktok-token', 32) : null;
  }

  isConfigured(): boolean {
    return this.key !== null;
  }

  encrypt(plainText: string): string {
    if (!this.key) {
      throw new ServiceUnavailableException('Cifratura token TikTok non configurata');
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(payload: string): string {
    if (!this.key) {
      throw new ServiceUnavailableException('Cifratura token TikTok non configurata');
    }
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new ServiceUnavailableException('Token TikTok corrotto');
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
