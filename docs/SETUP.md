# Panduan Setup Proyek ScoutNote

Dokumen ini memuat panduan persiapan lingkungan pengembangan, konfigurasi variabel lingkungan, verifikasi integrasi komponen eksternal (Exa MCP, LLM, dan PostgreSQL), serta langkah troubleshooting.

---

## 1. Prasyarat & Versi Tool

Pastikan perkakas berikut telah terpasang dan dapat diakses dari terminal/shell (Git Bash atau PowerShell pada Windows):

| Perkakas | Versi Minimum | Versi Teruji | Catatan |
| --- | --- | --- | --- |
| **Node.js** | `>= 20.0.0` | `v26.12.1` | Runtime JavaScript/TypeScript utama |
| **npm** | `>= 10.0.0` | `v12.2.1` | Package manager root monorepo |
| **Git** | `>= 2.40.0` | `2.43.0.windows.1` | Version control system |
| **Docker** | `>= 24.0.0` | `29.7.2` | Kontainerisasi layanan (opsional untuk lokal DB) |
| **Python** | `>= 3.10.0` | `3.12.7` | Validasi JSON pada skrip ekspor log (perintah `python`) |
| **OpenCode** | `>= 2.0.0` | `v2.2.0` | CLI agent session management |

---

## 2. Variabel Lingkungan (`.env`)

Salin template berkas `.env.example` ke `.env` di direktori root:

```bash
cp .env.example .env
```

Daftar variabel lingkungan yang digunakan tanpa mencantumkan nilai rahasia:

| Nama Variabel | Wajib / Opsional | Deskripsi |
| --- | --- | --- |
| `EXA_API_KEY` | Wajib (untuk kuota penuh) | Kunci API Exa dari dashboard Exa AI untuk pencarian web |
| `EXA_MCP_URL` | Wajib | Endpoint Model Context Protocol Exa (default: `https://mcp.exa.ai/mcp`) |
| `LLM_BASE_URL` | Wajib | Base URL endpoint Chat Completions kompatibel OpenAI |
| `LLM_API_KEY` | Wajib | Kunci API penyedia LLM (Google AI Studio, Groq, atau OpenRouter) |
| `LLM_MODEL` | Wajib | Identifikasi model LLM aktif yang mendukung tool calling (misal: `gemini-3.5-flash-lite`) |
| `DATABASE_URL` | Wajib | URI connection string PostgreSQL (`postgresql://<user>:<password>@<host>/<database>`) |
| `DATABASE_SSL` | Wajib | Kontrol enkripsi SSL/TLS koneksi database (`true` atau `false`) |
| `MCP_BEARER_TOKEN` | Wajib | Token bearer rahasia untuk autentikasi komunikasi antarlayanan MCP ScoutNote |

> **Perhatian**: Berkas `.env` telah didaftarkan pada `.gitignore` dan **dilarang keras** di-commit ke repositori Git.

---

## 3. Skrip Pemeriksaan Lingkungan

Monorepo menyediakan skrip verifikasi otomatis di folder `scripts/` untuk memastikan seluruh dependensi dan integrasi eksternal siap digunakan:

### A. Pemeriksaan Lingkungan Lokal (`check-env.sh`)

Memeriksa versi perkakas sistem dan status kelengkapan variabel `.env` tanpa mencetak nilainya.

- **Perintah**:
  ```bash
  bash scripts/check-env.sh
  ```
- **Hasil yang Diharapkan**:
  - Semua versi tool (Node, npm, Git, Docker, Python, OpenCode) tercetak.
  - Status `.env` dilaporkan "ditemukan" dan tidak ada variabel yang kosong.

### B. Pemeriksaan Integrasi Exa MCP (`check-exa.ts`)

Menghubungkan klien MCP via `StreamableHTTPClientTransport` ke endpoint remote Exa, mendaftar tool, dan memanggil tool `web_search_exa`.

- **Perintah**:
  ```bash
  npx tsx scripts/check-exa.ts
  ```
