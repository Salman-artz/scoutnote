# Design System & UI Specification: ScoutNote

Dokumen ini mendefinisikan prinsip desain, design tokens (Light & Dark), arsitektur komponen, layout wireframe, dan pedoman interaksi untuk aplikasi mobile ScoutNote berbasis React Native / Expo murni tanpa pustaka styling eksternal.

---

## 1. Prinsip Desain

1. **Transparency over Magic**: Setiap interaksi agen AI dan pemanggilan tool MCP (baik pembacaan web maupun penulisan database) harus ditampilkan secara eksplisit, terstruktur, dan dapat diaudit oleh pengguna.
2. **Natural & Grounded Aesthetic**: Menggunakan palet earthy-minimalist yang tenang (mirip permukaan kertas dan tinta hangat) untuk kenyamanan membaca hasil riset teks yang panjang.
3. **Predictable Feedback**: Memberikan kejelasan status waktu-nyata untuk setiap siklus operasi (berpikir, memanggil web, menulis ke database, sukses, atau gagal).
4. **Zero-Dependency Styling**: Dibangun sepenuhnya dengan `StyleSheet` bawaan React Native dan React Context (`ThemeProvider`) agar ringan, deterministik, dan bebas komplikasi dependensi native.

---

## 2. Design Tokens

### 2.1 Palet Warna Semantik

Palet warna menggunakan nuansa hangat natural dengan pemisahan warna aksen yang jelas antara operasi pembacaan (Exa Read) dan penulisan (DB Write):

| Token Semantik | Light Mode Hex | Dark Mode Hex | Deskripsi / Peran |
| --- | --- | --- | --- |
| `background` | `#F5F3EE` | `#191A17` | Latar belakang kanvas utama layar |
| `surface` | `#FFFEFA` | `#23241F` | Latar kartu pesan, bottom bar, dan modal |
| `primary` | `#626B50` | `#A3AD83` | Aksen tombol aktif, gelembung chat user, sorotan |
| `text` | `#292B26` | `#EAE8DF` | Teks judul, isi pesan utama, dan teks input |
| `muted` | `#858579` | `#A09F91` | Teks sekunder, label timestamp, placeholder |
| `border` | `#E4E0D7` | `#393A32` | Garis batas kartu, pemisah item, input border |
| `success` | `#557653` | `#8EAE7A` | Indikator sukses simpan DB, badge selesai |
| `danger` | `#B45D50` | `#D78375` | Pesan error, tombol hapus catatan |
| `mcpRead` | `#647C8A` | `#91ADBC` | Aksen identitas MCP A (Exa Web Search / Read) |
| `mcpWrite` | `#A77B43` | `#D0A46B` | Aksen identitas MCP B (PostgreSQL Note / Write) |

### 2.2 Skala Tipografi (Font Sistem)

Menggunakan font sistem bawaan (`System` / SF Pro di iOS, Roboto di Android):

| Token Ukuran | Ukuran (pt) | Line Height (pt) | Weight | Penggunaan |
| --- | --- | --- | --- | --- |
| `type.xs` | 11 | 14 | Regular (400) | Timestamp, badge label kecil |
| `type.sm` | 13 | 18 | Regular / Medium (500) | Argumen tool payload, teks sekunder |
| `type.md` | 15 | 22 | Regular (400) | Isi pesan chat, teks input, ringkasan note |
| `type.lg` | 17 | 24 | Medium (500) / Semi (600) | Judul catatan di kartu, nama pengirim |
| `type.xl` | 20 | 26 | Semi (600) | Judul layar (ScreenHeader), subjudul |
| `type.2xl` | 24 | 30 | Bold (700) | Header utama |

### 2.3 Skala Spacing (Kelipatan 4pt)

| Token Spacing | Nilai | Contoh Penggunaan |
| --- | --- | --- |
| `space.1` | 4 pt | Margin antar ikon kecil dan label |
| `space.2` | 8 pt | Padding internal badge, gap horizontal kecil |
| `space.3` | 12 pt | Padding gelembung pesan, gap vertikal antar elemen |
| `space.4` | 16 pt | Padding horizontal kontainer layar, margin antar kartu |
| `space.5` | 20 pt | Padding vertikal kontainer header |
| `space.6` | 24 pt | Jarak pemisah antar seksi besar |
| `space.8` | 32 pt | Jarak kosong empty state |
| `space.10` | 40 pt | Batas bawah area scroll chat |

