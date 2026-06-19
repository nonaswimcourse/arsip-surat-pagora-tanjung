const SUPABASE_URL = 'https://rwbbxytowtnoyjcngevk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1Vq-L40vJKQMT6CfuORWMQ_Iom2dRSj';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLE_SURAT = 'surat';
const TABLE_PROFIL = 'profil_instansi';
const STORAGE_BUCKET = 'dokumen-surat';

let currentRoute = 'dashboard';
let cachedDocuments = [];
let cachedProfile = null;
let lastPreviewDocument = null;
let lastPreviewElement = null;

const documentTypes = {
  masuk: {
    title: 'Surat Masuk',
    subtitle: 'Catat surat masuk dan buat lembar registrasi otomatis.',
    badge: 'Masuk',
    defaultStatus: 'diterima',
    primaryLabel: 'Pengirim',
    secondaryLabel: 'Tujuan / Penerima',
    requiresAddress: false,
    templateTitle: 'LEMBAR REGISTRASI SURAT MASUK',
    help: 'Gunakan menu ini untuk mencatat surat yang diterima dan membuat template registrasi atau disposisi awal.'
  },
  keluar: {
    title: 'Surat Keluar',
    subtitle: 'Buat konsep surat keluar, simpan datanya, lalu unduh PDF otomatis.',
    badge: 'Keluar',
    defaultStatus: 'draft',
    primaryLabel: 'Nama Tujuan',
    secondaryLabel: 'Instansi Tujuan',
    requiresAddress: true,
    templateTitle: 'SURAT KELUAR',
    help: 'Gunakan menu ini untuk membuat naskah surat keluar resmi dalam format PDF.'
  },
  tugas: {
    title: 'Surat Tugas',
    subtitle: 'Buat surat tugas resmi berdasarkan data kegiatan.',
    badge: 'Tugas',
    defaultStatus: 'draft',
    primaryLabel: 'Nama Petugas',
    secondaryLabel: 'Kegiatan / Tujuan Tugas',
    requiresAddress: false,
    templateTitle: 'SURAT TUGAS',
    help: 'Gunakan menu ini untuk menerbitkan surat tugas guru, pengurus, atau anggota KKG.'
  },
  undangan: {
    title: 'Undangan',
    subtitle: 'Buat surat undangan kegiatan secara otomatis.',
    badge: 'Undangan',
    defaultStatus: 'draft',
    primaryLabel: 'Penerima Undangan',
    secondaryLabel: 'Nama Kegiatan',
    requiresAddress: true,
    templateTitle: 'SURAT UNDANGAN',
    help: 'Gunakan menu ini untuk membuat undangan rapat, pelatihan, atau kegiatan KKG.'
  },
  sk: {
    title: 'Surat Keputusan',
    subtitle: 'Buat konsep SK dengan format resmi dan siap dicetak.',
    badge: 'SK',
    defaultStatus: 'draft',
    primaryLabel: 'Tentang / Objek Keputusan',
    secondaryLabel: 'Dasar Keputusan',
    requiresAddress: false,
    templateTitle: 'SURAT KEPUTUSAN',
    help: 'Gunakan menu ini untuk menyusun SK sederhana dengan data tersimpan.'
  }
};

const defaultProfile = {
  id: 'default',
  nama_instansi: 'KKG PJOK SD Kecamatan Tanjung',
  nama_aplikasi: 'SIPAS KKG PJOK',
  alamat: 'Kecamatan Tanjung',
  telepon: '-',
  email: '-',
  website: '-',
  kota: 'Tanjung',
  kepala_nama: 'Nama Ketua KKG',
  kepala_nip: '-',
  jabatan: 'Ketua KKG PJOK',
  logo_url: 'logo.png'
};

function el(id) {
  return document.getElementById(id);
}

