import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: "../.env" });

const { Pool } = pg;

const sslEnabled = process.env.DATABASE_SSL === "true";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
});

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Advisory lock prevents concurrent migration race conditions on table/sequence creation
    await client.query("SELECT pg_advisory_xact_lock(7429124)");

    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        source_url TEXT,
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);

      ALTER TABLE notes ADD COLUMN IF NOT EXISTS source_url TEXT;
      ALTER TABLE notes ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
    `);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