### 2.4 Skala Border Radius

| Token Radius | Nilai | Penggunaan |
| --- | --- | --- |
| `radius.xs` | 4 pt | Badge label, tag kecil |
| `radius.sm` | 8 pt | Kotak argumen JSON, kartu tool call internal |
| `radius.md` | 12 pt | Kartu catatan (NoteCard), container chat input |
| `radius.lg` | 16 pt | Gelembung chat (MessageBubble), kartu utama |
| `radius.full` | 9999 pt | Tombol kirim bulat, chip saran interaktif |

### 2.5 Elevation & Shadow

- **Light Mode Elevation**:
  - `shadow.none`: `{ elevation: 0, shadowOpacity: 0 }`
  - `shadow.sm`: `{ shadowColor: '#292B26', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 }`
  - `shadow.md`: `{ shadowColor: '#292B26', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 }`
- **Dark Mode Elevation**:
  - Menghindari shadow buram pekat; menggunakan perbatasan kontras tipis (`borderWidth: 1`, `borderColor: tokens.border`) untuk memperjelas elevasi permukaan.

---

## 3. Inventaris Komponen

### 3.1 `MessageBubble`
- **Fungsi**: Merender pesan teks dari user atau asisten AI.
- **Props**:
  - `role`: `'user' | 'assistant'`
  - `content`: `string`
  - `timestamp`: `string`
  - `children?`: `React.ReactNode` (untuk menyisipkan ToolCallCard di bawah jawaban asisten)
- **State**: Tidak ada (stateless).

### 3.2 `ToolCallCard`
- **Fungsi**: Menampilkan blok eksekusi tool MCP yang transparan.
- **Props**:
  - `serverType`: `'read' | 'write'` (menentukan tema warna `mcpRead` vs `mcpWrite`)
  - `toolName`: `string` (misal: `web_search_exa`, `save_note`)
  - `status`: `'running' | 'success' | 'failed'`
  - `argumentsPayload`: `Record<string, any>`
  - `resultPreview?`: `string`
- **State**:
  - `isExpanded`: `boolean` (default: `false`, klik untuk membuka detail JSON payload).

### 3.3 `ServerBadge`
- **Fungsi**: Penanda visual ringkas tipe server MCP.
- **Props**:
  - `type`: `'read' | 'write'`
  - `label`: `string` (misal: `"MCP A: READ"` atau `"MCP B: WRITE"`)
- **State**: Tidak ada (stateless).

### 3.4 `ChatInput`
- **Fungsi**: Bar input teks bawah dengan tombol kirim dinamis.
- **Props**:
  - `value`: `string`
  - `onChangeText`: `(text: string) => void`
  - `onSend`: `() => void`
  - `isLoading`: `boolean`
  - `placeholder?`: `string`
- **State**:
  - Mengelola status fokus teks (`isFocused: boolean`).

### 3.5 `TypingIndicator`
- **Fungsi**: Indikator animasi 3 titik ketika asisten sedang memproses atau orkestrasi tool berjalan.
- **Props**:
  - `statusText?`: `string` (misal: `"Menghubungi Exa Search..."`, `"Menyimpan ke Database..."`)
- **State**:
  - Animasi loop opacity titik (menggunakan `Animated` core).

### 3.6 `ExampleChip`
- **Fungsi**: Tombol pil cepat untuk memasukkan prompt pengujian standar.
- **Props**:
  - `label`: `string`
  - `onPress`: `(prompt: string) => void`
- **State**: Feedback `activeOpacity` saat disentuh.

### 3.7 `NoteCard`
- **Fungsi**: Kartu representasi catatan tersimpan di layar Notes.
- **Props**:
  - `id`: `number`
  - `title`: `string`
  - `contentSnippet`: `string`
  - `createdAt`: `string`
  - `onDelete`: `(id: number) => void`
  - `isDeleting?`: `boolean`
- **State**: Tidak ada (state delete dikelola oleh parent screen).

### 3.8 `EmptyState`
- **Fungsi**: Tampilan saat daftar catatan masih kosong atau chat belum dimulai.
- **Props**:
  - `iconName`: `string`
  - `title`: `string`
  - `description`: `string`