function safe(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLong(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}

function formatDateShort(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function slugify(value) {
  return String(value || 'dokumen')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'dokumen';
}

function showToast(message, type = 'success') {
  const toast = el('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 4200);
}

function setPageHeader(title, subtitle) {
  el('pageTitle').textContent = title;
  el('pageSubtitle').textContent = subtitle;
}

function setActiveMenu(route) {
  document.querySelectorAll('.menu-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.route === route);
  });
}

function getLocalDocuments() {
  try {
    return JSON.parse(localStorage.getItem('sipas_documents') || '[]');
  } catch (error) {
    return [];
  }
}

function setLocalDocuments(rows) {
  localStorage.setItem('sipas_documents', JSON.stringify(rows));
}

function getLocalProfile() {
  try {
    return JSON.parse(localStorage.getItem('sipas_profile') || 'null');
  } catch (error) {
    return null;
  }
}

function setLocalProfile(profile) {
  localStorage.setItem('sipas_profile', JSON.stringify(profile));
}

async function doLogin() {
  const email = el('email').value.trim();
  const password = el('password').value;
  el('loginError').textContent = '';

  if (!email || !password) {
    el('loginError').textContent = 'Email dan password wajib diisi.';
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    el('loginError').textContent = error.message;
    return;
  }

  el('loginPage').style.display = 'none';
  el('app').style.display = 'block';
  await bootstrapApp();
}

async function logout() {
  await supabaseClient.auth.signOut();
  location.reload();
}

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    el('loginPage').style.display = 'none';
    el('app').style.display = 'block';
    await bootstrapApp();
  }
}

async function bootstrapApp() {
  await loadProfile();
  await navigate('dashboard');
}

async function loadProfile() {
  const localProfile = getLocalProfile();
  cachedProfile = { ...defaultProfile, ...(localProfile || {}) };

  try {
    const { data, error } = await supabaseClient
      .from(TABLE_PROFIL)
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (!error && data) {
      cachedProfile = { ...defaultProfile, ...data };
      setLocalProfile(cachedProfile);
    }
  } catch (error) {
    console.warn('Profil instansi memakai data lokal:', error);
  }

  return cachedProfile;
}

async function navigate(route) {
  currentRoute = route;
  setActiveMenu(route);

  if (route === 'dashboard') return renderDashboard();
  if (route === 'arsip') return renderArchivePage();
  if (route === 'pengaturan') return renderSettingsPage();
  if (documentTypes[route]) return renderDocumentPage(route);

  renderEmptyState('Menu belum tersedia', 'Menu ini belum memiliki konfigurasi halaman.');
}

async function refreshCurrentPage() {
  await navigate(currentRoute);
}

function renderEmptyState(title, message) {
  setPageHeader(title, message);
  el('pageContent').innerHTML = `
    <div class="empty-state">
      <h2>${safe(title)}</h2>
      <p>${safe(message)}</p>
    </div>`;
}

async function fetchDocuments(filter = {}) {
  const localRows = getLocalDocuments();
  let rows = localRows;

  try {
    let query = supabaseClient
      .from(TABLE_SURAT)
      .select('*')
      .order('created_at', { ascending: false });

    if (filter.jenis) query = query.eq('jenis', filter.jenis);
    if (filter.status) query = query.eq('status', filter.status);

    const { data, error } = await query;
    if (error) throw error;
    rows = data || [];
  } catch (error) {
    console.warn('Data Supabase belum terbaca. Aplikasi memakai data lokal:', error);
  }

  if (filter.jenis) rows = rows.filter((row) => row.jenis === filter.jenis);
  if (filter.status) rows = rows.filter((row) => row.status === filter.status);

  cachedDocuments = rows;
  return rows;
}

