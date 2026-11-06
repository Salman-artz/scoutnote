# Product Requirement Document (PRD): ScoutNote

- **Produk**: ScoutNote (Mobile AI Chatbot dengan Dual-MCP Orchestration)
- **Target Waktu**: 1 Hari Kerja (Sprint 1-Day MVP)
- **Status**: Disetujui untuk Implementasi
- **Versi**: 1.0.0

---

## 1. Masalah dan Tujuan

### 1.1 Masalah
1. Pengguna kesulitan mengonsolidasi riset web terkini langsung ke dalam repositori catatan pribadi tanpa berpindah aplikasi (copy-paste manual).
2. Sebagian besar demo AI/LLM bersifat satu arah (hanya membaca atau hanya menghasilkan teks), jarang mendemonstrasikan transparansi eksekusi tool dua arah (*external read* + *database write*) secara terverifikasi pada antarmuka mobile.

### 1.2 Tujuan
1. **Fungsional**: Membangun aplikasi chatbot mobile berbasis Expo yang menghubungkan LLM ke dua server Model Context Protocol (MCP) secara berurutan: **MCP A** (*Read* via Exa Search) dan **MCP B** (*Write/Read* via Database internal).
2. **Kebutuhan Evaluasi Teknis**: Menyediakan repositori monorepo teruji, dokumentasi setup lengkap, video demo alur 2-arah MCP, dan log sesi AI agent yang tervalidasi.
3. **Portofolio Standar Industri**: Menunjukkan implementasi arsitektur AI-first, backend gateway, orkestrasi tool, containerization Docker, dan kebersihan kode tanpa overengineering.

---

## 2. Target Pengguna & User Stories

### 2.1 Target Pengguna
Developer, researcher, dan profesional yang membutuhkan kurasi informasi web cepat yang langsung terarsip ke database catatan pribadi.

### 2.2 User Stories & Acceptance Criteria

- **US-1: Riset dan Pencatatan Otomatis (Dual-MCP Flow)**
  - *Sebagai*: Pengguna aplikasi.
  - *Saya ingin*: Berkata *"Cari berita terbaru tentang Expo React Native lalu simpan ringkasannya sebagai catatan"*.
  - *Agar*: Informasi terbaru langsung dicari dari internet dan disimpan tanpa intervensi manual.
  - *Acceptance Criteria (AC-1)*:
    1. Sistem memanggil MCP A (`web_search_exa`) untuk mengambil data berita web.
    2. Sistem mengekstrak ringkasan lalu memanggil MCP B (`save_note`) untuk menyimpan data ke database.
    3. UI Chat menampilkan jawaban akhir beserta kartu/badge transparan untuk kedua pemanggilan tool (**MCP A READ** dan **MCP B WRITE**).

- **US-2: Tinjauan dan Manajemen Catatan Tersimpan**
  - *Sebagai*: Pengguna aplikasi.
  - *Saya ingin*: Membuka layar "Notes" untuk melihat daftar catatan dan menghapus catatan yang tidak relevan.
  - *Agar*: Saya dapat memverifikasi bahwa data benar-benar tersimpan di database dan dapat dikelola.
  - *Acceptance Criteria (AC-2)*:
    1. Layar Notes memuat daftar catatan dari MCP B (`list_notes`).
    2. Terdapat tombol hapus pada tiap catatan yang memicu MCP B (`delete_note`).
    3. Daftar terbarukan secara instan setelah penghapusan.

- **US-3: Transparansi Status Eksekusi Tool**
  - *Sebagai*: Penguji/Evaluator teknis.
  - *Saya ingin*: Melihat status pemanggilan tool saat proses sedang berlangsung.
  - *Agar*: Saya dapat memvalidasi bahwa LLM benar-benar mengeksekusi MCP server dan bukan respons statis.
  - *Acceptance Criteria (AC-3)*:
    1. Menampilkan indikator visual khusus ketika tool MCP A sedang aktif (*fetching web*).
    2. Menampilkan indikator visual saat MCP B aktif (*persisting to DB*).
    3. Payload ringkas (nama tool & argumen) dapat dilihat pada gelembung chat.

---

## 3. Scope & Non-Goals

