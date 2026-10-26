// Fitur & Akses: simpan setiap toggle langsung ke server (kembalikan bila gagal)
document.addEventListener('DOMContentLoaded', () => {
  const { api, toast } = window.App;
  document.querySelectorAll('[data-feature-toggle]').forEach((input) => {
    input.addEventListener('change', async () => {
      const enabled = input.checked;
      input.disabled = true;
      try {
        const res = await api('PATCH', '/api/admin/features', { key: input.dataset.key, role: input.dataset.role, enabled });
        toast(res.message, enabled ? 'success' : 'info');
      } catch (err) {
        input.checked = !enabled;
        toast(err.message, 'error', 7000);
      }
      input.disabled = false;
    });
  });
});
