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
      const res = await this.db.client.from('student_rewards').select('*').eq('student_id', id).limit(500);
      if ((res as any)?.error) throw (res as any).error;
      const rows = ((res as any)?.data as any[]) || [];
      // student_rewards is a LEDGER: the coin balance is the SUM of coin amounts.
      // This is persisted in the DB, so it survives restarts and re-logins. Because
      // the query succeeded, we trust the DB (even with 0 rows) and do not fall back
      // to the in-memory mirror, which could otherwise mask the true balance.
      const dbCoins = rows
        .filter((r: any) => String(r.reward_type || 'coin') === 'coin')
        .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      const badges = rows
        .filter((r: any) => String(r.reward_type || '') === 'badge')
        .map((b: any) => b.label || b.reason)
        .filter(Boolean);
      const recentRewards = rows
        .slice()
        .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 6)
        .map((r: any) => ({
          id: r.id,
          type: r.reward_type || 'coin',
          label: r.label || r.reason || 'Reward',
          amount: r.amount || 0,
          createdAt: r.created_at || null
        }));
      const merged = { coins: dbCoins, badges, recentRewards };
      this.localFeed.setRewards(id, merged);
      return { success: true, coins: merged.coins, badges: merged.badges, recentRewards: merged.recentRewards };
    } catch (e) {
      // DB unreachable — serve the last known in-memory mirror.
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
      // Append a coin ledger row (persistent balance = SUM of coin amounts).
      const ins = await this.db.client
        .from('student_rewards')
        .insert([{ student_id: sid, reward_type: 'coin', amount: coins, label: reason, reason }])
        .select();
      if ((ins as any)?.error) throw (ins as any).error;

      // Recompute the authoritative balance from the ledger.
      const res = await this.db.client.from('student_rewards').select('amount,reward_type').eq('student_id', sid).limit(500);
      const rows = (res && (res as any).data) || [];
      const newBalance = (Array.isArray(rows) ? rows : [])
        .filter((r: any) => String(r.reward_type || 'coin') === 'coin')
        .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

      this.localFeed.addReward(sid, { amount: coins, reason, reward_type: 'coin' });
      this.localFeed.setRewards(sid, { ...this.localFeed.getRewards(sid), coins: newBalance });
      this.localFeed.logStudentActivity(sid, {
        type: 'reward',
        action: 'earned',
        title: `${coins} coins earned`,
        details: reason,
        meta: { coins, balance: newBalance }
      });
      return { success: true, newBalance };
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
