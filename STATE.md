# STATE — SertifDigital Informatika TSU

_Terakhir diperbarui: 24 Oktober 2026_

## 1. Yang selesai hari ini

Keempat tahap (milestone) selesai dan sudah diuji.

| Tahap | Isi | Verifikasi |
|---|---|---|
| 1. Setup | Express 5, EJS, Tailwind v4 (palet biru TSU + emas), struktur MVC, Helmet, rate limit, error handler | Server jalan, header keamanan aktif |
| 2. DB & Auth | PostgreSQL 18 + Prisma 6 (User, Event, EventSignature, Certificate, AuditLog, Session), Passport Local + Google OAuth, RBAC, CSRF (`csrf-sync`), session di PostgreSQL | Login/logout/CSRF/RBAC diuji end-to-end |
| 3. Backend | CRUD event, workflow approval, upload template & multi-TTD, API koordinat builder, generator PDF (PDFKit: teks + TTD + QR), import CSV, nomor sertifikat otomatis, blast email (Nodemailer → Mailpit), endpoint publik verifikasi/pencarian/unduh, kelola user, audit log | **53/53** skenario E2E lolos |
| 4. Frontend | Dashboard per role + grafik, daftar/detail event, **Certificate Builder (Fabric.js)**, halaman persetujuan, kelola user, log sistem, portal publik `/cari` & `/verify/:kode` | **23/23** uji UI di Chrome headless lolos, tanpa error JS/CSP |

Perubahan tambahan atas permintaan:
- Database diganti dari MySQL ke **PostgreSQL**.
- Akun **Admin Prodi** (`adminprodi@tsu.ac.id`) ditambahkan dengan role `ADMIN`, selevel Kaprodi.
- Google Client ID & Secret sudah diisi di `.env`. **Login Google sudah terbukti berhasil** (akun `dziky@tsu.ac.id` login via Google dan tertaut).
- **Alur persetujuan akses Google**: akun `@tsu.ac.id` yang belum terdaftar kini otomatis menjadi *Permintaan Akses* (status `PENDING`) dan melihat halaman "menunggu persetujuan". Super Admin menyetujui sambil memilih role, atau menolak, di menu **Kelola User**. Ada badge di sidebar dan pengingat di dashboard Super Admin. Antrean dibatasi 100 permintaan. Diuji: 15/15 skenario logika + 8/8 uji browser, dan seluruh uji sebelumnya tetap lolos.
- **Manajemen Fitur & Akses** (menu Super Admin): matriks aktif/nonaktif 11 fitur per role (Kaprodi/Admin Prodi, HMP) + 4 fitur global (portal pencarian, unduh PDF publik, login Google, permintaan akses). Ditegakkan di tampilan **dan** di server (API menolak dengan pesan "dinonaktifkan oleh Super Admin"). Super Admin tidak bisa dibatasi; verifikasi QR tidak bisa dimatikan. Perubahan langsung berlaku, tercatat di log (`FEATURE_TOGGLE`/`FEATURE_RESET`), ada tombol "Kembalikan ke Default". Diuji: 29/29 skenario + uji unduh publik + uji browser, seluruh regresi tetap lolos.

Kondisi akhir database: bersih (data uji sudah dihapus), 0 event. Isinya 5 akun: `superadmin@`, `adminprodi@`, `dziky@` (dibuat sendiri, role Kaprodi/Admin Prodi), `kaprodi@` (demo), `hmp@` (demo). Akun hasil seed memakai password = `SEED_SUPERADMIN_PASSWORD` di `.env` (masih password contoh — wajib diganti).

Migrasi yang sudah diterapkan: `init`, `signature_signer_text`, `cert_number_default`, `user_access_requests`, `feature_settings`.

