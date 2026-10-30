import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { emptyPlan, type Plan, type Project, type ProjectSummary, type User } from '../../shared/plan';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    transcript TEXT NOT NULL DEFAULT '',
    plan JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_id TEXT UNIQUE;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  );
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users (id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS projects_owner ON projects (owner_id);
`;

type Row = {
  id: string;
  name: string;
  transcript: string;
  plan: Plan;
  share_id: string | null;
  updated_at: Date;
};

const toProject = (row: Row): Project => ({
  id: row.id,
  name: row.name,
  transcript: row.transcript,
  plan: row.plan,
  shareId: row.share_id,
  updatedAt: row.updated_at.toISOString(),
});

// Omit dataDir for an in-memory database.
export async function openStore(dataDir?: string) {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = new PGlite(dataDir);
  await db.exec(SCHEMA);

  return {
    async list(ownerId: string): Promise<ProjectSummary[]> {
      const { rows } = await db.query<Row>(
        'SELECT id, name, updated_at FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC',
        [ownerId],
      );
      return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at.toISOString() }));
    },

    async get(id: string, ownerId: string): Promise<Project | undefined> {
      const { rows } = await db.query<Row>('SELECT * FROM projects WHERE id = $1 AND owner_id = $2', [
        id,
        ownerId,
      ]);
      return rows[0] && toProject(rows[0]);
    },

    async create(name: string, ownerId: string): Promise<Project> {
      const { rows } = await db.query<Row>(
        'INSERT INTO projects (id, name, plan, owner_id) VALUES ($1, $2, $3::jsonb, $4) RETURNING *',
        [crypto.randomUUID(), name, JSON.stringify(emptyPlan()), ownerId],
      );
      return toProject(rows[0]);
    },

    async update(
      id: string,
      ownerId: string,
      fields: { name?: string; plan?: Plan; transcript?: string },
    ): Promise<Project | undefined> {
      const { rows } = await db.query<Row>(
        `UPDATE projects SET
           name = COALESCE($2, name),
           plan = COALESCE($3::jsonb, plan),
           transcript = COALESCE($4, transcript),
           updated_at = now()
         WHERE id = $1 AND owner_id = $5 RETURNING *`,
        [
          id,
          fields.name ?? null,
          fields.plan ? JSON.stringify(fields.plan) : null,
          fields.transcript ?? null,
          ownerId,
        ],
      );
      return rows[0] && toProject(rows[0]);
    },

    async getShared(shareId: string): Promise<Project | undefined> {
      const { rows } = await db.query<Row>('SELECT * FROM projects WHERE share_id = $1', [shareId]);
      return rows[0] && toProject(rows[0]);
    },

    // Keeps an existing link working, and null turns sharing off.
    async setShare(id: string, ownerId: string, enabled: boolean): Promise<Project | undefined> {
      const { rows } = await db.query<Row>(
        enabled
          ? 'UPDATE projects SET share_id = COALESCE(share_id, $3) WHERE id = $1 AND owner_id = $2 RETURNING *'
          : 'UPDATE projects SET share_id = NULL WHERE id = $1 AND owner_id = $2 RETURNING *',
        enabled ? [id, ownerId, crypto.randomUUID()] : [id, ownerId],
      );
      return rows[0] && toProject(rows[0]);
    },

    async remove(id: string, ownerId: string): Promise<boolean> {
      const { affectedRows } = await db.query('DELETE FROM projects WHERE id = $1 AND owner_id = $2', [
        id,
        ownerId,
      ]);
      return (affectedRows ?? 0) > 0;
    },

    // Undefined when the email is taken. Projects from before accounts existed
    // have no owner, and go to the very first account.
    async createUser(email: string, passwordHash: string): Promise<User | undefined> {
      return db.transaction(async (tx) => {
        const { rows } = await tx.query<User>(
          `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)
           ON CONFLICT (email) DO NOTHING RETURNING id, email`,
          [crypto.randomUUID(), email, passwordHash],
        );
        if (rows[0]) {
          await tx.query(
            `UPDATE projects SET owner_id = $1
             WHERE owner_id IS NULL AND (SELECT count(*) FROM users) = 1`,
            [rows[0].id],
          );
        }
        return rows[0];
      });
    },

    async findUser(email: string) {
      const { rows } = await db.query<User & { password_hash: string }>(
        'SELECT id, email, password_hash FROM users WHERE email = $1',
        [email],
      );
      return rows[0];
    },

    async createSession(tokenHash: string, userId: string, expiresAt: Date) {
      await db.query('DELETE FROM sessions WHERE expires_at <= now()');
      await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
        tokenHash,
        userId,
        expiresAt.toISOString(),
      ]);
    },

    async sessionUser(tokenHash: string): Promise<User | undefined> {
      const { rows } = await db.query<User>(
        `SELECT users.id, users.email FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE token_hash = $1 AND expires_at > now()`,
        [tokenHash],
      );
      return rows[0];
    },

    async deleteSession(tokenHash: string) {
      await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },

    close: () => db.close(),
  };
}

export type Store = Awaited<ReturnType<typeof openStore>>;