- **State**: Stateless.

### 3.9 `ErrorBanner`
- **Fungsi**: Banner melayang untuk menampilkan galat API (429, timeout, offline).
- **Props**:
  - `message`: `string`
  - `onRetry?`: `() => void`
  - `onDismiss`: `() => void`
- **State**: Stateless.

### 3.10 `ScreenHeader`
- **Fungsi**: Header konsisten untuk navigasi antar layar dan saklar Dark Mode.
- **Props**:
  - `title`: `string`
  - `subtitle?`: `string`
  - `showBackButton?`: `boolean`
  - `onBackPress?`: `() => void`
  - `rightAction?`: `React.ReactNode` (misal: tombol Notes atau toggle tema)
- **State**: Stateless.

---

## 4. Wireframe Layout Layar (ASCII)

### 4.1 Layar Chat (`/app/chat`)

```text
+-----------------------------------------------------------+
| [=] ScoutNote                  [Notes (2)] [Tema (O/C)]   | <- ScreenHeader
+-----------------------------------------------------------+
|                                                           |
|  [User]                                                   |
|  +-----------------------------------------------------+  |
|  | Cari berita Expo React Native lalu simpan           |  | <- MessageBubble (User)
|  | ringkasannya sebagai catatan                        |  |
|  +-----------------------------------------------------+  |
|                                                     14:02 |
|                                                           |
|  [Assistant]                                              |
|  +-----------------------------------------------------+  |
|  | Tentu, saya sedang mencari berita terbaru dan       |  | <- MessageBubble (AI)
|  | menyimpannya untuk Anda.                            |  |
|  |                                                     |  |
|  | +-[MCP A: READ]-----------------------------------+ |  |
|  | | Tool: web_search_exa           [OK: 3 hasil] [v]| |  | <- ToolCallCard (Read)
|  | | Query: "Expo React Native latest news"          | |  |
|  | +-------------------------------------------------+ |  |
|  |                                                     |  |
|  | +-[MCP B: WRITE]----------------------------------+ |  |
|  | | Tool: save_note                [Tersimpan: #1]  | |  | <- ToolCallCard (Write)
|  | | Judul: "Rangkuman Berita Expo SDK Terbaru"      | |  |
|  | +-------------------------------------------------+ |  |
|  |                                                     |  |
|  | Berita berhasil diriset dan dicatat ke database!    |  |
|  +-----------------------------------------------------+  |
|  14:03                                                    |
|                                                           |
|  ( ) ( ) ( ) Asisten selesai memproses                    | <- TypingIndicator
+-----------------------------------------------------------+
| [ Cari berita Expo... ] [ Cek rilis React Native... ]     | <- ExampleChip bar
+-----------------------------------------------------------+
| [ Tulis pesan untuk ScoutNote...               ] [ Kirim ]| <- ChatInput
+-----------------------------------------------------------+
```

### 4.2 Layar Notes (`/app/notes`)

```text
+-----------------------------------------------------------+
| [< Chat] Catatan Tersimpan (Total: 2)                     | <- ScreenHeader
+-----------------------------------------------------------+
|                                                           |
| +-------------------------------------------------------+ |
| | Rangkuman Berita Expo SDK Terbaru         [Hapus (X)] | | <- NoteCard
| | Expo SDK 52 telah dirilis dengan New Architecture...  | |
| | 05 Nov 2026, 14:03                  Tag: #expo #react | |
| +-------------------------------------------------------+ |
|                                                           |
| +-------------------------------------------------------+ |
| | Catatan Persiapan Arsitektur MCP          [Hapus (X)] | | <- NoteCard
| | Server MCP internal berjalan di port 3001 dengan pg...| |
| | 05 Nov 2026, 11:20                  Tag: #mcp #server | |
| +-------------------------------------------------------+ |
|                                                           |
| (Pull down untuk refresh catatan dari database)           |
+-----------------------------------------------------------+
```

---

## 5. Aturan Interaksi

1. **Auto-Scroll Chat**:
   - Setiap pesan baru dikirim atau streaming token masuk, `FlatList` otomatis melakukan `scrollToEnd({ animated: true })`.
