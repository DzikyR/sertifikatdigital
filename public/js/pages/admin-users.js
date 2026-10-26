// Kelola user: dialog tambah / ubah user
document.addEventListener('DOMContentLoaded', () => {
  const { api, toast, setBusy, flashNext } = window.App;
  const dlg = document.getElementById('user-dialog');
  const form = dlg.querySelector('[data-user-form]');
  const title = dlg.querySelector('[data-user-form-title]');
  const pwWrap = dlg.querySelector('[data-password-wrap]');
  let editingId = null;

  const open = (u) => {
    editingId = u?.id || null;
    form.reset();
    title.textContent = u ? `Ubah ${u.name}` : 'Tambah User';
    pwWrap.classList.toggle('hidden', Boolean(u)); // password diubah via "Reset Password"
    if (u) {
      form.elements.name.value = u.name;
      form.elements.email.value = u.email;
      form.elements.role.value = u.role;
    }
    dlg.showModal();
    form.elements.name.focus();
  };

  // Setujui permintaan akses dengan role yang dipilih
  document.querySelectorAll('form[data-approve-form]').forEach((f) => {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const role = f.elements.role.value;
      if (!role) return toast('Pilih role terlebih dahulu.', 'error');
      const btn = f.querySelector('button:not([type="button"])');
      setBusy(btn, true);
      try {
        const res = await api('POST', f.dataset.url, { role });
        flashNext(res.message);
        location.reload();
      } catch (err) {
        toast(err.message, 'error', 7000);
        setBusy(btn, false);
      }
    });
  });

  document.querySelector('[data-open-user-form]')?.addEventListener('click', () => open(null));
  document.querySelectorAll('[data-edit-user]').forEach((b) => b.addEventListener('click', () => open(JSON.parse(b.dataset.editUser))));
  dlg.querySelector('[data-close-user-form]').addEventListener('click', () => dlg.close());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const body = { name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), role: form.elements.role.value };
    if (!editingId && form.elements.password.value) body.password = form.elements.password.value;
    setBusy(btn, true);
    try {
      const res = editingId
        ? await api('PATCH', `/api/admin/users/${editingId}`, body)
        : await api('POST', '/api/admin/users', body);
      flashNext(res.message);
      location.reload();
    } catch (err) {
      toast(err.message, 'error', 7000);
      setBusy(btn, false);
    }
  });
});