| Kategori | Di Dalam Scope (Wajib) | Di Dalam Scope (Opsional / Bonus) | Di Luar Scope (Non-Goals) |
| --- | --- | --- | --- |
| **Mobile App** | Layar Chat & Layar Notes (Expo React Native + TypeScript) | Dark Mode toggle | Notifikasi push latar belakang |
| **Backend / Gateway** | Express Gateway pengorkestrasi LLM + MCP Client | Caching respons Exa | Autentikasi multi-tenant / OAuth login |
| **MCP B (Server)** | Node.js MCP Server dengan PostgreSQL (`save_note`, `list_notes`, `delete_note`) | Filter pencarian catatan via keyword | Sinkronisasi offline (CRDT / SQLite local) |
| **Infrastruktur** | Dockerfile gateway & MCP server, skrip validasi | Skrip deploy 1-klik | Payment gateway / rate limiter tingkat enterprise |

---

## 4. Alur Inti Langkah demi Langkah

```
[Pengguna] -> Input teks: "Cari berita Expo lalu simpan ringkasannya"
   │
   ▼
[Mobile App (Expo)] -> POST /api/chat ke Gateway
   │
   ▼
[Gateway API] -> Mengirim prompt + skema tools ke LLM
   │
   ├─► Putaran 1: LLM memutuskan memanggil tool "web_search_exa"
   │     │
   │     ▼
   │   [MCP A: Exa Remote] Mengambil berita terkini dari internet
   │     │
   │     └─► Mengembalikan hasil teks web ke Gateway -> Diteruskan ke LLM
   │
   ├─► Putaran 2: LLM memproses hasil web & memutuskan memanggil "save_note"
   │     │
   │     ▼
   │   [MCP B: Internal Server] Menyimpan ringkasan ke PostgreSQL
   │     │
   │     └─► Mengembalikan status sukses & Note ID ke Gateway -> Diteruskan ke LLM
   │
   ▼
[LLM] -> Menghasilkan jawaban teks konfirmasi akhir
   │
   ▼
[Mobile App] -> Menerima respons lengkap:
                 - Jawaban akhir asisten
                 - Kartu Audit: [READ: web_search_exa]
                 - Kartu Audit: [WRITE: save_note (ID, Judul)]
```

---

## 5. Kebutuhan Fungsional (Functional Requirements)

- **FR-1 (Chat Interface)**: Aplikasi mobile harus menyediakan antarmuka pesan chat yang responsif dengan riwayat percakapan sesi aktif.
- **FR-2 (Tool Orchestration)**: Gateway harus menangani orkestrasi multi-turn function calling OpenAI-compatible (Google Gemini / cadangan) hingga LLM mencapai teks final.
- **FR-3 (MCP A Integration)**: Gateway harus terhubung ke server remote `https://mcp.exa.ai/mcp` menggunakan header otentikasi resmi untuk membaca data web.
- **FR-4 (MCP B Toolset)**: Server kustom MCP B harus mengekspos 3 tool JSON-RPC standar MCP:
  1. `save_note(title: string, content: string, tags?: string[])`: Menyimpan catatan ke PostgreSQL.
  2. `list_notes(limit?: number)`: Mengambil daftar catatan terbaru.
  3. `delete_note(id: number)`: Menghapus catatan berdasarkan ID.
- **FR-5 (Visual Execution Cards)**: UI pesan asisten harus merender kartu khusus untuk tiap pemanggilan tool yang membedakan tipe aksi (READ vs WRITE).
- **FR-6 (Notes Screen)**: Layar sekunder untuk menampilkan daftar seluruh catatan yang tersimpan di PostgreSQL dengan fitur pull-to-refresh dan tombol delete.

---

## 6. Kebutuhan Non-Fungsional (Non-Functional Requirements)

- **NFR-1 (Latensi)**: Total durasi alur 2-arah tool calling tidak boleh melebihi 15 detik pada kondisi jaringan normal.
- **NFR-2 (Penanganan Error Komprehensif)**:
  - Jika Exa 429/timeout: Gateway memberikan pesan kegagalan pencarian web tanpa membuat aplikasi crash.
  - Jika LLM 503/429: Gateway melakukan auto-retry 1x atau memberikan notifikasi kuota habis.
  - Jika Database terputus: Mengembalikan pesan error terstruktur ke pengguna.
- **NFR-3 (Keamanan Kredensial)**: Seluruh API key (`EXA_API_KEY`, `LLM_API_KEY`, `DATABASE_URL`) hanya berada di backend gateway/MCP server. Aplikasi mobile dilarang menyimpan kunci rahasia.
- **NFR-4 (Mitigasi Cold Start Serverless)**: Backend dan database pooler harus memiliki toleransi timeout minimal 20 detik untuk mengakomodasi waking-up server gratis (Neon/Render).
- **NFR-5 (Observabilitas & Logging)**: Setiap pemanggilan MCP dan LLM dicatat dalam structured log konsol backend untuk keperluan verifikasi.

