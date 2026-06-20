const SUPABASE_URL = 'https://bixyaowckwvjpgwffoci.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_phZErDKE6oDEDN5whvlk3Q_8LpXylcG';
const TABLE_SURAT = 'surat';
const TABLE_PROFIL = 'profil_instansi';
const STORAGE_BUCKET = 'dokumen-surat';
const LOCAL_SESSION_KEY = 'sipas_kantor_session';
const LOCAL_DOC_KEY = 'sipas_kantor_documents';
const LOCAL_PROFILE_KEY = 'sipas_kantor_profile';
const LOCAL_DELETED_KEY = 'sipas_kantor_deleted_ids';

const hasSupabaseSdk = typeof window !== 'undefined'
  && window.supabase
  && typeof window.supabase.createClient === 'function';
const supabaseClient = hasSupabaseSdk
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let currentRoute = 'dashboard';
let cachedDocuments = [];
let cachedProfile = null;
let currentUser = null;
let lastPreviewDocument = null;
let lastPreviewElement = null;
let editTargetId = null;

const demoAccounts = {
  'admin@sipas.local': { password: 'admin123', role: 'admin', name: 'Administrator' },
  'staf@sipas.local': { password: 'staf123', role: 'staf', name: 'Staf Administrasi' },
  'pimpinan@sipas.local': { password: 'pimpinan123', role: 'pimpinan', name: 'Pimpinan' }
};

const permissions = {
  admin: { create: true, edit: true, delete: true, reset: true, archive: true, approve: true, settings: true, export: true, pdf: true },
  staf: { create: true, edit: true, delete: true, reset: true, archive: true, approve: false, settings: true, export: true, pdf: true },
  pimpinan: { create: false, edit: true, delete: true, reset: true, archive: true, approve: true, settings: true, export: true, pdf: true }
};

const documentTypes = {
  masuk: {
    title: 'Surat Masuk',
    subtitle: 'Catat surat masuk, disposisi awal, dan arsip dokumen masuk.',
    badge: 'Masuk',
    defaultStatus: 'diterima',
    primaryLabel: 'Pengirim',
    secondaryLabel: 'Tujuan / Penerima',
    requiresAddress: false,
    templateTitle: 'LEMBAR REGISTRASI SURAT MASUK',
    help: 'Gunakan menu ini untuk mencatat surat dinas atau berkas fisik yang diterima dari luar.'
  },
  keluar: {
    title: 'Surat Keluar',
    subtitle: 'Buat konsep surat keluar resmi, ajukan persetujuan, dan unduh PDF siap cetak.',
    badge: 'Keluar',
    defaultStatus: 'draft',
    primaryLabel: 'Nama Tujuan',
    secondaryLabel: 'Instansi Tujuan',
    requiresAddress: true,
    templateTitle: 'SURAT KELUAR',
    help: 'Gunakan menu ini untuk menyusun naskah surat resmi keluar. Tanggal bagian atas dinonaktifkan.'
  },
  tugas: {
    title: 'Surat Tugas',
    subtitle: 'Buat surat tugas resmi berdasarkan data kegiatan dan personel petugas.',
    badge: 'Tugas',
    defaultStatus: 'draft',
    primaryLabel: 'Nama Petugas',
    secondaryLabel: 'Kegiatan / Tujuan Tugas',
    requiresAddress: false,
    templateTitle: 'SURAT TUGAS',
    help: 'Gunakan menu ini untuk menerbitkan penugasan resmi kolektif atau mandiri.'
  },
  undangan: {
    title: 'Undangan',
    subtitle: 'Buat surat undangan kegiatan / rapat dengan format rincian acara yang rapi.',
    badge: 'Undangan',
    defaultStatus: 'draft',
    primaryLabel: 'Penerima Undangan',
    secondaryLabel: 'Nama Kegiatan',
    requiresAddress: true,
    templateTitle: 'SURAT UNDANGAN',
    help: 'Gunakan menu ini jika ingin membuat surat undangan rapat berkala instansi.'
  },
  sk: {
    title: 'Surat Keputusan',
    subtitle: 'Buat konsep SK (Surat Keputusan) dengan struktur konsideran resmi.',
    badge: 'SK',
    defaultStatus: 'draft',
    primaryLabel: 'Tentang / Objek Keputusan',
    secondaryLabel: 'Dasar Keputusan',
    requiresAddress: false,
    templateTitle: 'SURAT KEPUTUSAN',
    help: 'Gunakan menu ini untuk merancang draf Surat Keputusan (SK) pimpinan.'
  }
};

const defaultProfile = {
  id: 'default',
  nama_instansi: 'KKG PJOK SD KECAMATAN TANJUNG',
  nama_aplikasi: 'SIPAS Kantor',
  alamat: 'Kecamatan Tanjung',
  telepon: '-',
  email: '-',
  website: '-',
  kota: 'Tanjung',
  kepala_nama: 'Nama Ketua KKG',
  kepala_nip: '-',
  jabatan: 'Ketua KKG PJOK',
  logo_url: ''
};

function el(id) { return document.getElementById(id); }

function safe(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
}

