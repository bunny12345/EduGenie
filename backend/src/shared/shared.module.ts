import { Module } from '@nestjs/common';
import { LocalFeedService } from './local-feed.service';

@Module({
  providers: [LocalFeedService],
  exports: [LocalFeedService]
})
export class SharedModule {}