---

## 7. Daftar Layar Aplikasi Mobile

1. **Layar Chat (`/app/chat`)**:
   - Header: Nama aplikasi ("ScoutNote"), status koneksi gateway, tombol navigasi ke layar Notes.
   - Area Chat: Gelembung pesan pengguna dan asisten.
   - Komponen Tool Call:
     - Badge Biru/Hijau: `[MCP A: READ]` menampilkan query pencarian.
     - Badge Kuning/Oranye: `[MCP B: WRITE]` menampilkan judul dan ID catatan yang disimpan.
   - Bar Input: Input teks dan tombol kirim dengan indikator disabled saat proses aktif.

2. **Layar Notes (`/app/notes`)**:
   - Header: Judul layar dan tombol kembali ke Chat.
   - List View: Kartu catatan (Judul, Cuplikan Isi, Tanggal Dibuat).
   - Aksi: Tombol ikon sampah (*trash*) untuk menghapus catatan via MCP B.
   - Empty State: Ilustrasi / teks informatif jika belum ada catatan yang tersimpan.

---

## 8. Metrik Keberhasilan & Bukti Verifikasi

Untuk memastikan pemenuhan tugas teknis dan kelayakan portofolio:

1. **Video Demo (Durasi 2–3 Menit)**:
   - Menampilkan input prompt riset & simpan.
   - Menampilkan proses loading dan kemunculan visual badge `[MCP A READ]` disusul `[MCP B WRITE]`.
   - Menampilkan jawaban asisten yang memuat ringkasan.
   - Berpindah ke layar Notes dan membuktikan catatan baru telah masuk di database.
   - Menghapus catatan tersebut untuk membuktikan operasi `delete_note`.
2. **README Repositori**:
   - Diagram arsitektur alur dual-MCP.
   - Panduan menjalankan backend dan frontend dalam maksimal 3 perintah.
   - Tautan video demo / cuplikan GIF.
3. **Log Sesi Agent yang Dapat Diverifikasi**:
   - Berkas log tersensor di `docs/agent-logs/` yang mendokumentasikan proses coding dan keputusan teknis langkah demi langkah.

---

## 9. Risiko & Mitigasi

| ID | Risiko Potensial | Dampak | Strategi Mitigasi |
| --- | --- | --- | --- |
| **R-1** | Kuota LLM Free Tier habis saat demo/pengujian | Tinggi | Menggunakan `gemini-3.5-flash-lite` (1.500 RPD). Menyiapkan fallback konfigurasi Groq/OpenRouter di `.env`. |
| **R-2** | Inkompatibilitas pustaka native di Expo Go | Tinggi | Menggunakan pustaka UI berbasis JavaScript murni (React Native core + Lucide / Vector Icons bawaan Expo). |
| **R-3** | Cold start serverless DB (Neon) menyebabkan timeout request | Sedang | Pooler connection aktif dan setting timeout 15–20 detik pada driver `pg`. |
| **R-4** | Kompleksitas protokol JSON-RPC MCP di sisi klien mobile | Sedang | Semua komunikasi protokol MCP dikelola oleh backend Gateway. Klien mobile hanya berkomunikasi via endpoint REST sederhana. |

---

## 10. Rencana Milestone 1 Hari (1-Day Sprint)

| Waktu | Milestone | Deliverable Utama |
| --- | --- | --- |
| **08:00 - 10:00** | **M1: Database & Server MCP B** | Skema tabel `notes`, modul Express MCP B dengan tools (`save_note`, `list_notes`, `delete_note`). |
| **10:00 - 12:30** | **M2: Backend Gateway & Orkestrasi LLM** | Integrasi LLM function calling, pemanggilan MCP A (Exa) dan MCP B (Internal), endpoint REST `/api/chat` & `/api/notes`. |
| **12:30 - 13:30** | *Istirahat & Evaluasi Tengah Hari* | Verifikasi alur API via `curl` / automated test script. |
| **13:30 - 16:30** | **M3: Frontend Expo Mobile** | Antarmuka Layar Chat, kartu visual tool call, Layar Notes, integrasi state chat ke gateway. |
| **16:30 - 18:00** | **M4: Pengujian E2E & Dockerization** | Dockerfile backend, pengetesan skenario dual-MCP penuh dari mobile, sanitasi error. |
| **18:00 - 20:00** | **M5: Dokumentasi, Demo & Log Final** | Perekaman video demo, pembaruan README, ekspor log agen, dan komit Git final. |
