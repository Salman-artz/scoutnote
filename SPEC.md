# Spesifikasi Teknis (SPEC): ScoutNote

- **Target Pengerjaan**: 1 Hari Kerja (Sprint 1-Day MVP)
- **Status**: Disetujui untuk Implementasi
- **Referensi Acuan**: `docs/PRD.md` dan `docs/DESIGN.md`

---

## 1. Scope dan Non-Goals

### 1.1 In-Scope
1. **Frontend Mobile (`/app`)**:
   - Expo (React Native + TypeScript) dengan dua layar: Layar Chat (`/chat`) dan Layar Notes (`/notes`).
   - Desain semantik Light/Dark mode berbasis `StyleSheet` murni dan `ThemeProvider` sesuai `docs/DESIGN.md`.
   - Visualisasi kartu eksekusi tool dual-MCP: badge `[MCP A: READ]` dan `[MCP B: WRITE]`.
   - Penanganan SSE (Server-Sent Events) untuk menerima token teks dan status tool secara bertahap.
2. **Backend Gateway (`/gateway`)**:
   - Express server (TypeScript) sebagai orkestrator sentral.
   - Endpoint `POST /chat` (SSE), `GET /notes`, `DELETE /notes/:id`, `GET /health`.
   - Orkestrasi multi-turn LLM via endpoint OpenAI-compatible (Google Gemini `gemini-3.5-flash-lite`).
   - Klien MCP A (remote Exa search) dan klien MCP B (internal notes server).
3. **Internal MCP Server (`/mcp-notes`)**:
   - Node.js/Express service yang mengekspos protokol MCP berbasis JSON-RPC/REST.
   - 3 Tool standar: `save_note`, `list_notes`, `delete_note`.
   - Persistensi data ke PostgreSQL (Neon Serverless / Local Postgres).
4. **Infrastruktur & Devops (`/.github`, `docker-compose.yml`)**:
   - Dockerfile per service (`gateway`, `mcp-notes`) dan `docker-compose.yml` untuk lingkungan lokal.
   - GitHub Actions workflow untuk lint, typecheck, dan automated verification tests.

### 1.2 Non-Goals
1. Autentikasi multi-tenant (OAuth/JWT/User signup).
2. Sinkronisasi data offline berbasis CRDT / WatermelonDB / SQLite lokal.
3. Notifikasi push latar belakang.
4. Voice-to-text atau pemrosesan audio/multimodal di luar teks.
5. Pembayaran atau billing rate limiter tingkat produksi.

---

## 2. Diagram Arsitektur

```mermaid
flowchart TD
    subgraph Client ["Client Tier"]
        App["Mobile App (Expo / React Native)"]
    end

    subgraph BackendGateway ["Gateway Tier (/gateway)"]
        GW["Express Gateway Orchestrator"]
        SSE["SSE Stream Handler"]
        Orch["LLM Tool Loop Controller"]
    end

    subgraph LLMProvider ["AI Provider"]
        Gemini["Google Gemini API\n(v1beta OpenAI Compatible)"]
    end

    subgraph MCPTier ["MCP Tools Tier"]
        MCPA["MCP A: Exa Remote Server\n(https://mcp.exa.ai/mcp)"]
        MCPB["MCP B: Custom Notes Server\n(/mcp-notes)"]
    end

    subgraph StorageTier ["Data Tier"]
        DB[(PostgreSQL 18\nNeon Serverless / Local)]
    end

    subgraph DevOps ["DevOps & CI/CD"]
        GHA["GitHub Actions CI\n(Lint, Typecheck, Test)"]
        Deploy["Cloud Provider Auto-Deploy\n(from main branch)"]
    end

    App <-->|POST /chat (SSE)\nGET, DELETE /notes| GW
    GW --> SSE
    GW --> Orch
    Orch <-->|chat/completions\n(multi-turn tool calling)| Gemini
    Orch <-->|Tool: web_search_exa\n(Read Web)| MCPA
    Orch <-->|Tool: save_note, list_notes\n(Write/Read Notes)| MCPB
    MCPB <-->|pg driver\n(SSL enabled)| DB

    GHA -->|Trigger on push/PR| GW
    GHA -->|Trigger on push/PR| MCPB
    GHA -->|Trigger on push/PR| App
    GHA -.->|Success| Deploy
```

