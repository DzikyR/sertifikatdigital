# SertifDigital Informatika TSU

Web app manajemen **sertifikat digital** untuk Program Studi Informatika & Himpunan Mahasiswa (HMP) Universitas Tiga Serangkai: desain sertifikat dengan builder visual, import peserta, alur persetujuan Kaprodi, penerbitan bertahap, pengiriman email, serta verifikasi keaslian lewat QR Code.

**Stack:** Node.js 20+ · Express 5 · EJS + Tailwind CSS v4 · Fabric.js · PostgreSQL + Prisma 6 · Passport (Local & Google OAuth) · PDFKit · Nodemailer · sharp

---

## Daftar Isi

1. [Fitur](#fitur)
2. [Prasyarat](#prasyarat)
3. [Tutorial Instalasi (Windows + Laragon)](#tutorial-instalasi-windows--laragon)
4. [Tutorial Instalasi (Linux / macOS)](#tutorial-instalasi-linux--macos)
5. [Konfigurasi `.env`](#konfigurasi-env)
6. [Login Google (opsional)](#login-google-opsional)
7. [Email (Mailpit / SMTP)](#email-mailpit--smtp)
8. [Login Pertama & Langkah Awal](#login-pertama--langkah-awal)
9. [Deploy ke Server Production](#deploy-ke-server-production)
10. [Pembaruan Aplikasi](#pembaruan-aplikasi)
11. [Pemecahan Masalah](#pemecahan-masalah)
12. [Perintah npm](#perintah-npm)
13. [Role & Alur Kerja](#role--alur-kerja)
14. [Keamanan](#keamanan)
15. [Struktur Proyek](#struktur-proyek)

---

## Fitur

- **Certificate Builder** (drag & drop): nama, nomor, kegiatan, tema kegiatan, tanggal, peran, **teks kustom** multi-baris dengan isian otomatis (`{nama}`, `{hari}`, `{tanggal}`, `{lokasi}`, …), **multi-TTD**, **multi-logo**, dan QR Code.
- **27 font** bawaan (Great Vibes, Playfair, Montserrat, Poppins, …) + **unggah font sendiri** (TTF/OTF/WOFF), **8 tema** gaya siap pakai, **pipet warna** & palet warna dari template.
- **Peserta**: import **Excel (.xlsx)** / CSV (template tersedia), tambah/edit manual, hapus terpilih / semua. Nama bergelar yang mengandung koma tetap terbaca benar.
- **Alur persetujuan**: event HMP diajukan ke Kaprodi → disetujui/ditolak dengan catatan.
- **Penerbitan terpisah dari email**: pratinjau PDF tiap peserta sebelum terbit, terbitkan semua/terpilih, kirim email hanya bila diperlukan, status *terbit* & *email* per peserta. Kaprodi dapat **membuka kunci** event untuk memperbaiki kesalahan.
- **Portal publik**: cari sertifikat (email / nomor), unduh PDF, verifikasi QR (anti-pemalsuan HMAC).
- **Super Admin**: kelola user & permintaan akses Google, **Fitur & Akses** per role, **Pengaturan Aplikasi** (logo, warna, nama, tagline, deskripsi, footer), log sistem.

---

## Prasyarat

| Perangkat lunak | Versi | Keterangan |
|---|---|---|
| [Node.js](https://nodejs.org) | **20 atau lebih baru** (disarankan 22 LTS) | sudah termasuk npm |
| [PostgreSQL](https://www.postgresql.org/download/) | 14+ (diuji di 18) | database utama |
| [Git](https://git-scm.com) | terbaru | untuk clone repository |
| Mailpit / server SMTP | – | untuk mengirim email sertifikat (Mailpit sudah ada di Laragon) |

> Fitur PDF, gambar, dan font memakai `sharp` & `pdfkit` yang terpasang otomatis lewat `npm install` (tidak perlu software tambahan).

---

## Tutorial Instalasi (Windows + Laragon)

### 1. Pasang perangkat lunak

1. Pasang **[Laragon](https://laragon.org/download/)** (sudah berisi Node.js, Git, dan Mailpit). Pastikan versi Node.js di Laragon **≥ 20**: klik kanan Laragon → *Node.js* → pilih versi 20/22 (atau unduh dari nodejs.org).
2. Pasang **PostgreSQL** dari [postgresql.org](https://www.postgresql.org/download/windows/). Catat **password user `postgres`** yang Anda buat saat instalasi. Biarkan port default `5432`.

### 2. Clone repository

Buka **Terminal Laragon** (tombol *Terminal*), lalu:

```bash
cd C:\laragon\www
git clone https://github.com/DzikyR/sertifikatdigital.git
cd sertifikatdigital
```

### 3. Pasang dependensi

```bash
npm install
```

Perintah ini juga menjalankan `prisma generate` secara otomatis.

### 4. Buat database

Buka **SQL Shell (psql)** atau **pgAdmin**, lalu jalankan:

```sql
CREATE DATABASE sertifdigital;
```

> Lewat terminal: `"C:\Program Files\PostgreSQL\18\bin\psql" -U postgres -c "CREATE DATABASE sertifdigital;"` (sesuaikan angka versi PostgreSQL Anda).

### 5. Buat file `.env`

```bash
copy .env.example .env
```

Buka `.env` dengan editor, lalu **minimal** ubah:

```ini
DATABASE_URL="postgresql://postgres:PASSWORD_POSTGRES_ANDA@localhost:5432/sertifdigital?schema=public"
SESSION_SECRET=isi-string-acak-panjang
QR_SIGNING_SECRET=isi-string-acak-panjang-yang-berbeda
SEED_SUPERADMIN_EMAIL=superadmin@tsu.ac.id
SEED_SUPERADMIN_PASSWORD=PasswordKuatAnda123
```

Buat string acak untuk secret dengan:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> ⚠️ **`QR_SIGNING_SECRET` jangan diubah** setelah sertifikat pertama terbit — semua QR yang sudah tercetak akan dinyatakan tidak valid.

### 6. Buat tabel & akun awal

```bash
npm run db:deploy     # menerapkan semua migrasi database
npm run db:seed       # membuat akun Super Admin & Admin Prodi (+ akun demo di development)
```

### 7. Jalankan aplikasi

```bash
npm run dev
```

Buka **http://localhost:3000** lalu login dengan `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`.

`npm run dev` menjalankan server (auto-restart saat file berubah) **dan** Tailwind (membangun `public/css/style.css`). Hentikan dengan `Ctrl + C`.

### 8. Nyalakan Mailpit (untuk email)

Di Laragon: menu **Menu → Mailpit** (atau *Start All*). Email uji bisa dilihat di **http://localhost:8025**.

---

## Tutorial Instalasi (Linux / macOS)

```bash
# 1. Prasyarat (contoh Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs postgresql git

# 2. Database
sudo -u postgres psql -c "CREATE DATABASE sertifdigital;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'password-anda';"

# 3. Aplikasi
git clone https://github.com/DzikyR/sertifikatdigital.git
cd sertifikatdigital
npm install
cp .env.example .env          # lalu edit DATABASE_URL, SESSION_SECRET, QR_SIGNING_SECRET, SEED_*
npm run db:deploy
npm run db:seed
npm run dev                   # http://localhost:3000
```

Untuk email lokal, jalankan [Mailpit](https://mailpit.axllent.org/docs/install/) (`mailpit` → SMTP `localhost:1025`, inbox `http://localhost:8025`).

---

## Konfigurasi `.env`

| Variabel | Wajib | Keterangan |
|---|---|---|
| `NODE_ENV` | ✓ | `development` atau `production` |
| `PORT` | ✓ | port server (default `3000`) |
| `APP_URL` | ✓ | URL publik aplikasi. **Tertanam di setiap QR Code** — isi dengan domain asli sebelum menerbitkan sertifikat pertama |
| `TRUST_PROXY` |  | `1` bila berjalan di belakang nginx / reverse proxy |
| `SESSION_SECRET` | ✓ | string acak panjang untuk cookie sesi |
| `QR_SIGNING_SECRET` | ✓ | string acak untuk tanda tangan QR (jangan diubah setelah ada sertifikat terbit) |
| `DATABASE_URL` | ✓ | koneksi PostgreSQL |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |  | login Google (kosongkan untuk menonaktifkan) |
| `GOOGLE_ALLOWED_DOMAIN` |  | batasi login Google ke domain tertentu, mis. `tsu.ac.id` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | ✓ | server email (default Mailpit `localhost:1025`) |
| `MAIL_FROM` | ✓ | pengirim email, mis. `"Prodi Informatika TSU <no-reply@tsu.ac.id>"` |
| `RATE_LIMIT_*`, `PUBLIC_RATE_LIMIT_MAX` |  | batas request |
| `SEED_SUPERADMIN_*`, `SEED_ADMINPRODI_*` | ✓ (saat seed) | akun awal yang dibuat `npm run db:seed` (password min. 10 karakter) |

> File `.env` berisi rahasia dan **tidak ikut** ter-commit ke Git.

---

## Login Google (opsional)

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → buat project → **APIs & Services → OAuth consent screen** (pilih *Internal* bila memakai Google Workspace kampus).
2. **Credentials → Create Credentials → OAuth client ID** → tipe *Web application*.
3. **Authorized redirect URIs**: `http://localhost:3000/auth/google/callback` (dan `https://domain-anda/auth/google/callback` untuk production).
4. Salin *Client ID* & *Client Secret* ke `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), lalu restart server.

Akun Google dari domain yang diizinkan tetapi belum terdaftar akan masuk ke **Permintaan Akses**; Super Admin menyetujui sambil memilih role di menu **Kelola User**.

---

## Email (Mailpit / SMTP)

- **Development**: Mailpit (Laragon) — semua email tertangkap di http://localhost:8025, tidak terkirim sungguhan.
- **Production**: isi SMTP sungguhan, contoh Gmail/Google Workspace (memakai *App Password*):

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=akun@tsu.ac.id
SMTP_PASS=app-password-16-karakter
MAIL_FROM="Prodi Informatika TSU <akun@tsu.ac.id>"
```

Email hanya dikirim bila diminta dari tab **Peserta** (menerbitkan sertifikat tidak otomatis mengirim email).

---

## Login Pertama & Langkah Awal

1. Login sebagai **Super Admin** (akun dari `SEED_SUPERADMIN_*`).
2. **Segera ganti password** akun hasil seed (menu *Kelola User → Reset Password*). Di mode development, seed juga membuat akun demo `kaprodi@tsu.ac.id` dan `hmp@tsu.ac.id` dengan password yang sama — nonaktifkan bila tidak dipakai.
3. Buka **Pengaturan Aplikasi** untuk mengatur logo, warna, nama, tagline, deskripsi, dan footer.
4. Buat akun Kaprodi/Admin Prodi & pengurus HMP di **Kelola User** (atau setujui permintaan akses Google).
5. Kaprodi/HMP: **Event Sertifikat → Buat Event** → unggah template → atur di Builder → import peserta → (HMP: ajukan ke Kaprodi) → terbitkan.

---

## Deploy ke Server Production

```bash
git clone https://github.com/DzikyR/sertifikatdigital.git && cd sertifikatdigital
npm ci
cp .env.example .env            # NODE_ENV=production, APP_URL=https://domain-anda, TRUST_PROXY=1, SMTP asli, secret baru
npm run db:deploy
npm run db:seed                 # di production hanya membuat Super Admin & Admin Prodi
npm run build                   # membangun CSS (wajib, karena public/css/style.css tidak ada di Git)
npm start
```

Jalankan sebagai service, misalnya dengan **PM2**:

```bash
npm install -g pm2
pm2 start src/server.js --name sertifdigital
pm2 save && pm2 startup
```

Contoh **nginx** (reverse proxy + HTTPS via Certbot):

```nginx
server {
    server_name sertifikat.domain-anda.ac.id;
    client_max_body_size 12m;          # upload template maks. 10 MB
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Checklist production:**

- [ ] `NODE_ENV=production`, `TRUST_PROXY=1`, HTTPS aktif
- [ ] `APP_URL` = domain asli (**sebelum** sertifikat pertama terbit)
- [ ] `SESSION_SECRET` & `QR_SIGNING_SECRET` baru (jangan pakai nilai contoh)
- [ ] Redirect URI Google OAuth untuk domain production
- [ ] SMTP sungguhan
- [ ] Backup rutin database **dan** folder `storage/` (template, TTD, logo, font, PDF)

---

## Pembaruan Aplikasi

```bash
git pull
npm install
npm run db:deploy     # menerapkan migrasi baru (bila ada)
npm run build         # production
pm2 restart sertifdigital   # atau jalankan ulang npm run dev
```

---

## Pemecahan Masalah

| Masalah | Solusi |
|---|---|
| Tampilan berantakan / tanpa gaya | CSS belum dibangun. Jalankan `npm run dev` (development) atau `npm run build`. |
| `P1001: Can't reach database server` | PostgreSQL belum berjalan atau `DATABASE_URL` salah (user, password, port, nama database). |
| `P1003: Database ... does not exist` | Buat database dulu (`CREATE DATABASE sertifdigital;`). |
| `EPERM: operation not permitted, rename ... query_engine-windows.dll.node` | Server masih berjalan saat `prisma generate`/`migrate`. Hentikan `npm run dev`, ulangi perintah, lalu jalankan lagi. |
| Email gagal terkirim (status *Gagal*) | Mailpit/SMTP belum menyala atau kredensial salah. Perbaiki, lalu klik **Kirim Ulang yang Gagal** di tab Peserta. |
| Tombol "Masuk dengan Google" tidak muncul | `GOOGLE_CLIENT_ID/SECRET` kosong atau fitur login Google dimatikan di *Fitur & Akses*. |
| `redirect_uri_mismatch` saat login Google | Samakan `GOOGLE_CALLBACK_URL` dengan redirect URI di Google Cloud Console. |
| QR mengarah ke `localhost` | `APP_URL` belum diganti sebelum sertifikat terbit. Ganti `APP_URL`, lalu Kaprodi **Buka Kunci** event dan terbitkan ulang (nomor & kode QR tetap sama). |
| `SEED_SUPERADMIN_PASSWORD minimal 10 karakter` | Perpanjang password di `.env`, lalu `npm run db:seed` lagi. |

---

## Perintah npm

| Perintah | Fungsi |
|---|---|
| `npm run dev` | server (auto-restart) + Tailwind watch |
| `npm start` | jalankan server (production) |
| `npm run build` | bangun CSS Tailwind (minified) |
| `npm run db:deploy` | terapkan migrasi database |
| `npm run db:migrate` | buat migrasi baru saat mengubah `schema.prisma` (development) |
| `npm run db:seed` | buat/perbarui akun awal (tidak menimpa password yang sudah ada) |
| `npm run db:studio` | lihat isi database di browser (Prisma Studio) |
| `npm run db:reset` | **hapus semua data** lalu migrasi & seed ulang (development saja) |

---

## Role & Alur Kerja

| Role | Akses |
|---|---|
| `SUPER_ADMIN` | Kelola user & permintaan akses, Fitur & Akses, Pengaturan Aplikasi, log sistem |
| `ADMIN` (Kaprodi / Admin Prodi) | Event Prodi (terbit tanpa approval), menyetujui/menolak draf HMP, membuka kunci event |
| `HMP` | Event HMP: template, TTD, logo, builder, peserta, ajukan ke Kaprodi, terbitkan setelah disetujui |
| Publik (tanpa login) | `/cari` pencarian & unduh PDF, `/verify/:kode` hasil scan QR |

```
PRODI: DRAFT ──terbitkan──▶ PUBLISHED
HMP  : DRAFT ─ajukan─▶ PENDING_APPROVAL ─setujui─▶ APPROVED ─terbitkan─▶ PUBLISHED
                              └─tolak (alasan)─▶ REJECTED ─(revisi & ajukan ulang)
Kaprodi: APPROVED / PUBLISHED ──buka kunci (alasan)──▶ DRAFT
```

Setelah event terkunci, sertifikat diterbitkan **per peserta** (setelah pratinjau) dan baru dapat diakses publik setelah terbit. Email dikirim terpisah, kapan saja diperlukan.

---

## Keamanan

Helmet (CSP tanpa inline script), CSRF (synchronizer token), rate limit (global, publik, login), validasi input (express-validator), RBAC per route & per status event, fitur yang bisa dimatikan per role, upload divalidasi ulang dengan sharp/fontkit, QR verifikasi berisi kode acak 144-bit + HMAC-SHA256 atas data sertifikat (perubahan data di database terdeteksi sebagai TIDAK VALID), audit log seluruh aksi penting.

---

## Struktur Proyek

```
prisma/            schema, migrasi, seed
public/            aset statis: js/ (main.js + pages/*), fonts/ (font bawaan, lisensi SIL OFL), img/
src/config/        env, database, session, passport, helmet, upload, mail, features
src/middlewares/   auth (RBAC), eventAccess, feature, csrf, rateLimiter, validate, errorHandler
src/services/      logika bisnis (event, layout, font, logo, signature, participant, pdf, blast, branding, public, stats, admin)
src/controllers/   api/ (JSON) & pages/ (render EJS)
src/routes/        public, auth, app (halaman), api/
src/views/         EJS (partials, pages, emails)
src/styles/        input.css (Tailwind v4 + design token)
storage/           upload & cache PDF (tidak diekspos publik, tidak ikut Git)
```

---

© Program Studi Informatika · Universitas Tiga Serangkai
