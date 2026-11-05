import "dotenv/config";
import pg from "pg";

const { Client } = pg;

function maskDatabaseUrl(rawUrl: string): { maskedUrl: string; host: string; provider: string } {
  try {
    const parsed = new URL(rawUrl);
    const maskedUser = parsed.username ? `${parsed.username.slice(0, 2)}***` : "***";
    const maskedUrl = `${parsed.protocol}//${maskedUser}:****@${parsed.host}${parsed.pathname}`;
    const host = parsed.hostname;

    let provider = "Generic PostgreSQL";
    if (host.includes("neon.tech")) provider = "Neon Serverless PostgreSQL";
    else if (host.includes("supabase.co") || host.includes("supabase.com")) provider = "Supabase PostgreSQL";
    else if (host.includes("render.com")) provider = "Render PostgreSQL";
    else if (host.includes("railway.app")) provider = "Railway PostgreSQL";
    else if (host.includes("aivencloud.com")) provider = "Aiven PostgreSQL";
    else if (host.includes("amazonaws.com")) provider = "AWS RDS PostgreSQL";
    else if (host === "localhost" || host === "127.0.0.1") provider = "Localhost PostgreSQL";

    return { maskedUrl, host, provider };
  } catch {
    return {
      maskedUrl: "postgres://***:****@unknown-host/unknown-db",
      host: "unknown-host",
      provider: "PostgreSQL",
    };
  }
}

function handlePgError(err: any, sslEnabled: boolean) {
  const code = err?.code;
  const message = err?.message || String(err);

  console.error("\n--- Diagnostik Kesalahan Koneksi Database ---");

  if (
    code === "28000" ||
    message.includes("SSL") ||
    message.includes("no pg_hba.conf entry") ||
    message.includes("SSL off") ||
    message.includes("server does not support SSL")
  ) {
    console.error(`[SSL Error]: Server database membutuhkan pengaturan SSL yang berbeda.`);
    console.error(`Status DATABASE_SSL saat ini: ${sslEnabled ? "true" : "false"}`);
    console.error(`Saran: Pastikan DATABASE_SSL=${sslEnabled ? "false" : "true"} di .env bila server ${sslEnabled ? "tidak mendukung SSL" : "mewajibkan koneksi SSL"}.`);
  } else if (code === "28P01" || message.includes("password authentication failed")) {
    console.error(`[Autentikasi Gagal]: Username atau password database salah.`);
  } else if (
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    message.includes("getaddrinfo ENOTFOUND") ||
    message.includes("connect ECONNREFUSED")
  ) {
    console.error(`[Host Tidak Terjangkau]: Tidak dapat menjangkau server PostgreSQL (${code || "Network Error"}).`);
    console.error(`Saran: Periksa koneksi internet, nama host pada DATABASE_URL, atau status aktif server database.`);
  } else if (code === "3D000" || message.includes("does not exist")) {
    console.error(`[Database Tidak Ditemukan]: Nama database pada path DATABASE_URL tidak ditemukan.`);
  } else {
    console.error(`[Database Error (${code || "UNKNOWN"})]: ${message}`);
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    console.error("Error: DATABASE_URL tidak ditemukan di file .env atau bernilai kosong.");
    process.exit(1);
  }

  const sslRaw = (process.env.DATABASE_SSL || "false").toLowerCase().trim();
  const isSSL = sslRaw === "true" || sslRaw === "1";

  const { maskedUrl, host, provider } = maskDatabaseUrl(dbUrl);

  console.log("=== ScoutNote Database Health Check ===");
  console.log(`Penyedia Terdeteksi : ${provider}`);
  console.log(`Target Host        : ${host}`);
  console.log(`URL Terenkripsi     : ${maskedUrl}`);
  console.log(`Konfigurasi SSL     : ${isSSL ? "Aktif (rejectUnauthorized: false)" : "Non-aktif"}`);
  console.log("----------------------------------------");

  const client = new Client({
    connectionString: dbUrl,
    ssl: isSSL ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 15000,
  });

  try {
    process.stdout.write("1. Menghubungkan ke database... ");
    const t0 = Date.now();
    await client.connect();
    console.log(`SUKSES (${Date.now() - t0}ms)`);

    process.stdout.write("2. Mengeksekusi SELECT version()... ");
    const verRes = await client.query("SELECT version();");
    const rawVersion = verRes.rows[0]?.version || "Tidak diketahui";
    const shortVersion = rawVersion.split(" on ")[0];
    console.log(`SUKSES\n   -> Versi Server: ${shortVersion}`);

    process.stdout.write("3. Membuat tabel sementara (temp table)... ");
    const tableName = `scoutnote_check_${Date.now()}`;
    await client.query(`
      CREATE TEMPORARY TABLE ${tableName} (
        id SERIAL PRIMARY KEY,
        test_payload TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log(`SUKSES (${tableName})`);

    process.stdout.write("4. Menyisipkan satu baris data (INSERT)... ");
    const insertRes = await client.query(
      `INSERT INTO ${tableName} (test_payload) VALUES ($1) RETURNING id, test_payload, created_at;`,
      ["koneksi_database_scoutnote_berhasil"]
    );
    const insertedRow = insertRes.rows[0];
    console.log(`SUKSES\n   -> Data Disisipkan: ID=${insertedRow.id}, Payload="${insertedRow.test_payload}"`);

    process.stdout.write("5. Membaca kembali data (SELECT)... ");
    const selectRes = await client.query(`SELECT * FROM ${tableName} WHERE id = $1;`, [insertedRow.id]);
    const readRow = selectRes.rows[0];
    if (readRow && readRow.test_payload === insertedRow.test_payload) {
      console.log(`SUKSES\n   -> Data Terverifikasi: "${readRow.test_payload}" pada ${readRow.created_at}`);
    } else {
      throw new Error("Data yang dibaca tidak sesuai dengan data yang disisipkan.");
    }

    process.stdout.write("6. Menghapus tabel sementara (DROP TABLE)... ");
    await client.query(`DROP TABLE IF EXISTS ${tableName};`);
    console.log("SUKSES");

    console.log("----------------------------------------");
    console.log("HASIL: SEMUA TAHAP PENGUJIAN DATABASE LULUS (OK).");
  } catch (err: any) {
    console.log("GAGAL");
    handlePgError(err, isSSL);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