---

## 3. Kontrak API: App <-> Gateway

Semua endpoint dilayani di bawah root gateway (contoh: `http://localhost:3000/api`).

### 3.1 `POST /api/chat`
Mengirim prompt dari pengguna dan menerima streaming teks beserta status eksekusi tool secara real-time via Server-Sent Events (SSE).

- **Header Masuk**: `Content-Type: application/json`, `Accept: text/event-stream`
- **Request Body**:
  ```json
  {
    "messages": [
      { "role": "user", "content": "Cari berita Expo React Native lalu simpan ringkasannya sebagai catatan" }
    ]
  }
  ```

- **Format Respons**: `Content-Type: text/event-stream; charset=utf-8`

#### Spesifikasi Event SSE:
1. **Event `token`** (potongan token teks asisten):
   ```text
   event: token
   data: {"delta": "Tentu, "}
   ```
2. **Event `tool_call`** (diterbitkan saat LLM memutuskan memanggil tool):
   ```text
   event: tool_call
   data: {
     "id": "call_abc123",
     "server": "read",
     "tool": "web_search_exa",
     "input": { "query": "Expo React Native latest news" }
   }
   ```
   *(server bernilai `'read'` untuk Exa dan `'write'` untuk aksi simpan database)*
3. **Event `tool_result`** (diterbitkan saat hasil tool diterima oleh gateway):
   ```text
   event: tool_result
   data: {
     "id": "call_abc123",
     "server": "read",
     "tool": "web_search_exa",
     "status": "success",
     "preview": "Expo SDK 58 released with native crash reporting..."
   }
   ```
4. **Event `done`** (menandakan penyelesaian alur chat):
   ```text
   event: done
   data: {
     "finish_reason": "stop",
     "message_id": "msg_fin_01"
   }
   ```
5. **Event `error`** (diterbitkan jika terjadi kegagalan tak terpulihkan):
   ```text
   event: error
   data: {
     "code": "RATE_LIMIT_EXCEEDED" | "UPSTREAM_TIMEOUT" | "INTERNAL_ERROR",
     "message": "Batas kuota layanan terlampaui. Silakan coba lagi beberapa saat."
   }
   ```

### 3.2 `GET /api/notes`
Mengambil daftar catatan tersimpan (diteruskan dari MCP B).

- **Query**: `?limit=20` (opsional)
- **Response `200 OK`**:
  ```json
  {
    "notes": [
      {
        "id": 1,
        "title": "Rangkuman Berita Expo SDK Terbaru",
        "content": "Expo SDK 58 kini mendukung native crash reporting di EAS Observe...",
        "tags": ["expo", "react-native"],
        "created_at": "2026-11-05T14:03:00.000Z",
        "updated_at": "2026-11-05T14:03:00.000Z"
      }
    ]
  }
  ```

### 3.3 `DELETE /api/notes/:id`
Menghapus catatan spesifik berdasarkan ID (diteruskan ke MCP B).

- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "id": 1,
    "message": "Catatan berhasil dihapus"
  }
  ```
- **Response `404 Not Found`**:
  ```json
  {
    "error": "Catatan dengan ID 1 tidak ditemukan"
  }
  ```

### 3.4 `GET /api/health`
Status kesiapan seluruh layanan monorepo.

- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "gateway": true,
    "mcp_notes": true,
    "database": true,
    "timestamp": "2026-11-05T14:00:00.000Z"
  }
  ```

---

## 4. Skema Database & Tool MCP B

### 4.1 Skema Tabel PostgreSQL (`notes`)
```sql
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
```

### 4.2 Skema Tool Zod (MCP B)

```ts
import { z } from "zod";

export const SaveNoteSchema = z.object({
  title: z.string().min(1, "Judul catatan tidak boleh kosong").max(255),
  content: z.string().min(1, "Konten catatan tidak boleh kosong"),
  tags: z.array(z.string()).default([]).optional(),
});

export const ListNotesSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20).optional(),
});

export const DeleteNoteSchema = z.object({
  id: z.number().int().positive("ID catatan harus berupa angka positif"),
});
```

---

## 5. Daftar Environment Variable per Layanan

