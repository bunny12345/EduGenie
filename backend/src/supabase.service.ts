import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class SupabaseService {
  client: any;

  constructor() {
    const url = process.env.SUPABASE_URL || '';
    // Prefer service role key for server-side operations. Fall back to anon key if not available.
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const key = serviceRole || anonKey || '';
    if (url && key) {
      this.client = createClient(url, key);
    } else {
      // Development fallback: provide a minimal mock client so the server can run without Supabase
      // Methods return resolved promises shaped like Supabase responses: { data, error }
      // This keeps prototyping fast when env vars are not set.
      // WARNING: mock client does NOT persist data.
      // eslint-disable-next-line no-console
      console.warn('SUPABASE_URL or SUPABASE_ANON_KEY not set — using mock Supabase client for local dev');
      // Simple in-memory store that persists for the process lifetime and supports
      // the limited chain patterns used in this prototype: insert(...).select()
      // and select(...).eq(...)
      const store: Record<string, any[]> = {};
      const ensureTable = (t: string) => {
        if (!store[t]) store[t] = [];
      };

      this.client = {
        from: (table: string) => ({
          insert: (rows: any[]) => {
            ensureTable(table);
            const toInsert = rows.map((r) => ({ ...r }));
            store[table] = store[table].concat(toInsert);
            return {
              select: async () => ({ data: toInsert, error: null })
            };
          },
          // select returns a thenable object so it can be awaited directly or chained with .eq()
          select: (_cols?: any) => {
            const obj: any = {
              eq: async (k: string, v: any) => ({ data: (store[table] || []).filter((r) => r[k] == v), error: null })
            };
            // make thenable so `await table.select()` works
            obj.then = (resolve: any) => resolve({ data: store[table] || [], error: null });
            return obj;
          },
          // also expose selectBuilder for code that uses it
          selectBuilder: (_cols?: any) => ({
            eq: async (k: string, v: any) => ({ data: (store[table] || []).filter((r) => r[k] == v), error: null })
          }),
          upsert: async (rows: any[]) => {
            ensureTable(table);
            store[table] = store[table].concat(rows);
            return { data: rows, error: null };
          },
          update: (rows: any) => {
            ensureTable(table);
            const obj: any = {
              eq: async (k: string, v: any) => {
                store[table] = (store[table] || []).map((r) => (r[k] == v ? { ...r, ...rows } : r));
                return { data: (store[table] || []).filter((r) => r[k] == v), error: null };
              }
            };
            // make thenable so callers can await or chain .eq()
            obj.then = (resolve: any) => resolve({ data: rows, error: null });
            return obj;
          },
          delete: async () => ({ data: null, error: null })
        }),
        rpc: async () => ({ data: null, error: null })
      };
      // mark mock flag for callers
      (this.client as any).isMock = true;
    }
  }

  // Verify a Supabase JWT. Returns the decoded payload or null on failure.
  verifyJwt(token?: string) {
    if (!token) return null;
    const t = token.replace(/^Bearer\s+/i, '');
    const secret = process.env.SUPABASE_JWT_SECRET;
    try {
      if (secret) {
        // Verify signature when the project JWT secret is available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = (jwt as any).verify(t, secret as string);
        return payload;
      }
      // No secret available (dev). Decode without verification for local flows.
      // WARNING: this is insecure and only intended for local/dev without SUPABASE_JWT_SECRET.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decoded = (jwt as any).decode(t);
      // eslint-disable-next-line no-console
      console.warn('SUPABASE_JWT_SECRET not set — JWT decoded without verification');
      return decoded;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('JWT verification failed', e?.message || e);
      return null;
    }
  }

  // Convenience: extract student id (sub) from token payload
  getStudentIdFromToken(token?: string) {
    const payload: any = this.verifyJwt(token || '');
    if (!payload) return null;
    return payload.sub || payload.user_id || payload.id || null;
  }
}
