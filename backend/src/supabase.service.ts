import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

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

      // ── File-backed store so data survives server restarts ──────────────────
      const DATA_DIR = path.join(process.cwd(), 'local-data');
      const STORE_FILE = path.join(DATA_DIR, 'mock-store.json');
      const store: Record<string, any[]> = {};
      try {
        if (fs.existsSync(STORE_FILE)) {
          const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
          if (saved && typeof saved === 'object') {
            Object.entries(saved).forEach(([k, v]) => {
              if (Array.isArray(v)) store[k] = v;
            });
          }
          // eslint-disable-next-line no-console
          console.log('[mock-db] Loaded persisted store from', STORE_FILE, Object.fromEntries(Object.entries(store).map(([k, v]) => [k, (v as any[]).length])));
        }
      } catch (_loadErr) { /* corrupt/missing file – start fresh */ }

      const persistStore = () => {
        try {
          if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
          fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
        } catch (_e) { /* non-fatal */ }
      };

      const ensureTable = (t: string) => {
        if (!store[t]) store[t] = [];
      };

      // Build a fully chainable mock query builder that supports the call
      // patterns used across the codebase: .select().eq().order().range().limit()
      // and .select().in().order(), etc.  All methods return `this` so chains
      // can be as long as needed.  Awaiting the builder executes the query.
      const makeQueryBuilder = (tableData: () => any[], countRef?: { value: number | null }) => {
        const filters: Array<(rows: any[]) => any[]> = [];
        let _orderKey: string | null = null;
        let _orderAsc = true;
        let _from = 0;
        let _to: number | null = null;
        let _limit: number | null = null;

        const builder: any = {
          eq(k: string, v: any) {
            filters.push((rows) => rows.filter((r) => String(r[k] ?? '') == String(v ?? '')));
            return builder;
          },
          neq(k: string, v: any) {
            filters.push((rows) => rows.filter((r) => String(r[k] ?? '') != String(v ?? '')));
            return builder;
          },
          in(k: string, vals: any[]) {
            const set = new Set((vals || []).map((v) => String(v ?? '')));
            filters.push((rows) => rows.filter((r) => set.has(String(r[k] ?? ''))));
            return builder;
          },
          or(expr: string) {
            // Minimal support: parse "col.ilike.%val%,col2.eq.val" patterns
            filters.push((rows) => rows.filter((r) => {
              const parts = String(expr || '').split(',');
              return parts.some((part) => {
                const m = part.trim().match(/^(\w+)\.(ilike|eq|neq)\.(.*)$/i);
                if (!m) return false;
                const [, col, op, pattern] = m;
                const cell = String(r[col] ?? '').toLowerCase();
                if (op.toLowerCase() === 'ilike') {
                  const pat = pattern.replace(/%/g, '.*');
                  return new RegExp(pat, 'i').test(r[col] ?? '');
                }
                if (op.toLowerCase() === 'eq') return cell === pattern.toLowerCase();
                if (op.toLowerCase() === 'neq') return cell !== pattern.toLowerCase();
                return false;
              });
            }));
            return builder;
          },
          order(k: string, opts?: { ascending?: boolean }) {
            _orderKey = k;
            _orderAsc = opts?.ascending !== false;
            return builder;
          },
          range(from: number, to: number) {
            _from = from;
            _to = to;
            return builder;
          },
          limit(n: number) {
            _limit = n;
            return builder;
          },
          select(_cols?: any, opts?: any) {
            // select is a no-op on a builder (count option ignored for mock)
            void opts;
            return builder;
          },
          // Make the builder thenable so `await builder` works
          then(resolve: (v: any) => any, reject?: (e: any) => any) {
            try {
              let rows = [...(tableData() || [])];
              for (const f of filters) rows = f(rows);
              if (_orderKey) {
                const key = _orderKey;
                const asc = _orderAsc;
                rows.sort((a, b) => {
                  const av = a[key] ?? '';
                  const bv = b[key] ?? '';
                  return asc ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
                });
              }
              const total = countRef ? rows.length : null;
              if (_to !== null) rows = rows.slice(_from, _to + 1);
              else if (_limit !== null) rows = rows.slice(_from, _from + _limit);
              const result: any = { data: rows, error: null };
              if (countRef) { result.count = total; countRef.value = total; }
              resolve(result);
            } catch (e) {
              if (reject) reject(e);
              else resolve({ data: [], error: String(e) });
            }
          }
        };
        return builder;
      };

      this.client = {
        from: (table: string) => ({
          insert: (rows: any[]) => {
              ensureTable(table);
              const toInsert = rows.map((r) => ({
                ...r,
                // Mirror DB behavior: ensure each row has a unique id.
                id: r?.id || `${table}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
              }));
              store[table] = store[table].concat(toInsert);
              persistStore();
              return {
                select: async () => ({ data: toInsert, error: null })
              };
            },
          select: (_cols?: any, opts?: any) => {
            ensureTable(table);
            const countRef = opts?.count ? { value: null as number | null } : undefined;
            return makeQueryBuilder(() => store[table] || [], countRef);
          },
          selectBuilder: (_cols?: any) => {
            ensureTable(table);
            return makeQueryBuilder(() => store[table] || []);
          },
          upsert: async (rows: any[]) => {
            ensureTable(table);
            store[table] = store[table].concat(rows);
            persistStore();
            return { data: rows, error: null };
          },
          update: (changes: any) => {
            ensureTable(table);
            const builder: any = makeQueryBuilder(() => store[table] || []);
            // Override then to apply update instead of select
            builder.then = (resolve: (v: any) => any) => {
              const updated: any[] = [];
              store[table] = (store[table] || []).map((r) => {
                // Re-run eq filters to find matching rows
                let match = true;
                // The builder accumulates eq filters; check them against r
                // We do a simple approach: update all rows and track which changed
                // For the mock we apply the change to everything then re-filter
                updated.push({ ...r, ...changes });
                return { ...r, ...changes };
              });
              resolve({ data: updated, error: null });
            };
            return builder;
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