| Layanan | Nama Variabel | Contoh Nilai | Keterangan |
| --- | --- | --- | --- |
| **`gateway`** | `PORT` | `3000` | Port listen server gateway |
| | `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/` | Base URL OpenAI compatibility Gemini |
| | `LLM_API_KEY` | *(Secret)* | Kunci otentikasi model AI |
| | `LLM_MODEL` | `gemini-3.5-flash-lite` | Model default yang mendukung function calling |
| | `EXA_MCP_URL` | `https://mcp.exa.ai/mcp` | Remote MCP URL Exa Search |
| | `EXA_API_KEY` | *(Secret)* | Kunci otentikasi pencarian Exa |
| | `MCP_NOTES_URL` | `http://localhost:3001` | URL endpoint lokal/internal server MCP B |
| | `MCP_BEARER_TOKEN` | *(Secret)* | Token rahasia otorisasi antarlayanan |
| **`mcp-notes`** | `PORT` | `3001` | Port listen server MCP B |
| | `DATABASE_URL` | `postgresql://...` | URI koneksi database PostgreSQL |
| | `DATABASE_SSL` | `true` | Enkripsi SSL (`rejectUnauthorized: false`) |
| | `MCP_BEARER_TOKEN` | *(Secret)* | Token verifikasi permintaan dari gateway |
| **`app` (Expo)** | `EXPO_PUBLIC_GATEWAY_URL`| `http://10.0.2.2:3000` / `http://localhost:3000` | URL publik gateway yang dijangkau emulator/device |

---

## 6. Struktur Folder Monorepo

```text
cobatest/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Pipeline GitHub Actions
├── app/                           # Expo Mobile Application
│   ├── assets/                    # Ikon dan splash
│   ├── components/                # Komponen UI modular (sesuai docs/DESIGN.md)
│   │   ├── chat/
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ToolCallCard.tsx
│   │   │   ├── ServerBadge.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── TypingIndicator.tsx
│   │   │   └── ExampleChip.tsx
│   │   ├── notes/
│   │   │   └── NoteCard.tsx
│   │   └── common/
│   │       ├── EmptyState.tsx
│   │       ├── ErrorBanner.tsx
│   │       └── ScreenHeader.tsx
│   ├── screens/
│   │   ├── ChatScreen.tsx
│   │   └── NotesScreen.tsx
│   ├── theme/
│   │   ├── tokens.ts              # Palet warna, spacing, typo, radius
│   │   └── ThemeContext.tsx       # ThemeProvider & hook useTheme()
│   ├── services/
│   │   └── api.ts                 # Klien fetch REST & parser SSE
│   ├── App.tsx                    # Root wrapper
│   ├── app.json                   # Konfigurasi Expo
│   ├── package.json
│   └── tsconfig.json
├── gateway/                       # Express Orchestrator Backend
│   ├── src/
│   │   ├── clients/
│   │   │   ├── exaMcp.ts          # Integrasi MCP A remote
│   │   │   └── notesMcp.ts        # Klien pemanggil MCP B
│   │   ├── orchestrator/
│   │   │   └── llmLoop.ts         # Multi-turn tool loop & streaming
│   │   ├── routes/
│   │   │   ├── chat.ts            # Handler POST /api/chat (SSE)
│   │   │   └── notes.ts           # Handler GET & DELETE /api/notes
│   │   ├── config.ts              # Pemuatan environment & validasi zod
│   │   └── server.ts              # Entry point Express
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── mcp-notes/                     # Internal Notes MCP Server
│   ├── src/
│   │   ├── db/
│   │   │   ├── client.ts          # Koneksi pg pooler dengan SSL
│   │   │   └── migrate.ts         # Inisialisasi skema tabel notes
│   │   ├── tools/
│   │   │   ├── saveNote.ts
│   │   │   ├── listNotes.ts
│   │   │   └── deleteNote.ts
│   │   ├── server.ts              # Express MCP server handler
│   │   └── schemas.ts             # Zod validation schemas
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   ├── PRD.md
│   ├── DESIGN.md
│   ├── SETUP.md
│   └── agent-logs/
│       └── persiapan.md
├── scripts/
│   ├── check-env.sh
│   ├── check-exa.ts
│   ├── check-llm.ts
│   ├── check-db.ts
│   └── export-log.sh
├── .env.example
├── .gitignore
├── docker-compose.yml             # Orkestrasi lokal (db + mcp-notes + gateway)
├── package.json                   # Root private scripts
└── SPEC.md
```