2. **Expand/Collapse Kartu Tool Call**:
   - Kondisi awal kartu tool call berstatus ringkas (*collapsed*) hanya memuat nama tool, status ikon badge, dan satu baris argumen utama.
   - Mengetuk kartu mengubah `isExpanded` menjadi `true`, membuka kotak teks monospaced (`surface` background) yang memuat JSON payload input dan hasil ringkas output.
3. **Umpan Balik Loading & Status Berkelanjutan**:
   - Selama gateway menghubungi MCP A atau MCP B, `TypingIndicator` menampilkan teks status kontekstual (misal: `"Mencari di web via Exa..."` lalu `"Menyimpan catatan ke database..."`).
   - Tombol Kirim masuk ke state non-aktif (`disabled: true`, `opacity: 0.5`) saat proses sedang berlangsung untuk mencegah *double submission*.
4. **Penanganan & Umpan Balik Galat**:
   - Galat kuota/jaringan memunculkan `ErrorBanner` di bagian atas layar dengan tombol aksi `"Coba Lagi"` tanpa menghapus draf teks pengguna di input bar.

---

## 6. Aksesibilitas (A11y)

1. **Target Sentuh Minimum**:
   - Semua tombol yang dapat disentuh (tombol kirim, tombol hapus catatan, kartu expand, chip saran) memiliki ukuran fisik area sentuh minimal **44 x 44 pt** (memanfaatkan `hitSlop` jika dimensi ikon < 44pt).
2. **Rasio Kontras Warna**:
   - Rasio kontras teks utama (`text`) terhadap latar (`background` / `surface`) memenuhi standar minimum WCAG 2.1 AA (minimal **4.5:1** pada Light Mode maupun Dark Mode).
   - Teks muted (`muted`) memiliki rasio kontras minimal **3:1** terhadap surface untuk teks sekunder.
3. **Dynamic Font Scaling**:
   - Semua komponen `Text` mempertahankan `allowFontScaling={true}` dan menggunakan `maxFontSizeMultiplier={1.5}` agar tata letak tidak rusak saat pengguna mengaktifkan ukuran teks besar di sistem OS.
4. **Semantik Label Aksesibilitas**:
   - Tombol aksi dilengkapi `accessibilityRole="button"` dan `accessibilityLabel` yang jelas (contoh tombol hapus: `accessibilityLabel="Hapus catatan Rangkuman Berita Expo"`).

---

## 7. Pemetaan Implementasi Kode

Seluruh arsitektur styling diimplementasikan secara modular tanpa library tambahan:

```
app/
├── components/
│   ├── chat/
│   │   ├── MessageBubble.tsx      # Gelembung pesan pengguna & AI
│   │   ├── ToolCallCard.tsx       # Kartu transparan eksekusi MCP A & B
│   │   ├── ServerBadge.tsx        # Lencana identitas warna READ vs WRITE
│   │   ├── ChatInput.tsx          # Bar masukan teks & tombol kirim
│   │   ├── TypingIndicator.tsx    # Animasi pemrosesan asisten
│   │   └── ExampleChip.tsx        # Chip cepat prompt rekomendasi
│   ├── notes/
│   │   └── NoteCard.tsx           # Kartu catatan individual & trigger hapus
│   └── common/
│       ├── EmptyState.tsx         # Tampilan kosong informatif
│       ├── ErrorBanner.tsx        # Banner notifikasi kesalahan
│       └── ScreenHeader.tsx       # Header universal layar + tema toggle
├── theme/
│   ├── tokens.ts                  # Konstanta warna light/dark, spacing, typo, radius
│   └── ThemeContext.tsx           # ThemeProvider & hook useTheme()
├── screens/
│   ├── ChatScreen.tsx             # Penggabungan komponen chat
│   └── NotesScreen.tsx            # Penggabungan daftar catatan
└── App.tsx                        # Root aplikasi dengan ThemeProvider
```

### Pola Konsumsi Tema (Contoh Arsitektur):
```ts
// app/theme/ThemeContext.tsx
import React, { createContext, useContext, useState } from 'react';
import { useColorScheme } from 'react-native';
import { colors, typography, spacing, radius, shadows } from './tokens';

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  colors: typeof colors.light;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  shadows: typeof shadows.light;
}
```
Komponen memanggil `const { colors, spacing } = useTheme();` dan menerapkan gaya dinamis melalui fungsi `StyleSheet.create({ ... })` atau array style bawaan React Native.
