import { Controller, Get, Param, Query } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';

@Controller('library')
export class LibraryController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  async search(@Query('topic') topic: string, @Query('level') level: string) {
    try {
      const q = this.db.client.from('resources').select('*');
      const res = await q;
      return { resources: (res && (res as any).data) || [] };
    } catch (e) {
      return { resources: [] };
    }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    try {
      const res = await this.db.client.from('resources').select('*').eq('id', id).limit(1);
      return (res && (res as any).data && (res as any).data[0]) || { id, title: 'Resource', type: 'article', url: '' };
    } catch (e) {
      return { id, title: 'Resource', type: 'article', url: '' };
    }
  }
}
