# ScoutNote

[![CI](https://github.com/Salman-artz/scoutnote/actions/workflows/ci.yml/badge.svg)](https://github.com/Salman-artz/scoutnote/actions/workflows/ci.yml)

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

## Deployment dan Rollback

Deployment saat ini berjalan lokal melalui Docker Compose. Gateway dan MCP Notes dibangun dari Dockerfile masing-masing, sedangkan PostgreSQL memakai volume lokal.

```bash
docker compose build
docker compose up -d
docker compose ps
```

Akses lokal:

- Gateway: `http://localhost:3000`
- MCP Notes: `http://localhost:3001`
- PostgreSQL: `localhost:5432`

Tunnel atau hosting cloud belum menjadi deployment aktif. Keduanya dapat ditambahkan kemudian dengan mengarahkan gateway ke URL MCP Notes publik dan mengisi environment variable pada platform tujuan. Secret tetap disimpan di secret manager platform, bukan di workflow atau repository.

Rollback lokal memakai image/tag atau commit sebelumnya:

```bash
git checkout <commit-sebelumnya>
docker compose build --no-cache gateway mcp-notes
docker compose up -d gateway mcp-notes
```

Untuk kembali ke kode terbaru:

```bash
git checkout main
docker compose up -d --build gateway mcp-notes
```

### CI GitHub Actions

Workflow CI berjalan pada setiap push dan pull request ke `main`. Job matrix menjalankan `npm ci`, typecheck, lint, dan build/export pada `/app`, `/gateway`, dan `/mcp-notes`. Job Docker membangun image gateway dan MCP Notes memakai Node.js 20, sama dengan Dockerfile. CI tidak memanggil Exa, LLM, database cloud, atau endpoint yang membutuhkan secret.


Cara memastikan run pertama lulus:

1. Push commit ini ke branch `main`, atau buka pull request menuju `main`.
2. Buka tab **Actions** di repository GitHub.
3. Pilih workflow **CI** dan run terbaru.
4. Pastikan seluruh job matrix (`app`, `gateway`, `mcp-notes`) dan kedua job Docker berstatus hijau.
5. Jika gagal, buka job yang gagal, periksa langkah pertama berwarna merah, perbaiki commit, lalu push ulang.

## Dokumentasi Arsitektur & Spesifikasi

- **Spesifikasi Teknis**: [`SPEC.md`](SPEC.md)
- **Product Requirement Document**: [`docs/PRD.md`](docs/PRD.md)
- **Sistem Desain & Token UI**: [`docs/DESIGN.md`](docs/DESIGN.md)
- **Panduan Setup Terpadu**: [`docs/SETUP.md`](docs/SETUP.md)
- **Panduan Pemecahan Masalah**: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)
