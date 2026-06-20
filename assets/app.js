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
    help: 'Gunakan menu ini untuk mencatat surat yang diterima oleh kantor.'
  },
  keluar: {
    title: 'Surat Keluar',
    subtitle: 'Buat konsep surat keluar resmi dan unduh PDF siap cetak.',
    badge: 'Keluar',
    defaultStatus: 'draft',
    primaryLabel: 'Nama Tujuan',
    secondaryLabel: 'Instansi Tujuan',
    requiresAddress: true,
    templateTitle: 'SURAT KELUAR',
    help: 'Gunakan menu ini untuk membuat naskah surat keluar resmi.'
  },
  tugas: {
    title: 'Surat Tugas',
    subtitle: 'Buat surat tugas resmi berdasarkan kegiatan dan petugas.',
    badge: 'Tugas',
    defaultStatus: 'draft',
    primaryLabel: 'Nama Petugas',
    secondaryLabel: 'Kegiatan / Tujuan Tugas',
    requiresAddress: false,
    templateTitle: 'SURAT TUGAS',
    help: 'Gunakan menu ini untuk menerbitkan surat tugas guru, pengurus, atau pegawai.'
  },
  undangan: {
    title: 'Undangan',
    subtitle: 'Buat surat undangan kegiatan dengan format hari, tanggal, waktu, tempat, dan acara yang rapi.',
    badge: 'Undangan',
    defaultStatus: 'draft',
    primaryLabel: 'Penerima Undangan',
    secondaryLabel: 'Nama Kegiatan',
    requiresAddress: true,
    templateTitle: 'SURAT UNDANGAN',
    help: 'Gunakan menu ini untuk membuat undangan rapat, sosialisasi, pelatihan, atau kegiatan kantor.'
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
    help: 'Gunakan menu ini untuk menyusun surat keputusan sederhana.'
  }
};

