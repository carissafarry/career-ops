# career-ops LinkedIn watcher (extension Chrome)

Me-reload satu tab pencarian LinkedIn-mu pada interval acak, lalu mengirim lowongan yang terlihat ke app career-ops di `http://localhost:3000`. App yang memutuskan semuanya (lowongan baru, notifikasi macOS, kapan polling berikutnya).

## Pasang (sekali)

1. Buka `chrome://extensions`.
2. Nyalakan **Developer mode** (pojok kanan atas).
3. Klik **Load unpacked**, pilih folder ini: `web/extensions/linkedin-watch/`.
4. Pastikan kamu sudah login ke LinkedIn di Chrome yang sama.

## Pakai

1. Jalankan app (`cd web && npm start`), buka menu **LinkedIn**.
2. Tempel URL pencarian LinkedIn yang sudah kamu atur filternya (remote, past 24 hours, urut terbaru), atur interval, simpan.
3. Tekan **Enable**. Dalam sekitar satu menit extension membuka window kecil (diminimize) berisi pencarian itu. Putaran pertama hanya mencatat baseline, tanpa notifikasi.
4. Biarkan Chrome tetap terbuka. Kalau Chrome atau window itu ditutup, polling berhenti dan menu menampilkan "extension silent".

## Berhenti otomatis

Kalau LinkedIn menampilkan login, captcha, checkpoint, atau 429, app menghentikan watcher dan mengirim notifikasi. Extension tidak mencoba menembusnya. Setelah kamu beres, tekan **Resume** di menu.

## Kalau "Last heard never" terus

App menolak request dari `chrome-extension://...` kecuali origin-nya didaftarkan. ID extension ini tetap (`lhdmblifafaboalafnfbpjiholhmpcme`, dari `key` di manifest), dan sudah ditulis di `web/.env.local`:

`CAREER_OPS_ALLOWED_ORIGINS=chrome-extension://lhdmblifafaboalafnfbpjiholhmpcme`

Setelah mengubah `.env.local`, **restart app** (`npm start`; kalau build, build ulang). Lalu di `chrome://extensions` klik **Reload** pada extension ini dan pastikan ID-nya sama. Kalau berbeda, hapus extension lama lalu Load unpacked lagi.

## Kalau daftar lowongan tidak terbaca

Window yang diminimize kadang tidak dirender LinkedIn. Ubah `WINDOW_STATE` di `background.js` dari `"minimized"` ke `"normal"` (lalu reload extension), dan taruh window kecilnya di pojok monitor.
