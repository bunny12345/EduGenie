import { Controller, Get, Post, Query, Body, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('rewards')
export class RewardsController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  @UseGuards(AuthGuard)
  async getRewards(@Req() req: any, @Query('studentId') studentId: string) {
    const id = req.studentId || studentId;
    try {
      const res = await this.db.client.from('student_rewards').select('*').eq('student_id', id).limit(20);
      const rows = (res && (res as any).data) || [];
      const head = (Array.isArray(rows) && rows[0]) || { coins: 0, badges: [] };
      const recentRewards = (Array.isArray(rows) ? rows : []).slice(0, 6).map((r: any) => ({
        id: r.id,
        type: r.reward_type || 'coin',
        label: r.label || r.reason || 'Reward',
        amount: r.amount || 0,
        createdAt: r.created_at || null
      }));
      return { coins: head.coins || 0, badges: head.badges || [], recentRewards };
    } catch (e) {
      return { coins: 0, badges: [], recentRewards: [] };
    }
  }

  @Post('redeem')
  @UseGuards(AuthGuard)
  async redeem(@Req() req: any, @Body() body: any) {
    try {
      // mock redeem: insert into redemptions table
      const sid = body.studentId || req.studentId;
      const rec = { student_id: sid, reward_id: body.rewardId, created_at: new Date().toISOString() };
      await this.db.client.from('redemptions').insert([rec]);
      const balanceRes = await this.db.client.from('student_rewards').select('coins').eq('student_id', sid).limit(1);
      const row = (balanceRes && (balanceRes as any).data && (balanceRes as any).data[0]) || { coins: 0 };
      return { success: true, newBalance: row.coins || 0 };
    } catch (e) {
      return { success: false, newBalance: 0, error: String(e) };
    }
  }
}