- **Hasil yang Diharapkan**:
  - Berhasil terhubung ke endpoint Exa MCP (`https://mcp.exa.ai/mcp?tools=web_search_exa`).
  - Menampilkan tool `web_search_exa` beserta deskripsinya.
  - Mengembalikan cuplikan 500 karakter hasil pencarian web dan total panjang karakter (> 10.000 karakter).

### C. Pemeriksaan Kompatibilitas LLM & Tool Calling (`check-llm.ts`)

Menguji endpoint OpenAI-compatible LLM dengan tool calling dua putaran (pemanggilan tool `web_search` palsu lalu pengiriman hasil tool kembali untuk mendapatkan respons teks akhir).

- **Perintah**:
  ```bash
  npx tsx scripts/check-llm.ts [daftar-model-opsional...]
  ```
  *Contoh spesifik model*: `npx tsx scripts/check-llm.ts gemini-3.5-flash-lite gemini-flash-lite-latest`
- **Hasil yang Diharapkan**:
  - Putaran 1: Status HTTP 200, respons memuat objek `tool_calls` dengan nama `web_search` dan argumen JSON query.
  - Putaran 2: Status HTTP 200, model menerima pesan role `tool` dan mengembalikan jawaban akhir berupa teks.
  - Evaluasi model: `[V] LULUS`.

### D. Pemeriksaan Koneksi Database PostgreSQL (`check-db.ts`)

Menguji siklus hidup koneksi database PostgreSQL via `pg` dengan opsi SSL dinamis.

- **Perintah**:
  ```bash
  npx tsx scripts/check-db.ts
  ```
- **Hasil yang Diharapkan**:
  - Terhubung ke host database (URL disensor otomatis).
  - Eksekusi `SELECT version()` sukses mengembalikan versi server.
  - Siklus DDL/DML sukses: `CREATE TEMPORARY TABLE` -> `INSERT` -> `SELECT` (verifikasi data) -> `DROP TABLE`.
  - Pesan konfirmasi: `HASIL: SEMUA TAHAP PENGUJIAN DATABASE LULUS (OK).`

---

## 4. Rincian Teknis Komponen

### Exa MCP

- **Endpoint**: `https://mcp.exa.ai/mcp`
- **Metode Autentikasi**:
  - Header HTTP: `x-api-key: <EXA_API_KEY>` atau `Authorization: Bearer <EXA_API_KEY>`.
  - Query Parameter: `https://mcp.exa.ai/mcp?exaApiKey=<EXA_API_KEY>`.
  - OAuth: `https://mcp.exa.ai/mcp?login` (untuk klien interaktif berbasis browser).
  - Keyless: Kuota gratis terbatas untuk `web_search_exa` dan `web_fetch_exa`.
- **Daftar Tool**:
  - Default: `web_search_exa`, `web_fetch_exa`.
  - Tambahan via query `?tools=...`: `web_search_advanced_exa`, `agent_run`.
