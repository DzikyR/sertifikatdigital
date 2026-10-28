// Halaman detail event: upload multipart (template, TTD, CSV) & progres blast email
document.addEventListener('DOMContentLoaded', () => {
  const { api, toast, setBusy, flashNext } = window.App;

  // Pindah ke tab peserta bila datang dari form pencarian peserta
  if (new URLSearchParams(location.search).get('tab') === 'peserta' && location.hash !== '#peserta') {
    document.querySelector('[data-tab="peserta"]')?.click();
  }

  document.querySelectorAll('form[data-upload-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button:not([type="button"])');
      const fd = new FormData(form);
      // Checkbox tak tercentang tidak ikut FormData -> kirim eksplisit
      form.querySelectorAll('input[type="checkbox"][name]').forEach((cb) => fd.set(cb.name, cb.checked ? 'true' : 'false'));
      setBusy(btn, true);
      try {
        const res = await api('POST', form.dataset.url, fd);
        if ('report' in form.dataset) {
          const { skipped = [], errors = [], fixes = [] } = res.data || {};
          if (skipped.length || errors.length || fixes.length) {
            // Tampilkan laporan baris yang dilewati; muat ulang manual agar laporan sempat dibaca
            const box = document.querySelector('[data-import-report]');
            box.replaceChildren();
            const title = document.createElement('p');
            title.className = 'font-semibold';
            title.textContent = res.message;
            box.appendChild(title);
            const ul = document.createElement('ul');
            ul.className = 'mt-2 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5';
            [...errors, ...skipped, ...fixes].slice(0, 100).forEach((r) => {
              const li = document.createElement('li');
              li.textContent = `Baris ${r.line}: ${r.message}`;
              if (fixes.includes(r)) li.className = 'text-emerald-800';
              ul.appendChild(li);
            });
            box.appendChild(ul);
            const reload = document.createElement('button');
            reload.type = 'button';
            reload.className = 'btn btn-outline mt-3';
            reload.textContent = 'Muat ulang daftar peserta';
            reload.addEventListener('click', () => location.reload());
            box.appendChild(reload);
            box.classList.remove('hidden');
            toast(res.message, 'info', 8000);
            setBusy(btn, false);
            form.reset();
            return;
          }
        }
        flashNext(res.warning ? `${res.message || 'Berhasil.'} ${res.warning}` : (res.message || 'Berhasil diunggah.'), res.warning ? 'info' : 'success');
        location.reload();
      } catch (err) {
        toast(err.message, 'error', 7000);
        setBusy(btn, false);
      }
    });
  });

  // ---------------------------------------------------------------- pratinjau sebelum terbit
  // Menampilkan PDF dengan data asli tiap peserta; tombol Terbitkan baru aktif setelah dicentang.
  const pv = document.getElementById('issue-preview');
  const rowData = () => [...document.querySelectorAll('tr[data-row]')].map((tr) => ({ ...tr.dataset }));
  let openPreview = () => {};
  if (pv) {
    const $p = (s) => pv.querySelector(s);
    const frame = $p('[data-pv-frame]');
    const okBtn = $p('[data-pv-ok]');
    const check = $p('[data-pv-check]');
    let state = { items: [], index: 0, onConfirm: null };

    const show = () => {
      const it = state.items[state.index];
      const url = `${pv.dataset.baseUrl}/${it.id}/preview`;
      frame.src = url;
      $p('[data-pv-open]').href = url;
      $p('[data-pv-who]').textContent = `${it.name} · ${it.email} · ${it.role} · No. ${it.number}`;
      $p('[data-pv-pos]').textContent = `${state.index + 1} / ${state.items.length}`;
      $p('[data-pv-prev]').disabled = state.index === 0;
      $p('[data-pv-next]').disabled = state.index === state.items.length - 1;
    };
    openPreview = ({ items, index = 0, title, note = '', confirmLabel, onConfirm }) => {
      if (!items.length) { toast('Tidak ada peserta untuk dipratinjau.', 'info'); return; }
      state = { items, index, onConfirm };
      $p('[data-pv-title]').textContent = title;
      $p('[data-pv-note]').textContent = note;
      $p('[data-pv-confirm-bar]').classList.toggle('hidden', !onConfirm);
      check.checked = false;
      okBtn.disabled = true;
      okBtn.textContent = confirmLabel || 'Terbitkan';
      show();
      pv.showModal();
    };
    $p('[data-pv-prev]').addEventListener('click', () => { if (state.index > 0) { state.index -= 1; show(); } });
    $p('[data-pv-next]').addEventListener('click', () => { if (state.index < state.items.length - 1) { state.index += 1; show(); } });
    pv.querySelectorAll('[data-pv-close]').forEach((b) => b.addEventListener('click', () => pv.close()));
    pv.addEventListener('close', () => { frame.src = 'about:blank'; });
    pv.addEventListener('keydown', (e) => {
      if (e.target === check) return;
      if (e.key === 'ArrowLeft') $p('[data-pv-prev]').click();
      if (e.key === 'ArrowRight') $p('[data-pv-next]').click();
    });
    check.addEventListener('change', () => { okBtn.disabled = !check.checked; });
    okBtn.addEventListener('click', async () => {
      setBusy(okBtn, true);
      try {
        await state.onConfirm();
      } catch (err) {
        toast(err.message, 'error', 8000);
        setBusy(okBtn, false);
      }
    });
  }

  const postAndReload = async (url, body) => {
    const res = await api('POST', url, body);
    flashNext(res.message);
    location.reload();
  };

  // Pratinjau satu peserta (lihat saja), bisa geser ke peserta lain di daftar
  document.querySelectorAll('[data-preview-row]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const items = rowData();
      openPreview({ items, index: Math.max(0, items.findIndex((r) => r.id === btn.dataset.previewRow)), title: 'Pratinjau Sertifikat' });
    });
  });

  // Tombol terbit: semua (event), semua yang belum, atau satu peserta -> pratinjau dulu
  document.querySelectorAll('[data-preview-issue]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.previewIssue;
      let items = rowData().filter((r) => r.active === '1');
      if (mode === 'unissued') items = items.filter((r) => r.issued === '0');
      if (mode === 'one') items = items.filter((r) => r.id === btn.dataset.id);
      const total = Number(btn.dataset.total || items.length);
      const more = total > items.length ? ` Pratinjau menampilkan ${items.length} dari ${total} peserta (yang tampil di tabel).` : '';
      const title = mode === 'one' ? 'Pratinjau sebelum terbit' : `Pratinjau sebelum menerbitkan ${total} sertifikat`;
      openPreview({
        items,
        title,
        note: `Periksa nama, gelar, peran & posisi teks tiap peserta (gunakan tombol panah). Setelah terbit, sertifikat langsung dapat diakses via web; email tidak dikirim otomatis.${more}`,
        confirmLabel: btn.dataset.confirmLabel,
        onConfirm: () => postAndReload(btn.dataset.url, JSON.parse(btn.dataset.body || '{}')),
      });
    });
  });

  // Alasan perbaikan (wajib, tercatat di log & tampil di tabel)
  const askWithdraw = (count) => window.App.dialog({
    title: `Tarik ${count} sertifikat untuk diperbaiki?`,
    message: `Hanya sertifikat terpilih yang ditarik dari publik (QR menampilkan "sedang diperbaiki"); sertifikat lain tetap terbit. Status email direset. Setelah datanya diedit, terbitkan kembali. Nomor & QR tetap sama.`,
    okLabel: 'Tarik',
    input: { label: 'Alasan perbaikan (mis. salah ketik nama)', required: true },
  });
  const withdraw = (url, ids, note) => api('POST', url, { ids, note });

  // Pilih beberapa peserta -> aksi massal (draf: hapus; terbit: tarik untuk perbaikan / terbitkan / kirim email)
  const bulkBar = document.querySelector('[data-bulk-bar]');
  if (bulkBar) {
    const rows = [...document.querySelectorAll('[data-select-row]')];
    const all = document.querySelector('[data-select-all]');
    const countEl = bulkBar.querySelector('[data-bulk-count]');
    const idleText = countEl.textContent;
    const selected = () => rows.filter((cb) => cb.checked);
    const delBtn = bulkBar.querySelector('[data-bulk-delete]');
    const issueBtn = bulkBar.querySelector('[data-bulk-issue]');
    const emailBtn = bulkBar.querySelector('[data-bulk-email]');
    const withdrawBtn = bulkBar.querySelector('[data-bulk-withdraw]');
    const refresh = () => {
      const sel = selected();
      const unissued = sel.filter((cb) => cb.dataset.issued === '0' && cb.dataset.active === '1').length;
      const sendable = sel.filter((cb) => cb.dataset.issued === '1' && cb.dataset.active === '1').length;
      if (delBtn) delBtn.disabled = sel.length === 0;
      if (issueBtn) issueBtn.disabled = unissued === 0;
      if (emailBtn) emailBtn.disabled = sendable === 0;
      if (withdrawBtn) withdrawBtn.disabled = sendable === 0;
      const parts = [`${sel.length} peserta dipilih`];
      if (issueBtn || emailBtn || withdrawBtn) parts.push(`${unissued} belum terbit`, `${sendable} terbit`);
      countEl.textContent = sel.length ? parts.join(' · ') : idleText;
      if (all) {
        all.checked = sel.length > 0 && sel.length === rows.length;
        all.indeterminate = sel.length > 0 && sel.length < rows.length;
      }
    };
    rows.forEach((cb) => cb.addEventListener('change', refresh));
    all?.addEventListener('change', () => { rows.forEach((cb) => { cb.checked = all.checked; }); refresh(); });

    const run = async (btn, confirmOpts, url, body) => {
      const ok = await window.App.dialog(confirmOpts);
      if (!ok) return;
      setBusy(btn, true);
      try {
        const res = await api('POST', url, body);
        flashNext(res.message);
        location.reload();
      } catch (err) {
        toast(err.message, 'error', 8000);
        setBusy(btn, false);
      }
    };
    delBtn?.addEventListener('click', () => {
      const ids = selected().map((cb) => cb.value);
      run(delBtn, {
        title: `Hapus ${ids.length} peserta?`,
        message: 'Peserta terpilih akan dihapus dari event ini. Tindakan ini tidak dapat dibatalkan.',
        okLabel: 'Hapus', danger: true,
      }, bulkBar.dataset.url, { ids });
    });
    issueBtn?.addEventListener('click', () => {
      const ids = selected().filter((cb) => cb.dataset.issued === '0' && cb.dataset.active === '1').map((cb) => cb.value);
      openPreview({
        items: rowData().filter((r) => ids.includes(r.id)),
        title: `Pratinjau sebelum menerbitkan ${ids.length} sertifikat`,
        note: 'Periksa sertifikat tiap peserta terpilih (gunakan tombol panah). Setelah terbit, sertifikat langsung dapat diakses via web; email tidak dikirim otomatis.',
        confirmLabel: `Terbitkan ${ids.length}`,
        onConfirm: () => postAndReload(bulkBar.dataset.issueUrl, { ids }),
      });
    });
    withdrawBtn?.addEventListener('click', async () => {
      const ids = selected().filter((cb) => cb.dataset.issued === '1' && cb.dataset.active === '1').map((cb) => cb.value);
      const note = await askWithdraw(ids.length);
      if (!note) return;
      setBusy(withdrawBtn, true);
      try {
        const res = await withdraw(bulkBar.dataset.withdrawUrl, ids, note);
        flashNext(res.message);
        location.href = `${location.pathname}?tab=peserta&issueStatus=withdrawn`;
      } catch (err) {
        toast(err.message, 'error', 8000);
        setBusy(withdrawBtn, false);
      }
    });
    emailBtn?.addEventListener('click', () => {
      const ids = selected().filter((cb) => cb.dataset.issued === '1' && cb.dataset.active === '1').map((cb) => cb.value);
      const skipped = selected().length - ids.length;
      run(emailBtn, {
        title: `Kirim email ke ${ids.length} peserta?`,
        message: `Sertifikat PDF dikirim ke email peserta terpilih (termasuk yang sudah pernah menerima).${skipped ? ` ${skipped} peserta dilewati karena belum terbit atau dicabut.` : ''}`,
        okLabel: 'Kirim email',
      }, bulkBar.dataset.blastUrl, { certificateIds: ids });
    });
    refresh();
  }

  // Edit data peserta (dialog)
  const editDlg = document.getElementById('edit-participant');
  if (editDlg) {
    const form = editDlg.querySelector('[data-edit-form]');
    let editingId = null;
    let reloadOnClose = false;
    const openEdit = (d) => {
      editingId = d.id;
      ['name', 'email', 'role', 'institution'].forEach((k) => { form.elements[k].value = d[k] || ''; });
      editDlg.showModal();
      form.elements.name.focus();
    };
    document.querySelectorAll('[data-edit-participant]').forEach((btn) => {
      btn.addEventListener('click', () => openEdit(JSON.parse(btn.dataset.editParticipant)));
    });
    // Perbaiki satu sertifikat terbit: tarik dulu, lalu langsung buka form edit
    document.querySelectorAll('[data-correct-row]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const d = JSON.parse(btn.dataset.correctRow);
        const note = await askWithdraw(1);
        if (!note) return;
        try {
          await withdraw(`${editDlg.dataset.baseUrl}/withdraw`, [d.id], note);
        } catch (err) {
          toast(err.message, 'error', 8000);
          return;
        }
        reloadOnClose = true; // status baris sudah berubah walau edit dibatalkan
        toast('Sertifikat ditarik. Silakan perbaiki datanya.', 'info');
        openEdit(d);
      });
    });
    editDlg.addEventListener('close', () => { if (reloadOnClose) location.reload(); });
    editDlg.querySelectorAll('[data-edit-cancel]').forEach((b) => b.addEventListener('click', () => editDlg.close()));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      const body = Object.fromEntries(['name', 'email', 'role', 'institution'].map((k) => [k, form.elements[k].value.trim()]));
      setBusy(btn, true);
      try {
        const res = await api('PATCH', `${editDlg.dataset.baseUrl}/${editingId}`, body);
        flashNext(res.message);
        reloadOnClose = false;
        location.reload();
      } catch (err) {
        toast(err.message, 'error', 7000);
        setBusy(btn, false);
      }
    });
  }

  // Polling progres blast email
  const panel = document.querySelector('[data-blast-panel]');
  if (panel) {
    const progress = panel.querySelector('[data-blast-progress]');
    const bar = panel.querySelector('[data-blast-bar]');
    const count = panel.querySelector('[data-blast-count]');
    const summary = panel.querySelector('[data-blast-summary]');
    let wasRunning = false;
    const poll = async () => {
      try {
        const res = await api('GET', panel.dataset.url);
        const e = res.email || {};
        summary.querySelectorAll('[data-email-count]').forEach((el) => { el.textContent = e[el.dataset.emailCount] || 0; });
        if (res.running && res.progress) {
          wasRunning = true;
          progress.classList.remove('hidden');
          bar.value = Math.round((res.progress.processed / res.progress.total) * 100);
          count.textContent = `${res.progress.processed} / ${res.progress.total}`;
          setTimeout(poll, 1500);
        } else if (wasRunning) {
          flashNext(`Pengiriman selesai: ${e.SENT || 0} terkirim, ${e.FAILED || 0} gagal.`, e.FAILED ? 'info' : 'success');
          location.reload();
        }
      } catch { /* abaikan; coba lagi saat halaman dimuat ulang */ }
    };
    poll();
  }
});
