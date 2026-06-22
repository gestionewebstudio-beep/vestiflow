import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { AuthProfileCacheService } from './auth-profile-cache.service';
import { toUserProfileDto, type UserProfileDto } from './dto/user-profile.dto';
import { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import { SupabaseService } from './supabase.service';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class UserAvatarService {
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly profileCache: AuthProfileCacheService,
    private readonly platformAdmin: PlatformAdminService,
  ) {
    this.bucket = this.config.get<string>('SUPABASE_USER_AVATARS_BUCKET') ?? 'user-avatars';
  }

  async uploadAvatar(
    userId: string,
    authUserId: string,
    file: Express.Multer.File,
  ): Promise<UserProfileDto> {
    this.assertValidFile(file);

    const client = this.supabase.getStorageClient();
    if (!client) {
      throw new ServiceUnavailableException(
        'Storage avatar non configurato. Crea il bucket user-avatars in Supabase.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { stores: true, tenant: { select: { name: true, channelProfile: true } } },
    });
    if (!user) {
      throw new BadRequestException('Utente non trovato');
    }

    const ext = this.extensionForMime(file.mimetype);
    const storagePath = `${user.tenantId}/${user.id}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from(this.bucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      throw new InternalServerErrorException(
        `Caricamento foto profilo non riuscito: ${uploadError.message.slice(0, 200)}`,
      );
    }

    const publicUrl = this.publicObjectUrl(storagePath);

    if (user.avatarStoragePath) {
      await client.storage.from(this.bucket).remove([user.avatarStoragePath]);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl: publicUrl,
        avatarStoragePath: storagePath,
      },
      include: { stores: true, tenant: { select: { name: true, channelProfile: true } } },
    });

    this.profileCache.invalidate(authUserId);
    return toUserProfileDto(updated, this.platformAdmin.isPlatformAdmin(updated.email));
  }

  async removeAvatar(userId: string, authUserId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { stores: true, tenant: { select: { name: true, channelProfile: true } } },
    });
    if (!user) {
      throw new BadRequestException('Utente non trovato');
    }

    if (user.avatarStoragePath) {
      const client = this.supabase.getStorageClient();
      if (client) {
        await client.storage.from(this.bucket).remove([user.avatarStoragePath]);
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl: null,
        avatarStoragePath: null,
      },
      include: { stores: true, tenant: { select: { name: true, channelProfile: true } } },
    });

    this.profileCache.invalidate(authUserId);
    return toUserProfileDto(updated, this.platformAdmin.isPlatformAdmin(updated.email));
  }

  private assertValidFile(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File immagine mancante');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Immagine troppo grande (max 2 MB)');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Formato non supportato. Usa JPEG, PNG o WebP.');
    }
    if (!this.matchesMagicBytes(file.buffer, file.mimetype)) {
      throw new BadRequestException("Il file non è un'immagine valida");
    }
  }

  private matchesMagicBytes(buffer: Buffer, mime: string): boolean {
    if (mime === 'image/jpeg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8;
    }
    if (mime === 'image/png') {
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    }
    if (mime === 'image/webp') {
      return (
        buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
        buffer.slice(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  }

  private extensionForMime(mime: string): string {
    switch (mime) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'bin';
    }
  }

  private publicObjectUrl(storagePath: string): string {
    const base = this.config.get<string>('SUPABASE_URL')?.replace(/\/$/, '');
    if (!base) {
      throw new ServiceUnavailableException('SUPABASE_URL non configurato');
    }
    return `${base}/storage/v1/object/public/${this.bucket}/${storagePath}`;
  }
}