async function renderDashboard() {
  setPageHeader('Dashboard', 'Ringkasan administrasi surat dan arsip dokumen.');
  const rows = await fetchDocuments();
  const activeRows = rows.filter((row) => row.status !== 'diarsipkan');
  const archiveRows = rows.filter((row) => row.status === 'diarsipkan');

  const countByType = Object.keys(documentTypes).reduce((result, key) => {
    result[key] = rows.filter((row) => row.jenis === key).length;
    return result;
  }, {});

  el('pageContent').innerHTML = `
    <div class="stats">
      <div class="card stat-card"><span>Total Surat</span><strong id="totalSurat">${rows.length}</strong><small>Semua jenis dokumen</small></div>
      <div class="card stat-card"><span>Surat Aktif</span><strong id="totalMasuk">${activeRows.length}</strong><small>Belum diarsipkan</small></div>
      <div class="card stat-card"><span>Total Arsip</span><strong id="totalArsip">${archiveRows.length}</strong><small>Dokumen selesai</small></div>
    </div>

    <div class="section-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Ringkasan Menu</h2>
            <p>Semua menu sudah aktif dan terhubung dengan form pembuatan dokumen.</p>
          </div>
        </div>
        <div class="quick-menu">
          ${Object.entries(documentTypes).map(([key, type]) => `
            <button onclick="navigate('${key}')">
              <strong>${safe(type.title)}</strong>
              <span>${countByType[key] || 0} data</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Alur Sistem</h2>
            <p>Konsep kerja menu yang sudah disiapkan.</p>
          </div>
        </div>
        <ol class="workflow">
          <li>Isi data surat melalui menu sesuai jenis dokumen.</li>
          <li>Sistem menyimpan data ke tabel Supabase.</li>
          <li>Sistem membuat tampilan template resmi otomatis.</li>
          <li>PDF dapat diunduh, dicetak, dan diunggah ke Supabase Storage jika bucket tersedia.</li>
          <li>Dokumen selesai dapat dipindahkan ke menu arsip.</li>
        </ol>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>Dokumen Terbaru</h2>
          <p>Data terakhir yang masuk ke sistem.</p>
        </div>
      </div>
      ${renderTable(rows.slice(0, 8), { showType: true })}
    </div>`;
}

async function renderDocumentPage(typeKey) {
  const type = documentTypes[typeKey];
  setPageHeader(type.title, type.subtitle);
  const rows = await fetchDocuments({ jenis: typeKey });

  el('pageContent').innerHTML = `
    <div class="two-column">
      <form class="panel form-panel" id="documentForm" onsubmit="saveDocument(event, '${typeKey}')">
        <div class="panel-header">
          <div>
            <h2>Form ${safe(type.title)}</h2>
            <p>${safe(type.help)}</p>
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label>Nomor Surat</label>
            <input name="nomor_surat" required placeholder="Contoh: 001/KKG-PJOK/VI/2026">
          </div>
          <div class="field">
            <label>Tanggal Surat</label>
            <input type="date" name="tanggal_surat" value="${todayInput()}" required>
          </div>
          <div class="field">
            <label>${safe(type.primaryLabel)}</label>
            <input name="pengirim" required placeholder="Isi nama pihak terkait">
          </div>
          <div class="field">
            <label>${safe(type.secondaryLabel)}</label>
            <input name="penerima" required placeholder="Isi tujuan atau keterangan utama">
          </div>
          <div class="field full">
            <label>Perihal</label>
            <input name="perihal" required placeholder="Tulis perihal surat">
          </div>
          ${type.requiresAddress ? `
          <div class="field full">
            <label>Alamat Tujuan</label>
            <textarea name="alamat_tujuan" rows="2" placeholder="Tulis alamat tujuan"></textarea>
          </div>` : ''}
          <div class="field">
            <label>Sifat Surat</label>
            <select name="sifat_surat">
              <option value="Biasa">Biasa</option>
              <option value="Penting">Penting</option>
              <option value="Segera">Segera</option>
              <option value="Rahasia">Rahasia</option>
            </select>
          </div>
          <div class="field">
            <label>Lampiran</label>
            <input name="lampiran" placeholder="Contoh: 1 berkas / -">
          </div>
          <div class="field full">
            <label>Isi Surat / Ringkasan</label>
            <textarea name="isi_surat" rows="7" required placeholder="Tulis isi surat. Untuk surat keluar, bagian ini akan menjadi badan surat pada PDF."></textarea>
          </div>
          <div class="field">
            <label>Status</label>
            <select name="status">
              <option value="${safe(type.defaultStatus)}">${safe(titleCase(type.defaultStatus))}</option>
              <option value="draft">Draft</option>
              <option value="diterima">Diterima</option>
              <option value="diproses">Diproses</option>
              <option value="selesai">Selesai</option>
              <option value="diarsipkan">Diarsipkan</option>
            </select>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn secondary" onclick="previewForm('${typeKey}')">Preview Template</button>
          <button type="submit" class="btn">Simpan Data</button>
          <button type="button" class="btn gold" onclick="saveDocumentAndPdf(event, '${typeKey}')">Simpan & Download PDF</button>
        </div>
      </form>

      <div class="panel concept-card">
        <h2>Konsep Menu</h2>
        <p>Menu ${safe(type.title)} dibuat agar data tidak hanya tampil di layar, tetapi juga dapat menjadi dokumen PDF siap pakai.</p>
        <div class="concept-list">
          <div><span>1</span><p>Data diinput melalui form.</p></div>
          <div><span>2</span><p>Data tersimpan ke Supabase.</p></div>
          <div><span>3</span><p>Template PDF dibuat otomatis.</p></div>
          <div><span>4</span><p>Dokumen dapat dicetak atau diarsipkan.</p></div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>Data ${safe(type.title)}</h2>
          <p>Daftar dokumen yang sudah dibuat pada menu ini.</p>
        </div>
        <input class="table-search" id="search-${typeKey}" oninput="filterTable('${typeKey}')" placeholder="Cari nomor, perihal, atau pihak terkait...">
      </div>
      <div id="table-${typeKey}">${renderTable(rows, { showType: false })}</div>
    </div>`;
}

function titleCase(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function readFormData(typeKey) {
  const form = el('documentForm');
  const data = new FormData(form);
  const type = documentTypes[typeKey];

  return {
    jenis: typeKey,
    nomor_surat: data.get('nomor_surat')?.trim(),
    tanggal_surat: data.get('tanggal_surat'),
    perihal: data.get('perihal')?.trim(),
    pengirim: data.get('pengirim')?.trim(),
    penerima: data.get('penerima')?.trim(),
    instansi_tujuan: data.get('penerima')?.trim(),
    alamat_tujuan: data.get('alamat_tujuan')?.trim() || '',
    isi_surat: data.get('isi_surat')?.trim(),
    lampiran: data.get('lampiran')?.trim() || '-',
    sifat_surat: data.get('sifat_surat') || 'Biasa',
    status: data.get('status') || type.defaultStatus
  };
}

function validateDocument(payload) {
  const required = ['nomor_surat', 'tanggal_surat', 'perihal', 'pengirim', 'penerima', 'isi_surat'];
  const missing = required.filter((key) => !payload[key]);
  return missing.length === 0;
}

async function saveDocument(event, typeKey, options = {}) {
  if (event) event.preventDefault();
  const payload = readFormData(typeKey);

  if (!validateDocument(payload)) {
    showToast('Data belum lengkap. Lengkapi nomor, tanggal, perihal, pihak terkait, dan isi surat.', 'error');
    return null;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  payload.created_by = session?.user?.id || null;
  payload.created_at = new Date().toISOString();

  let savedRow = null;
  try {
    const { data, error } = await supabaseClient
      .from(TABLE_SURAT)
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    savedRow = data;
    showToast('Data berhasil disimpan ke Supabase.');
  } catch (error) {
    const localRows = getLocalDocuments();
    savedRow = { ...payload, id: crypto.randomUUID(), local_only: true };
    localRows.unshift(savedRow);
    setLocalDocuments(localRows);
    showToast('Data tersimpan lokal. Jalankan SQL Supabase agar data tersimpan online.', 'warning');
    console.warn('Gagal menyimpan ke Supabase:', error);
  }

  if (options.downloadPdf && savedRow) {
    await createPdfFromDocument(savedRow, { download: true, upload: true });
  }

  el('documentForm')?.reset();
  await renderDocumentPage(typeKey);
  return savedRow;
}

async function saveDocumentAndPdf(event, typeKey) {
  if (event) event.preventDefault();
  await saveDocument(event, typeKey, { downloadPdf: true });
}

async function previewForm(typeKey) {
  const payload = readFormData(typeKey);
  if (!validateDocument(payload)) {
    showToast('Isi data utama terlebih dahulu sebelum preview.', 'error');
    return;
  }
  openPreview({ ...payload, id: 'preview' });
}

function openPreview(documentRow) {
  lastPreviewDocument = documentRow;
  const content = el('previewContent');
  content.innerHTML = buildDocumentHTML(documentRow);
  lastPreviewElement = content.querySelector('.pdf-page');
  el('previewModal').hidden = false;
}

function closePreview() {
  el('previewModal').hidden = true;
  lastPreviewDocument = null;
  lastPreviewElement = null;
}

function printPreview() {
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html><head><title>Cetak Dokumen</title><link rel="stylesheet" href="assets/style.css"></head>
    <body class="print-body">${el('previewContent').innerHTML}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 350);
}

async function downloadPreviewPdf() {
  if (!lastPreviewDocument) return;
  await createPdfFromDocument(lastPreviewDocument, { download: true, upload: false });
}

async function createPdfFromDocument(documentRow, options = { download: true, upload: false }) {
  await loadProfile();
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildDocumentHTML(documentRow);
  document.body.appendChild(wrapper);
  const pdfElement = wrapper.querySelector('.pdf-page');
  const fileName = `${slugify(documentRow.jenis)}-${slugify(documentRow.nomor_surat)}.pdf`;

  try {
    if (typeof html2pdf === 'undefined') {
      openPreview(documentRow);
      showToast('Library PDF belum terbaca. Gunakan tombol Cetak untuk simpan sebagai PDF.', 'warning');
      return;
    }

    const worker = html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      })
      .from(pdfElement);

    if (options.upload && !documentRow.local_only && documentRow.id) {
      const pdfBlob = await worker.outputPdf('blob');
      await uploadPdfBlob(documentRow, pdfBlob, fileName);
      if (options.download) {
        await html2pdf().set({ filename: fileName, jsPDF: { unit: 'mm', format: 'a4' } }).from(pdfElement).save();
      }
    } else if (options.download) {
      await worker.save();
    }
  } catch (error) {
    console.warn('Gagal membuat PDF otomatis:', error);
    openPreview(documentRow);
    showToast('PDF otomatis gagal dibuat. Preview tetap tersedia untuk dicetak manual.', 'warning');
  } finally {
    wrapper.remove();
  }
}

async function uploadPdfBlob(documentRow, pdfBlob, fileName) {
  const path = `${documentRow.jenis}/${Date.now()}-${fileName}`;
  const { error: uploadError } = await supabaseClient
    .storage
    .from(STORAGE_BUCKET)
    .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });

  if (uploadError) {
    console.warn('Upload PDF ke storage gagal:', uploadError);
    showToast('PDF berhasil dibuat, tetapi belum terunggah ke Supabase Storage. Pastikan bucket dokumen-surat sudah dibuat.', 'warning');
    return;
  }

  const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  await supabaseClient
    .from(TABLE_SURAT)
    .update({ pdf_path: path, pdf_url: data?.publicUrl || null })
    .eq('id', documentRow.id);

  showToast('PDF berhasil dibuat dan diunggah ke Supabase Storage.');
}

function buildDocumentHTML(documentRow) {
  const profile = { ...defaultProfile, ...(cachedProfile || {}) };
  const type = documentTypes[documentRow.jenis] || documentTypes.keluar;

  if (documentRow.jenis === 'masuk') return buildIncomingTemplate(documentRow, profile, type);
  if (documentRow.jenis === 'tugas') return buildAssignmentTemplate(documentRow, profile, type);
  if (documentRow.jenis === 'undangan') return buildInvitationTemplate(documentRow, profile, type);
  if (documentRow.jenis === 'sk') return buildDecisionTemplate(documentRow, profile, type);
  return buildOutgoingTemplate(documentRow, profile, type);
}

function letterhead(profile) {
  return `
    <div class="letterhead">
      <img src="${safe(profile.logo_url || 'logo.png')}" alt="Logo" onerror="this.style.display='none'">
      <div>
        <h1>${safe(profile.nama_instansi)}</h1>
        <p>${safe(profile.alamat)}</p>
        <p>Telp. ${safe(profile.telepon)} | Email: ${safe(profile.email)} | Web: ${safe(profile.website)}</p>
      </div>
    </div>
    <div class="letter-line"></div>`;
}

function signature(profile) {
  return `
    <div class="signature-block">
      <p>${safe(profile.kota)}, ${formatDateLong(todayInput())}</p>
      <p>${safe(profile.jabatan)}</p>
      <div class="signature-space"></div>
      <p><strong>${safe(profile.kepala_nama)}</strong></p>
      <p>NIP. ${safe(profile.kepala_nip)}</p>
    </div>`;
}

function metaTable(rows) {
  return `
    <table class="meta-table">
      ${rows.map(([label, value]) => `
        <tr><td>${safe(label)}</td><td>:</td><td>${safe(value || '-')}</td></tr>`).join('')}
    </table>`;
}

function paragraphText(value) {
  return safe(value || '-').split('\n').map((line) => `<p>${line || '&nbsp;'}</p>`).join('');
}

function buildOutgoingTemplate(row, profile, type) {
  return `
    <article class="pdf-page">
      ${letterhead(profile)}
      <div class="letter-meta-grid">
        <div>${metaTable([
          ['Nomor', row.nomor_surat],
          ['Lampiran', row.lampiran],
          ['Sifat', row.sifat_surat],
          ['Perihal', row.perihal]
        ])}</div>
        <div class="date-right">${safe(profile.kota)}, ${formatDateLong(row.tanggal_surat)}</div>
      </div>

      <div class="recipient">
        <p>Kepada Yth.</p>
        <p><strong>${safe(row.pengirim)}</strong></p>
        <p>${safe(row.penerima)}</p>
        <p>${safe(row.alamat_tujuan || '')}</p>
      </div>

      <div class="body-text">
        <p>Dengan hormat,</p>
        ${paragraphText(row.isi_surat)}
      </div>
      ${signature(profile)}
    </article>`;
}

function buildIncomingTemplate(row, profile, type) {
  return `
    <article class="pdf-page">
      ${letterhead(profile)}
      <h2 class="template-title">${safe(type.templateTitle)}</h2>
      ${metaTable([
        ['Nomor Surat', row.nomor_surat],
        ['Tanggal Surat', formatDateLong(row.tanggal_surat)],
        ['Tanggal Diterima', formatDateLong(todayInput())],
        ['Pengirim', row.pengirim],
        ['Tujuan/Penerima', row.penerima],
        ['Perihal', row.perihal],
        ['Sifat Surat', row.sifat_surat],
        ['Lampiran', row.lampiran],
        ['Status', titleCase(row.status)]
      ])}
      <div class="body-box">
        <h3>Ringkasan Isi Surat</h3>
        ${paragraphText(row.isi_surat)}
      </div>
      <div class="disposition-box">
        <h3>Catatan Tindak Lanjut</h3>
        <div class="blank-lines"></div>
      </div>
      ${signature(profile)}
    </article>`;
}

function buildAssignmentTemplate(row, profile, type) {
  return `
    <article class="pdf-page">
      ${letterhead(profile)}
      <h2 class="template-title">${safe(type.templateTitle)}</h2>
      <p class="center-text">Nomor: ${safe(row.nomor_surat)}</p>
      <div class="body-text">
        <p>Yang bertanda tangan di bawah ini memberikan tugas kepada:</p>
        ${metaTable([
          ['Nama Petugas', row.pengirim],
          ['Kegiatan/Tujuan', row.penerima],
          ['Tanggal Surat', formatDateLong(row.tanggal_surat)],
          ['Perihal', row.perihal]
        ])}
        ${paragraphText(row.isi_surat)}
        <p>Surat tugas ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.</p>
      </div>
      ${signature(profile)}
    </article>`;
}

function buildInvitationTemplate(row, profile, type) {
  return `
    <article class="pdf-page">
      ${letterhead(profile)}
      <div class="letter-meta-grid">
        <div>${metaTable([
          ['Nomor', row.nomor_surat],
          ['Lampiran', row.lampiran],
          ['Sifat', row.sifat_surat],
          ['Perihal', row.perihal]
        ])}</div>
        <div class="date-right">${safe(profile.kota)}, ${formatDateLong(row.tanggal_surat)}</div>
      </div>
      <div class="recipient">
        <p>Kepada Yth.</p>
        <p><strong>${safe(row.pengirim)}</strong></p>
        <p>${safe(row.alamat_tujuan || '')}</p>
      </div>
      <div class="body-text">
        <p>Dengan hormat,</p>
        <p>Sehubungan dengan kegiatan <strong>${safe(row.penerima)}</strong>, kami mengundang Bapak/Ibu untuk hadir dalam kegiatan tersebut.</p>
        ${paragraphText(row.isi_surat)}
        <p>Demikian undangan ini disampaikan. Atas perhatian dan kehadirannya, kami ucapkan terima kasih.</p>
      </div>
      ${signature(profile)}
    </article>`;
}

function buildDecisionTemplate(row, profile, type) {
  return `
    <article class="pdf-page">
      ${letterhead(profile)}
      <h2 class="template-title">${safe(type.templateTitle)}</h2>
      <p class="center-text">Nomor: ${safe(row.nomor_surat)}</p>
      <h3 class="center-text small-title">TENTANG</h3>
      <h3 class="center-text small-title">${safe(row.pengirim)}</h3>
      <div class="body-text">
        ${metaTable([
          ['Tanggal', formatDateLong(row.tanggal_surat)],
          ['Dasar Keputusan', row.penerima],
          ['Perihal', row.perihal]
        ])}
        <p><strong>MEMUTUSKAN:</strong></p>
        ${paragraphText(row.isi_surat)}
      </div>
      ${signature(profile)}
    </article>`;
}

function renderTable(rows, options = {}) {
  if (!rows.length) {
    return `<div class="empty-state small"><h3>Belum ada data</h3><p>Data yang dibuat akan tampil di sini.</p></div>`;
  }

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>No</th>
            ${options.showType ? '<th>Jenis</th>' : ''}
            <th>Nomor</th>
            <th>Tanggal</th>
            <th>Perihal</th>
            <th>Pihak Terkait</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => `
            <tr>
              <td>${index + 1}</td>
              ${options.showType ? `<td><span class="badge">${safe(documentTypes[row.jenis]?.badge || row.jenis)}</span></td>` : ''}
              <td>${safe(row.nomor_surat)}</td>
              <td>${formatDateShort(row.tanggal_surat)}</td>
              <td>${safe(row.perihal)}</td>
              <td>${safe(row.pengirim || row.penerima)}</td>
              <td><span class="status ${safe(row.status)}">${safe(titleCase(row.status))}</span></td>
              <td class="actions">
                <button onclick="previewById('${safe(row.id)}')">Preview</button>
                <button onclick="downloadById('${safe(row.id)}')">PDF</button>
                <button onclick="archiveById('${safe(row.id)}')">Arsip</button>
                <button class="danger" onclick="deleteById('${safe(row.id)}')">Hapus</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function filterTable(typeKey) {
  const keyword = el(`search-${typeKey}`)?.value?.toLowerCase() || '';
  const rows = await fetchDocuments({ jenis: typeKey });
  const filtered = rows.filter((row) => [
    row.nomor_surat, row.perihal, row.pengirim, row.penerima, row.status
  ].join(' ').toLowerCase().includes(keyword));

  el(`table-${typeKey}`).innerHTML = renderTable(filtered, { showType: false });
}

function findDocumentById(id) {
  return cachedDocuments.find((row) => String(row.id) === String(id)) || getLocalDocuments().find((row) => String(row.id) === String(id));
}

async function previewById(id) {
  const row = findDocumentById(id);
  if (!row) return showToast('Data tidak ditemukan.', 'error');
  openPreview(row);
}

async function downloadById(id) {
  const row = findDocumentById(id);
  if (!row) return showToast('Data tidak ditemukan.', 'error');
  await createPdfFromDocument(row, { download: true, upload: !row.local_only });
}

async function archiveById(id) {
  const row = findDocumentById(id);
  if (!row) return showToast('Data tidak ditemukan.', 'error');

  if (row.local_only) {
    const localRows = getLocalDocuments().map((item) => item.id === id ? { ...item, status: 'diarsipkan' } : item);
    setLocalDocuments(localRows);
  } else {
    try {
      const { error } = await supabaseClient.from(TABLE_SURAT).update({ status: 'diarsipkan' }).eq('id', id);
      if (error) throw error;
    } catch (error) {
      showToast('Gagal mengarsipkan di Supabase.', 'error');
      console.warn(error);
      return;
    }
  }

  showToast('Dokumen berhasil dipindahkan ke arsip.');
  await refreshCurrentPage();
}

async function deleteById(id) {
  if (!confirm('Hapus data ini? Tindakan ini tidak dapat dibatalkan.')) return;
  const row = findDocumentById(id);
  if (!row) return showToast('Data tidak ditemukan.', 'error');

  if (row.local_only) {
    setLocalDocuments(getLocalDocuments().filter((item) => item.id !== id));
  } else {
    try {
      const { error } = await supabaseClient.from(TABLE_SURAT).delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      showToast('Gagal menghapus data di Supabase.', 'error');
      console.warn(error);
      return;
    }
  }

  showToast('Data berhasil dihapus.');
  await refreshCurrentPage();
}

async function renderArchivePage() {
  setPageHeader('Arsip', 'Dokumen yang sudah selesai dan dipindahkan ke arsip.');
  const rows = await fetchDocuments({ status: 'diarsipkan' });
  el('pageContent').innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h2>Arsip Dokumen</h2>
          <p>Seluruh dokumen berstatus diarsipkan.</p>
        </div>
      </div>
      ${renderTable(rows, { showType: true })}
    </div>`;
}

async function renderSettingsPage() {
  setPageHeader('Pengaturan', 'Atur identitas instansi untuk kop surat dan tanda tangan PDF.');
  const profile = await loadProfile();

  el('pageContent').innerHTML = `
    <form class="panel form-panel" id="profileForm" onsubmit="saveProfile(event)">
      <div class="panel-header">
        <div>
          <h2>Profil Instansi</h2>
          <p>Data ini akan muncul otomatis pada kop surat dan bagian tanda tangan.</p>
        </div>
      </div>
      <div class="form-grid">
        <div class="field">
          <label>Nama Instansi</label>
          <input name="nama_instansi" value="${safe(profile.nama_instansi)}" required>
        </div>
        <div class="field">
          <label>Nama Aplikasi</label>
          <input name="nama_aplikasi" value="${safe(profile.nama_aplikasi)}" required>
        </div>
        <div class="field full">
          <label>Alamat</label>
          <textarea name="alamat" rows="2">${safe(profile.alamat)}</textarea>
        </div>
        <div class="field">
          <label>Telepon</label>
          <input name="telepon" value="${safe(profile.telepon)}">
        </div>
        <div class="field">
          <label>Email</label>
          <input name="email" value="${safe(profile.email)}">
        </div>
        <div class="field">
          <label>Website</label>
          <input name="website" value="${safe(profile.website)}">
        </div>
        <div class="field">
          <label>Kota Penandatanganan</label>
          <input name="kota" value="${safe(profile.kota)}">
        </div>
        <div class="field">
          <label>Nama Penandatangan</label>
          <input name="kepala_nama" value="${safe(profile.kepala_nama)}">
        </div>
        <div class="field">
          <label>NIP</label>
          <input name="kepala_nip" value="${safe(profile.kepala_nip)}">
        </div>
        <div class="field">
          <label>Jabatan</label>
          <input name="jabatan" value="${safe(profile.jabatan)}">
        </div>
        <div class="field full">
          <label>URL Logo</label>
          <input name="logo_url" value="${safe(profile.logo_url)}" placeholder="logo.png atau URL publik Supabase Storage">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn" type="submit">Simpan Pengaturan</button>
      </div>
    </form>`;
}

async function saveProfile(event) {
  event.preventDefault();
  const form = new FormData(el('profileForm'));
  const payload = {
    id: 'default',
    nama_instansi: form.get('nama_instansi')?.trim(),
    nama_aplikasi: form.get('nama_aplikasi')?.trim(),
    alamat: form.get('alamat')?.trim(),
    telepon: form.get('telepon')?.trim(),
    email: form.get('email')?.trim(),
    website: form.get('website')?.trim(),
    kota: form.get('kota')?.trim(),
    kepala_nama: form.get('kepala_nama')?.trim(),
    kepala_nip: form.get('kepala_nip')?.trim(),
    jabatan: form.get('jabatan')?.trim(),
    logo_url: form.get('logo_url')?.trim() || 'logo.png',
    updated_at: new Date().toISOString()
  };

  cachedProfile = { ...defaultProfile, ...payload };
  setLocalProfile(cachedProfile);

  try {
    const { error } = await supabaseClient.from(TABLE_PROFIL).upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    showToast('Pengaturan berhasil disimpan ke Supabase.');
  } catch (error) {
    showToast('Pengaturan tersimpan lokal. Jalankan SQL Supabase agar tersimpan online.', 'warning');
    console.warn(error);
  }
}

window.doLogin = doLogin;
window.logout = logout;
window.navigate = navigate;
window.refreshCurrentPage = refreshCurrentPage;
window.saveDocument = saveDocument;
window.saveDocumentAndPdf = saveDocumentAndPdf;
window.previewForm = previewForm;
window.closePreview = closePreview;
window.printPreview = printPreview;
window.downloadPreviewPdf = downloadPreviewPdf;
window.filterTable = filterTable;
window.previewById = previewById;
window.downloadById = downloadById;
window.archiveById = archiveById;
window.deleteById = deleteById;
window.saveProfile = saveProfile;

document.addEventListener('DOMContentLoaded', checkSession);