- **Referensi**: [https://github.com/exa-labs/exa-mcp-server](https://github.com/exa-labs/exa-mcp-server) | [https://docs.exa.ai/reference/exa-mcp](https://docs.exa.ai/reference/exa-mcp)

### LLM (Google Gemini OpenAI-Compatible)

- **Base URL**: `https://generativelanguage.googleapis.com/v1beta/openai/`
- **Endpoint Chat Completions**: `${LLM_BASE_URL}chat/completions`
- **Autentikasi**: Header `Authorization: Bearer <LLM_API_KEY>`
- **Hasil Verifikasi Model**:
  - `gemini-3.5-flash-lite`: **LULUS** (stabil, kuota harian besar, latensi rendah).
  - `gemini-flash-lite-latest`: **LULUS** (alias resmi model Flash Lite terbaru).
  - `gemini-2.5-flash`: **TIDAK TERSEDIA** (HTTP 404 untuk pengguna baru).
  - `gemini-3.5-flash`: **TERBATAS** (HTTP 429 pada Free Tier akun baru karena limit 20 RPD).
- **Batas Penggunaan Free Tier**:
  - Flash-Lite: 15–30 RPM, 250.000–1.000.000 TPM, 1.000–1.500 RPD.
  - Flash: 10–15 RPM, 250.000 TPM, 20–500 RPD.
- **Referensi**: [https://ai.google.dev/gemini-api/docs/openai](https://ai.google.dev/gemini-api/docs/openai) | [https://ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits)

### Database (PostgreSQL)

- **Penyedia Teruji**: Neon Serverless PostgreSQL (`ep-floral-hat-a184yopm-pooler.ap-southeast-1.aws.neon.tech`)
- **Versi Engine**: PostgreSQL 18.6
- **Pengaturan SSL**:
  - `DATABASE_SSL=true`
  - Konfigurasi `pg.Client`: `ssl: { rejectUnauthorized: false }` untuk validasi sertifikat serverless proxy.

---

## 5. Panduan Troubleshooting

### A. Troubleshooting Lingkungan (`check-env.sh`)

1. **Python tidak ditemukan di Windows**:
   - Penyebab: Windows App Execution Aliases mencegat perintah `python.exe`.
   - Solusi: Nonaktifkan App Installer alias di *Settings > Apps > Advanced app settings > App execution aliases*, atau gunakan Anaconda / path instalasi Python mandiri.
2. **Variabel `.env` kosong**:
   - Penyebab: Nilai belum diisi setelah menyalin `.env.example`.
   - Solusi: Buka `.env` dan isi variabel yang dilaporkan kosong oleh skrip.

### B. Troubleshooting Exa MCP (`check-exa.ts`)

1. **Error 401 Unauthorized**:
   - Kunci `EXA_API_KEY` tidak valid atau kedaluwarsa. Periksa kembali kunci di [dashboard Exa](https://dashboard.exa.ai/api-keys).
2. **Error 429 Rate Limit**:
   - Kuota pencarian Exa publik habis. Masukkan API key berbayar/terdaftar pada `EXA_API_KEY`.
3. **Connection Timeout**:
   - Terjadi kendala rute jaringan ke `mcp.exa.ai`. Pastikan koneksi internet stabil atau nonaktifkan VPN/firewall yang memblokir SSE.

### C. Troubleshooting LLM (`check-llm.ts`)

1. **Error 404 Not Found**:
   - Nama model di `LLM_MODEL` salah atau sudah didepresiasi oleh Google (misal: `gemini-2.5-flash`). Ubah menjadi `gemini-3.5-flash-lite` atau `gemini-flash-lite-latest`.
2. **Error 429 Quota Exceeded (RESOURCE_EXHAUSTED)**:
   - Batas permintaan harian (RPD) pada tier gratis habis (misal limit 20 RPD pada varian Gemini 3.5 Flash). Beralihlah ke model `gemini-3.5-flash-lite` yang memiliki kuota 1.000–1.500 RPD, atau tunggu reset kuota harian (tengah malam waktu Pacific).
3. **Error 503 Service Unavailable / Spikes**:
   - Server Google sedang mengalami lonjakan beban sesaat. Skrip telah dilengkapi mekanisme auto-retry berjarak 2 detik.
4. **Error 401 Unauthorized**:
   - Header Authorization atau `LLM_API_KEY` tidak sah. Periksa kunci pada Google AI Studio.

### D. Troubleshooting Database (`check-db.ts`)

1. **Error SSL / `no pg_hba.conf entry`**:
   - Penyedia serverless (seperti Neon) mewajibkan SSL. Pastikan `DATABASE_SSL=true` ada di `.env`.
2. **Error 28P01 Password Authentication Failed**:
   - Kredensial username atau password pada `DATABASE_URL` salah. Salin ulang URI koneksi dari dashboard database.
3. **Error ENOTFOUND / ECONNREFUSED**:
   - Host database tidak dapat dijangkau. Periksa status cluster database (apakah sedang dalam keadaan suspended/sleeping) dan periksa DNS jaringan.