---

## 7. Rencana Docker

### 7.1 Dockerfile per Layanan
1. `mcp-notes/Dockerfile`:
   - Base image: `node:20-alpine`.
   - Install dependencies, build typescript, expose port `3001`.
   - Command: `node dist/server.js`.
2. `gateway/Dockerfile`:
   - Base image: `node:20-alpine`.
   - Install dependencies, build typescript, expose port `3000`.
   - Command: `node dist/server.js`.

### 7.2 `docker-compose.yml` (Eksekusi Lokal Terpadu)
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: scoutnote-postgres
    environment:
      POSTGRES_USER: scoutnote
      POSTGRES_PASSWORD: scoutnotepassword
      POSTGRES_DB: scoutnote_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U scoutnote -d scoutnote_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  mcp-notes:
    build:
      context: ./mcp-notes
      dockerfile: Dockerfile
    container_name: scoutnote-mcp-notes
    environment:
      PORT: 3001
      DATABASE_URL: postgres://scoutnote:scoutnotepassword@postgres:5432/scoutnote_db
      DATABASE_SSL: "false"
      MCP_BEARER_TOKEN: dev-bearer-secret
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy

  gateway:
    build:
      context: ./gateway
      dockerfile: Dockerfile
    container_name: scoutnote-gateway
    environment:
      PORT: 3000
      LLM_BASE_URL: ${LLM_BASE_URL}
      LLM_API_KEY: ${LLM_API_KEY}
      LLM_MODEL: ${LLM_MODEL}
      EXA_MCP_URL: ${EXA_MCP_URL}
      EXA_API_KEY: ${EXA_API_KEY}
      MCP_NOTES_URL: http://mcp-notes:3001
      MCP_BEARER_TOKEN: dev-bearer-secret
    ports:
      - "3000:3000"
    depends_on:
      - mcp-notes

volumes:
  pgdata:
