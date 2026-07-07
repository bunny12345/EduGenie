import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';

@Controller('rewards')
export class RewardsController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  async getRewards(@Query('studentId') studentId: string) {
    try {
      const res = await this.db.client.from('student_rewards').select('coins, badges').eq('student_id', studentId).limit(1);
      const row = (res && (res as any).data && (res as any).data[0]) || { coins: 0, badges: [] };
      return row;
    } catch (e) {
      return { coins: 0, badges: [] };
    }
  }

  @Post('redeem')
  async redeem(@Body() body: any) {
    try {
      // mock redeem: insert into redemptions table
      const rec = { student_id: body.studentId, reward_id: body.rewardId, created_at: new Date().toISOString() };
      await this.db.client.from('redemptions').insert([rec]);
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}
