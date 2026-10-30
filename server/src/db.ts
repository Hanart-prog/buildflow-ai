import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { emptyPlan, type Plan, type Project, type ProjectSummary } from '../../shared/plan';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    transcript TEXT NOT NULL DEFAULT '',
    plan JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

type Row = {
  id: string;
  name: string;
  transcript: string;
  plan: Plan;
  updated_at: Date;
};

const toProject = (row: Row): Project => ({
  id: row.id,
  name: row.name,
  transcript: row.transcript,
  plan: row.plan,
  updatedAt: row.updated_at.toISOString(),
});

// Omit dataDir for an in-memory database.
export async function openStore(dataDir?: string) {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = new PGlite(dataDir);
  await db.exec(SCHEMA);

  return {
    async list(): Promise<ProjectSummary[]> {
      const { rows } = await db.query<Row>(
        'SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC',
      );
      return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at.toISOString() }));
    },

    async get(id: string): Promise<Project | undefined> {
      const { rows } = await db.query<Row>('SELECT * FROM projects WHERE id = $1', [id]);
      return rows[0] && toProject(rows[0]);
    },

    async create(name: string): Promise<Project> {
      const { rows } = await db.query<Row>(
        'INSERT INTO projects (id, name, plan) VALUES ($1, $2, $3::jsonb) RETURNING *',
        [crypto.randomUUID(), name, JSON.stringify(emptyPlan())],
      );
      return toProject(rows[0]);
    },

    async update(
      id: string,
      fields: { name?: string; plan?: Plan; transcript?: string },
    ): Promise<Project | undefined> {
      const { rows } = await db.query<Row>(
        `UPDATE projects SET
           name = COALESCE($2, name),
           plan = COALESCE($3::jsonb, plan),
           transcript = COALESCE($4, transcript),
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [
          id,
          fields.name ?? null,
          fields.plan ? JSON.stringify(fields.plan) : null,
          fields.transcript ?? null,
        ],
      );
      return rows[0] && toProject(rows[0]);
    },

    async remove(id: string): Promise<boolean> {
      const { affectedRows } = await db.query('DELETE FROM projects WHERE id = $1', [id]);
      return (affectedRows ?? 0) > 0;
    },

    close: () => db.close(),
  };
}

export type Store = Awaited<ReturnType<typeof openStore>>;
