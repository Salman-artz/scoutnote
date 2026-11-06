# ScoutNote

ScoutNote adalah monorepo sistem catatan cerdas terintegrasi yang menghubungkan asisten chatbot mobile (Expo / React Native) ke dua server Model Context Protocol (MCP): **MCP A** (Exa Search remote untuk pembacaan web) dan **MCP B** (server internal kustom untuk persistensi catatan ke PostgreSQL).

---

## Prasyarat

- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`
- **Git**: `>= 2.40.0`
- **PostgreSQL**: PostgreSQL 16+ (lokal atau cloud seperti Neon Serverless)
- **API Keys**: Google Gemini API key (`LLM_API_KEY`) dan Exa API key (`EXA_API_KEY`)

---

## Cara Menjalankan Proyek

### 1. Kloning dan Konfigurasi Lingkungan

Salin template variabel lingkungan di root repositori:

```bash
cp .env.example .env
```

Buka berkas `.env` dan lengkapi nilai variabel yang diperlukan (`LLM_API_KEY`, `EXA_API_KEY`, `DATABASE_URL`, `MCP_BEARER_TOKEN`).

### 2. Instalasi Dependensi

Jalankan instalasi dependensi pada setiap paket layanan:

```bash
# Instalasi root helper scripts
npm install

# Instalasi service backend MCP Notes
cd mcp-notes && npm install && cd ..

# Instalasi service Gateway
cd gateway && npm install && cd ..

# Instalasi frontend mobile Expo
cd app && npm install && cd ..
```

### 3. Menjalankan Layanan (Development Mode)

Buka 3 terminal terpisah untuk menjalankan masing-masing komponen:

#### Terminal 1: MCP Notes Service
```bash
cd mcp-notes
npm run dev
# Berjalan di http://localhost:3001
```

#### Terminal 2: Gateway Orchestrator
```bash
cd gateway
npm run dev
# Berjalan di http://localhost:3000
```

#### Terminal 3: Mobile App (Expo)
```bash
cd app
npm start
# Tekan 'w' untuk web, 'a' untuk Android, 'i' untuk iOS, atau scan QR code via Expo Go
```

---

## Skrip Verifikasi & Health Check

Proyek dilengkapi skrip otomatis di folder `scripts/` untuk memverifikasi setiap komponen:

```bash
# Periksa status perkakas dan variabel .env
bash scripts/check-env.sh

# Verifikasi koneksi MCP Exa Search remote
npx tsx scripts/check-exa.ts

# Verifikasi kompatibilitas tool calling LLM (Gemini)
npx tsx scripts/check-llm.ts gemini-3.5-flash-lite

# Verifikasi koneksi dan query siklus hidup PostgreSQL
npx tsx scripts/check-db.ts
```

---

## Dokumentasi Arsitektur & Spesifikasi

- **Spesifikasi Teknis**: [`SPEC.md`](SPEC.md)
- **Product Requirement Document**: [`docs/PRD.md`](docs/PRD.md)
- **Sistem Desain & Token UI**: [`docs/DESIGN.md`](docs/DESIGN.md)
- **Panduan Setup Terpadu**: [`docs/SETUP.md`](docs/SETUP.md)
- **Panduan Pemecahan Masalah**: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)
