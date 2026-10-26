/* global fabric */
// Interactive Certificate Builder (Fabric.js)
//
// Semua objek kanvas memakai koordinat px ASLI template; tampilan diskalakan dengan
// canvas.setZoom(). Konvensi sama dengan PDF generator (layoutService):
//  - Teks : left/top = titik jangkar (originX = align, originY = 'center')
//  - QR   : pojok kiri-atas, ukuran = sisi persegi
//  - TTD  : pojok kiri-atas + lebar/tinggi kotak
document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('builder');
  if (!root || !window.fabric) return;
  const { api, toast, setBusy } = window.App;
  const eventId = root.dataset.eventId;
  const $ = (sel) => root.querySelector(sel);

  const FIELD_LABELS = {
    participantName: 'Nama Peserta',
    certificateNumber: 'Nomor Sertifikat',
    eventName: 'Nama Kegiatan',
    eventTheme: 'Tema Kegiatan',
    eventDate: 'Tanggal',
    participantRole: 'Peran Peserta',
  };
  const SAMPLE = {
    participantName: 'Nama Lengkap Peserta, S.Kom.',
    certificateNumber: 'INF/XXXXX/2026/0001',
    eventName: root.dataset.eventTitle,
    eventTheme: root.dataset.eventTheme || 'Tema kegiatan (belum diisi di Info Event)',
    eventDate: root.dataset.eventDate,
    participantRole: 'Peserta',
  };

  // ---------------------------------------------------------------- data
  let data;
  try {
    data = (await api('GET', `/api/events/${eventId}/builder`)).data;
  } catch (err) {
    $('[data-canvas-loading]').textContent = err.message;
    return;
  }
  if (!data.template) {
    $('[data-canvas-loading]').textContent = 'Unggah template terlebih dahulu di tab Template & TTD.';
    return;
  }

  const editable = data.permissions.editLayout;
  const W = data.template.width;
  const H = data.template.height;
  let fonts = Object.fromEntries(data.fonts.map((f) => [f.name, f]));
  const layout = structuredClone(data.layout || { fields: {} });
  layout.signatureText ||= { fontSize: Math.round(H / 55), font: 'Helvetica-Bold', titleFont: 'Helvetica', color: '#0f172a' };

  if (editable) $('[data-save]').classList.remove('hidden');
  else $('[data-readonly-note]').classList.remove('hidden');

  // ---------------------------------------------------------------- canvas
  const canvas = new fabric.Canvas('builder-canvas', {
    selection: false,
    preserveObjectStacking: true,
    uniformScaling: true,
  });
  const bg = await fabric.FabricImage.fromURL(data.template.url);
  bg.set({ originX: 'left', originY: 'top', left: 0, top: 0, selectable: false, evented: false });
  canvas.backgroundImage = bg;
  $('[data-canvas-loading]').remove();

  const wrap = $('[data-canvas-wrap]');
  function fit() {
    const zoom = Math.min(wrap.clientWidth / W, 1);
    canvas.setDimensions({ width: Math.round(W * zoom), height: Math.round(H * zoom) });
    canvas.setZoom(zoom);
    $('[data-zoom-label]').textContent = `Template ${W} × ${H} px · zoom ${Math.round(zoom * 100)}%`;
    canvas.requestRenderAll();
  }
  fit();
  new ResizeObserver(() => fit()).observe(wrap);

  const baseProps = {
    lockRotation: true,
    selectable: editable,
    evented: true,
    hoverCursor: editable ? 'move' : 'default',
    borderColor: '#2259b5',
    cornerColor: '#fbb625',
    cornerStrokeColor: '#0c2c5e',
    cornerSize: 12,
    transparentCorners: false,
    padding: 4,
  };
  const cornersOnly = (o) => o.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false });

  // Kotak bantu lebar maksimum teks (tampil saat teks dipilih)
  const guide = new fabric.Rect({
    originX: 'left', originY: 'center', fill: 'rgba(34,89,181,0.06)', stroke: '#2259b5', strokeDashArray: [8, 6],
    strokeWidth: 1, strokeUniform: true, selectable: false, evented: false, visible: false, excludeFromExport: true,
  });
  canvas.add(guide);

  // ---------------------------------------------------------------- dirty state
  let dirty = false;
  const markDirty = () => {
    if (!editable) return;
    dirty = true;
    $('[data-dirty-indicator]').classList.remove('hidden');
  };
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------- objek teks
  const objects = { fields: {}, qr: null, sigs: [], texts: [], logos: [] };
  let colorUiReady = false; // alat warna diinisialisasi di akhir; renderProps bisa terpanggil lebih awal

  // Font berkas (bawaan/kustom) dimuat sekali lewat FontFace; setelah siap, ukuran teks dihitung ulang
  const fontLoads = {};
  function ensureFont(f) {
    if (!f?.url) return Promise.resolve();
    fontLoads[f.name] ||= new FontFace(f.css, `url(${f.url})`).load()
      .then((face) => { document.fonts.add(face); fabric.cache.clearFontCache(f.css); })
      .catch(() => toast(`Font "${f.label}" gagal dimuat di kanvas.`, 'error'));
    return fontLoads[f.name];
  }

  function applyFont(obj, fontName) {
    const f = fonts[fontName] || fonts.Helvetica;
    obj.set({ fontFamily: f.css, fontWeight: f.weight, fontStyle: f.style });
    if (!f.url) return;
    ensureFont(f).then(() => {
      if (obj.fontFamily !== f.css) return; // font sudah diganti lagi
      obj.initDimensions();
      obj.setCoords();
      obj.dirty = true;
      objects.sigs.forEach(placeCaption);
      updateGuide();
      canvas.requestRenderAll();
    });
  }

  function createField(key, f) {
    const obj = new fabric.FabricText(`${f.prefix || ''}${SAMPLE[key]}`, {
      ...baseProps,
      left: f.x, top: f.y, originX: f.align, originY: 'center', textAlign: f.align,
      fontSize: f.fontSize, fill: f.color,
    });
    applyFont(obj, f.font);
    cornersOnly(obj);
    obj.meta = { kind: 'field', key };
    objects.fields[key] = obj;
    canvas.add(obj);
    return obj;
  }

  function defaultField(key) {
    const ref = layout.fields.participantName || { x: W / 2, fontSize: Math.round(H / 40), maxWidth: Math.round(W * 0.7) };
    // Muncul tepat di bawah Nama Peserta agar langsung terlihat & tidak menumpuk
    const name = objects.fields.participantName;
    const y = name ? Math.min(Math.round(name.top + name.fontSize * 0.9), H - 10) : Math.round(H * 0.5);
    return {
      x: name ? Math.round(name.left) : Math.round(W / 2), y, fontSize: Math.round(ref.fontSize * 0.5), font: 'Helvetica',
      color: '#0f172a', align: 'center', maxWidth: ref.maxWidth, prefix: key === 'participantRole' ? 'Sebagai ' : '',
    };
  }

  Object.entries(layout.fields).forEach(([key, f]) => createField(key, f));

  // ---------------------------------------------------------------- teks kustom (multi-baris)
  // Kanvas menampilkan isian otomatis {placeholder} dengan data contoh. Jarak antarbaris Fabric =
  // fontSize x lineHeight x 1.13, jadi lineHeight dibagi 1.13 agar sama dengan PDF (fontSize x lineHeight).
  const FABRIC_LINE_MULT = 1.13;
  const PLACEHOLDER_SAMPLE = Object.fromEntries((data.placeholders || []).map((p) => [p.key, p.sample || `{${p.key}}`]));
  const fillSample = (text) => text.replace(/\{([a-z]+)\}/gi, (m, k) => PLACEHOLDER_SAMPLE[k.toLowerCase()] ?? m);
  let textSeq = 0;

  function createTextBlock(t) {
    const obj = new fabric.Textbox(fillSample(t.text), {
      ...baseProps,
      left: t.x, top: t.y, originX: t.align, originY: 'center', textAlign: t.align,
      width: t.maxWidth, fontSize: t.fontSize, fill: t.color, lineHeight: t.lineHeight / FABRIC_LINE_MULT,
      editable: false, splitByGrapheme: false,
    });
    obj.setControlsVisibility({ mt: false, mb: false, mtr: false }); // sisi kiri/kanan = ubah lebar
    const entry = { obj, t: { id: t.id || `t${Date.now().toString(36)}${textSeq += 1}`, text: t.text, font: t.font, lineHeight: t.lineHeight } };
    obj.meta = { kind: 'text', entry };
    applyFont(obj, t.font);
    objects.texts.push(entry);
    canvas.add(obj);
    return obj;
  }

  function defaultText() {
    const ref = layout.fields.participantName || { fontSize: Math.round(H / 40) };
    const last = objects.texts[objects.texts.length - 1]?.obj;
    const y = last ? Math.min(Math.round(last.top + last.height / 2 + last.fontSize * 1.6), H - 20) : Math.round(H * 0.68);
    return {
      text: 'atas partisipasinya sebagai {peran} dalam kegiatan {kegiatan}',
      x: Math.round(W / 2), y, fontSize: Math.max(12, Math.round(ref.fontSize * 0.4)), font: 'Helvetica',
      color: '#0f172a', align: 'center', maxWidth: Math.round(W * 0.7), lineHeight: 1.3,
    };
  }

  function textState(entry) {
    const { obj, t } = entry;
    return {
      ...t, x: Math.round(obj.left), y: Math.round(obj.top), fontSize: Math.round(obj.fontSize), color: obj.fill,
      align: obj.originX, maxWidth: Math.round(obj.width),
    };
  }

  function setTextProp(entry, name, value) {
    const { obj, t } = entry;
    switch (name) {
      case 'text': t.text = value.slice(0, 1000); obj.set('text', fillSample(t.text)); break;
      case 'x': obj.set('left', Number(value)); break;
      case 'y': obj.set('top', Number(value)); break;
      case 'fontSize': obj.set('fontSize', Math.max(6, Number(value))); break;
      case 'maxWidth': obj.set('width', Math.min(Math.max(20, Number(value)), W)); break;
      case 'lineHeight': t.lineHeight = Math.min(Math.max(Number(value), 0.8), 3); obj.set('lineHeight', t.lineHeight / FABRIC_LINE_MULT); break;
      case 'color': obj.set('fill', value); break;
      case 'font': t.font = value; applyFont(obj, value); break;
      case 'align': {
        const w = obj.width;
        const from = obj.originX;
        const leftEdge = obj.left - (from === 'center' ? w / 2 : from === 'right' ? w : 0);
        obj.set({ originX: value, textAlign: value, left: Math.round(leftEdge + (value === 'center' ? w / 2 : value === 'right' ? w : 0)) });
        break;
      }
      default:
    }
    obj.initDimensions();
    obj.setCoords();
  }

  function removeText(entry) {
    canvas.remove(entry.obj);
    objects.texts.splice(objects.texts.indexOf(entry), 1);
    canvas.discardActiveObject();
    markDirty();
    canvas.requestRenderAll();
    renderList();
    renderProps();
  }

  (layout.texts || []).forEach((t) => createTextBlock(t));

  // ---------------------------------------------------------------- QR
  async function createQr(q) {
    const img = await fabric.FabricImage.fromURL('/img/qr-placeholder.svg');
    img.set({ ...baseProps, originX: 'left', originY: 'top', left: q.x, top: q.y });
    img.scaleToWidth(q.size);
    cornersOnly(img);
    img.meta = { kind: 'qr' };
    objects.qr = img;
    canvas.add(img);
    return img;
  }
  if (layout.qr) await createQr(layout.qr);

  // ---------------------------------------------------------------- TTD + caption
  function captionTexts(sig) {
    const st = layout.signatureText;
    const name = new fabric.FabricText(sig.signerName || '', {
      originX: 'center', originY: 'top', fontSize: st.fontSize, fill: st.color, underline: true,
      selectable: false, evented: false,
    });
    applyFont(name, st.font);
    const title = new fabric.FabricText(sig.signerTitle || '', {
      originX: 'center', originY: 'top', fontSize: st.fontSize * 0.85, fill: st.color, selectable: false, evented: false,
    });
    applyFont(title, st.titleFont);
    return { name, title };
  }

  function placeCaption(entry) {
    const { img, caption, sig } = entry;
    const visible = sig.showSignerText && (sig.signerName || sig.signerTitle);
    const w = img.getScaledWidth();
    const h = img.getScaledHeight();
    const cx = img.left + w / 2;
    let cursor = img.top + h + 2;
    caption.name.set({ visible: Boolean(visible && sig.signerName), left: cx, top: cursor });
    if (sig.signerName) cursor += caption.name.fontSize * 1.16 * 1.1;
    caption.title.set({ visible: Boolean(visible && sig.signerTitle), left: cx, top: cursor });
    caption.name.setCoords();
    caption.title.setCoords();
  }

  for (const sig of data.signatures) {
    const img = await fabric.FabricImage.fromURL(sig.imageUrl);
    // Gambar di-fit ke kotak (sama seperti PDF), lalu kotak = ukuran tampil gambar
    const scale = Math.min(sig.width / img.width, sig.height / img.height);
    img.set({
      ...baseProps, originX: 'left', originY: 'top', scaleX: scale, scaleY: scale,
      left: sig.posX + (sig.width - img.width * scale) / 2,
      top: sig.posY + (sig.height - img.height * scale) / 2,
    });
    cornersOnly(img);
    const caption = captionTexts(sig);
    const entry = { img, caption, sig };
    img.meta = { kind: 'sig', entry };
    objects.sigs.push(entry);
    canvas.add(img, caption.name, caption.title);
    placeCaption(entry);
  }

  // ---------------------------------------------------------------- logo (di bawah lapisan teks, sama seperti PDF)
  for (const logo of data.logos || []) {
    const img = await fabric.FabricImage.fromURL(logo.imageUrl);
    const scale = Math.min(logo.width / img.width, logo.height / img.height);
    img.set({
      ...baseProps, originX: 'left', originY: 'top', scaleX: scale, scaleY: scale,
      left: logo.posX + (logo.width - img.width * scale) / 2,
      top: logo.posY + (logo.height - img.height * scale) / 2,
    });
    cornersOnly(img);
    const entry = { img, logo };
    img.meta = { kind: 'logo', entry };
    objects.logos.push(entry);
    canvas.add(img);
    canvas.sendObjectToBack(img);
  }
  canvas.requestRenderAll();

  // ---------------------------------------------------------------- normalisasi setelah transformasi
  function normalize(obj) {
    if (!obj?.meta) return;
    if (obj.meta.kind === 'field' && (obj.scaleX !== 1 || obj.scaleY !== 1)) {
      obj.set({ fontSize: Math.max(6, Math.round(obj.fontSize * obj.scaleY)), scaleX: 1, scaleY: 1 });
    }
    if (obj.meta.kind === 'text') {
      if (obj.scaleX !== 1 || obj.scaleY !== 1) {
        obj.set({
          fontSize: Math.max(6, Math.round(obj.fontSize * obj.scaleY)),
          width: Math.min(Math.max(20, Math.round(obj.width * obj.scaleX)), W), scaleX: 1, scaleY: 1,
        });
      }
      obj.set('width', Math.min(Math.max(20, Math.round(obj.width)), W));
      obj.initDimensions();
    }
    // Batasi agar tetap di dalam template
    if (obj.meta.kind !== 'field' && obj.meta.kind !== 'text') {
      obj.set({
        left: Math.min(Math.max(obj.left, 0), W - obj.getScaledWidth()),
        top: Math.min(Math.max(obj.top, 0), H - obj.getScaledHeight()),
      });
    } else {
      obj.set({ left: Math.min(Math.max(obj.left, 0), W), top: Math.min(Math.max(obj.top, 0), H) });
    }
    obj.set({ left: Math.round(obj.left), top: Math.round(obj.top) });
    obj.setCoords();
  }

  function updateGuide() {
    const obj = canvas.getActiveObject();
    if (!obj || obj.meta?.kind !== 'field') { guide.visible = false; return; }
    const f = fieldState(obj.meta.key);
    const left = f.align === 'left' ? obj.left : f.align === 'right' ? obj.left - f.maxWidth : obj.left - f.maxWidth / 2;
    guide.set({ visible: true, left, top: obj.top, width: f.maxWidth, height: obj.fontSize * obj.scaleY * 1.3 });
    guide.setCoords();
  }

  canvas.on('object:moving', (e) => {
    if (e.target.meta?.kind === 'sig') placeCaption(e.target.meta.entry);
    updateGuide();
  });
  canvas.on('object:scaling', (e) => {
    if (e.target.meta?.kind === 'sig') placeCaption(e.target.meta.entry);
    updateGuide();
  });
  canvas.on('object:modified', (e) => {
    normalize(e.target);
    if (e.target.meta?.kind === 'sig') placeCaption(e.target.meta.entry);
    updateGuide();
    markDirty();
    renderProps();
  });
  canvas.on('selection:created', () => { updateGuide(); renderProps(); renderList(); });
  canvas.on('selection:updated', () => { updateGuide(); renderProps(); renderList(); });
  canvas.on('selection:cleared', () => { guide.visible = false; renderProps(); renderList(); canvas.requestRenderAll(); });

  // Nudge dengan keyboard
  document.addEventListener('keydown', (e) => {
    const obj = canvas.getActiveObject();
    if (!obj || !editable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const step = e.shiftKey ? 10 : 1;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!delta) return;
    e.preventDefault();
    obj.set({ left: obj.left + delta[0], top: obj.top + delta[1] });
    normalize(obj);
    if (obj.meta.kind === 'sig') placeCaption(obj.meta.entry);
    updateGuide();
    markDirty();
    renderProps();
    canvas.requestRenderAll();
  });

  // ---------------------------------------------------------------- state <-> objek
  // Properti non-visual (font name, maxWidth, prefix) disimpan di layout.fields[key]
  function fieldState(key) {
    const obj = objects.fields[key];
    const f = layout.fields[key];
    return { ...f, x: Math.round(obj.left), y: Math.round(obj.top), fontSize: Math.round(obj.fontSize), color: obj.fill, align: obj.originX };
  }

  function setFieldProp(key, name, value) {
    const obj = objects.fields[key];
    const f = layout.fields[key];
    switch (name) {
      case 'x': obj.set('left', Number(value)); break;
      case 'y': obj.set('top', Number(value)); break;
      case 'fontSize': obj.set('fontSize', Math.max(6, Number(value))); break;
      case 'color': obj.set('fill', value); f.color = value; break;
      case 'font': f.font = value; applyFont(obj, value); break;
      case 'maxWidth': f.maxWidth = Math.min(Math.max(20, Number(value)), W); break;
      case 'prefix': f.prefix = value.slice(0, 60); obj.set('text', `${f.prefix}${SAMPLE[key]}`); break;
      case 'align': {
        // Pertahankan posisi visual saat jangkar berpindah
        const w = obj.getScaledWidth();
        const from = obj.originX;
        const leftEdge = obj.left - (from === 'center' ? w / 2 : from === 'right' ? w : 0);
        const anchor = leftEdge + (value === 'center' ? w / 2 : value === 'right' ? w : 0);
        obj.set({ originX: value, textAlign: value, left: Math.round(anchor) });
        f.align = value;
        break;
      }
      default:
    }
    obj.setCoords();
  }

  // ---------------------------------------------------------------- daftar elemen
  const list = $('[data-element-list]');
  function renderList() {
    const active = canvas.getActiveObject();
    list.replaceChildren();
    const row = (label, opts) => {
      const li = document.createElement('li');
      li.className = `flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${opts.active ? 'bg-tsu-50 font-semibold text-tsu-800' : 'text-slate-700 hover:bg-slate-50'}`;
      if (opts.toggle) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = opts.enabled;
        cb.disabled = !editable || opts.required;
        cb.className = 'rounded border-slate-300 text-tsu-600';
        cb.setAttribute('aria-label', `Tampilkan ${label}`);
        cb.addEventListener('change', () => opts.toggle(cb.checked));
        li.appendChild(cb);
      } else {
        const dot = document.createElement('span');
        dot.className = 'h-4 w-4 shrink-0 rounded bg-gold-400';
        dot.setAttribute('aria-hidden', 'true');
        li.appendChild(dot);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'flex-1 truncate text-left disabled:cursor-default disabled:text-slate-400';
      btn.textContent = label + (opts.required ? ' *' : '');
      btn.disabled = !opts.enabled;
      btn.addEventListener('click', () => { if (opts.obj) { canvas.setActiveObject(opts.obj); canvas.requestRenderAll(); } });
      li.appendChild(btn);
      list.appendChild(li);
    };

    data.fieldKeys.forEach((key) => {
      const obj = objects.fields[key];
      row(FIELD_LABELS[key], {
        enabled: Boolean(obj), obj, active: obj && obj === active, required: key === 'participantName',
        toggle: (on) => {
          if (on) {
            layout.fields[key] = defaultField(key);
            canvas.setActiveObject(createField(key, layout.fields[key]));
          } else {
            canvas.remove(obj);
            delete objects.fields[key];
            delete layout.fields[key];
            canvas.discardActiveObject();
          }
          markDirty();
          canvas.requestRenderAll();
          renderList();
        },
      });
    });

    row('QR Code Verifikasi', {
      enabled: Boolean(objects.qr), obj: objects.qr, active: objects.qr && objects.qr === active,
      toggle: async (on) => {
        if (on) {
          const size = Math.round(Math.min(W, H) * 0.15);
          canvas.setActiveObject(await createQr({ x: W - size - Math.round(W * 0.07), y: H - size - Math.round(H * 0.09), size }));
        } else {
          canvas.remove(objects.qr);
          objects.qr = null;
          canvas.discardActiveObject();
        }
        markDirty();
        canvas.requestRenderAll();
        renderList();
      },
    });

    objects.sigs.forEach((entry) => row(`TTD: ${entry.sig.label}`, { enabled: true, obj: entry.img, active: entry.img === active }));
    if (!objects.sigs.length) {
      const li = document.createElement('li');
      li.className = 'px-2 py-1.5 text-xs text-slate-500';
      li.textContent = 'Belum ada tanda tangan untuk event ini.';
      list.appendChild(li);
    }

    // Logo
    const logoHead = document.createElement('li');
    logoHead.className = 'mt-2 border-t border-slate-100 px-2 pt-3 text-xs font-bold uppercase tracking-wide text-slate-500';
    logoHead.textContent = 'Logo';
    list.appendChild(logoHead);
    objects.logos.forEach((entry) => row(entry.logo.label, { enabled: true, obj: entry.img, active: entry.img === active }));
    if (!objects.logos.length) {
      const li = document.createElement('li');
      li.className = 'px-2 py-1.5 text-xs text-slate-500';
      li.append('Belum ada logo. ');
      const a = document.createElement('a');
      a.href = `/events/${eventId}#template`;
      a.className = 'font-semibold text-tsu-700 hover:underline';
      a.textContent = 'Unggah di tab Template & TTD';
      li.appendChild(a);
      list.appendChild(li);
    }

    // Teks kustom
    const head = document.createElement('li');
    head.className = 'mt-2 border-t border-slate-100 px-2 pt-3 text-xs font-bold uppercase tracking-wide text-slate-500';
    head.textContent = 'Teks Kustom';
    list.appendChild(head);
    objects.texts.forEach((entry, i) => {
      const li = document.createElement('li');
      li.className = `flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${entry.obj === active ? 'bg-tsu-50 font-semibold text-tsu-800' : 'text-slate-700 hover:bg-slate-50'}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'min-w-0 flex-1 truncate text-left';
      btn.textContent = `${i + 1}. ${entry.t.text.split('\n')[0]}`;
      btn.title = entry.t.text;
      btn.addEventListener('click', () => { canvas.setActiveObject(entry.obj); canvas.requestRenderAll(); });
      li.appendChild(btn);
      if (editable) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'shrink-0 rounded px-1.5 text-red-600 hover:bg-red-50';
        del.textContent = '×';
        del.setAttribute('aria-label', `Hapus teks kustom ${i + 1}`);
        del.addEventListener('click', () => removeText(entry));
        li.appendChild(del);
      }
      list.appendChild(li);
    });
    if (editable && objects.texts.length < 20) {
      const li = document.createElement('li');
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn-outline mt-1 w-full py-1.5 text-sm';
      add.textContent = '+ Tambah Teks Kustom';
      add.addEventListener('click', () => {
        const obj = createTextBlock(defaultText());
        canvas.setActiveObject(obj);
        markDirty();
        canvas.requestRenderAll();
        renderList();
        renderProps();
        forms.text.elements.text.focus();
        forms.text.elements.text.select();
      });
      li.appendChild(add);
      list.appendChild(li);
    } else if (!objects.texts.length) {
      const li = document.createElement('li');
      li.className = 'px-2 py-1.5 text-xs text-slate-500';
      li.textContent = 'Tidak ada teks kustom.';
      list.appendChild(li);
    }
  }

  // ---------------------------------------------------------------- panel properti
  const forms = {
    field: $('[data-props="field"]'),
    qr: $('[data-props="qr"]'),
    sig: $('[data-props="sig"]'),
    text: $('[data-props="text"]'),
    logo: $('[data-props="logo"]'),
  };
  // Pilihan font dikelompokkan (Standar PDF, Script, Serif, Sans Serif, Kustom)
  function fillFontSelects() {
    root.querySelectorAll('[data-font-select]').forEach((select) => {
      const current = select.value;
      select.replaceChildren();
      const groups = {};
      Object.values(fonts).forEach((f) => {
        if (!groups[f.group]) {
          groups[f.group] = document.createElement('optgroup');
          groups[f.group].label = f.group;
          select.appendChild(groups[f.group]);
        }
        const opt = document.createElement('option');
        opt.value = f.name;
        opt.textContent = f.label;
        groups[f.group].appendChild(opt);
      });
      if (current) select.value = current;
    });
  }
  fillFontSelects();
  Object.values(forms).forEach((form) => {
    form.querySelectorAll('input, select, textarea, button').forEach((el) => { el.disabled = el.disabled || !editable; });
    form.addEventListener('submit', (e) => e.preventDefault());
  });

  function renderProps() {
    renderPropsInner();
    syncColorUi();
  }

  function renderPropsInner() {
    const obj = canvas.getActiveObject();
    const kind = obj?.meta?.kind;
    $('[data-props-empty]').classList.toggle('hidden', Boolean(kind));
    Object.entries(forms).forEach(([k, form]) => form.classList.toggle('hidden', k !== kind));
    if (!kind) return;
    const form = forms[kind];
    const setVal = (name, v) => {
      const el = form.elements[name];
      if (!el || el === document.activeElement) return;
      if (el instanceof RadioNodeList) el.value = v;
      else el.value = v;
    };
    if (kind === 'field') {
      const f = fieldState(obj.meta.key);
      form.querySelector('[data-prop-title]').textContent = FIELD_LABELS[obj.meta.key];
      ['x', 'y', 'fontSize', 'maxWidth', 'font', 'color', 'prefix', 'align'].forEach((n) => setVal(n, f[n] ?? ''));
    } else if (kind === 'text') {
      const t = textState(obj.meta.entry);
      form.querySelector('[data-prop-title]').textContent = `Teks Kustom ${objects.texts.indexOf(obj.meta.entry) + 1}`;
      ['text', 'x', 'y', 'fontSize', 'maxWidth', 'lineHeight', 'font', 'color', 'align'].forEach((n) => setVal(n, t[n] ?? ''));
    } else if (kind === 'logo') {
      form.querySelector('[data-prop-title]').textContent = obj.meta.entry.logo.label;
      setVal('x', Math.round(obj.left));
      setVal('y', Math.round(obj.top));
      setVal('width', Math.round(obj.getScaledWidth()));
      setVal('height', Math.round(obj.getScaledHeight()));
    } else if (kind === 'qr') {
      setVal('x', Math.round(obj.left));
      setVal('y', Math.round(obj.top));
      setVal('size', Math.round(obj.getScaledWidth()));
    } else if (kind === 'sig') {
      const { sig } = obj.meta.entry;
      form.querySelector('[data-prop-title]').textContent = `TTD: ${sig.label}`;
      setVal('x', Math.round(obj.left));
      setVal('y', Math.round(obj.top));
      setVal('width', Math.round(obj.getScaledWidth()));
      setVal('height', Math.round(obj.getScaledHeight()));
      $('[data-sig-caption-note]').textContent = sig.showSignerText && (sig.signerName || sig.signerTitle)
        ? `Dicetak di bawah TTD: ${[sig.signerName, sig.signerTitle].filter(Boolean).join(' / ')}`
        : 'Nama & jabatan tidak dicetak untuk TTD ini.';
    }
  }

  forms.field.addEventListener('input', (e) => {
    const obj = canvas.getActiveObject();
    if (obj?.meta?.kind !== 'field' || !e.target.name) return;
    if (e.target.type === 'number' && e.target.value === '') return;
    setFieldProp(obj.meta.key, e.target.name, e.target.value);
    updateGuide();
    markDirty();
    canvas.requestRenderAll();
  });
  forms.field.addEventListener('change', () => { const o = canvas.getActiveObject(); normalize(o); updateGuide(); renderProps(); canvas.requestRenderAll(); });

  forms.text.addEventListener('input', (e) => {
    const obj = canvas.getActiveObject();
    if (obj?.meta?.kind !== 'text' || !e.target.name) return;
    if (e.target.type === 'number' && e.target.value === '') return;
    setTextProp(obj.meta.entry, e.target.name, e.target.value);
    if (e.target.name === 'text') renderList();
    markDirty();
    canvas.requestRenderAll();
  });
  forms.text.addEventListener('change', () => { normalize(canvas.getActiveObject()); renderProps(); canvas.requestRenderAll(); });
  // Sisipkan {placeholder} di posisi kursor
  function insertToken(token) {
    const ta = forms.text.elements.text;
    const start = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, start) + token + ta.value.slice(ta.selectionEnd ?? start);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + token.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  forms.text.querySelectorAll('[data-insert]').forEach((btn) => {
    btn.addEventListener('click', () => insertToken(btn.dataset.insert));
  });

  // Kartu referensi kode isian: kode, arti, dan contoh nilai dari event ini
  const refBody = $('[data-placeholder-ref]');
  (data.placeholders || []).forEach((p) => {
    const token = `{${p.key}}`;
    const tr = document.createElement('tr');
    const tdCode = document.createElement('td');
    tdCode.className = 'whitespace-nowrap px-2 py-1.5 align-top';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-tsu-800 hover:border-tsu-300 hover:bg-tsu-50';
    btn.textContent = token;
    btn.title = `Sisipkan / salin ${token}`;
    btn.addEventListener('click', async () => {
      const obj = canvas.getActiveObject();
      if (editable && obj?.meta?.kind === 'text') { insertToken(token); return; }
      try {
        await navigator.clipboard.writeText(token);
        toast(`${token} disalin. Tempel di isi Teks Kustom.`, 'info');
      } catch {
        toast(`Pilih Teks Kustom terlebih dahulu untuk menyisipkan ${token}.`, 'info');
      }
    });
    tdCode.appendChild(btn);
    const tdDesc = document.createElement('td');
    tdDesc.className = 'px-2 py-1.5 align-top text-slate-700';
    const label = document.createElement('span');
    label.className = 'block font-medium';
    label.textContent = p.label;
    const sample = document.createElement('span');
    sample.className = 'block text-[11px] text-slate-500';
    sample.textContent = p.sample ? `mis. ${p.sample}` : 'belum diisi di Info Event';
    if (!p.sample) sample.classList.add('italic', 'text-amber-700');
    tdDesc.append(label, sample);
    tr.append(tdCode, tdDesc);
    refBody.appendChild(tr);
  });
  forms.text.querySelector('[data-remove-text]').addEventListener('click', () => {
    const obj = canvas.getActiveObject();
    if (obj?.meta?.kind === 'text') removeText(obj.meta.entry);
  });

  forms.logo.addEventListener('input', (e) => {
    const obj = canvas.getActiveObject();
    if (obj?.meta?.kind !== 'logo' || e.target.value === '') return;
    const v = Number(e.target.value);
    if (e.target.name === 'x') obj.set('left', v);
    if (e.target.name === 'y') obj.set('top', v);
    if (e.target.name === 'width') obj.scaleToWidth(Math.max(10, Math.min(v, W)));
    obj.setCoords();
    markDirty();
    canvas.requestRenderAll();
  });
  forms.logo.addEventListener('change', () => { normalize(canvas.getActiveObject()); renderProps(); canvas.requestRenderAll(); });

  forms.qr.addEventListener('input', (e) => {
    const obj = canvas.getActiveObject();
    if (obj?.meta?.kind !== 'qr' || e.target.value === '') return;
    const v = Number(e.target.value);
    if (e.target.name === 'x') obj.set('left', v);
    if (e.target.name === 'y') obj.set('top', v);
    if (e.target.name === 'size') obj.scaleToWidth(Math.max(40, v));
    obj.setCoords();
    markDirty();
    canvas.requestRenderAll();
  });
  forms.qr.addEventListener('change', () => { normalize(canvas.getActiveObject()); renderProps(); canvas.requestRenderAll(); });

  forms.sig.addEventListener('input', (e) => {
    const obj = canvas.getActiveObject();
    if (obj?.meta?.kind !== 'sig' || e.target.value === '') return;
    const v = Number(e.target.value);
    if (e.target.name === 'x') obj.set('left', v);
    if (e.target.name === 'y') obj.set('top', v);
    if (e.target.name === 'width') obj.scaleToWidth(Math.max(10, v));
    obj.setCoords();
    placeCaption(obj.meta.entry);
    markDirty();
    canvas.requestRenderAll();
  });
  forms.sig.addEventListener('change', () => {
    const obj = canvas.getActiveObject();
    normalize(obj);
    if (obj?.meta) placeCaption(obj.meta.entry);
    renderProps();
    canvas.requestRenderAll();
  });

  // Gaya teks di bawah TTD (global per event)
  const sigText = $('[data-sigtext]');
  function renderSigText() {
    const st = layout.signatureText;
    sigText.elements.fontSize.value = st.fontSize;
    sigText.elements.color.value = st.color;
    sigText.elements.font.value = st.font;
    sigText.elements.titleFont.value = st.titleFont;
    syncColorUi();
  }
  function applySigText() {
    const st = layout.signatureText;
    objects.sigs.forEach((entry) => {
      entry.caption.name.set({ fontSize: st.fontSize, fill: st.color });
      entry.caption.title.set({ fontSize: st.fontSize * 0.85, fill: st.color });
      applyFont(entry.caption.name, st.font);
      applyFont(entry.caption.title, st.titleFont);
      entry.caption.name.initDimensions();
      entry.caption.title.initDimensions();
      placeCaption(entry);
    });
  }
  renderSigText();
  sigText.querySelectorAll('input, select').forEach((el) => { el.disabled = !editable; });
  sigText.addEventListener('submit', (e) => e.preventDefault());
  sigText.addEventListener('input', (e) => {
    if (e.target.value === '') return;
    if (e.target.name === 'fontSize') layout.signatureText.fontSize = Math.min(Math.max(6, Number(e.target.value)), 200);
    if (e.target.name === 'color') layout.signatureText.color = e.target.value;
    if (e.target.name === 'font') layout.signatureText.font = e.target.value;
    if (e.target.name === 'titleFont') layout.signatureText.titleFont = e.target.value;
    applySigText();
    markDirty();
    canvas.requestRenderAll();
  });

  // ---------------------------------------------------------------- tema
  const themeList = $('[data-theme-list]');
  function applyTheme(theme) {
    Object.keys(objects.fields).forEach((key) => {
      const t = theme.fields[key] || theme.fields.default;
      if (!t || !fonts[t.font]) return;
      setFieldProp(key, 'font', t.font);
      setFieldProp(key, 'color', t.color);
    });
    const td = theme.fields.default;
    if (td && fonts[td.font]) {
      objects.texts.forEach((entry) => { setTextProp(entry, 'font', td.font); setTextProp(entry, 'color', td.color); });
    }
    const st = theme.signatureText;
    if (st && fonts[st.font] && fonts[st.titleFont]) {
      Object.assign(layout.signatureText, { font: st.font, titleFont: st.titleFont, color: st.color });
      renderSigText();
      applySigText();
    }
    markDirty();
    updateGuide();
    renderProps();
    canvas.requestRenderAll();
    toast(`Tema "${theme.name}" diterapkan. Klik Simpan Layout untuk menyimpan.`, 'info');
  }

  (data.themes || []).forEach((theme) => {
    const nameStyle = theme.fields.participantName || theme.fields.default;
    const nameFont = fonts[nameStyle.font];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.disabled = !editable;
    btn.title = theme.description;
    btn.className = 'rounded-lg border border-slate-200 p-2 text-left transition hover:border-tsu-400 hover:bg-tsu-50 disabled:cursor-not-allowed disabled:opacity-60';
    const sample = document.createElement('span');
    sample.className = 'block truncate text-lg leading-tight';
    sample.textContent = 'Nama Peserta';
    sample.style.color = nameStyle.color;
    if (nameFont) {
      sample.style.fontFamily = nameFont.css;
      sample.style.fontWeight = nameFont.weight;
      sample.style.fontStyle = nameFont.style;
      ensureFont(nameFont);
    }
    const label = document.createElement('span');
    label.className = 'mt-1 block truncate text-xs font-semibold text-slate-600';
    label.textContent = theme.name;
    btn.append(sample, label);
    btn.addEventListener('click', () => applyTheme(theme));
    themeList.appendChild(btn);
  });

  // ---------------------------------------------------------------- font kustom
  const fontBox = $('[data-custom-fonts]');
  const fontForm = fontBox.querySelector('[data-font-upload]');
  const fontList = fontBox.querySelector('[data-font-list]');
  const me = data.currentUser;
  if (editable) fontForm.classList.remove('hidden');

  function renderFontList() {
    fontList.replaceChildren();
    const customs = Object.values(fonts).filter((f) => f.group === 'Font Kustom');
    if (!customs.length) {
      const li = document.createElement('li');
      li.className = 'text-xs text-slate-500';
      li.textContent = 'Belum ada font kustom.';
      fontList.appendChild(li);
      return;
    }
    customs.forEach((f) => {
      const li = document.createElement('li');
      li.className = 'flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50';
      const name = document.createElement('span');
      name.className = 'min-w-0 flex-1 truncate';
      name.textContent = f.label;
      name.title = f.uploader ? `Diunggah oleh ${f.uploader}` : f.label;
      name.style.fontFamily = f.css;
      ensureFont(f);
      li.appendChild(name);
      if (editable && (me.role !== 'HMP' || f.createdById === me.id)) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'text-xs font-semibold text-red-600 hover:underline';
        del.textContent = 'Hapus';
        del.addEventListener('click', async () => {
          const ok = await window.App.dialog({
            title: 'Hapus font?', message: `Font "${f.label}" akan dihapus dari pustaka font.`, okLabel: 'Hapus', danger: true,
          });
          if (!ok) return;
          try {
            const res = await api('DELETE', `/api/fonts/${f.id}`);
            delete fonts[f.name];
            fillFontSelects();
            renderFontList();
            toast(res.message);
          } catch (err) { toast(err.message, 'error', 8000); }
        });
        li.appendChild(del);
      }
      fontList.appendChild(li);
    });
  }
  renderFontList();

  fontForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = fontForm.querySelector('button');
    setBusy(btn, true);
    try {
      const res = await api('POST', '/api/fonts', new FormData(fontForm));
      const list = (await api('GET', '/api/fonts')).data;
      fonts = Object.fromEntries(list.map((f) => [f.name, f]));
      fillFontSelects();
      renderFontList();
      renderProps();
      renderSigText();
      fontForm.reset();
      toast(`${res.message} Pilih di daftar font (grup "Font Kustom").`);
    } catch (err) { toast(err.message, 'error', 8000); }
    setBusy(btn, false);
  });

  // ---------------------------------------------------------------- alat warna: HEX, pipet, palet
  const HEX_RE = /^#?([0-9a-f]{6})$/i;
  const toHex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

  /** Pasang warna ke input color lalu picu event agar elemen kanvas ikut berubah. */
  function setColorInput(input, hex) {
    input.value = hex.toLowerCase();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    syncColorUi();
  }

  // Kode HEX & palet "sedang dipakai" mengikuti nilai input color (dipanggil dari renderProps)
  function syncColorUi() {
    if (!colorUiReady) return;
    root.querySelectorAll('[data-color-row]').forEach((row) => {
      const color = row.querySelector('input[type="color"]');
      const hex = row.querySelector('[data-hex]');
      if (hex !== document.activeElement) hex.value = color.value.toUpperCase();
      hex.classList.remove('border-red-400');
    });
    renderUsedPalette();
  }

  root.querySelectorAll('[data-color-row]').forEach((row) => {
    const color = row.querySelector('input[type="color"]');
    const hex = row.querySelector('[data-hex]');
    const pipette = row.querySelector('[data-eyedropper]');
    if (!editable) { hex.disabled = true; pipette.disabled = true; }
    color.addEventListener('input', () => { if (hex !== document.activeElement) hex.value = color.value.toUpperCase(); });
    hex.addEventListener('input', (e) => {
      e.stopPropagation(); // jangan diproses handler form (input tanpa name)
      const m = hex.value.trim().match(HEX_RE);
      hex.classList.toggle('border-red-400', !m && hex.value.trim() !== '');
      if (m) setColorInput(color, `#${m[1]}`);
    });
    hex.addEventListener('blur', () => { hex.value = color.value.toUpperCase(); hex.classList.remove('border-red-400'); });
    // Tempel kode warna dari mana saja: "0c2c5e", "#0C2C5E", "rgb(12, 44, 94)"
    hex.addEventListener('paste', (e) => {
      const text = (e.clipboardData?.getData('text') || '').trim();
      const rgb = text.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (!rgb) return;
      e.preventDefault();
      setColorInput(color, toHex(...rgb.slice(1, 4).map((v) => Math.min(255, Number(v)))));
    });
    pipette.addEventListener('click', () => pickColor(color));
  });

  // Pipet: EyeDropper API (Chrome/Edge, bisa ambil warna dari mana saja di layar);
  // browser lain: klik titik di kanvas sertifikat.
  let picking = null;
  async function pickColor(input) {
    if (window.EyeDropper) {
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        setColorInput(input, sRGBHex.startsWith('#') ? sRGBHex : toHex(...(sRGBHex.match(/\d+/g) || [0, 0, 0]).map(Number)));
        toast(`Warna ${input.value.toUpperCase()} dipakai.`, 'info', 2500);
      } catch { /* dibatalkan (Esc) */ }
      return;
    }
    picking = { input, prev: canvas.getActiveObject() };
    canvas.skipTargetFind = true;
    canvas.defaultCursor = 'crosshair';
    canvas.hoverCursor = 'crosshair';
    wrap.classList.add('ring-4', 'ring-gold-400');
    wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); // tombol pipet bisa jauh di bawah kanvas
    toast('Klik titik pada sertifikat untuk mengambil warnanya. Tekan Esc untuk batal.', 'info', 6000);
  }
  function endCanvasPick() {
    canvas.skipTargetFind = false;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = editable ? 'move' : 'default';
    wrap.classList.remove('ring-4', 'ring-gold-400');
    const { prev } = picking;
    picking = null;
    if (prev) canvas.setActiveObject(prev);
    canvas.requestRenderAll();
    renderProps();
  }
  canvas.on('mouse:down', (opt) => {
    if (!picking) return;
    const { input } = picking;
    const scale = canvas.getRetinaScaling();
    const rect = canvas.lowerCanvasEl.getBoundingClientRect();
    const x = Math.round((opt.e.clientX - rect.left) * scale);
    const y = Math.round((opt.e.clientY - rect.top) * scale);
    const [r, g, b] = canvas.lowerCanvasEl.getContext('2d').getImageData(x, y, 1, 1).data;
    endCanvasPick();
    setColorInput(input, toHex(r, g, b));
    toast(`Warna ${toHex(r, g, b).toUpperCase()} dipakai.`, 'info', 2500);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && picking) endCanvasPick(); });

  // Palet: klik = pakai pada teks terpilih, atau salin kode bila tidak ada yang dipilih
  function swatch(hex, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'h-7 w-7 rounded-md border border-slate-300 shadow-sm ring-offset-1 transition hover:scale-110 hover:ring-2 hover:ring-tsu-500';
    b.style.backgroundColor = hex;
    b.title = `${hex.toUpperCase()}${title ? ` · ${title}` : ''}`;
    b.setAttribute('aria-label', `Warna ${hex.toUpperCase()}`);
    b.addEventListener('click', async () => {
      const kind = canvas.getActiveObject()?.meta?.kind;
      const form = editable && (kind === 'field' || kind === 'text') ? forms[kind] : null;
      if (form) {
        setColorInput(form.elements.color, hex);
        toast(`Warna ${hex.toUpperCase()} dipakai.`, 'info', 2500);
        return;
      }
      try {
        await navigator.clipboard.writeText(hex.toUpperCase());
        toast(`${hex.toUpperCase()} disalin. Pilih teks lalu klik warna untuk memakainya langsung.`, 'info');
      } catch {
        toast('Pilih teks di kanvas terlebih dahulu untuk memakai warna ini.', 'info');
      }
    });
    return b;
  }

  function renderUsedPalette() {
    const box = root.querySelector('[data-palette-used]');
    if (!box) return;
    const colors = new Map();
    Object.entries(objects.fields).forEach(([key, o]) => colors.set(String(o.fill).toLowerCase(), FIELD_LABELS[key]));
    objects.texts.forEach((t, i) => { if (!colors.has(String(t.obj.fill).toLowerCase())) colors.set(String(t.obj.fill).toLowerCase(), `Teks kustom ${i + 1}`); });
    if (!colors.has(layout.signatureText.color)) colors.set(layout.signatureText.color, 'Teks TTD');
    box.replaceChildren(...[...colors].filter(([hex]) => HEX_RE.test(hex)).map(([hex, label]) => swatch(hex, label)));
  }

  // Warna dominan template: gambar diperkecil tanpa penghalusan (warna piksel tetap asli),
  // dikelompokkan kasar, lalu tiap kelompok diwakili warna asli yang paling sering muncul.
  function templatePalette() {
    const img = bg.getElement();
    const w = 160;
    const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
    const { data: px } = ctx.getImageData(0, 0, w, h);
    const buckets = new Map();
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      const key = (px[i] >> 4) * 256 + (px[i + 1] >> 4) * 16 + (px[i + 2] >> 4);
      const exact = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      const bkt = buckets.get(key) || { n: 0, colors: new Map() };
      bkt.n += 1;
      bkt.colors.set(exact, (bkt.colors.get(exact) || 0) + 1);
      buckets.set(key, bkt);
    }
    const picked = [];
    [...buckets.values()].sort((a, b) => b.n - a.n).forEach((bkt) => {
      if (picked.length >= 12 || bkt.n < 3) return;
      const [top] = [...bkt.colors].sort((a, b) => b[1] - a[1])[0];
      const rgb = [(top >> 16) & 255, (top >> 8) & 255, top & 255];
      if (picked.every((p) => Math.hypot(p[0] - rgb[0], p[1] - rgb[1], p[2] - rgb[2]) > 40)) picked.push(rgb);
    });
    const box = root.querySelector('[data-palette-template]');
    box.replaceChildren(...picked.map((rgb) => swatch(toHex(...rgb), 'dari template')));
  }
  try { templatePalette(); } catch { root.querySelector('[data-palette-template]').textContent = 'Palet template tidak tersedia.'; }
  colorUiReady = true;

  renderList();
  renderProps();
  renderSigText();

  // ---------------------------------------------------------------- simpan & preview
  function collect() {
    const fields = {};
    Object.keys(objects.fields).forEach((key) => {
      const f = fieldState(key);
      fields[key] = {
        x: f.x, y: f.y, fontSize: f.fontSize, font: f.font, color: f.color, align: f.align, maxWidth: Math.round(f.maxWidth), prefix: f.prefix || '',
      };
    });
    const qr = objects.qr
      ? { x: Math.round(objects.qr.left), y: Math.round(objects.qr.top), size: Math.round(objects.qr.getScaledWidth()) }
      : null;
    return {
      layout: {
        fields,
        qr,
        signatureText: layout.signatureText,
        texts: objects.texts.map((entry) => {
          const t = textState(entry);
          return {
            id: t.id, text: t.text, x: t.x, y: t.y, fontSize: t.fontSize, font: t.font, color: t.color,
            align: t.align, maxWidth: t.maxWidth, lineHeight: t.lineHeight,
          };
        }),
      },
      logos: objects.logos.map(({ img, logo }) => ({
        id: logo.id,
        posX: Math.round(img.left),
        posY: Math.round(img.top),
        width: Math.round(img.getScaledWidth()),
        height: Math.round(img.getScaledHeight()),
      })),
      signatures: objects.sigs.map(({ img, sig }) => ({
        id: sig.id,
        posX: Math.round(img.left),
        posY: Math.round(img.top),
        width: Math.round(img.getScaledWidth()),
        height: Math.round(img.getScaledHeight()),
      })),
    };
  }

  async function save({ silent } = {}) {
    const res = await api('PUT', `/api/events/${eventId}/layout`, collect());
    dirty = false;
    $('[data-dirty-indicator]').classList.add('hidden');
    if (!silent) toast(res.message || 'Layout tersimpan.');
  }

  const saveBtn = $('[data-save]');
  saveBtn.addEventListener('click', async () => {
    setBusy(saveBtn, true);
    try { await save(); } catch (err) { toast(err.message, 'error', 7000); }
    setBusy(saveBtn, false);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && editable) {
      e.preventDefault();
      saveBtn.click();
    }
  });

  $('[data-preview]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    // Buka tab lebih dulu (sinkron) agar tidak diblokir popup blocker, lalu isi setelah simpan
    const win = window.open('about:blank', '_blank');
    setBusy(btn, true);
    try {
      if (dirty) await save({ silent: true });
      if (win) win.location.href = `/api/events/${eventId}/preview?t=${Date.now()}`;
      else location.href = `/api/events/${eventId}/preview`;
    } catch (err) {
      win?.close();
      toast(err.message, 'error', 7000);
    }
    setBusy(btn, false);
  });
});