### Pembaruan 26 Oktober 2026
- **Login**: tombol ikon mata untuk melihat/menyembunyikan password (juga di form tambah user).
- **Font baru**: 27 font bawaan (Great Vibes, Pinyon Script, Alex Brush, Dancing Script, Playfair Display, Cinzel, Lora, EB Garamond, Montserrat, Poppins + variannya; file WOFF di `public/fonts`, lisensi SIL OFL) + **unggah font kustom** (TTF/OTF/WOFF, divalidasi dengan fontkit) di panel builder. Font tersemat di PDF. Font yang masih dipakai event tidak bisa dihapus. Migrasi baru: `custom_fonts`.
- **Tema builder**: 8 preset paduan font & warna (Standar, Klasik Emas, Formal Biru TSU, Elegan Kaligrafi, Akademik, Modern, Ceria, Lembut). Font teks di bawah TTD kini bisa dipilih.
- **Import peserta**: mendukung **Excel (.xlsx)** + template Excel berkolom (dengan lembar petunjuk); template CSV memakai titik koma agar langsung terbagi kolom di Excel berbahasa Indonesia; tabel format kolom di tab Peserta. Nama bergelar berkoma tanpa tanda kutip (`Dziky Ridhwanullah, S.Kom., M.Kom,dziky@...`) kini digabung otomatis berdasarkan posisi kolom email dan dilaporkan sebagai "diperbaiki otomatis". File tanpa baris judul juga diterima bila kolomnya sesuai urutan template.
- Diuji: 20/20 skenario API + 11/11 uji browser (tanpa error JS/CSP).
- **Tema Kegiatan**: kolom opsional `theme` di event (maks. 250 karakter; migrasi `event_theme`). Diisi di form buat/ubah event, tampil di detail event & halaman verifikasi publik, dan bisa dicetak lewat elemen "Tema Kegiatan" di builder (nonaktif secara default). Diuji 12/12 skenario.
- **Teks Kustom** di builder: hingga 20 blok teks bebas per event (maks. 1000 karakter, multi-baris + pindah baris otomatis sesuai lebar kotak), dengan font/warna/perataan/jarak baris sendiri. Mendukung isian otomatis `{nama} {peran} {instansi} {nomor} {kegiatan} {tema} {hari} {tanggal} {lokasi}` yang diganti data tiap peserta di PDF. Disimpan di `layout.texts` (tanpa migrasi). Tema gaya ikut mengubah font/warna teks kustom. Diuji 9/9 (browser + PDF). Kartu **Kode Isian Otomatis** di panel builder menampilkan semua kode beserta arti & contoh nilainya dari event (kode yang datanya belum diisi ditandai); klik kode = sisipkan ke teks terpilih atau salin.
- **Pengaturan Aplikasi** (menu Super Admin `/admin/settings`): logo (PNG/JPG/WEBP/SVG → PNG 512px, dipakai di header, sidebar, login, footer, email & favicon), warna utama + aksen (gradasi dibuat otomatis, disajikan lewat `/theme.css` yang menimpa variabel Tailwind; warna default = palet lama persis, tanpa CSS tambahan), nama/subjudul/teks logo, nama unit & institusi, tagline, deskripsi meta, label penyelenggara Prodi/HMP, teks beranda (badge, judul, sorotan, deskripsi, 3 kartu keunggulan), teks login, footer (hak cipta, catatan, alamat, email, telepon, situs, Instagram, YouTube). Pratinjau langsung + cek kontras WCAG + preset warna + tombol "Default" per kolom + "Kembalikan Semua ke Default". Disimpan di tabel `app_settings` (migrasi `app_settings`, hanya nilai yang berbeda dari default), di-cache seperti fitur. Diuji 21/21 sebagai Super Admin; data uji sudah dikembalikan ke default.
- **Alat warna di builder** (permintaan sudut pandang pengurus HMP): setiap kolom warna (teks, teks kustom, teks TTD) kini = color picker + kolom **HEX** (bisa ketik/tempel `#0C2C5E`, `0c2c5e`, atau `rgb(12,44,94)`) + tombol **pipet**. Pipet memakai EyeDropper API (Chrome/Edge, ambil warna dari mana saja di layar); browser lain → mode klik pada kanvas (kanvas digulir otomatis ke layar, Esc batal). Panel **Palet Warna**: warna dominan template (diambil dari piksel asli JPG) + warna yang sedang dipakai; klik = pakai ke teks terpilih atau salin kode. Partial `partials/builder-color.ejs`. Diuji 12/12 sebagai akun HMP.
- **Pratinjau sebelum terbit**: semua tombol terbit (Terbitkan Semua, Terbitkan Semua yang Belum, Terbitkan Terpilih, Terbitkan per baris) membuka dialog pratinjau PDF dengan data asli tiap peserta (navigasi ←/→, "Tab baru"); tombol Terbitkan baru aktif setelah centang "sudah saya periksa". Tombol **Pratinjau** per baris (lihat saja). Endpoint `GET /participants/:id/preview` (render tanpa cache, CSP `frame-ancestors 'self'` agar bisa di-iframe).
- **Buka Kunci** (Kaprodi/Admin Prodi, fitur `event.unlock`): APPROVED/PUBLISHED → DRAFT dengan alasan wajib (disimpan di `reviewNote`, tampil sebagai banner). Semua sertifikat ditarik dari publik (`issuedAt = null`), cache PDF dihapus, status email direset ke "Belum"; nomor & kode QR tetap sehingga QR yang sudah tersebar valid lagi setelah terbit ulang. Ditolak bila blast sedang berjalan. Diuji 19/19.
- **Penerbitan & email dipisah**: tombol event "Terbitkan & Kirim Email" diganti **Terbitkan Semua** (`issueAll: true`) dan **Kunci & Pilih Peserta** (`issueAll: false`); keduanya tidak mengirim email. Sertifikat dapat diakses publik hanya bila terbit (`issuedAt`), seperti sebelumnya. Panel **Manajemen Penerbitan & Email** di tab Peserta: hitungan Terbit/Belum terbit/Dicabut dan Terkirim/Belum/Antre/Gagal (bisa diklik sebagai filter), "Terbitkan Semua yang Belum", tombol blast; tabel punya kolom Penerbitan & Status Email, checkbox + "Terbitkan Terpilih" / "Kirim Email Terpilih", aksi per baris Terbitkan / Kirim email. Endpoint baru `POST /participants/issue` (izin `issue` = pengelola event terbit + fitur `event.publish`). Statistik email event kini hanya menghitung sertifikat terbit. Diuji 18/18 (termasuk verifikasi publik & email nyata ke Mailpit).
- **Kelola peserta di tabel** (selama event masih bisa diedit): tombol **Tambah Peserta** (form manual, nomor urut melanjutkan), tombol **Edit** per baris (dialog; nomor & kode verifikasi tetap, HMAC dihitung ulang), checkbox per baris + pilih semua + **Hapus Terpilih**, dan **Hapus Semua** (dipindah dari kartu import ke toolbar tabel). Endpoint: `POST /participants`, `PATCH /participants/:id`, `POST /participants/bulk-delete`. Duplikat email+peran ditolak (409). Diuji 15/15 di browser.
- **Logo (lebih dari satu)**: model baru `EventLogo` (migrasi `event_logos`), maks. 10 logo per event. Diunggah di tab Template & TTD (PNG/JPG/WEBP/SVG maks. 5 MB; divalidasi & dinormalkan ke PNG oleh sharp, SVG dirender 300 dpi; peringatan bila tanpa latar transparan). Posisi & ukuran diatur di builder (proporsional), dicetak di bawah lapisan teks. Ikut terkunci bersama template saat event diajukan/terbit. Diuji 13/13 (API + browser + PDF).

