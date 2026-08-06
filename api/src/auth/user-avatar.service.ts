import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import {
  assertUploadImageMimeAndMagicBytes,
  AVATAR_IMAGE_MAX_EDGE_PX,
  AVATAR_IMAGE_WEBP_QUALITY,
  optimizeUploadedImageToWebp,
} from '../common/upload/image-optimize.util';
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

    const optimized = await optimizeUploadedImageToWebp(file.buffer, {
      maxEdgePx: AVATAR_IMAGE_MAX_EDGE_PX,
      quality: AVATAR_IMAGE_WEBP_QUALITY,
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        stores: true,
        tenant: { select: { name: true, channelProfile: true } },
        locations: { include: { location: { select: { id: true, name: true } } } },
        defaultLocation: { select: { id: true, name: true } },
      },
    });
    if (!user) {
      throw new BadRequestException('Utente non trovato');
    }

    const storagePath = `${user.tenantId}/${user.id}/${randomUUID()}.${optimized.extension}`;

    const { error: uploadError } = await client.storage
      .from(this.bucket)
      .upload(storagePath, optimized.buffer, {
        contentType: optimized.contentType,
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
      include: {
        stores: true,
        tenant: { select: { name: true, channelProfile: true } },
        locations: { include: { location: { select: { id: true, name: true } } } },
        defaultLocation: { select: { id: true, name: true } },
      },
    });

    this.profileCache.invalidate(authUserId);
    return toUserProfileDto(updated, this.platformAdmin.isPlatformAdmin(updated.email));
  }

  async removeAvatar(userId: string, authUserId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        stores: true,
        tenant: { select: { name: true, channelProfile: true } },
        locations: { include: { location: { select: { id: true, name: true } } } },
        defaultLocation: { select: { id: true, name: true } },
      },
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
      include: {
        stores: true,
        tenant: { select: { name: true, channelProfile: true } },
        locations: { include: { location: { select: { id: true, name: true } } } },
        defaultLocation: { select: { id: true, name: true } },
      },
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
    assertUploadImageMimeAndMagicBytes(file.buffer, file.mimetype, ALLOWED_MIME);
  }

  private publicObjectUrl(storagePath: string): string {
    const base = this.config.get<string>('SUPABASE_URL')?.replace(/\/$/, '');
    if (!base) {
      throw new ServiceUnavailableException('SUPABASE_URL non configurato');
    }
    return `${base}/storage/v1/object/public/${this.bucket}/${storagePath}`;
  }
}