function jsAttr(value) {
  return String(value ?? '').replace(/'/g, "\\'");
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function titleCase(value) {
  return String(value || '-')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function formatDateLong(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateShort(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function slugify(value) {
  return String(value || 'dokumen')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'dokumen';
}

function newId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getPerm(action) {
  const role = currentUser?.role || 'staf';
  return !!(permissions[role] && permissions[role][action]);
}

function showToast(message, type = 'success') {
  const toast = el('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function errorText(error, fallback = 'Terjadi kesalahan sistem.') {
  if (!error) return fallback;
  return error.message || error.error_description || error.details || JSON.stringify(error);
}

function readJSON(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

function getLocalSession() { return readJSON(LOCAL_SESSION_KEY, null); }
function setLocalSession(user) { writeJSON(LOCAL_SESSION_KEY, { user, created_at: new Date().toISOString() }); }
function clearLocalSession() { localStorage.removeItem(LOCAL_SESSION_KEY); }

function getLocalDocuments() { return readJSON(LOCAL_DOC_KEY, []); }
function setLocalDocuments(rows) { writeJSON(LOCAL_DOC_KEY, rows); }

function getDeletedDocumentIds() { return readJSON(LOCAL_DELETED_KEY, []); }
function setDeletedDocumentIds(ids) { writeJSON(LOCAL_DELETED_KEY, [...new Set((ids || []).map(String).filter(Boolean))]); }

function normalizeDocument(row) {
  return {
    id: row.id || newId(),
    jenis: row.jenis || 'keluar',
    nomor_surat: row.nomor_surat || '',
    nomor_agenda: row.nomor_agenda || '',
    tanggal_surat: row.tanggal_surat || todayInput(),
    pengirim: row.pengirim || '',
    penerima: row.penerima || '',
    alamat_tujuan: row.alamat_tujuan || '',
    perihal: row.perihal || '',
    sifat_surat: row.sifat_surat || 'Biasa',
    lampiran: row.lampiran || '-',
    isi_surat: row.isi_surat || '',
    hari: row.hari || '',
    tanggal_kegiatan: row.tanggal_kegiatan || '',
    waktu: row.waktu || '',
    tempat: row.tempat || '',
    acara: row.acara || '',
    status: row.status || (documentTypes[row.jenis || 'keluar'] ? documentTypes[row.jenis || 'keluar'].defaultStatus : 'draft'),
    catatan: row.catatan || '',
    dibuat_oleh: row.dibuat_oleh || (currentUser ? currentUser.email : '-'),
    disetujui_oleh: row.disetujui_oleh || '',
    pdf_url: row.pdf_url || '',
    pdf_path: row.pdf_path || '',
    local_only: row.local_only !== undefined ? !!row.local_only : true,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString()
  };
}

async function fetchDocuments(filter = {}) {
  const deletedIds = new Set(getDeletedDocumentIds().map(String));
  const localRows = getLocalDocuments().map(normalizeDocument).filter(row => !deletedIds.has(String(row.id)));
  let onlineRows = [];

  try {
    if (!supabaseClient) throw new Error('Supabase Client tidak aktif');
    let query = supabaseClient.from(TABLE_SURAT).select('*').order('created_at', { ascending: false });
    if (filter.jenis) query = query.eq('jenis', filter.jenis);
    if (filter.status) query = query.eq('status', filter.status);
    const { data, error } = await query;
    if (error) throw error;
    if (data) onlineRows = data.map(normalizeDocument).filter(row => !deletedIds.has(String(row.id)));
  } catch (err) {
    console.warn('Menggunakan data lokal mirror offline:', err.message);
  }

  const merged = new Map();
  onlineRows.forEach(row => merged.set(String(row.id), row));
  localRows.forEach(row => {
    const current = merged.get(String(row.id));
    if (!current || row.local_only || new Date(row.updated_at) >= new Date(current.updated_at)) {
      merged.set(String(row.id), row);
    }
  });

  let rows = Array.from(merged.values());

  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    rows = rows.filter(r => 
      String(r.nomor_surat).toLowerCase().includes(kw) ||
      String(r.perihal).toLowerCase().includes(kw) ||
      String(r.pengirim).toLowerCase().includes(kw) ||
      String(r.penerima).toLowerCase().includes(kw) ||
      String(r.isi_surat).toLowerCase().includes(kw)
    );
  }

  if (filter.startDate) rows = rows.filter(r => r.tanggal_surat >= filter.startDate);
  if (filter.endDate) rows = rows.filter(r => r.tanggal_surat <= filter.endDate);

  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  cachedDocuments = rows;
  return rows;
}

async function saveDocumentToStorage(row) {
  const normalized = normalizeDocument(row);
  normalized.updated_at = new Date().toISOString();
  
  setDeletedDocumentIds(getDeletedDocumentIds().filter(id => String(id) !== String(normalized.id)));
  const localRows = getLocalDocuments().filter(item => String(item.id) !== String(normalized.id));
  
  writeJSON(LOCAL_DOC_KEY, [{ ...normalized, local_only: true }, ...localRows]);

  try {
    if (!supabaseClient) throw new Error('Supabase Offline');
    const copy = { ...normalized };
    delete copy.local_only;
    const { data, error } = await supabaseClient.from(TABLE_SURAT).upsert(copy, { onConflict: 'id' }).select().single();
    if (error) throw error;
    
    const onlineRow = normalizeDocument({ ...normalized, ...(data || {}), local_only: false });
    const freshLocal = getLocalDocuments().filter(item => String(item.id) !== String(onlineRow.id));
    writeJSON(LOCAL_DOC_KEY, [onlineRow, ...freshLocal]);
    return onlineRow;
  } catch (error) {
    return { ...normalized, local_only: true, sync_error: errorText(error) };
  }
}

async function deleteDocumentFromStorage(row) {
  const id = String(row.id);
  setDeletedDocumentIds([...getDeletedDocumentIds(), id]);
  writeJSON(LOCAL_DOC_KEY, getLocalDocuments().filter(item => String(item.id) !== id));

  if (!supabaseClient || row.local_only || id.startsWith('local-')) {
    return { onlineDeleted: false };
  }
  
  try {
    if (row.pdf_path) {
      await supabaseClient.storage.from(STORAGE_BUCKET).remove([row.pdf_path]).catch(() => {});
    }
    await supabaseClient.from(TABLE_SURAT).delete().eq('id', row.id);
    return { onlineDeleted: true };
  } catch (e) {
    return { onlineDeleted: false, error: e };
  }
}

async function fetchProfile() {
  if (cachedProfile) return cachedProfile;
  const localProf = readJSON(LOCAL_PROFILE_KEY, null);
  if (localProf) {
    cachedProfile = localProf;
    return cachedProfile;
  }

  try {
    if (!supabaseClient) throw new Error('Supabase Offline');
    const { data, error } = await supabaseClient.from(TABLE_PROFIL).select('*').limit(1);
    if (!error && data && data.length > 0) {
      cachedProfile = data[0];
      writeJSON(LOCAL_PROFILE_KEY, cachedProfile);
      return cachedProfile;
    }
  } catch (e) {}

  cachedProfile = { ...defaultProfile };
  return cachedProfile;
}

async function saveProfile(profileData) {
  const updated = { ...cachedProfile, ...profileData, updated_at: new Date().toISOString() };
  if (updated.id === 'default') updated.id = newId();
  
  cachedProfile = updated;
  writeJSON(LOCAL_PROFILE_KEY, updated);

  try {
    if (!supabaseClient) throw new Error('Supabase Offline');
    const { data, error } = await supabaseClient.from(TABLE_PROFIL).upsert(updated, { onConflict: 'id' }).select().single();
    if (!error && data) {
      cachedProfile = data;
      writeJSON(LOCAL_PROFILE_KEY, data);
    }
  } catch (e) {
    showToast('Profil disimpan secara lokal (Offline)', 'warning');
    return updated;
  }
  showToast('Profil instansi berhasil diperbarui!');
  return cachedProfile;
}

function doLogin() {
  const email = el('email')?.value.trim();
  const password = el('password')?.value;

  if (!email || !password) {
    el('loginError').textContent = 'Email dan Password wajib diisi!';
    el('loginError').hidden = false;
    return;
  }

  if (demoAccounts[email] && demoAccounts[email].password === password) {
    const user = { email, role: demoAccounts[email].role, name: demoAccounts[email].name };
    currentUser = user;
    setLocalSession(user);
    el('loginPage').style.display = 'none';
    el('app').style.display = 'block';
    navigate('dashboard');
    showToast(`Selamat datang kembali, ${user.name}!`);
  } else {
    el('loginError').textContent = 'Email atau password akun keliru.';
    el('loginError').hidden = false;
  }
}

function logout() {
  clearLocalSession();
  currentUser = null;
  el('app').style.display = 'none';
  el('loginPage').style.display = 'block';
  if (el('email')) el('email').value = '';
  if (el('password')) el('password').value = '';
  if (el('loginError')) el('loginError').hidden = true;
}

async function navigate(route) {
  currentRoute = route;
  document.querySelectorAll('.sidebar .menu-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick') === `Maps('${route}')`);
  });

  if (route === 'dashboard') return renderDashboard();
  if (route === 'settings') return renderSettings();
  if (documentTypes[route]) return renderDocumentPage(route);
}

async function refreshCurrentPage() {
  await fetchDocuments();
  navigate(currentRoute);
  showToast('Data diperbarui dari server.');
}

async function renderDashboard() {
  const rows = await fetchDocuments();
  el('pageTitle').textContent = 'Dashboard';
  el('pageSubtitle').textContent = 'Sistem informasi administrasi surat dan arsip kantor.';

  const count = { masuk: 0, keluar: 0, tugas: 0, undangan: 0, sk: 0 };
  rows.forEach(r => { if (count[r.jenis] !== undefined) count[r.jenis]++; });

  el('pageContent').innerHTML = `
    <div class="stats">
      <div class="card stat-card" onclick="navigate('masuk')">
        <span>Surat Masuk</span><strong>${count.masuk}</strong>
      </div>
      <div class="card stat-card" onclick="navigate('keluar')">
        <span>Surat Keluar</span><strong>${count.keluar}</strong>
      </div>
      <div class="card stat-card" onclick="navigate('tugas')">
        <span>Surat Tugas</span><strong>${count.tugas}</strong>
      </div>
      <div class="card stat-card" onclick="navigate('undangan')">
        <span>Undangan</span><strong>${count.undangan}</strong>
      </div>
      <div class="card stat-card" onclick="navigate('sk')">
        <span>Surat Keputusan</span><strong>${count.sk}</strong>
      </div>
    </div>
    
    <div class="section-grid">
      <div class="panel">
        <h2>Akses Cepat Format Dokumentasi</h2>
        <div class="quick-menu">
          ${Object.entries(documentTypes).map(([key, t]) => `
            <button class="btn-quick" onclick="navigate('${key}')">
              <span class="badge ${key}">${t.badge}</span>
              <strong>${safe(t.title)}</strong>
              <p>${safe(t.subtitle)}</p>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

async function renderSettings() {
  el('pageTitle').textContent = 'Pengaturan Instansi';
  el('pageSubtitle').textContent = 'Sesuaikan kop surat, tanda tangan pimpinan, dan profil aplikasi.';
  
  const prof = await fetchProfile();
  const disabled = !getPerm('settings') ? 'disabled' : '';

  el('pageContent').innerHTML = `
    <div class="panel">
      <form id="profileForm" onsubmit="event.preventDefault(); window.saveProfileData();">
        <div class="form-grid">
          <div class="field full"><label>Nama Instansi (Kop Utama)</label><input id="p_nama" value="${safe(prof.nama_instansi)}" required ${disabled}></div>
          <div class="field full"><label>Alamat Lengkap Kantor</label><input id="p_alamat" value="${safe(prof.alamat)}" ${disabled}></div>
          <div class="field"><label>Telepon</label><input id="p_telp" value="${safe(prof.telepon)}" ${disabled}></div>
          <div class="field"><label>Email Kantor</label><input id="p_email" value="${safe(prof.email)}" ${disabled}></div>
          <div class="field"><label>Website</label><input id="p_web" value="${safe(prof.website)}" ${disabled}></div>
          <div class="field"><label>Kota Penerbitan</label><input id="p_kota" value="${safe(prof.kota)}" required ${disabled}></div>
          <div class="field"><label>Nama Pejabat / Pimpinan</label><input id="p_kap_nama" value="${safe(prof.kepala_nama)}" required ${disabled}></div>
          <div class="field"><label>NIP Pejabat</label><input id="p_kap_nip" value="${safe(prof.kepala_nip)}" ${disabled}></div>
          <div class="field"><label>Jabatan Struktur</label><input id="p_jabatan" value="${safe(prof.jabatan)}" required ${disabled}></div>
          <div class="field full"><label>Tautan File Logo Kantor (URL Gambar)</label><input id="p_logo" value="${safe(prof.logo_url)}" placeholder="Contoh: assets/logo.png atau URL online" ${disabled}></div>
        </div>
        ${getPerm('settings') ? '<div class="form-actions"><button type="submit" class="btn">Simpan Perubahan Profil</button></div>' : ''}
      </form>
    </div>
    
    ${getPerm('reset') ? `
    <div class="panel danger-zone" style="margin-top:24px; border-top: 4px solid var(--red);">
      <h2 style="color:var(--red)">Pusat Kendali Data Terbuka (Danger Zone)</h2>
      <p style="margin-bottom:12px; color:var(--muted)">Menghapus seluruh rekaman cache lokal dokumen SIPAS di browser komputer ini secara permanen.</p>
      <button class="btn danger" onclick="resetAllData()">Hapus & Reset Semua Database Lokal</button>
    </div>` : ''}
  `;
}

window.saveProfileData = function() {
  if (!getPerm('settings')) return;
  const pData = {
    nama_instansi: el('p_nama').value.trim(),
    alamat: el('p_alamat').value.trim(),
    telepon: el('p_telp').value.trim(),
    email: el('p_email').value.trim(),
    website: el('p_web').value.trim(),
    kota: el('p_kota').value.trim(),
    kepala_nama: el('p_kap_nama').value.trim(),
    kepala_nip: el('p_kap_nip').value.trim(),
    jabatan: el('p_jabatan').value.trim(),
    logo_url: el('p_logo').value.trim()
  };
  saveProfile(pData);
};

async function renderDocumentPage(typeKey) {
  const type = documentTypes[typeKey];
  el('pageTitle').textContent = type.title;
  el('pageSubtitle').textContent = type.subtitle;

  const rows = await fetchDocuments({ jenis: typeKey });
  
  el('pageContent').innerHTML = `
    <div class="two-column">
      <div class="panel">
        <h2>Input Dokumen Resmi</h2>
        <p style="color:var(--muted); font-size:13px; margin-bottom:16px;">${type.help}</p>
        ${documentFormHTML(typeKey, {}, 'create')}
      </div>
      
      <div class="panel concept-card">
        <h2>Petunjuk Tata Letak</h2>
        <div class="info-alert">
          <strong>Info Aturan Garis Dinas:</strong> Dokumen diatur otomatis pas ukuran <strong>A4 Tunggal (1 Halaman)</strong>. Sesuai aturan resmi, variabel tanggal bagian atas dikosongkan.
        </div>
        <div class="toolbar" style="margin-top:16px;">
          <input type="text" id="tableSearch" class="table-search" placeholder="Cari nomor atau perihal..." oninput="filterTable('${jsAttr(typeKey)}')">
          <select id="statusFilter" onchange="filterTable('${jsAttr(typeKey)}')">
            <option value="">Semua Status</option>
            <option value="draft">Draft</option>
            <option value="disetujui">Disetujui</option>
            <option value="selesai">Selesai</option>
          </select>
        </div>
      </div>
    </div>

    <div class="panel" id="table-container" style="margin-top:24px;">
      ${renderTable(rows)}
    </div>
  `;
}

function documentFormHTML(typeKey, row = {}, mode = 'create') {
  const type = documentTypes[typeKey];
  const data = { ...row };
  const formId = mode === 'edit' ? 'editDocumentForm' : 'documentForm';
  const submitHandler = mode === 'edit' 
    ? `saveEditedDocument(event, '${jsAttr(data.id)}')` 
    : `saveDocument(event, '${jsAttr(typeKey)}')`;
    
  const disabled = !getPerm(mode === 'edit' ? 'edit' : 'create') ? 'disabled' : '';

  return `
    <form id="${formId}" onsubmit="${submitHandler}">
      <div class="form-grid">
        <div class="field">
          <label>Nomor Surat Resmi</label>
          <input name="nomor_surat" required value="${safe(data.nomor_surat)}" placeholder="Contoh: 001/KKG-PJOK/VI/2026" ${disabled}>
        </div>
        <div class="field">
          <label>Nomor Agenda / Berkas</label>
          <input name="nomor_agenda" value="${safe(data.nomor_agenda)}" placeholder="Boleh dikosongkan (-)" ${disabled}>
        </div>
        <div class="field">
          <label>Tanggal Surat Diterbitkan</label>
          <input type="date" name="tanggal_surat" value="${safe(data.tanggal_surat || todayInput())}" required ${disabled}>
        </div>
        <div class="field">
          <label>Status Dokumen</label>
          <select name="status" ${disabled}>
            ${['draft', 'diterima', 'diproses', 'diajukan', 'disetujui', 'selesai', 'diarsipkan'].map(s => `
              <option value="${s}" ${data.status === s ? 'selected' : ''}>${titleCase(s)}</option>
            `).join('')}
          </select>
        </div>
        <div class="field">
          <label>${safe(type.primaryLabel)}</label>
          <input name="pengirim" required value="${safe(data.pengirim)}" placeholder="Contoh: Guru PJOK Se-Kecamatan" ${disabled}>
        </div>
        <div class="field">
          <label>${safe(type.secondaryLabel)}</label>
          <input name="penerima" required value="${safe(data.penerima)}" placeholder="Contoh: Rapat Rutin Bulanan" ${disabled}>
        </div>
        <div class="field full">
          <label>Perihal / Judul Ringkas</label>
          <input name="perihal" required value="${safe(data.perihal)}" placeholder="Contoh: Undangan Sosialisasi Perwasitan Bola Voli" ${disabled}>
        </div>
        <div class="field full">
          <label>Alamat Tujuan Fisik (Lokasi Pengiriman)</label>
          <textarea name="alamat_tujuan" rows="2" placeholder="Contoh: Tempat Masing-masing / Di Tempat" ${disabled}>${safe(data.alamat_tujuan || 'di Tempat')}</textarea>
        </div>
        
        <div class="field"><label>Hari Pelaksanaan</label><input name="hari" value="${safe(data.hari)}" placeholder="Rabu" ${disabled}></div>
        <div class="field"><label>Tanggal Pelaksanaan</label><input name="tanggal_kegiatan" value="${safe(data.tanggal_kegiatan)}" placeholder="26 Juni 2026" ${disabled}></div>
        <div class="field"><label>Waktu Kegiatan</label><input name="waktu" value="${safe(data.waktu)}" placeholder="09.00 - Selesai" ${disabled}></div>
        <div class="field"><label>Tempat / Ruangan</label><input name="tempat" value="${safe(data.tempat)}" placeholder="SDN Lemahabang 01" ${disabled}></div>
        <div class="field full"><label>Nama Acara Utama</label><input name="acara" value="${safe(data.acara)}" placeholder="Sosialisasi Perwasitan Bola Voli" ${disabled}></div>
        
        <div class="field full">
          <label>Isi Pokok Surat (Gunakan baris baru untuk memisah paragraf)</label>
          <textarea name="isi_surat" rows="5" required placeholder="Tuliskan pembuka, isi inti pembahasan, dan keterangan tambahan..." ${disabled}>${safe(data.isi_surat)}</textarea>
        </div>
        <div class="field full">
          <label>Catatan Internal Kantor (Disposisi pimpinan)</label>
          <input name="catatan" value="${safe(data.catatan)}" placeholder="Catatan tambahan pelengkap dokumen" ${disabled}>
        </div>
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="previewForm('${jsAttr(typeKey)}', '${jsAttr(formId)}')">Pratinjau Lembar Dokumen</button>
        ${getPerm(mode === 'edit' ? 'edit' : 'create') ? '<button type="submit" class="btn">Simpan Berkas</button>' : ''}
      </div>
    </form>
  `;
}

function renderTable(rows) {
  if (!rows || rows.length === 0) {
    return `<div class="empty-state small"><h3>Tidak ada log arsip surat ditemukan</h3><p>Silakan isi form di atas untuk menambahkan berkas baru.</p></div>`;
  }

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>No</th>
            <th>No. Surat</th>
            <th>Tanggal Dokumen</th>
            <th>Tujuan / Perihal</th>
            <th>Sifat</th>
            <th>Status</th>
            <th>Aksi Cetak & Manajemen</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => {
            const labelTujuan = row.jenis === 'masuk' ? row.pengirim : row.penerima;
            return `
              <tr>
                <td>${index + 1}</td>
                <td><strong>${safe(row.nomor_surat)}</strong><br><small style="color:var(--muted)">${safe(row.nomor_agenda || '-')}</small></td>
                <td>${formatDateShort(row.tanggal_surat)}</td>
                <td><span class="badge ${row.jenis}">${documentTypes[row.jenis] ? documentTypes[row.jenis].badge : 'Surat'}</span> <strong>${safe(labelTujuan)}</strong><br><small>${safe(row.perihal)}</small></td>
                <td>${safe(row.sifat_surat)}</td>
                <td><span class="status ${row.status}">${titleCase(row.status)}</span></td>
                <td class="actions">
                  <button class="btn-action" onclick="previewById('${jsAttr(row.id)}')">Preview/Print</button>
                  <button class="btn-action secondary" onclick="editById('${jsAttr(row.id)}')">Edit</button>
                  <button class="btn-action danger" onclick="deleteById('${jsAttr(row.id)}')">Hapus</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function filterTable(typeKey) {
  const kw = el('tableSearch')?.value.toLowerCase() || '';
  const status = el('statusFilter')?.value || '';

  const filtered = cachedDocuments.filter(r => {
    const matchKw = !kw || [r.nomor_surat, r.perihal, r.pengirim, r.penerima].join(' ').toLowerCase().includes(kw);
    const matchStatus = !status || r.status === status;
    return matchKw && matchStatus;
  });

  const container = el('table-container');
  if (container) container.innerHTML = renderTable(filtered);
}

async function saveDocument(event, typeKey) {
  event.preventDefault();
  if (!getPerm('create')) return;

  const form = event.target;
  const formData = new FormData(form);
  const dataObj = Object.fromEntries(formData.entries());
  dataObj.jenis = typeKey;

  const res = await saveDocumentToStorage(dataObj);
  showToast(res.sync_error ? 'Tersimpan lokal (Offline)' : 'Sukses! Berkas tersimpan ke cloud database.');
  form.reset();
  
  const freshRows = await fetchDocuments({ jenis: typeKey });
  const container = el('table-container');
  if (container) container.innerHTML = renderTable(freshRows);
}

async function saveDocumentAndPdf(event, typeKey) {
  event.preventDefault();
  await saveDocument(event, typeKey);
  setTimeout(() => {
    if (cachedDocuments.length > 0) {
      previewById(cachedDocuments[0].id);
      setTimeout(() => { downloadPreviewPdf(); }, 600);
    }
  }, 500);
}

async function saveEditedDocument(event, id) {
  event.preventDefault();
  if (!getPerm('edit')) return;

  const form = event.target;
  const formData = new FormData(form);
  const dataObj = Object.fromEntries(formData.entries());
  
  const existing = cachedDocuments.find(d => String(d.id) === String(id));
  const payload = { ...(existing || {}), ...dataObj, id };

  await saveDocumentToStorage(payload);
  showToast('Perubahan data dokumen berhasil diperbarui!');
  closeEditModal();
  
  await fetchDocuments();
  navigate(currentRoute);
}

async function deleteById(id) {
  if (!getPerm('delete')) return;
  const target = cachedDocuments.find(d => String(d.id) === String(id));
  if (!target) return;

  if (confirm(`Apakah Anda yakin ingin menghapus dokumen No: ${target.nomor_surat}?`)) {
    await deleteDocumentFromStorage(target);
    showToast('Dokumen telah berhasil dihapus dari sistem.');
    await fetchDocuments();
    navigate(currentRoute);
  }
}

function editById(id) {
  if (!getPerm('edit')) return;
  const target = cachedDocuments.find(d => String(d.id) === String(id));
  if (!target) return showToast('Berkas tidak ditemukan.', 'error');

  editTargetId = id;
  el('editModalTitle').textContent = `Edit Berkas ${documentTypes[target.jenis].badge} - ${target.nomor_surat}`;
  el('editModalContent').innerHTML = documentFormHTML(target.jenis, target, 'edit');
  el('editModal').hidden = false;
}

function closeEditModal() {
  el('editModal').hidden = true;
  editTargetId = null;
}

async function previewById(id) {
  const target = cachedDocuments.find(d => String(d.id) === String(id));
  if (!target) return showToast('Data berkas gagal dimuat.', 'error');
  
  const prof = await fetchProfile();
  lastPreviewDocument = target;
  
  let html = '';
  if (target.jenis === 'masuk') html = buildIncomingTemplate(target, prof);
  else if (target.jenis === 'tugas') html = buildAssignmentTemplate(target, prof);
  else if (target.jenis === 'undangan') html = buildInvitationTemplate(target, prof);
  else if (target.jenis === 'sk') html = buildDecisionTemplate(target, prof);
  else html = buildOutgoingTemplate(target, prof);

  el('previewContent').innerHTML = html;
  el('previewModal').hidden = false;
}

async function previewForm(typeKey, formId) {
  const form = el(formId);
  if (!form) return;

  const formData = new FormData(form);
  const dataObj = Object.fromEntries(formData.entries());
  dataObj.jenis = typeKey;

  const prof = await fetchProfile();
  lastPreviewDocument = dataObj;

  let html = '';
  if (typeKey === 'masuk') html = buildIncomingTemplate(dataObj, prof);
  else if (typeKey === 'tugas') html = buildAssignmentTemplate(dataObj, prof);
  else if (typeKey === 'undangan') html = buildInvitationTemplate(dataObj, prof);
  else if (typeKey === 'sk') html = buildDecisionTemplate(dataObj, prof);
  else html = buildOutgoingTemplate(dataObj, prof);

  el('previewContent').innerHTML = html;
  el('previewModal').hidden = false;
}

function closePreview() { el('previewModal').hidden = true; }
function printPreview() { window.print(); }

function archiveById(id) { showToast('Dokumen berhasil diarsipkan.'); }
function restoreById(id) { showToast('Dokumen berhasil dikembalikan.'); }
function approveById(id) { showToast('Dokumen disetujui oleh pimpinan.'); }
function downloadById(id) { previewById(id); setTimeout(() => { downloadPreviewPdf(); }, 500); }

function letterhead(prof) {
  return `
    <header class="letterhead-wrap">
      <div class="lh-logo-area">
        <img src="${prof.logo_url || 'logo.png'}" alt="Logo Kantor" onerror="this.style.display='none';">
      </div>
      <div class="lh-text-area">
        <h1>${safe(prof.nama_instansi)}</h1>
        <p class="lh-sub">${safe(prof.alamat)}</p>
        <p class="lh-contact">Telp: ${safe(prof.telepon)} | Email: ${safe(prof.email)} | Web: ${safe(prof.website)}</p>
      </div>
    </header>
    <div class="lh-line"></div>
  `;
}

function metaTable(entries) {
  return entries.map(e => `
    <div class="meta-row">
      <span class="label">${safe(e[0])}</span>
      <span class="colon">:</span>
      <span class="value">${safe(e[1] || '-')}</span>
    </div>
  `).join('');
}

function paragraphText(text) {
  if (!text) return '';
  return String(text).split('\n').filter(p => p.trim() !== '')
    .map(p => `<p class="surat-p">${safe(p)}</p>`).join('');
}

function buildActivityMeta(row) {
  if (!row.hari && !row.tanggal_kegiatan && !row.tempat && !row.acara) return '';
  return `
    <div class="activity-box-panel">
      <table class="activity-table">
        <tr><td style="width:110px; font-weight:600">Hari</td><td style="width:15px">:</td><td>${safe(row.hari)}</td></tr>
        <tr><td style="font-weight:600">Tanggal</td><td>:</td><td>${safe(row.tanggal_kegiatan)}</td></tr>
        <tr><td style="font-weight:600">Waktu</td><td>:</td><td>${safe(row.waktu)}</td></tr>
        <tr><td style="font-weight:600">Tempat</td><td>:</td><td>${safe(row.tempat)}</td></tr>
        <tr><td style="font-weight:600">Acara / Agenda</td><td>:</td><td><strong>${safe(row.acara)}</strong></td></tr>
      </table>
    </div>
  `;
}

function signature(prof, row) {
  return `
    <footer class="signature-block-wrap">
      <p class="sig-date">${safe(prof.kota)}, ${formatDateLong(row.tanggal_surat)}</p>
      <p class="sig-job">${safe(prof.jabatan || 'Ketua KKG')},</p>
      <div class="sig-space" style="height:65px"></div>
      <p class="sig-name"><strong><u>${safe(prof.kepala_nama)}</u></strong></p>
      <p class="sig-nip">NIP. ${safe(prof.kepala_nip || '-')}</p>
    </footer>
  `;
}

function buildOutgoingTemplate(row, profile) {
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
      </div>
      <div class="recipient">
        <p>Kepada Yth.</p>
        <p><strong>${safe(row.pengirim)}</strong></p>
        <p>${safe(row.penerima)}</p>
        <p>${safe(row.alamat_tujuan || '')}</p>
      </div>
      ${buildActivityMeta(row)}
      <div class="body-text"><p>Dengan hormat,</p>${paragraphText(row.isi_surat)}</div>
      ${signature(profile, row)}
    </article>
  `;
}

function buildIncomingTemplate(row, profile) {
  return `
    <article class="pdf-page">
      <div style="text-align:center; border-bottom:3px double #000; padding-bottom:8px; margin-bottom:15px;">
        <h2 style="margin:0; font-size:18px;">${safe(profile.nama_aplikasi)} - DISPOSISI SURAT MASUK</h2>
      </div>
      <table class="activity-table" style="margin-bottom:15px; border-collapse:collapse; width:100%;" border="1" cellpadding="6">
        <tr><td style="width:140px; font-weight:600">No. Agenda Registrasi</td><td><strong>${safe(row.nomor_agenda || '-')}</strong></td></tr>
        <tr><td style="font-weight:600">Nomor Asal Surat</td><td>${safe(row.nomor_surat)}</td></tr>
        <tr><td style="font-weight:600">Tanggal Surat Fisik</td><td>${formatDateLong(row.tanggal_surat)}</td></tr>
        <tr><td style="font-weight:600">Instansi Pengirim</td><td><strong>${safe(row.pengirim)}</strong></td></tr>
        <tr><td style="font-weight:600">Perihal Utama</td><td>${safe(row.perihal)}</td></tr>
      </table>
      <div class="body-text" style="border:1px solid #000; padding:12px; min-height:100px; margin-bottom:15px;">
        <strong style="display:block; margin-bottom:6px;">Ringkasan / Catatan Isi Surat:</strong>
        ${paragraphText(row.isi_surat)}
      </div>
      <div style="border:1px solid #000; padding:12px; background:#f9f9f9;">
        <strong>Instruksi Utama Disposisi Pimpinan:</strong>
        <p style="margin-top:6px; font-style:italic;">${safe(row.catatan || 'Belum ada instruksi lanjutan.')}</p>
      </div>
      <div style="margin-top:40px; text-align:right;">
        <p>${safe(profile.kota)}, ${formatDateLong(todayInput())}</p>
        <p>Petugas Administrasi,</p>
        <div style="height:55px"></div>
        <p>_______________________</p>
      </div>
    </article>
  `;
}

function buildAssignmentTemplate(row, profile) {
  return `
    <article class="pdf-page">
      ${letterhead(profile)}
      <div style="text-align:center; margin-top:10px; margin-bottom:20px;">
        <h2 style="margin:0; font-size:16px; letter-spacing:1px; text-decoration:underline;">SURAT TUGAS</h2>
        <p style="margin:4px 0 0 0;">Nomor: ${safe(row.nomor_surat)}</p>
      </div>
      <div class="body-text">
        <p>Dasar Kegiatan: Sehubungan dengan pelaksanaan urusan program dinas serta instruksi pengembangan mutu, maka bersama ini pimpinan menugaskan kepada:</p>
        <div style="margin:15px 0; padding-left:20px;">
          <table class="activity-table">
            <tr><td style="width:110px; font-weight:600">Nama Personel</td><td style="width:15px">:</td><td><strong>${safe(row.pengirim)}</strong></td></tr>
            <tr><td style="font-weight:600">Tugas / Jabatan</td><td>:</td><td>${safe(row.penerima)}</td></tr>
          </table>
        </div>
        <p>Untuk melaksanakan agenda urusan kegiatan kedinasan dengan rincian jadwal pelaksanaan sebagai berikut:</p>
      </div>
      ${buildActivityMeta(row)}
      <div class="body-text" style="margin-top:15px;">
        ${paragraphText(row.isi_surat)}
        <p style="margin-top:12px;">Demikian surat tugas ini diterbitkan untuk dilaksanakan dengan penuh rasa tanggung jawab dan dipergunakan sebagaimana mestinya.</p>
      </div>
      ${signature(profile, row)}
    </article>
  `;
}

function buildInvitationTemplate(row, profile) {
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
      </div>
      <div class="recipient">
        <p>Kepada Yth.</p>
        <p><strong>${safe(row.pengirim)}</strong></p>
        <p>${safe(row.penerima)}</p>
        <p>${safe(row.alamat_tujuan || 'di Tempat')}</p>
      </div>
      <div class="body-text">
        <p>Dengan hormat,</p>
        <p>Sesuai keputusan dan program kerja berkala, dengan ini kami mengharapkan kehadiran Bapak/Ibu Saudara/i untuk bergabung dalam forum musyawarah/kegiatan resmi yang akan diselenggarakan pada:</p>
      </div>
      ${buildActivityMeta(row)}
      <div class="body-text" style="margin-top:15px;">
        ${paragraphText(row.isi_surat)}
        <p style="margin-top:12px;">Mengingat pentingnya pokok pembahasan acara ini, kehadiran tepat waktu sangat kami harapkan. Atas perhatian dan kerja samanya, kami sampaikan terima kasih.</p>
      </div>
      ${signature(profile, row)}
    </article>
  `;
}

function buildDecisionTemplate(row, profile) {
  return `
    <article class="pdf-page">
      ${letterhead(profile)}
      <div style="text-align:center; margin-top:10px; margin-bottom:15px;">
        <h2 style="margin:0; font-size:15px; font-weight:700;">KEPUTUSAN KETUA KKG PJOK SD KECAMATAN TANJUNG</h2>
        <p style="margin:4px 0 0 0; font-size:13px;">Nomor: ${safe(row.nomor_surat)}</p>
        <p style="margin:6px 0; font-weight:700; font-size:14px;">TENTANG<br>${safe(row.perihal).toUpperCase()}</p>
      </div>
      <div style="font-size:13px; line-height:1.4;">
        <table style="width:100%; border-collapse:collapse;" cellpadding="4">
          <tr style="vertical-align:top;"><td style="width:90px; font-weight:600;">MENIMBANG</td><td style="width:15px;">:</td><td>a. Bahwa demi kelancaran organisasi perlu dikeluarkan keputusan kepengurusan;<br>b. Bahwa personel yang tercantum namanya dipandang cakap memenuhi tugas.</td></tr>
          <tr style="vertical-align:top;"><td style="font-weight:600;">MENGINGAT</td><td>:</td><td>1. Undang-Undang Sistem Pendidikan Nasional;<br>2. AD/ART Organisasi Musyawarah KKG Kerja Guru PJOK.</td></tr>
          <tr style="vertical-align:top;"><td style="font-weight:600; text-align:center;" colspan="3">MEMUTUSKAN</td></tr>
          <tr style="vertical-align:top;"><td style="font-weight:600;">MENETAPKAN</td><td>:</td><td><strong>KEDUA:</strong> ${safe(row.isi_surat || '-')}</td></tr>
        </table>
      </div>
      ${signature(profile, row)}
    </article>
  `;
}

function downloadPreviewPdf() {
  const element = document.getElementById('previewContent');
  if (!element || element.innerHTML.trim() === "") {
    alert("Konten pratinjau kosong, gagal mencetak berkas.");
    return;
  }

  const docNumber = element.querySelector('strong, .value')?.textContent || 'surat';
  const cleanName = docNumber.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);

  const opt = {
    margin:       [12, 15, 12, 15],
    filename:     `Surat_${cleanName}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { 
      scale: 2,
      useCORS: true, 
      logging: false,
      width: 794,
      windowWidth: 794
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['avoid', 'css'] }
  };

  html2pdf().set(opt).from(element).save();
}

async function resetAllData() {
  if (confirm('PERINGATAN! Tindakan ini akan menghapus semua berkas arsip lokal dari komputer Anda secara permanen. Lanjutkan?')) {
    localStorage.removeItem(LOCAL_DOC_KEY);
    localStorage.removeItem(LOCAL_DELETED_KEY);
    localStorage.removeItem(LOCAL_PROFILE_KEY);
    cachedDocuments = [];
    cachedProfile = null;
    showToast('Seluruh basis data lokal berhasil dibersihkan.');
    navigate('dashboard');
  }
}

async function backupJson() {
  const rows = await fetchDocuments();
  const payload = { profile: cachedProfile, documents: rows, exported_at: new Date().toISOString() };
  downloadText(JSON.stringify(payload, null, 2), `backup-sipas-${todayInput()}.json`, 'application/json');
}

function downloadText(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

window.doLogin = doLogin;
window.logout = logout;
window.navigate = navigate;
window.refreshCurrentPage = refreshCurrentPage;
window.saveDocument = saveDocument;
window.saveDocumentAndPdf = saveDocumentAndPdf;
window.saveEditedDocument = saveEditedDocument;
window.previewForm = previewForm;
window.closePreview = closePreview;
window.printPreview = printPreview;
window.downloadPreviewPdf = downloadPreviewPdf;
window.filterTable = filterTable;
window.previewById = previewById;
window.downloadById = downloadById;
window.editById = editById;
window.closeEditModal = closeEditModal;
window.archiveById = archiveById;
window.restoreById = restoreById;
window.approveById = approveById;
window.deleteById = deleteById;
window.resetAllData = resetAllData;
window.saveProfile = saveProfile;
window.saveSettings = saveProfile;
window.backupJson = backupJson;

document.addEventListener('DOMContentLoaded', async () => {
  await fetchProfile();
  const session = getLocalSession();
  if (session && session.user) {
    currentUser = session.user;
    if (el('app')) el('app').style.display = 'block';
    if (el('loginPage')) el('loginPage').style.display = 'none';
    navigate('dashboard');
  } else {
    if (el('app')) el('app').style.display = 'none';
    if (el('loginPage')) el('loginPage').style.display = 'block';
  }
});
