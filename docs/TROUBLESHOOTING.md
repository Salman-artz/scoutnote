# Panduan Troubleshooting ScoutNote

Dokumen ini memuat catatan pemecahan masalah teknis, gejala kesalahan, akar penyebab, dan langkah remediasi selama pengembangan dan operasional ScoutNote.

---

## Template Entri Masalah

Salin template di bawah ini saat menambahkan temuan masalah baru:

```markdown
## [ID Masalah]: [Judul Ringkas Masalah]

- **Komponen Terkait**: [gateway / mcp-notes / app / database / llm / exa / ci]
- **Lingkungan / OS**: [Windows / macOS / Linux / Expo Go / Docker]
- **Gejala (Symptom)**:
  - [Pesan error lengkap, kode status HTTP, atau perilaku abnormal yang diamati]
- **Akar Penyebab (Root Cause)**:
  - [Penjelasan teknis mengapa kesalahan terjadi]
- **Langkah Penyelesaian (Remediation)**:
  1. [Langkah 1]
  2. [Langkah 2]
- **Cara Verifikasi (Verification)**:
  - [Perintah terminal atau skrip pengujian untuk memastikan masalah telah teratasi]
- **Status**: [Investigasi / Dalam Perbaikan / Terselesaikan]
```

---

## Daftar Masalah Terdata

## CI-001: Expo web export gagal mencari Metro TerminalReporter

- **Komponen Terkait**: `app` / CI
- **Lingkungan / OS**: GitHub Actions, Ubuntu, Node.js 20.20.2
- **Gejala (Symptom)**:
  - Langkah `npx expo export --platform web` gagal setelah `npm ci` dengan error `Cannot find module 'metro/src/lib/TerminalReporter'`.
- **Hipotesis Akar Penyebab (Root Cause)**:
  1. Ketidakcocokan versi `expo`/`@expo/cli` dengan versi `metro` yang terpasang.
  2. `package-lock.json` dibuat dengan versi Node.js/npm yang berbeda dari lingkungan CI sehingga resolusi dependency berbeda.
- **Langkah Penyelesaian (Remediation)**:
  1. Menghapus langkah `npx expo export --platform web` dari CI. Export web tidak wajib untuk tugas ini.
  2. Mempertahankan typecheck, lint, build yang tersedia, dan Docker build.
- **Cara Verifikasi (Verification)**:
  - Dari folder `app`, jalankan `npm ls metro` untuk memeriksa versi dan dependency tree Metro.
  - Dari folder `app`, jalankan `npx expo-doctor` untuk memeriksa kompatibilitas Expo dan dependency.
  - Push perubahan workflow dan pastikan job `app` lulus pada langkah `npm ci`, typecheck, serta langkah yang tersedia.
- **Status**: Terselesaikan dengan menghapus langkah CI yang tidak wajib.

*(Belum ada entri masalah aktif lainnya)*
