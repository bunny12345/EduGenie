import { Controller, Get, Post, Query, Body, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';

@Controller('rewards')
export class RewardsController {
  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService
  ) {}

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
      const fallback = this.localFeed.getRewards(id);
      const merged = {
        coins: Math.max(Number(head.coins || 0), Number(fallback.coins || 0)),
        badges: Array.isArray(head.badges) && head.badges.length ? head.badges : (fallback.badges || []),
        recentRewards: recentRewards.length ? recentRewards : (fallback.recentRewards || [])
      };
      this.localFeed.setRewards(id, merged);
      return { success: true, coins: merged.coins, badges: merged.badges, recentRewards: merged.recentRewards };
    } catch (e) {
      const fallback = this.localFeed.getRewards(id);
      return {
        success: true,
        error: String((e as any)?.message || e || 'rewards failed'),
        coins: fallback.coins || 0,
        badges: fallback.badges || [],
        recentRewards: fallback.recentRewards || []
      };
    }
  }

  @Post('earn')
  @UseGuards(AuthGuard)
  async earn(@Req() req: any, @Body() body: any) {
    const sid = body.studentId || req.studentId;
    const coins = Math.max(1, Math.min(1000, Number(body.coins || 10)));
    const reason = String(body.reason || 'Activity reward').slice(0, 200);
    try {
      // Upsert: add coins to existing row or insert new
      const existing = await this.db.client.from('student_rewards').select('id,coins').eq('student_id', sid).limit(1);
      const row = (existing as any)?.data?.[0] || null;
      if (row) {
        const newCoins = (Number(row.coins) || 0) + coins;
        await this.db.client.from('student_rewards').update({ coins: newCoins }).eq('id', row.id);
        this.localFeed.addReward(sid, { amount: coins, reason, reward_type: 'coin' });
        this.localFeed.logStudentActivity(sid, {
          type: 'reward',
          action: 'earned',
          title: `${coins} coins earned`,
          details: reason,
          meta: { coins, balance: newCoins }
        });
        return { success: true, newBalance: newCoins };
      } else {
        const ins = await this.db.client
          .from('student_rewards')
          .insert([{ student_id: sid, coins, badges: [], label: reason, reason, reward_type: 'coin', amount: coins }])
          .select();
        const newRow = (ins as any)?.data?.[0] || { coins };
        this.localFeed.addReward(sid, { amount: coins, reason, reward_type: 'coin' });
        this.localFeed.logStudentActivity(sid, {
          type: 'reward',
          action: 'earned',
          title: `${coins} coins earned`,
          details: reason,
          meta: { coins, balance: newRow.coins || coins }
        });
        return { success: true, newBalance: newRow.coins || coins };
      }
    } catch (e) {
      // Graceful: return optimistic balance on DB failure
      const next = this.localFeed.addReward(sid, { amount: coins, reason, reward_type: 'coin' });
      this.localFeed.logStudentActivity(sid, {
        type: 'reward',
        action: 'earned',
        title: `${coins} coins earned`,
        details: reason,
        meta: { coins, balance: next.coins }
      });
      return { success: true, error: String(e), newBalance: next.coins };
    }
  }

  @Post('redeem')
  @UseGuards(AuthGuard)
  async redeem(@Req() req: any, @Body() body: any) {
    try {
      const sid = body.studentId || req.studentId;
      const rec = { student_id: sid, reward_id: body.rewardId, created_at: new Date().toISOString() };
      await this.db.client.from('redemptions').insert([rec]);
      const balanceRes = await this.db.client.from('student_rewards').select('coins').eq('student_id', sid).limit(1);
      const row = (balanceRes && (balanceRes as any).data && (balanceRes as any).data[0]) || { coins: 0 };
      this.localFeed.logStudentActivity(sid, {
        type: 'reward',
        action: 'redeemed',
        title: `Reward ${body.rewardId || ''}`.trim(),
        details: 'Redeemed reward',
        meta: { rewardId: body.rewardId || null, balance: row.coins || 0 }
      });
      return { success: true, newBalance: row.coins || 0 };
    } catch (e) {
      return { success: false, newBalance: 0, error: String(e) };
    }
  }
}
