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
      const res = await this.db.client.from('student_rewards').select('coins, badges').eq('student_id', id).limit(1);
      const row = (res && (res as any).data && (res as any).data[0]) || { coins: 0, badges: [] };
      return row;
    } catch (e) {
      return { coins: 0, badges: [] };
    }
  }

  @Post('redeem')
  @UseGuards(AuthGuard)
  async redeem(@Req() req: any, @Body() body: any) {
    try {
      // mock redeem: insert into redemptions table
      const rec = { student_id: body.studentId || req.studentId, reward_id: body.rewardId, created_at: new Date().toISOString() };
      await this.db.client.from('redemptions').insert([rec]);
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}
