/**
 * Browser stand-in for node:sqlite's DatabaseSync, backed by sql.js (SQLite compiled to WebAssembly).
 * Covers exactly what platform/server uses: exec(), prepare().get/all/run with positional parameters.
 */
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';

let SQL: SqlJsStatic | null = null;
let initial: Uint8Array | null = null;
let current: Database | null = null;

export function configureSqlJs(sql: SqlJsStatic, restore: Uint8Array | null) { SQL = sql; initial = restore; }
export function exportDatabase(): Uint8Array | null { return current ? current.export() : null; }

const norm = (params: unknown[]): SqlValue[] => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : (p as SqlValue)));

export class DatabaseSync {
  private db: Database;
  constructor(_path?: string) {
    if (!SQL) throw new Error('sql.js not configured');
    this.db = initial ? new SQL.Database(initial) : new SQL.Database();
    initial = null;
    current = this.db;
  }
  exec(sql: string): void { this.db.exec(sql); }
  close(): void { /* the page owns the database for its whole lifetime */ }
  prepare(sql: string) {
    const db = this.db;
    const withStmt = <T>(params: unknown[], fn: (s: ReturnType<Database['prepare']>) => T): T => {
      const stmt = db.prepare(sql);
      try { stmt.bind(norm(params)); return fn(stmt); } finally { stmt.free(); }
    };
    return {
      get: (...params: unknown[]) => withStmt(params, (s) => (s.step() ? s.getAsObject() : undefined)),
      all: (...params: unknown[]) => withStmt(params, (s) => { const rows: Record<string, SqlValue>[] = []; while (s.step()) rows.push(s.getAsObject()); return rows; }),
      run: (...params: unknown[]) => {
        withStmt(params, (s) => { s.step(); });
        const changes = db.getRowsModified();
        const id = db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0] ?? 0;
        return { changes, lastInsertRowid: Number(id) };
      },
    };
  }
}
