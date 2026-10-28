// Pustaka tanda tangan (Kaprodi/Admin Prodi): unggah & ubah keterangan
document.addEventListener('DOMContentLoaded', () => {
  const { api, toast, setBusy, flashNext } = window.App;

  const upload = document.querySelector('form[data-signature-upload]');
  upload?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = upload.querySelector('[type="submit"]');
    const fd = new FormData(upload);
    fd.set('hmpAllowed', upload.elements.hmpAllowed.checked ? 'true' : 'false');
    setBusy(btn, true);
    try {
      const res = await api('POST', '/api/signatures', fd);
      flashNext(res.warning ? `${res.message} ${res.warning}` : res.message, res.warning ? 'info' : 'success');
      location.reload();
    } catch (err) {
      toast(err.message, 'error', 7000);
      setBusy(btn, false);
    }
  });

  const dlg = document.getElementById('edit-signature');
  const form = dlg.querySelector('[data-edit-form]');
  let editingId = null;
  document.querySelectorAll('[data-edit-signature]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = JSON.parse(btn.dataset.editSignature);
      editingId = d.id;
      ['label', 'signerName', 'signerTitle'].forEach((k) => { form.elements[k].value = d[k] || ''; });
      dlg.showModal();
      form.elements.label.focus();
    });
  });
  dlg.querySelectorAll('[data-edit-cancel]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const body = Object.fromEntries(['label', 'signerName', 'signerTitle'].map((k) => [k, form.elements[k].value.trim()]));
    setBusy(btn, true);
    try {
      const res = await api('PATCH', `/api/signatures/${editingId}`, body);
      flashNext(res.message);
      location.reload();
    } catch (err) {
      toast(err.message, 'error', 7000);
      setBusy(btn, false);
    }
  });
});