## 2. Bug / error / risiko yang masih tersisa

Tidak ada bug yang diketahui gagal di pengujian. Yang tersisa adalah hal yang **belum terverifikasi** atau **keterbatasan**:

### Belum terverifikasi
- **Alur permintaan akses dengan akun Google sungguhan.** Logikanya sudah diuji dengan profil Google tiruan, tapi belum dicoba dengan akun `@tsu.ac.id` asli yang belum terdaftar.
- **Presisi posisi teks builder vs PDF.** Posisi vertikal teks di kanvas Fabric.js dan di PDFKit dihitung dengan rumus tinggi baris yang sedikit berbeda, sehingga bisa ada selisih beberapa piksel. Belum diuji dengan template asli dari HMP/Prodi.
- **Pengiriman ke SMTP sungguhan** (bukan Mailpit) belum pernah dicoba.

### Keterbatasan yang diketahui
- **Tes otomatis tidak ada di repo.** Skrip uji (E2E API, smoke test halaman, uji UI Playwright) masih di folder scratchpad sementara dan bisa hilang.
- **Belum menjadi repository git.** Belum ada commit sama sekali.
- **Antrean email berjalan di dalam proses server.** Jika server restart di tengah blast, sisa email tetap berstatus antre dan harus dilanjutkan manual lewat tombol **Kirim yang Belum** di tab Peserta.
- **Peserta tidak bisa ditambah setelah event terbit** (template, layout & peserta terkunci sejak diajukan/terbit).
- **Font bawaan hanya subset Latin** (huruf A-Z, angka, tanda baca, aksen Latin-1). Huruf di luar itu (mis. ā, ş) tampil kotak pada 27 font bawaan; font standar PDF & font kustom tidak terpengaruh.
- **Lisensi font kustom** tidak diperiksa sistem. Pengunggah bertanggung jawab memastikan font boleh disematkan di PDF.
- **Pencarian publik berdasarkan email** menampilkan semua sertifikat milik email itu kepada siapa pun yang mengetahui emailnya (sesuai spesifikasi, tapi perlu disadari dari sisi privasi).
- **Mailpit tidak menyala otomatis.** Harus dinyalakan dari Laragon sebelum menerbitkan sertifikat.
- **Belum ada mode gelap.**
- **Pengaturan fitur di-cache per proses server** dan disegarkan setiap 30 detik. Perubahan lewat halaman Fitur & Akses langsung berlaku; perubahan yang dilakukan langsung di database baru terlihat maksimal 30 detik kemudian.
- **Fitur yang dimatikan tidak berlaku surut**: misalnya mematikan "Mengirim email" tidak menghentikan blast yang sedang berjalan.
- **Tidak ada notifikasi email** ke Super Admin saat ada permintaan akses baru, maupun ke pengguna saat disetujui/ditolak. Super Admin harus membuka aplikasi untuk melihatnya.