const defaultProfile = {
  id: 'default',
  nama_instansi: 'KKG PJOK SD Kecamatan Tanjung',
  nama_aplikasi: 'SIPAS Kantor',
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

// DIPERBAIKI: Mengamankan argumen string agar aman masuk ke dalam atribut onclick HTML
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
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDateLong(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateShort(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function slugify(value) {
  return String(value || 'dokumen')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'dokumen';
}

function newId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getRoleFromEmail(email) {
  const cleanEmail = String(email || '').toLowerCase();
  if (cleanEmail.includes('admin')) return 'admin';
  if (cleanEmail.includes('pimpinan') || cleanEmail.includes('kepala')) return 'pimpinan';
  if (cleanEmail.includes('staf') || cleanEmail.includes('staff')) return 'staf';
  return 'staf';
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'administrator') return 'admin';
  if (value === 'staff') return 'staf';
  if (value in permissions) return value;
  return '';
}

function buildSupabaseUser(user) {
  const metaRole = normalizeRole(user?.user_metadata?.role || user?.app_metadata?.role || user?.role);
  const role = metaRole || getRoleFromEmail(user?.email);
  return { id: user?.id, email: user?.email || '-', role, name: user?.user_metadata?.name || user?.email || '-' };
}

function getPerm(action) {
  const role = currentUser?.role || 'staf';
  return Boolean(permissions[role]?.[action]);
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

function errorText(error, fallback = 'Terjadi kesalahan.') {
  return error?.message || error?.error_description || error?.details || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function printableHTML(content) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dokumen SIPAS</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body class="print-body">${content}</body>
</html>`;
}

function getButtonForm(event, fallbackId = 'documentForm') {
  return event?.currentTarget?.closest?.('form') || event?.target?.closest?.('form') || el(fallbackId);
}

function validateForm(form) {
  if (!form) {
    showToast('Form tidak ditemukan.', 'error');
    return false;
  }
  if (typeof form.reportValidity === 'function' && !form.reportValidity()) {
    showToast('Lengkapi data wajib sebelum menyimpan.', 'error');
    return false;
  }
  return true;
}

// DIPERBAIKI: Cek eksistensi element sebelum manipulasi DOM agar mencegah crash
function setPageHeader(title, subtitle) {
  const pageTitle = el('pageTitle');
  const pageSubtitle = el('pageSubtitle');
  if (pageTitle) pageTitle.textContent = title;
  if (pageSubtitle) pageSubtitle.textContent = subtitle;
}

function setActiveMenu(route) {
  document.querySelectorAll('.menu-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.route === route);
  });
}

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (error) {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getLocalSession() {
  return readJSON(LOCAL_SESSION_KEY, null);
}

function setLocalSession(user) {
  const session = { user, created_at: new Date().toISOString() };
  writeJSON(LOCAL_SESSION_KEY, session);
  return session;
}

function clearLocalSession() {
  localStorage.removeItem(LOCAL_SESSION_KEY);
}

function getLocalDocuments() {
  return readJSON(LOCAL_DOC_KEY, []);
}

function setLocalDocuments(rows) {
  writeJSON(LOCAL_DOC_KEY, rows);
}

function getDeletedDocumentIds() {
  return readJSON(LOCAL_DELETED_KEY, []);
}

function setDeletedDocumentIds(ids) {
  const uniqueIds = [...new Set((ids || []).map((id) => String(id)).filter(Boolean))];
  writeJSON(LOCAL_DELETED_KEY, uniqueIds);
}

function markDocumentDeleted(id) {
  if (!id) return;
  setDeletedDocumentIds([...getDeletedDocumentIds(), String(id)]);
}

function unmarkDocumentDeleted(id) {
  if (!id) return;
  setDeletedDocumentIds(getDeletedDocumentIds().filter((item) => String(item) !== String(id)));
}

function isDocumentDeleted(id) {
  return getDeletedDocumentIds().some((item) => String(item) === String(id));
}

function documentTimestamp(row) {
  const date = new Date(row?.updated_at || row?.created_at || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function mergeDocumentRows(onlineRows = [], localRows = []) {
  const deletedIds = new Set(getDeletedDocumentIds().map(String));
  const merged = new Map();

  onlineRows.forEach((row) => {
    const id = String(row.id);
    if (!deletedIds.has(id)) merged.set(id, row);
  });

  localRows.forEach((row) => {
    const id = String(row.id);
    if (deletedIds.has(id)) return;
    const current = merged.get(id);
    if (!current || row.local_only || documentTimestamp(row) >= documentTimestamp(current)) {
      merged.set(id, row);
    }
  });

  return Array.from(merged.values());
}

function getLocalProfile() {
  return readJSON(LOCAL_PROFILE_KEY, null);
}

function setLocalProfile(profile) {
  writeJSON(LOCAL_PROFILE_KEY, profile);
}

function showApplication() {
  if (el('loginPage')) el('loginPage').style.display = 'none';
  if (el('app')) el('app').style.display = 'block';
}

function showLoginError(message) {
  const loginError = el('loginError');
  if (loginError) loginError.textContent = message;
}

function applyRoleUI() {
  const email = currentUser?.email || '-';
  const role = currentUser?.role || 'staf';
  const profileName = cachedProfile?.nama_instansi || defaultProfile.nama_instansi;
  if (el('currentUserEmail')) el('currentUserEmail').textContent = email;
  if (el('currentUserRole')) el('currentUserRole').textContent = `Role: ${titleCase(role)}`;
  if (el('sidebarProfileName')) el('sidebarProfileName').textContent = profileName;
  document.querySelectorAll('[data-route="pengaturan"]').forEach((item) => item.classList.remove('hidden'));
  document.querySelectorAll('.admin-only').forEach((item) => item.classList.toggle('hidden', !getPerm('settings')));
}

async function doLogin() {
  const email = el('email').value.trim().toLowerCase();
  const password = el('password').value;
  showLoginError('');

  if (!email || !password) {
    showLoginError('Email dan password wajib diisi.');
    return;
  }

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (!error && data?.user) {
        clearLocalSession();
        currentUser = buildSupabaseUser(data.user);
        showApplication();
        await bootstrapApp();
        return;
      }
      console.warn('Login Supabase gagal, cek akun demo lokal.', error);
    } catch (error) {
      console.warn('Supabase belum siap, cek akun demo lokal.', error);
    }
  }

  const demo = demoAccounts[email];
  if (!demo || demo.password !== password) {
    showLoginError('Login gagal. Gunakan akun Supabase aktif atau akun demo lokal yang tersedia.');
    return;
  }

  currentUser = { id: email, email, role: demo.role, name: demo.name, local_only: true };
  setLocalSession(currentUser);
  showApplication();
  await bootstrapApp();
  showToast('Login lokal berhasil. Data tersimpan di browser sampai Supabase disiapkan.', 'warning');
}

async function logout() {
  clearLocalSession();
  if (supabaseClient) {
    try { await supabaseClient.auth.signOut(); } catch (error) { console.warn('Logout Supabase gagal:', error); }
  }
  location.reload();
}

async function getCurrentSession() {
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data?.session?.user) {
        const user = data.session.user;
        return { user: buildSupabaseUser(user) };
      }
    } catch (error) {
      console.warn('Session Supabase belum tersedia:', error);
    }
  }
  return getLocalSession();
}

async function checkSession() {
  const session = await getCurrentSession();
  if (session?.user) {
    currentUser = session.user;
    showApplication();
    await bootstrapApp();
  }
}

async function bootstrapApp() {
  await loadProfile();
  applyRoleUI();
  await navigate('dashboard');
}

async function loadProfile() {
  const localProfile = getLocalProfile();
  cachedProfile = { ...defaultProfile, ...(localProfile || {}) };

  try {
    if (!supabaseClient) throw new Error('Supabase SDK tidak tersedia');
    const { data, error } = await supabaseClient
      .from(TABLE_PROFIL)
      .select('*')
      .eq('id', 'default')
      .maybeSingle();
    if (error) throw error;
    if (data) {
      cachedProfile = { ...defaultProfile, ...data };
      setLocalProfile(cachedProfile);
    }
  } catch (error) {
    console.warn('Profil memakai data lokal:', error);
  }
  return cachedProfile;
}

async function navigate(route) {
  if (route === 'pengaturan' && !currentUser) {
    showToast('Silakan login terlebih dahulu untuk membuka pengaturan.', 'error');
    return;
  }
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
  const pageContent = el('pageContent');
  if (pageContent) pageContent.innerHTML = `<div class="empty-state"><h2>${safe(title)}</h2><p>${safe(message)}</p></div>`;
}

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
    status: row.status || 'draft',
    catatan: row.catatan || '',
    dibuat_oleh: row.dibuat_oleh || currentUser?.email || '-',
    disetujui_oleh: row.disetujui_oleh || '',
    pdf_url: row.pdf_url || '',
    pdf_path: row.pdf_path || '',
    local_only: Boolean(row.local_only),
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString()
  };
}

function stripLocalOnly(row) {
  const copy = { ...row };
  delete copy.local_only;
  return copy;
}

async function fetchDocuments(filter = {}) {
  const localRows = getLocalDocuments().map(normalizeDocument).filter((row) => !isDocumentDeleted(row.id));
  let onlineRows = [];

  try {
    if (!supabaseClient) throw new Error('Supabase SDK tidak tersedia');
    let query = supabaseClient.from(TABLE_SURAT).select('*').order('created_at', { ascending: false });
    if (filter.jenis) query = query.eq('jenis', filter.jenis);
    if (filter.status) query = query.eq('status', filter.status);
    const { data, error } = await query;
    if (error) throw error;
    onlineRows = (data || []).map(normalizeDocument).filter((row) => !isDocumentDeleted(row.id));
  } catch (error) {
    console.warn('Data Supabase belum terbaca. Aplikasi memakai data lokal:', error);
  }

  let rows = mergeDocumentRows(onlineRows, localRows);

  if (filter.jenis) rows = rows.filter((row) => row.jenis === filter.jenis);
  if (filter.status) rows = rows.filter((row) => row.status === filter.status);
  if (filter.keyword) {
    const keyword = filter.keyword.toLowerCase();
    rows = rows.filter((row) => [row.nomor_surat, row.nomor_agenda, row.perihal, row.pengirim, row.penerima, row.status, row.acara, row.tempat]
      .join(' ')
      .toLowerCase()
      .includes(keyword));
  }
  if (filter.startDate) rows = rows.filter((row) => row.tanggal_surat >= filter.startDate);
  if (filter.endDate) rows = rows.filter((row) => row.tanggal_surat <= filter.endDate);

  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  cachedDocuments = rows;
  return rows;
}

async function saveDocumentToStorage(row) {
  const normalized = normalizeDocument(row);
  unmarkDocumentDeleted(normalized.id);
  const localRows = getLocalDocuments().filter((item) => String(item.id) !== String(normalized.id));

  const localMirror = { ...normalized, local_only: true };
  setLocalDocuments([localMirror, ...localRows]);

  try {
    if (!supabaseClient) throw new Error('Supabase SDK tidak tersedia');
    const { data, error } = await supabaseClient
      .from(TABLE_SURAT)
      .upsert(stripLocalOnly(normalized), { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;

    const onlineRow = normalizeDocument({ ...normalized, ...(data || {}), local_only: false });
    setLocalDocuments([onlineRow, ...localRows]);
    return onlineRow;
  } catch (error) {
    console.warn('Simpan ke Supabase gagal. Data tetap disimpan lokal:', error);
    return { ...localMirror, sync_error: errorText(error, 'Supabase belum menerima data.') };
  }
}

async function deleteDocumentFromStorage(row) {
  const id = String(row?.id || '');
  if (!id) throw new Error('ID dokumen tidak valid.');

  markDocumentDeleted(id);
  setLocalDocuments(getLocalDocuments().filter((item) => String(item.id) !== id));
  cachedDocuments = cachedDocuments.filter((item) => String(item.id) !== id);

  if (!supabaseClient || row.local_only || id.startsWith('local-')) {
    return { onlineDeleted: false, localDeleted: true };
  }

  let storageError = null;
  if (row.pdf_path) {
    try {
      const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).remove([row.pdf_path]);
      if (error) storageError = error;
    } catch (error) {
      storageError = error;
    }
  }

  const { error } = await supabaseClient.from(TABLE_SURAT).delete().eq('id', row.id);
  if (error) {
    return {
      onlineDeleted: false,
      localDeleted: true,
      error: errorText(error, 'Supabase menolak hapus data. Data sudah dihapus dari tampilan lokal.')
    };
  }

  return {
    onlineDeleted: true,
    localDeleted: true,
    storageWarning: storageError ? errorText(storageError, 'File PDF di Storage belum terhapus.') : ''
  };
}

async function deleteAllDocumentsFromStorage(rows = []) {
  const ids = rows.map((row) => String(row.id)).filter(Boolean);
  const pdfPaths = rows.map((row) => row.pdf_path).filter(Boolean);
  const oldDeletedIds = getDeletedDocumentIds();

  setLocalDocuments([]);
  setDeletedDocumentIds([...oldDeletedIds, ...ids]);
  cachedDocuments = [];

  if (!supabaseClient) {
    return { onlineDeleted: false, localDeleted: true, error: 'Supabase belum aktif. Data lokal sudah dikosongkan.' };
  }

  let storageWarning = '';
  try {
    if (pdfPaths.length) {
      const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).remove(pdfPaths);
      if (error) storageWarning = errorText(error, 'Sebagian file PDF di Storage belum terhapus.');
    }
  } catch (error) {
    storageWarning = errorText(error, 'Sebagian file PDF di Storage belum terhapus.');
  }

  const { error } = await supabaseClient.from(TABLE_SURAT).delete().not('id', 'is', null);
  if (error) {
    return {
      onlineDeleted: false,
      localDeleted: true,
      error: errorText(error, 'Supabase menolak reset data. Data sudah dikosongkan dari tampilan lokal.'),
      storageWarning
    };
  }

  return { onlineDeleted: true, localDeleted: true, storageWarning };
}

function getFormData(form, typeKey, existing = {}) {
  const data = new FormData(form);
  return normalizeDocument({
    ...existing,
    id: existing.id || newId(),
    jenis: typeKey,
    nomor_surat: data.get('nomor_surat')?.trim(),
    nomor_agenda: data.get('nomor_agenda')?.trim(),
    tanggal_surat: data.get('tanggal_surat') || todayInput(),
    pengirim: data.get('pengirim')?.trim(),
    penerima: data.get('penerima')?.trim(),
    alamat_tujuan: data.get('alamat_tujuan')?.trim(),
    perihal: data.get('perihal')?.trim(),
    sifat_surat: data.get('sifat_surat') || 'Biasa',
    lampiran: data.get('lampiran')?.trim() || '-',
    isi_surat: data.get('isi_surat')?.trim(),
    hari: data.get('hari')?.trim(),
    tanggal_kegiatan: data.get('tanggal_kegiatan')?.trim(),
    waktu: data.get('waktu')?.trim(),
    tempat: data.get('tempat')?.trim(),
    acara: data.get('acara')?.trim(),
    status: data.get('status') || documentTypes[typeKey].defaultStatus,
    catatan: data.get('catatan')?.trim(),
    dibuat_oleh: existing.dibuat_oleh || currentUser?.email || '-',
    updated_at: new Date().toISOString()
  });
}

// DIPERBAIKI: Mengganti penggunaan ${js(x)} dengan ${jsAttr(x)} dan tanda kutip tunggal ('') agar parameter fungsi onclick HTML valid
function documentFormHTML(typeKey, row = {}, mode = 'create') {
  const type = documentTypes[typeKey];
  const data = normalizeDocument({ jenis: typeKey, status: type.defaultStatus, ...row });
  const formId = mode === 'edit' ? 'editDocumentForm' : 'documentForm';
  const submitHandler = mode === 'edit'
    ? `saveEditedDocument(event, '${jsAttr(data.id)}')`
    : `saveDocument(event, '${jsAttr(typeKey)}')`;
  const disabled = !getPerm(mode === 'edit' ? 'edit' : 'create') ? 'disabled' : '';

  return `
    <form id="${formId}" onsubmit="${submitHandler}">
      <div class="form-grid">
        <div class="field">
          <label>Nomor Surat</label>
          <input name="nomor_surat" required value="${safe(data.nomor_surat)}" placeholder="Contoh: 001/KKG-PJOK/VI/2026" ${disabled}>
        </div>
        <div class="field">
          <label>Nomor Agenda</label>
          <input name="nomor_agenda" value="${safe(data.nomor_agenda)}" placeholder="Opsional" ${disabled}>
        </div>
        <div class="field">
          <label>Tanggal Surat</label>
          <input type="date" name="tanggal_surat" value="${safe(data.tanggal_surat || todayInput())}" required ${disabled}>
        </div>
        <div class="field">
          <label>Status</label>
          <select name="status" ${disabled}>
            ${statusOptions(data.status)}
          </select>
        </div>
        <div class="field">
          <label>${safe(type.primaryLabel)}</label>
          <input name="pengirim" required value="${safe(data.pengirim)}" placeholder="Isi nama pihak terkait" ${disabled}>
        </div>
        <div class="field">
          <label>${safe(type.secondaryLabel)}</label>
          <input name="penerima" required value="${safe(data.penerima)}" placeholder="Isi tujuan atau keterangan utama" ${disabled}>
        </div>
        <div class="field full">
          <label>Perihal</label>
          <input name="perihal" required value="${safe(data.perihal)}" placeholder="Tulis perihal surat" ${disabled}>
        </div>
        <div class="field full">
          <label>Alamat Tujuan</label>
          <textarea name="alamat_tujuan" rows="2" placeholder="Tulis alamat tujuan jika ada" ${disabled}>${safe(data.alamat_tujuan)}</textarea>
        </div>
        <div class="field">
          <label>Sifat Surat</label>
          <select name="sifat_surat" ${disabled}>
            ${['Biasa', 'Penting', 'Segera', 'Rahasia'].map((item) => `<option value="${item}" ${data.sifat_surat === item ? 'selected' : ''}>${item}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Lampiran</label>
          <input name="lampiran" value="${safe(data.lampiran)}" placeholder="Contoh: 1 berkas / -" ${disabled}>
        </div>
        <div class="field">
          <label>Hari Kegiatan</label>
          <input name="hari" value="${safe(data.hari)}" placeholder="Contoh: Rabu" ${disabled}>
        </div>
        <div class="field">
          <label>Tanggal Kegiatan</label>
          <input name="tanggal_kegiatan" value="${safe(data.tanggal_kegiatan)}" placeholder="Contoh: 19 Februari 2026" ${disabled}>
        </div>
        <div class="field">
          <label>Waktu</label>
          <input name="waktu" value="${safe(data.waktu)}" placeholder="Contoh: 09.00 - Selesai" ${disabled}>
        </div>
        <div class="field">
          <label>Tempat</label>
          <input name="tempat" value="${safe(data.tempat)}" placeholder="Contoh: SD Negeri Lemahabang 01" ${disabled}>
        </div>
        <div class="field full">
          <label>Acara</label>
          <input name="acara" value="${safe(data.acara)}" placeholder="Contoh: Sosialisasi Hasil Coaching Clinic" ${disabled}>
        </div>
        <div class="field full">
          <label>Isi Surat / Ringkasan</label>
          <textarea name="isi_surat" rows="8" required placeholder="Tulis isi surat. Data kegiatan di atas akan tampil rapi dengan titik dua sejajar." ${disabled}>${safe(data.isi_surat)}</textarea>
        </div>
        <div class="field full">
          <label>Catatan Internal</label>
          <textarea name="catatan" rows="3" placeholder="Catatan internal, disposisi, atau tindak lanjut" ${disabled}>${safe(data.catatan)}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="previewForm('${jsAttr(typeKey)}', '${jsAttr(formId)}')">Preview Template</button>
        ${mode === 'edit' ? `<button type="button" class="btn secondary" onclick="closeEditModal()">Batal</button>` : ''}
        <button type="submit" class="btn" ${disabled}>${mode === 'edit' ? 'Simpan Perubahan' : 'Simpan Data'}</button>
        ${mode === 'create' ? `<button type="button" class="btn gold" onclick="saveDocumentAndPdf(event, '${jsAttr(typeKey)}')" ${disabled}>Simpan & Download PDF</button>` : ''}
      </div>
    </form>`;
}

function statusOptions(selected) {
  const statuses = ['draft', 'diterima', 'diproses', 'diajukan', 'disetujui', 'selesai', 'diarsipkan'];
  return statuses.map((status) => `<option value="${status}" ${selected === status ? 'selected' : ''}>${titleCase(status)}</option>`).join('');
}

async function saveDocument(event, typeKey) {
  event.preventDefault();
  if (!getPerm('create')) return showToast('Role ini tidak dapat membuat dokumen.', 'error');
  const form = event.target;
  if (!validateForm(form)) return;
  const row = getFormData(form, typeKey);
  const saved = await saveDocumentToStorage(row);
  form.reset();
  const dateInput = form.querySelector('[name="tanggal_surat"]');
  if (dateInput) dateInput.value = todayInput();
  showToast(saved.local_only ? `Data tersimpan di browser. Supabase belum menerima data: ${saved.sync_error || 'periksa tabel/RLS.'}` : 'Data berhasil disimpan ke tabel dan mirror lokal.');
  await refreshCurrentPage();
}

async function saveDocumentAndPdf(event, typeKey) {
  event.preventDefault();
  if (!getPerm('create')) return showToast('Role ini tidak dapat membuat dokumen.', 'error');
  const form = getButtonForm(event, 'documentForm');
  if (!validateForm(form)) return;
  const row = getFormData(form, typeKey);
  const saved = await saveDocumentToStorage(row);
  await createPdfFromDocument(saved, { download: true, upload: !saved.local_only });
  form.reset();
  const dateInput = form.querySelector('[name="tanggal_surat"]');
  if (dateInput) dateInput.value = todayInput();
  showToast(saved.local_only ? `Data lokal tersimpan dan file dibuat. Supabase belum menerima data: ${saved.sync_error || 'periksa tabel/RLS.'}` : 'Data tersimpan dan PDF berhasil diproses.');
  await refreshCurrentPage();
}

async function saveEditedDocument(event, id) {
  event.preventDefault();
  if (!getPerm('edit')) return showToast('Role ini tidak dapat mengedit dokumen.', 'error');
  const existing = findDocumentById(id);
  if (!existing) return showToast('Data tidak ditemukan.', 'error');
  if (!validateForm(event.target)) return;
  const row = getFormData(event.target, existing.jenis, existing);
  const saved = await saveDocumentToStorage(row);
  closeEditModal();
  showToast(saved.local_only ? `Perubahan tersimpan lokal. Supabase belum menerima data: ${saved.sync_error || 'periksa tabel/RLS.'}` : 'Data berhasil diperbarui.');
  await refreshCurrentPage();
}

async function previewForm(typeKey, formId = 'documentForm') {
  const form = el(formId);
  if (!form) return showToast('Form tidak ditemukan.', 'error');
  const row = getFormData(form, typeKey);
  openPreview(row);
}

// DIPERBAIKI: Menggunakan jsAttr() untuk navigasi menu dashboard agar menu dapat diklik
async function renderDashboard() {
  setPageHeader('Dashboard', 'Ringkasan administrasi surat, persetujuan, dan arsip dokumen.');
  const rows = await fetchDocuments();
  const activeRows = rows.filter((row) => row.status !== 'diarsipkan');
  const archiveRows = rows.filter((row) => row.status === 'diarsipkan');
  const approvalRows = rows.filter((row) => row.status === 'diajukan');

  const countByType = Object.keys(documentTypes).reduce((result, key) => {
    result[key] = rows.filter((row) => row.jenis === key).length;
    return result;
  }, {});

  const pageContent = el('pageContent');
  if (!pageContent) return;

  pageContent.innerHTML = `
    <div class="stats">
      <div class="card stat-card"><span>Total Surat</span><strong>${rows.length}</strong><small>Semua jenis dokumen</small></div>
      <div class="card stat-card"><span>Surat Aktif</span><strong>${activeRows.length}</strong><small>Belum diarsipkan</small></div>
      <div class="card stat-card"><span>Menunggu Persetujuan</span><strong>${approvalRows.length}</strong><small>Status diajukan</small></div>
      <div class="card stat-card"><span>Total Arsip</span><strong>${archiveRows.length}</strong><small>Dokumen selesai</small></div>
    </div>

    <div class="section-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>Menu Surat</h2>
            <p>Semua menu sudah aktif, dapat dibuat, diedit, dicetak, dan diarsipkan.</p>
          </div>
        </div>
        <div class="quick-menu">
          ${Object.entries(documentTypes).map(([key, type]) => `
            <button onclick="navigate('${jsAttr(key)}')">
              <strong>${safe(type.title)}</strong>
              <span>${countByType[key] || 0} data</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><div><h2>Alur Kantor</h2><p>Alur kerja final yang disiapkan di sistem.</p></div></div>
        <ol class="workflow">
          <li>Staf membuat konsep surat dan mengisi data kegiatan.</li>
          <li>Dokumen dapat diedit kapan pun, termasuk setelah masuk arsip.</li>
          <li>Pimpinan dapat menyetujui dokumen berstatus diajukan.</li>
          <li>Sistem membuat PDF resmi dengan kop surat otomatis.</li>
          <li>Admin mengatur profil instansi, tanda tangan, dan identitas aplikasi.</li>
        </ol>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div><h2>Dokumen Terbaru</h2><p>Data terakhir yang tersimpan di sistem.</p></div>
        <div class="topbar-actions">
          <button class="btn secondary" onclick="exportCsv()">Export CSV</button>
          <button class="btn secondary" onclick="backupJson()">Backup JSON</button>
          <button class="btn danger" onclick="resetAllData()">Reset Semua Data</button>
        </div>
      </div>
      ${renderTable(rows.slice(0, 10), { showType: true })}
    </div>`;
}

async function renderDocumentPage(typeKey) {
  const type = documentTypes[typeKey];
  setPageHeader(type.title, type.subtitle);
  const rows = await fetchDocuments({ jenis: typeKey });
  const canCreate = getPerm('create');

  const pageContent = el('pageContent');
  if (!pageContent) return;

  pageContent.innerHTML = `
    ${!canCreate ? '<div class="alert">Role Anda hanya dapat melihat, menyetujui, mencetak, atau mengarsipkan sesuai hak akses. Pembuatan dan edit dokumen dibatasi.</div>' : ''}
    <div class="two-column">
      <div class="panel form-panel">
        <div class="panel-header"><div><h2>Form ${safe(type.title)}</h2><p>${safe(type.help)}</p></div></div>
        ${documentFormHTML(typeKey, {}, 'create')}
      </div>
      <div class="panel concept-card">
        <h2>Fitur Menu</h2>
        <p>Menu ${safe(type.title)} sudah dibuat untuk kebutuhan kantor. Semua data dapat dicari, diedit, dicetak PDF, disetujui, dan diarsipkan.</p>
        <div class="concept-list">
          <div><span>1</span><p>Data disimpan ke Supabase. Jika Supabase belum siap, sistem menyimpan ke localStorage.</p></div>
          <div><span>2</span><p>Format hari, tanggal, waktu, tempat, dan acara tampil sejajar pada PDF.</p></div>
          <div><span>3</span><p>Dokumen arsip tetap bisa diedit oleh role yang berwenang.</p></div>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><div><h2>Data ${safe(type.title)}</h2><p>Gunakan filter untuk mencari dokumen dengan cepat.</p></div></div>
      ${tableToolbar(typeKey)}
      <div id="table-${safe(typeKey)}">${renderTable(rows, { showType: false })}</div>
    </div>`;
}

function tableToolbar(typeKey = '') {
  return `
    <div class="toolbar">
      <div><label>Kata Kunci</label><input id="search-${safe(typeKey || 'all')}" placeholder="Cari nomor, perihal, pihak, status, acara, atau tempat"></div>
      <div><label>Dari Tanggal</label><input type="date" id="start-${safe(typeKey || 'all')}"></div>
      <div><label>Sampai Tanggal</label><input type="date" id="end-${safe(typeKey || 'all')}"></div>
      <button class="btn secondary" onclick="filterTable('${jsAttr(typeKey)}')">Terapkan</button>
    </div>`;
}

async function filterTable(typeKey = '') {
  const key = typeKey || 'all';
  const keyword = el(`search-${key}`)?.value || '';
  const startDate = el(`start-${key}`)?.value || '';
  const endDate = el(`end-${key}`)?.value || '';
  const rows = await fetchDocuments({ jenis: typeKey || undefined, keyword, startDate, endDate, status: currentRoute === 'arsip' ? 'diarsipkan' : undefined });
  const target = typeKey ? `table-${typeKey}` : 'table-arsip';
  const targetEl = el(target);
  if (targetEl) targetEl.innerHTML = renderTable(rows, { showType: !typeKey });
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
              <td><strong>${safe(row.nomor_surat)}</strong>${row.nomor_agenda ? `<br><small>Agenda: ${safe(row.nomor_agenda)}</small>` : ''}</td>
              <td>${formatDateShort(row.tanggal_surat)}</td>
              <td>${safe(row.perihal)}</td>
              <td>${safe(row.pengirim || row.penerima)}${row.penerima ? `<br><small>${safe(row.penerima)}</small>` : ''}</td>
              <td><span class="status ${safe(row.status)}">${safe(titleCase(row.status))}</span>${row.local_only ? '<br><small>Lokal</small>' : ''}</td>
              <td class="actions">${actionButtons(row)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// DIPERBAIKI: Mengubah ${js(row.id)} ke '${jsAttr(row.id)}' pada semua aksi tombol agar aksi data bekerja lancar
function actionButtons(row) {
  const buttons = [];
  buttons.push(`<button type="button" onclick="previewById('${jsAttr(row.id)}')">Preview</button>`);
  if (getPerm('pdf')) buttons.push(`<button type="button" onclick="downloadById('${jsAttr(row.id)}')">PDF</button>`);
  if (getPerm('edit')) buttons.push(`<button type="button" onclick="editById('${jsAttr(row.id)}')">Edit</button>`);
  if (getPerm('approve') && row.status === 'diajukan') buttons.push(`<button type="button" class="green" onclick="approveById('${jsAttr(row.id)}')">Setujui</button>`);
  if (getPerm('archive') && row.status !== 'diarsipkan') buttons.push(`<button type="button" onclick="archiveById('${jsAttr(row.id)}')">Arsip</button>`);
  if (getPerm('archive') && row.status === 'diarsipkan') buttons.push(`<button type="button" onclick="restoreById('${jsAttr(row.id)}')">Aktifkan</button>`);
  if (getPerm('delete')) buttons.push(`<button type="button" class="danger" onclick="deleteById('${jsAttr(row.id)}')">Delete</button>`);
  return buttons.join('');
}

function findDocumentById(id) {
  return cachedDocuments.find((row) => String(row.id) === String(id))
    || getLocalDocuments().map(normalizeDocument).find((row) => String(row.id) === String(id));
}

async function previewById(id) {
  const row = findDocumentById(id) || (await fetchDocuments()).find((item) => String(item.id) === String(id));
  if (!row) return showToast('Data tidak ditemukan.', 'error');
  openPreview(row);
}

async function downloadById(id) {
  const row = findDocumentById(id) || (await fetchDocuments()).find((item) => String(item.id) === String(id));
  if (!row) return showToast('Data tidak ditemukan.', 'error');
  await createPdfFromDocument(row, { download: true, upload: !row.local_only });
}

async function editById(id) {
  if (!getPerm('edit')) return showToast('Role ini tidak dapat mengedit dokumen.', 'error');
  const rows = await fetchDocuments();
  const row = rows.find((item) => String(item.id) === String(id));
  if (!row) return showToast('Data tidak ditemukan.', 'error');
  editTargetId = id;
  if (el('editModalTitle')) el('editModalTitle').textContent = `Edit ${documentTypes[row.jenis]?.title || 'Dokumen'}`;
  if (el('editModalContent')) el('editModalContent').innerHTML = documentFormHTML(row.jenis, row, 'edit');
  if (el('editModal')) el('editModal').hidden = false;
}

function closeEditModal() {
  editTargetId = null;
  if (el('editModal')) el('editModal').hidden = true;
  if (el('editModalContent')) el('editModalContent').innerHTML = '';
}

async function updateStatus(id, status, extra = {}) {
  const rows = await fetchDocuments();
  const row = rows.find((item) => String(item.id) === String(id));
  if (!row) return showToast('Data tidak ditemukan.', 'error');
  const updated = normalizeDocument({ ...row, status, ...extra, updated_at: new Date().toISOString() });
  await saveDocumentToStorage(updated);
  await refreshCurrentPage();
}

async function archiveById(id) {
  if (!getPerm('archive')) return showToast('Role ini tidak dapat mengarsipkan dokumen.', 'error');
  await updateStatus(id, 'diarsipkan');
  showToast('Dokumen berhasil dipindahkan ke arsip.');
}

async function restoreById(id) {
  if (!getPerm('archive')) return showToast('Role ini tidak dapat mengaktifkan arsip.', 'error');
  await updateStatus(id, 'selesai');
  showToast('Arsip berhasil diaktifkan kembali.');
}

async function approveById(id) {
  if (!getPerm('approve')) return showToast('Role ini tidak dapat menyetujui dokumen.', 'error');
  await updateStatus(id, 'disetujui', { disetujui_oleh: currentUser?.email || '-' });
  showToast('Dokumen berhasil disetujui.');
}

async function deleteById(id) {
  if (!getPerm('delete')) return showToast('Role ini tidak dapat menghapus dokumen.', 'error');
  const row = findDocumentById(id) || (await fetchDocuments()).find((item) => String(item.id) === String(id));
  if (!row) return showToast('Data tidak ditemukan.', 'error');
  if (!confirm(`Hapus dokumen "${row.nomor_surat || row.perihal || row.id}"? Tindakan ini tidak dapat dibatalkan.`)) return;

  const result = await deleteDocumentFromStorage(row);
  await refreshCurrentPage();

  if (result.onlineDeleted) {
    showToast(result.storageWarning ? `Data terhapus. ${result.storageWarning}` : 'Data berhasil dihapus permanen.');
    return;
  }

  showToast(result.error || 'Data berhasil dihapus dari tampilan lokal.', 'warning');
}

async function resetAllData() {
  if (!getPerm('reset')) return showToast('Role ini tidak dapat mereset data.', 'error');
  const rows = await fetchDocuments();
  const total = rows.length;

  if (!confirm(`Reset semua data surat? Total data yang akan dikosongkan: ${total}.`)) return;
  const confirmation = prompt('Ketik RESET untuk menghapus semua data surat dari aplikasi.');
  if (confirmation !== 'RESET') {
    showToast('Reset dibatalkan.', 'warning');
    return;
  }

  const result = await deleteAllDocumentsFromStorage(rows);
  await refreshCurrentPage();

  if (result.onlineDeleted) {
    showToast(result.storageWarning ? `Semua data berhasil direset. ${result.storageWarning}` : 'Semua data surat berhasil direset.');
    return;
  }

  showToast(result.error || 'Data lokal berhasil direset. Data online mungkin perlu dihapus lewat SQL Supabase.', 'warning');
}

async function renderArchivePage() {
  setPageHeader('Arsip', 'Dokumen yang sudah selesai dan dipindahkan ke arsip. Data arsip tetap bisa diedit oleh role yang berwenang.');
  const rows = await fetchDocuments({ status: 'diarsipkan' });
  const pageContent = el('pageContent');
  if (!pageContent) return;

  pageContent.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div><h2>Arsip Dokumen</h2><p>Seluruh dokumen berstatus diarsipkan.</p></div>
        <div class="topbar-actions"><button class="btn secondary" onclick="exportCsv('arsip')">Export Arsip</button></div>
      </div>
      ${tableToolbar('')}
      <div id="table-arsip">${renderTable(rows, { showType: true })}</div>
    </div>`;
}

async function renderSettingsPage() {
  setPageHeader('Pengaturan', 'Atur identitas instansi untuk kop surat, tanda tangan, dan template PDF.');
  const profile = await loadProfile();
  const pageContent = el('pageContent');
  if (!pageContent) return;

  pageContent.innerHTML = `
    <form class="panel form-panel" id="profileForm" onsubmit="saveProfile(event)">
      <div class="panel-header"><div><h2>Profil Instansi</h2><p>Data ini muncul otomatis pada kop surat dan tanda tangan.</p></div></div>
      <div class="form-grid">
        <div class="field"><label>Nama Instansi</label><input name="nama_instansi" value="${safe(profile.nama_instansi)}" required></div>
        <div class="field"><label>Nama Aplikasi</label><input name="nama_aplikasi" value="${safe(profile.nama_aplikasi)}" required></div>
        <div class="field full"><label>Alamat</label><textarea name="alamat" rows="2">${safe(profile.alamat)}</textarea></div>
        <div class="field"><label>Telepon</label><input name="telepon" value="${safe(profile.telepon)}"></div>
        <div class="field"><label>Email</label><input name="email" value="${safe(profile.email)}"></div>
        <div class="field"><label>Website</label><input name="website" value="${safe(profile.website)}"></div>
        <div class="field"><label>Kota Penandatanganan</label><input name="kota" value="${safe(profile.kota)}"></div>
        <div class="field"><label>Nama Penandatangan</label><input name="kepala_nama" value="${safe(profile.kepala_nama)}"></div>
        <div class="field"><label>NIP</label><input name="kepala_nip" value="${safe(profile.kepala_nip)}"></div>
        <div class="field"><label>Jabatan</label><input name="jabatan" value="${safe(profile.jabatan)}"></div>
        <div class="field full"><label>URL Logo</label><input name="logo_url" value="${safe(profile.logo_url)}" placeholder="logo.png atau URL publik Supabase Storage"></div>
      </div>
      <div class="form-actions"><button class="btn" type="submit">Simpan Pengaturan</button></div>
    </form>
    <div class="panel">
      <div class="panel-header"><div><h2>Catatan Produksi</h2><p>Untuk mode online, jalankan file supabase_schema.sql pada SQL Editor Supabase.</p></div></div>
      <div class="report-grid">
        <div class="alert">Frontend ini tetap aman dari crash saat Supabase belum siap karena sistem memakai localStorage sebagai fallback.</div>
        <div class="alert">Keamanan produksi yang sebenarnya tetap harus memakai Supabase Auth, Row Level Security, dan kebijakan akses database.</div>
      </div>
    </div>
    <div class="panel danger-zone">
      <div class="panel-header">
        <div><h2>Reset Data Surat</h2><p>Gunakan tombol ini untuk mengosongkan seluruh data surat dari tampilan aplikasi dan mencoba menghapus data online Supabase.</p></div>
        <button type="button" class="btn danger" onclick="resetAllData()">Reset Semua Data</button>
      </div>
      <div class="alert">Reset hanya menghapus data surat. Profil instansi dan pengaturan aplikasi tetap dipertahankan.</div>
    </div>`;
}

async function saveProfile(event) {
  event.preventDefault();
  if (!currentUser) return showToast('Sesi login tidak valid. Silakan login ulang.', 'error');
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
  applyRoleUI();

  try {
    if (!supabaseClient) throw new Error('Supabase SDK tidak tersedia');
    const { error } = await supabaseClient.from(TABLE_PROFIL).upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    showToast('Pengaturan berhasil disimpan ke Supabase.');
  } catch (error) {
    showToast('Pengaturan tersimpan lokal. Jalankan SQL Supabase agar tersimpan online.', 'warning');
    console.warn(error);
  }
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

function signature(profile, row = {}) {
  return `
    <div class="signature-block">
      <p>${safe(profile.kota)}, ${formatDateLong(row.tanggal_surat || todayInput())}</p>
      <p>${safe(profile.jabatan)}</p>
      <div class="signature-space"></div>
      <p><strong>${safe(profile.kepala_nama)}</strong></p>
      <p>NIP. ${safe(profile.kepala_nip)}</p>
      ${row.disetujui_oleh ? `<p class="stamp-space"></p><p><small>Disetujui oleh: ${safe(row.disetujui_oleh)}</small></p>` : ''}
    </div>`;
}

function metaTable(rows) {
  return `
    <table class="meta-table">
      ${rows.filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '').map(([label, value]) => `
        <tr><td>${safe(label)}</td><td>:</td><td>${safe(value || '-')}</td></tr>`).join('')}
    </table>`;
}

function paragraphText(value) {
  const lines = safe(value || '-').split('\n');
  return lines.map((line) => `<p>${line || '&nbsp;'}</p>`).join('');
}

function buildActivityMeta(row) {
  return metaTable([
    ['Hari', row.hari],
    ['Tanggal', row.tanggal_kegiatan],
    ['Waktu', row.waktu],
    ['Tempat', row.tempat],
    ['Acara', row.acara]
  ]);
}

function buildDocumentHTML(documentRow) {
  const profile = { ...defaultProfile, ...(cachedProfile || {}) };
  const row = normalizeDocument(documentRow);
  const type = documentTypes[row.jenis] || documentTypes.keluar;
  if (row.jenis === 'masuk') return buildIncomingTemplate(row, profile, type);
  if (row.jenis === 'tugas') return buildAssignmentTemplate(row, profile, type);
  if (row.jenis === 'undangan') return buildInvitationTemplate(row, profile, type);
  if (row.jenis === 'sk') return buildDecisionTemplate(row, profile, type);
  return buildOutgoingTemplate(row, profile, type);
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
    </article>`;
}

function buildIncomingTemplate(row, profile, type) {
  return `
    <article class="pdf-page">
      ${letterhead(profile)}
      <h2 class="template-title">${safe(type.templateTitle)}</h2>
      ${metaTable([
        ['Nomor Agenda', row.nomor_agenda],
        ['Nomor Surat', row.nomor_surat],
        ['Tanggal Surat', formatDateLong(row.tanggal_surat)],
        ['Pengirim', row.pengirim],
        ['Tujuan/Penerima', row.penerima],
        ['Perihal', row.perihal],
        ['Sifat Surat', row.sifat_surat],
        ['Lampiran', row.lampiran],
        ['Status', titleCase(row.status)]
      ])}
      ${buildActivityMeta(row)}
      <div class="body-box"><h3>Ringkasan Isi Surat</h3>${paragraphText(row.isi_surat)}</div>
      <div class="disposition-box"><h3>Catatan Tindak Lanjut</h3>${paragraphText(row.catatan || '........................................................................................................')}</div>
      ${signature(profile, row)}
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
        ${buildActivityMeta(row)}
        ${paragraphText(row.isi_surat)}
        <p>Surat tugas ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.</p>
      </div>
      ${signature(profile, row)}
    </article>`;
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
        <div class="date-right">${safe(profile.kota)}, ${formatDateLong(row.tanggal_surat)}</div>
      </div>
      <div class="recipient">
        <p>Kepada Yth.</p>
        <p><strong>${safe(row.pengirim)}</strong></p>
        <p>${safe(row.alamat_tujuan || '')}</p>
      </div>
      <div class="body-text">
        <p>Dengan hormat,</p>
        <p>Sehubungan dengan kegiatan <strong>${safe(row.penerima || row.acara)}</strong>, kami mengundang Bapak/Ibu untuk hadir pada:</p>
        ${buildActivityMeta(row)}
        ${paragraphText(row.isi_surat)}
        <p>Demikian undangan ini disampaikan. Atas perhatian dan kehadirannya, kami ucapkan terima kasih.</p>
      </div>
      ${signature(profile, row)}
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
        ${buildActivityMeta(row)}
        <p><strong>MEMUTUSKAN:</strong></p>
        ${paragraphText(row.isi_surat)}
      </div>
      ${signature(profile, row)}
    </article>`;
}

function openPreview(row) {
  lastPreviewDocument = normalizeDocument(row);
  if (el('previewContent')) el('previewContent').innerHTML = buildDocumentHTML(lastPreviewDocument);
  lastPreviewElement = el('previewContent') ? el('previewContent').querySelector('.pdf-page') : null;
  if (el('previewModal')) el('previewModal').hidden = false;
}

function closePreview() {
  if (el('previewModal')) el('previewModal').hidden = true;
  if (el('previewContent')) el('previewContent').innerHTML = '';
  lastPreviewElement = null;
  lastPreviewDocument = null;
}

function printPreview() {
  if (!lastPreviewElement) return showToast('Tidak ada dokumen untuk dicetak.', 'error');
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) return showToast('Popup cetak diblokir browser.', 'error');
  printWindow.document.write(`
    <!DOCTYPE html><html><head><title>Cetak Dokumen</title>
    <link rel="stylesheet" href="assets/style.css"></head><body class="print-body">${lastPreviewElement.outerHTML}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
}

window.downloadPreviewPdf = async function() {
  const element = document.getElementById('previewContent'); // Container pratinjau surat
  
  if (!element || element.innerHTML.trim() === "") {
    alert("Gagal mengunduh: Konten tidak ditemukan!");
    return;
  }

  // Ambil nomor surat untuk penamaan file otomatis (opsional)
  const docNumber = element.querySelector('.letter-number')?.textContent || 'surat';
  
  const opt = {
    margin:       [15, 15, 15, 15], // Margin atas, kiri, bawah, kanan (dalam mm)
    filename:     `${docNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { 
      scale: 2,             // Meningkatkan ketajaman teks (anti-blur)
      useCORS: true,        // Membantu memuat gambar/logo eksternal
      logging: false,
      width: 794,           // Mengunci lebar canvas ke standar rasio A4
      windowWidth: 794      // Memaksa browser me-render HTML seolah-olah di layar lebar 794px
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    await html2pdf().set(opt).from(element).save();
  } catch (error) {
    console.error("PDF Render Error:", error);
    alert("Terjadi kesalahan saat membuat file PDF.");
  }
};

async function createPdfFromDocument(documentRow, options = {}) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildDocumentHTML(documentRow);
  const page = wrapper.querySelector('.pdf-page');
  if (!page) {
    showToast('Template dokumen tidak ditemukan.', 'error');
    return;
  }
  document.body.appendChild(wrapper);
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-10000px';
  wrapper.style.top = '0';
  wrapper.style.width = '210mm';
  wrapper.style.background = '#fff';

  const fileName = `${slugify(documentRow.jenis)}-${slugify(documentRow.nomor_surat || Date.now())}.pdf`;
  const opt = {
    margin: 0,
    filename: fileName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    if (window.html2pdf) {
      const pdfBlob = await window.html2pdf().set(opt).from(page).outputPdf('blob');
      if (options.download) downloadBlob(pdfBlob, fileName);
      if (options.upload) await uploadPdf(documentRow, pdfBlob, fileName);
      if (options.download && !options.upload) showToast('PDF berhasil diunduh.');
      return;
    }

    const htmlName = fileName.replace(/\.pdf$/i, '.html');
    const htmlBlob = new Blob([printableHTML(page.outerHTML)], { type: 'text/html;charset=utf-8' });
    if (options.download) downloadBlob(htmlBlob, htmlName);
    showToast('Library PDF belum terbaca. File HTML sudah diunduh. Buka file itu lalu pilih Print > Save as PDF.', 'warning');
  } catch (error) {
    console.warn('Gagal membuat PDF:', error);
    const fallbackName = fileName.replace(/\.pdf$/i, '.html');
    const fallbackBlob = new Blob([printableHTML(page.outerHTML)], { type: 'text/html;charset=utf-8' });
    if (options.download) downloadBlob(fallbackBlob, fallbackName);
    showToast(`PDF gagal dibuat otomatis. File HTML cadangan sudah diunduh: ${errorText(error)}`, 'warning');
  } finally {
    wrapper.remove();
  }
}

async function uploadPdf(documentRow, pdfBlob, fileName) {
  try {
    if (!supabaseClient) throw new Error('Supabase belum aktif');
    const path = `${documentRow.jenis}/${Date.now()}-${fileName}`;
    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw uploadError;
    const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    const updated = normalizeDocument({ ...documentRow, pdf_path: path, pdf_url: data?.publicUrl || '', updated_at: new Date().toISOString() });
    await saveDocumentToStorage(updated);
    showToast('PDF berhasil dibuat dan diunggah ke Supabase Storage.');
  } catch (error) {
    console.warn('Upload PDF gagal:', error);
    showToast('PDF berhasil dibuat, tetapi belum terunggah ke Storage.', 'warning');
  }
}

async function exportCsv(scope = '') {
  if (!getPerm('export')) return showToast('Role ini tidak dapat export data.', 'error');
  const rows = await fetchDocuments(scope === 'arsip' ? { status: 'diarsipkan' } : {});
  const headers = ['jenis','nomor_surat','nomor_agenda','tanggal_surat','perihal','pengirim','penerima','hari','tanggal_kegiatan','waktu','tempat','acara','status','dibuat_oleh','disetujui_oleh'];
  const csv = [headers.join(',')].concat(rows.map((row) => headers.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
  downloadText(csv, `sipas-${scope || 'data'}-${todayInput()}.csv`, 'text/csv;charset=utf-8;');
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
window.exportCsv = exportCsv;
window.backupJson = backupJson;
}
