import { Module } from '@nestjs/common';

import { ShopifyModule } from '../shopify/shopify.module';
import { TikTokModule } from '../tiktok/tiktok.module';

import { ChannelSyncFacade } from './channel-sync.facade';

@Module({
  imports: [ShopifyModule, TikTokModule],
  providers: [ChannelSyncFacade],
  exports: [ChannelSyncFacade],
})
export class ChannelsModule {}
