import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async search(
    @Req() req: any,
    @Query('topic') topic: string,
    @Query('level') level: string,
    @Query('page') page: string
  ) {
    try {
      const p = Math.max(parseInt(page || '1', 10), 1);
      const pageSize = 20;
      const from = (p - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = this.db.client.from('resources').select('*');
      if (topic) q = q.ilike('topic', `%${topic}%`);
      if (level) q = q.eq('level', level);
      const res = await q.range(from, to);
      const resources = ((res && (res as any).data) || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        url: r.url,
        summary: r.summary || ''
      }));
      return { success: true, resources };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'library search failed'), resources: [] };
    }
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async get(@Req() req: any, @Param('id') id: string) {
    try {
      const res = await this.db.client.from('resources').select('*').eq('id', id).limit(1);
      const row = (res && (res as any).data && (res as any).data[0]) || { id, title: 'Resource', type: 'article', url: '', summary: '' };
      this.localFeed.logStudentActivity(req.studentId, {
        type: 'library',
        action: 'opened',
        title: row.title || 'Resource',
        details: 'Opened library resource',
        meta: { resourceId: id, resourceType: row.type || 'article' }
      });
      return { success: true, resource: row };
    } catch (e) {
      this.localFeed.logStudentActivity(req.studentId, {
        type: 'library',
        action: 'opened',
        title: 'Resource',
        details: 'Opened library resource',
        meta: { resourceId: id }
      });
      return { success: false, error: String((e as any)?.message || e || 'library get failed'), resource: { id, title: 'Resource', type: 'article', url: '', summary: '' } };
    }
  }
}
