// Interaksi UI global (tanpa inline script agar lolos CSP)
(() => {
  const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content;

  /** fetch ke API internal: kirim CSRF otomatis, parse JSON, lempar Error berisi pesan server. */
  async function api(method, url, body) {
    const headers = { Accept: 'application/json' };
    if (method !== 'GET') headers['X-CSRF-Token'] = csrf();
    let payload = body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const msg = data.errors?.map((e) => e.message).join(' ') || data.message || data.reason || `Permintaan gagal (${res.status}).`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function toast(message, type = 'success', timeout = 4500) {
    const region = document.getElementById('toast-region');
    if (!region) return alert(message);
    const styles = {
      success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      error: 'border-red-200 bg-red-50 text-red-900',
      info: 'border-tsu-200 bg-white text-slate-800',
    };
    const el = document.createElement('div');
    el.className = `pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg transition ${styles[type] || styles.info}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = message;
    region.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, timeout);
  }

  /** Dialog konfirmasi / input teks. Resolve: false (batal), true, atau string (mode input). */
  function dialog({ title, message = '', okLabel = 'OK', danger = false, input = null }) {
    const dlg = document.getElementById('app-dialog');
    if (!dlg) return Promise.resolve(input ? prompt(message) : confirm(message));
    dlg.querySelector('[data-dialog-title]').textContent = title;
    dlg.querySelector('[data-dialog-message]').textContent = message;
    const ok = dlg.querySelector('[data-dialog-ok]');
    ok.textContent = okLabel;
    ok.className = `btn ${danger ? 'bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}`;
    const wrap = dlg.querySelector('[data-dialog-input-wrap]');
    const field = dlg.querySelector('#app-dialog-input');
    wrap.classList.toggle('hidden', !input);
    field.value = '';
    field.required = Boolean(input?.required);
    if (input) dlg.querySelector('[data-dialog-input-label]').textContent = input.label;
    return new Promise((resolve) => {
      dlg.onclose = () => {
        if (dlg.returnValue !== 'ok') return resolve(false);
        return resolve(input ? field.value.trim() : true);
      };
      dlg.showModal();
      (input ? field : ok).focus();
    });
  }

  function setBusy(el, busy) {
    if (!el) return;
    el.disabled = busy;
    el.classList.toggle('opacity-60', busy);
    if (busy) el.dataset.label = el.innerHTML;
    if (busy) el.innerHTML = '<span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"></span> Memproses...';
    else if (el.dataset.label) el.innerHTML = el.dataset.label;
  }

  /** Simpan pesan untuk ditampilkan setelah reload. */
  const flashNext = (msg, type = 'success') => { try { sessionStorage.setItem('flash-next', JSON.stringify({ msg, type })); } catch { /* abaikan */ } };

  window.App = { api, toast, dialog, setBusy, flashNext };

  document.addEventListener('DOMContentLoaded', () => {
    try {
      const pending = JSON.parse(sessionStorage.getItem('flash-next') || 'null');
      if (pending) { sessionStorage.removeItem('flash-next'); toast(pending.msg, pending.type); }
    } catch { /* abaikan */ }

    // Toggle sederhana (menu navbar publik)
    document.querySelectorAll('[data-toggle]').forEach((btn) => {
      const target = document.getElementById(btn.dataset.toggle);
      if (!target) return;
      btn.addEventListener('click', () => {
        const hidden = target.classList.toggle('hidden');
        btn.setAttribute('aria-expanded', String(!hidden));
      });
    });

    // Tombol lihat/sembunyikan password: <div class="relative"><input type="password"><button data-password-toggle>
    document.querySelectorAll('[data-password-toggle]').forEach((btn) => {
      const input = btn.parentElement.querySelector('input');
      if (!input) return;
      const set = (show) => {
        input.type = show ? 'text' : 'password';
        const label = show ? 'Sembunyikan password' : 'Tampilkan password';
        btn.setAttribute('aria-label', label);
        btn.setAttribute('aria-pressed', String(show));
        btn.title = label;
        btn.querySelector('[data-icon-show]').classList.toggle('hidden', show);
        btn.querySelector('[data-icon-hide]').classList.toggle('hidden', !show);
      };
      btn.addEventListener('click', () => { set(input.type === 'password'); input.focus(); });
      // Kembalikan ke mode tersembunyi saat submit / form direset
      input.form?.addEventListener('submit', () => set(false));
      input.form?.addEventListener('reset', () => set(false));
    });

    // Sidebar mobile
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const toggleSidebar = (open) => {
      sidebar?.classList.toggle('hidden', !open);
      sidebar?.classList.toggle('flex', open);
      backdrop?.classList.toggle('hidden', !open);
    };
    document.querySelectorAll('[data-sidebar-open]').forEach((b) => b.addEventListener('click', () => toggleSidebar(true)));
    document.querySelectorAll('[data-sidebar-close]').forEach((b) => b.addEventListener('click', () => toggleSidebar(false)));

    // Tabs: <div data-tabs> <button data-tab="x"> ... <section data-tab-panel="x">
    document.querySelectorAll('[data-tabs]').forEach((root) => {
      const tabs = root.querySelectorAll('[data-tab]');
      const show = (name) => {
        tabs.forEach((t) => {
          const on = t.dataset.tab === name;
          t.setAttribute('aria-selected', String(on));
          t.classList.toggle('border-tsu-700', on);
          t.classList.toggle('text-tsu-800', on);
          t.classList.toggle('border-transparent', !on);
          t.classList.toggle('text-slate-500', !on);
        });
        root.querySelectorAll('[data-tab-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.tabPanel !== name));
        try { history.replaceState(null, '', `#${name}`); } catch { /* abaikan */ }
      };
      tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
      const initial = location.hash.slice(1);
      show([...tabs].some((t) => t.dataset.tab === initial) ? initial : tabs[0]?.dataset.tab);
    });

    /**
     * Tombol aksi deklaratif:
     * <button data-action="POST /api/..." data-confirm="..." data-prompt="Label" data-prompt-required
     *         data-body='{"k":"v"}' data-success="Pesan" data-redirect="/url">
     */
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      const [method, url] = btn.dataset.action.split(' ');
      let body = btn.dataset.body ? JSON.parse(btn.dataset.body) : undefined;

      if (btn.dataset.prompt) {
        const value = await dialog({
          title: btn.dataset.confirmTitle || btn.textContent.trim(),
          message: btn.dataset.confirm || '',
          okLabel: btn.dataset.okLabel || 'Kirim',
          danger: 'danger' in btn.dataset,
          input: { label: btn.dataset.prompt, required: 'promptRequired' in btn.dataset },
        });
        if (value === false) return;
        if ('promptRequired' in btn.dataset && !value) return toast(`${btn.dataset.prompt} wajib diisi.`, 'error');
        body = { ...(body || {}), [btn.dataset.promptField || 'note']: value };
      } else if (btn.dataset.confirm) {
        const ok = await dialog({
          title: btn.dataset.confirmTitle || 'Konfirmasi', message: btn.dataset.confirm, okLabel: btn.dataset.okLabel || 'Ya, lanjutkan', danger: 'danger' in btn.dataset,
        });
        if (!ok) return;
      }

      setBusy(btn, true);
      try {
        const res = await api(method, url, body);
        const msg = btn.dataset.success || res.message || 'Berhasil.';
        if (btn.dataset.redirect) { flashNext(msg); location.href = btn.dataset.redirect; return; }
        if ('noReload' in btn.dataset) { toast(msg); setBusy(btn, false); return; }
        flashNext(msg);
        location.reload();
      } catch (err) {
        toast(err.message, 'error', 7000);
        setBusy(btn, false);
      }
    });

    /**
     * Form via API: <form data-api-form data-method="POST" action="/api/..." data-redirect="/events/{id}">
     * Field kosong tidak dikirim; checkbox -> boolean.
     */
    document.querySelectorAll('form[data-api-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        const body = {};
        new FormData(form).forEach((v, k) => { if (v !== '' && k !== '_csrf') body[k] = v; });
        // Field opsional yang boleh dikosongkan saat ubah data (dikirim '' -> server menyimpan null)
        form.querySelectorAll('[data-allow-empty][name]:not(:disabled)').forEach((el) => { body[el.name] = el.value.trim(); });
        form.querySelectorAll('input[type="checkbox"][name]').forEach((cb) => { body[cb.name] = cb.checked; });
        setBusy(submit, true);
        try {
          const res = await api(form.dataset.method || 'POST', form.getAttribute('action'), body);
          const msg = form.dataset.success || res.message || 'Tersimpan.';
          flashNext(msg);
          if (form.dataset.redirect) location.href = form.dataset.redirect.replace('{id}', res.data?.id || '');
          else location.reload();
        } catch (err) {
          toast(err.message, 'error', 7000);
          setBusy(submit, false);
        }
      });
    });
  });
})();
