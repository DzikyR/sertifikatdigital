// Pengaturan Aplikasi (Super Admin): tab, warna, pratinjau langsung, simpan & unggah logo
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('settings');
  if (!root) return;
  const { api, toast, setBusy, flashNext } = window.App;
  const form = root.querySelector('[data-settings-form]');
  const defaults = JSON.parse(root.dataset.defaults);
  const field = (k) => form.elements[k];
  const val = (k) => (field(k)?.value ?? '').trim();

  // ---------------------------------------------------------------- tab
  const tabs = form.querySelectorAll('[data-stab]');
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => {
      const on = x === t;
      x.setAttribute('aria-selected', String(on));
      x.classList.toggle('border-tsu-700', on);
      x.classList.toggle('text-tsu-800', on);
      x.classList.toggle('border-transparent', !on);
      x.classList.toggle('text-slate-500', !on);
    });
    form.querySelectorAll('[data-spanel]').forEach((p) => p.classList.toggle('hidden', p.dataset.spanel !== t.dataset.stab));
  }));

  // ---------------------------------------------------------------- warna (sama dengan brandingService)
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
  const mix = (h, t, a) => rgbToHex(hexToRgb(h).map((v, i) => v + (t[i] - v) * a));
  const tint = (h, a) => mix(h, [255, 255, 255], a);
  const shade = (h, a) => mix(h, [0, 0, 0], a);
  const primaryScale = (b) => ({
    50: tint(b, 0.94), 200: tint(b, 0.7), 300: tint(b, 0.52), 700: tint(b, 0.03), 800: b, 900: shade(b, 0.2), 950: shade(b, 0.5),
  });
  const lum = (h) => {
    const [r, g, b] = hexToRgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const HEX = /^#?([0-9a-f]{6})$/i;

  root.querySelectorAll('[data-swatch]').forEach((s) => { s.style.backgroundColor = s.dataset.swatch; });

  root.querySelectorAll('[data-color-pair]').forEach((pair) => {
    const color = pair.querySelector('input[type="color"]');
    const hex = pair.querySelector('[data-hex-for]');
    color.addEventListener('input', () => { hex.value = color.value.toUpperCase(); });
    hex.addEventListener('input', (e) => {
      e.stopPropagation();
      const m = hex.value.trim().match(HEX);
      hex.classList.toggle('border-red-400', !m);
      if (m) { color.value = `#${m[1]}`.toLowerCase(); color.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    hex.addEventListener('blur', () => { hex.value = color.value.toUpperCase(); hex.classList.remove('border-red-400'); });
  });

  root.querySelectorAll('[data-preset-primary]').forEach((b) => b.addEventListener('click', () => {
    [['primaryColor', b.dataset.presetPrimary], ['accentColor', b.dataset.presetAccent]].forEach(([k, v]) => {
      field(k).value = v;
      field(k).dispatchEvent(new Event('input', { bubbles: true }));
    });
  }));

  // ---------------------------------------------------------------- penghitung karakter & default per kolom
  const counters = () => form.querySelectorAll('[data-count-for]').forEach((p) => {
    const el = field(p.dataset.countFor);
    p.textContent = `${el.value.length} / ${el.maxLength}`;
  });
  const resetButtons = () => form.querySelectorAll('[data-reset-field]').forEach((b) => {
    b.classList.toggle('hidden', val(b.dataset.resetField) === (defaults[b.dataset.resetField] ?? ''));
  });
  form.querySelectorAll('[data-reset-field]').forEach((b) => b.addEventListener('click', () => {
    const el = field(b.dataset.resetField);
    el.value = defaults[b.dataset.resetField] ?? '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const hex = form.querySelector(`[data-hex-for="${b.dataset.resetField}"]`);
    if (hex) hex.value = el.value.toUpperCase();
  }));

  // ---------------------------------------------------------------- pratinjau langsung
  const pv = (k) => root.querySelector(`[data-pv="${k}"]`);
  function renderPreview() {
    const p = primaryScale(val('primaryColor').toLowerCase());
    const a = val('accentColor').toLowerCase();
    pv('header').style.backgroundColor = p[800];
    pv('header').style.borderBottom = `4px solid ${a}`;
    const logo = pv('logo');
    if (!logo.querySelector('img')) {
      logo.textContent = val('logoText') || 'TSU';
      logo.style.backgroundColor = a;
      logo.style.color = p[900];
    }
    pv('hero').style.background = `linear-gradient(135deg, ${p[800]}, ${p[700]} 50%, ${p[900]})`;
    pv('heroBadge').style.backgroundColor = `${a}33`;
    pv('heroBadge').style.color = tint(a, 0.28);
    pv('heroHighlight').style.color = a;
    pv('btnAccent').style.backgroundColor = a;
    pv('btnAccent').style.color = p[950];
    pv('btnPrimary').style.backgroundColor = p[700];
    pv('btnOutline').style.borderColor = p[200];
    pv('btnOutline').style.color = p[700];
    pv('badge').style.backgroundColor = p[50];
    pv('badge').style.color = p[700];
    pv('feature1Title').style.color = p[800];
    pv('footer').style.backgroundColor = p[950];
    pv('footer').style.color = p[200];
    ['appName', 'appSubtitle', 'heroBadge', 'heroTitle', 'heroHighlight', 'heroDescription', 'feature1Title', 'footerCopyright', 'footerNote']
      .forEach((k) => { pv(k).textContent = val(k); });
    pv('heroBadge').classList.toggle('hidden', !val('heroBadge'));
    pv('contact').textContent = ['contactEmail', 'contactPhone'].map(val).filter(Boolean).join(' · ');

    // Peringatan keterbacaan (WCAG AA: 4,5 untuk teks biasa, 3 untuk teks besar)
    const checks = [
      ['Teks putih di atas warna utama (header, sidebar)', contrast('#ffffff', p[800]), 4.5],
      ['Teks putih di tombol utama', contrast('#ffffff', p[700]), 4.5],
      ['Teks gelap di tombol aksen', contrast(p[950], a), 4.5],
      ['Warna aksen di atas warna utama (judul sorotan)', contrast(a, p[800]), 3],
    ];
    const list = root.querySelector('[data-contrast-warnings]');
    list.replaceChildren(...checks.map(([label, ratio, min]) => {
      const li = document.createElement('li');
      const okay = ratio >= min;
      li.className = okay ? 'text-emerald-700' : 'font-medium text-red-700';
      li.textContent = `${okay ? '✓' : '⚠'} ${label}: kontras ${ratio.toFixed(1)}:1${okay ? '' : ` (disarankan ≥ ${min}:1, sulit dibaca)`}`;
      return li;
    }));
    root.querySelector('[data-contrast-for="primaryColor"]').textContent = `Kontras teks putih ${contrast('#ffffff', p[800]).toFixed(1)}:1`;
    root.querySelector('[data-contrast-for="accentColor"]').textContent = `Kontras di atas warna utama ${contrast(a, p[800]).toFixed(1)}:1`;
  }

  // ---------------------------------------------------------------- perubahan & simpan
  let dirty = false;
  form.addEventListener('input', () => {
    dirty = true;
    root.querySelector('[data-settings-dirty]').classList.remove('hidden');
    counters();
    resetButtons();
    renderPreview();
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const values = {};
    Object.keys(defaults).forEach((k) => { if (field(k)) values[k] = field(k).value; });
    setBusy(btn, true);
    try {
      const res = await api('PUT', '/api/admin/settings', { values });
      dirty = false;
      flashNext(res.message);
      location.reload();
    } catch (err) {
      toast(err.message, 'error', 8000);
      // Buka tab berisi kolom yang salah bila pesan menyebut labelnya
      const f = [...form.querySelectorAll('[data-field]')].find((d) => err.message.startsWith(d.querySelector('label').textContent.replace('*', '').trim()));
      if (f) { form.querySelector(`[data-stab="${f.closest('[data-spanel]').dataset.spanel}"]`).click(); f.querySelector('input, textarea')?.focus(); }
      setBusy(btn, false);
    }
  });

  // Unggah logo
  const logoForm = root.querySelector('form[data-upload-form]');
  logoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = logoForm.querySelector('button:not([type="button"])');
    setBusy(btn, true);
    try {
      const res = await api('POST', logoForm.dataset.url, new FormData(logoForm));
      flashNext(res.message);
      location.reload();
    } catch (err) {
      toast(err.message, 'error', 8000);
      setBusy(btn, false);
    }
  });

  counters();
  resetButtons();
  renderPreview();
});