```

---

## 8. Rencana CI/CD (GitHub Actions)

### 8.1 Workflow Pipeline (`.github/workflows/ci.yml`)
- **Pemicu**: Setiap `push` ke branch `main` dan setiap `pull_request` ke `main`.
- **Tahapan CI**:
  1. **Checkout**: Mengambil kode sumber repositori.
  2. **Setup Node.js**: Menggunakan Node.js `20.x` dengan caching npm.
  3. **Install Dependencies**: Menjalankan instalasi paket di root, `gateway`, dan `mcp-notes`.
  4. **Typecheck & Linting**:
     - `npm run typecheck` pada `gateway` dan `mcp-notes`.
     - Validasi kebersihan kode.
  5. **Automated Unit & Smoke Test**:
     - Menjalankan migrasi basis data uji dan eksekusi skrip pemeriksaan integritas (`check-db.ts`, `check-llm.ts` mock).
- **Deployment**:
  - Konfigurasi penyedia cloud hosting (seperti Render / Railway / Koyeb) yang terhubung ke branch `main`. Deployment terpicu otomatis begitu commit lolos verifikasi CI.

---

## 9. Checklist Tugas per Prompt (P4 .. P13)

| Status | Prompt ID | Target Komponen | Deliverable & Fokus Pekerjaan | Rujukan FR |
| :---: | --- | --- | --- | --- |
| [x] | **Scaffold** | `Monorepo` | Setup struktur `/app` (Expo, router), `/gateway` (Express, ESLint), `/mcp-notes` (Express, ESLint), `.env.example`, `README.md`, `docs/TROUBLESHOOTING.md`. | FR-1, FR-4 |
| [x] | **P4** | `mcp-notes` | Inisialisasi service `mcp-notes`, skema migrasi tabel `notes`, koneksi pg pooler dengan SSL. | FR-4 |
| [x] | **P5** | `mcp-notes` | Implementasi tool MCP B (`save_note`, `list_notes`, `delete_note`) dan skrip verifikasi standalone. | FR-4 |
| [x] | **P6** | `gateway` | Inisialisasi service `gateway`, Express skeleton, config validator, dan modul helper SSE. | FR-1, FR-2 |
| [x] | **P7** | `gateway` | Pembuatan klien MCP A (Exa Search remote) dan klien MCP B (koneksi internal). | FR-3, FR-4 |
| [x] | **P8** | `gateway` | Implementasi LLM Orchestrator: multi-turn loop, streaming SSE, tool calling execution. | FR-2, FR-5 |
| [x] | **P9** | `gateway` | Implementasi endpoint REST `GET /api/notes`, `DELETE /api/notes/:id`, dan `GET /api/health`. | FR-6 |
| [ ] | **P10** | `app` | Setup scaffold Expo mobile (`/app`), implementasi `tokens.ts` dan `ThemeContext.tsx`. | FR-1, UI Tokens |
| [ ] | **P11** | `app` | Pembuatan komponen UI: `MessageBubble`, `ToolCallCard`, `ServerBadge`, `ChatInput`, `NoteCard`. | FR-5, FR-6 |
| [ ] | **P12** | `app` | Integrasi layar: `ChatScreen` (koneksi SSE + kartu tool) dan `NotesScreen` (fetch & hapus). | FR-1, FR-6, US-1, US-2 |
| [ ] | **P13** | Monorepo / CI | Pembuatan `Dockerfile`, `docker-compose.yml`, GitHub Actions CI workflow, dan verifikasi akhir. | NFR-1..5, CI/CD |

---

## 10. Acceptance Criteria: Video Demo & README

### 10.1 Video Demo (Durasi Maksimal 3 Menit)
1. **Input Percakapan**: Mengetikkan/menempel prompt: *"Cari berita terbaru tentang Expo React Native lalu simpan ringkasannya sebagai catatan"*.
2. **Umpan Balik Real-time**: Indikator loading muncul saat proses berjalan.
3. **Kartu MCP A (READ)**: Tampil jelas gelembung kartu tool warna slate-blue (`#647C8A`) berlabel `[MCP A: READ]` dengan tool `web_search_exa`.
4. **Kartu MCP B (WRITE)**: Tampil jelas kartu tool warna amber-brown (`#A77B43`) berlabel `[MCP B: WRITE]` dengan tool `save_note`.
5. **Jawaban Asisten**: Menampilkan ringkasan berita yang rapi dan kontekstual.
6. **Verifikasi Tab Notes**: Menavigasi ke layar Notes, membuktikan catatan baru berhasil masuk ke database.
7. **Aksi Hapus**: Menekan tombol hapus pada catatan, mengonfirmasi catatan terhapus dan list ter-refresh.

### 10.2 README Repositori
1. Menampilkan judul proyek, badge CI build, dan paragraf deskripsi arsitektur.
2. Diagram arsitektur Mermaid dual-MCP yang mudah dibaca.
3. Panduan instalasi dan menjalankan proyek dalam maksimal 3 perintah (`npm install`, salin `.env`, `npm run dev`).
4. Tautan / cuplikan video demo atau gambar GIF animasi alur utama.
5. Dokumentasi ringkas pemecahan masalah dan referensi dokumen `docs/SETUP.md`, `docs/PRD.md`, `docs/DESIGN.md`.

---

## 11. Keputusan Fallback (Degradasi Anggun)

1. **Jika Streaming SSE Gagal / Terputus**:
   - Gateway secara otomatis menyimpan akumulasi token di memori buffer. Jika koneksi SSE drop di tengah jalan, klien dapat melakukan polling fallback sekali ke endpoint status untuk mengambil pesan lengkap terakhir tanpa mengulang eksekusi LLM.
2. **Jika Exa Search MCP Gagal (Error 429 / Timeout / 5xx)**:
   - Gateway menangkap error dari MCP A dan menyuntikkan pesan sistem kembali ke konteks LLM: `"(Gagal mengambil data eksternal dari Exa: Kuota habis atau timeout. Informasikan hal ini kepada pengguna dan tanyakan apakah ingin membuat catatan secara manual)"`.
   - LLM merespons dengan sopan tanpa membuat gateway crash atau UI mobile berhenti merespons.
3. **Jika Koneksi Database (MCP B) Terputus**:
   - Gateway memancarkan event `error` terstruktur via SSE (`DATABASE_UNAVAILABLE`).
   - Teks draf input pengguna di aplikasi mobile tetap dipertahankan pada bar input sehingga pengguna tidak kehilangan ketikan.