### Peringatan teknis
- `npm audit`: 3 temuan *high* di `deepmerge-ts`, terbawa oleh CLI Prisma 6 (hanya dipakai saat development). Perbaikannya butuh upgrade ke Prisma 7 yang mengubah cara setup.
- Prisma menampilkan peringatan bahwa konfigurasi `package.json#prisma` (seed) akan dihapus di Prisma 7.

### Wajib sebelum production
- Ganti `APP_URL` ke domain asli **sebelum menerbitkan sertifikat pertama**. URL ini tertanam di setiap QR Code, jadi sertifikat yang terbit dengan URL `localhost` akan mengarah ke tempat yang salah.
- Set `NODE_ENV=production` dan `TRUST_PROXY=1` (jika di belakang nginx).
- Daftarkan redirect URI Google OAuth untuk domain production.
- Isi konfigurasi SMTP sungguhan.

## 3. Yang dikerjakan pertama kali besok

1. **`git init` + commit pertama.** Pastikan `.env` dan `storage/` tidak ikut ter-commit (sudah ada di `.gitignore`).
2. **Uji alur permintaan akses dengan akun Google asli.** Minta seseorang dengan akun `@tsu.ac.id` yang belum terdaftar mencoba login → pastikan muncul halaman "menunggu persetujuan" → setujui di Kelola User → login ulang berhasil.
3. **Pindahkan skrip uji ke repo** (folder `tests/`) dan tambahkan `npm test`, supaya bisa dijalankan ulang setiap ada perubahan.
4. **Uji dengan template sertifikat asli** dari Prodi/HMP: atur di builder, bandingkan dengan Preview PDF, dan koreksi selisih posisi teks bila ada.

Setelah itu (opsional, sesuai prioritas): font dekoratif untuk nama peserta, izin menambah peserta setelah terbit, antrean email yang tahan restart, persiapan deploy production.

## Referensi cepat

```bash
npm run dev          # server + Tailwind watch → http://localhost:3000
npm run db:migrate   # terapkan migrasi
npm run db:seed      # buat ulang akun awal
npm run db:studio    # lihat isi database
```

Mailpit (inbox email uji): http://localhost:8025 · Panduan setup lengkap: `README.md`
