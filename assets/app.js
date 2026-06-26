const SUPABASE_URL = 'https://bixyaowckwvjpgwffoci.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_phZErDKE6oDEDN5whvlk3Q_8LpXylcG';
const TABLE_SURAT = 'surat';
const TABLE_PROFIL = 'profil_instansi';
const STORAGE_BUCKET = 'dokumen-surat';
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB per file
const LOCAL_SESSION_KEY = 'sipas_kantor_session';
const LOCAL_DOC_KEY = 'sipas_kantor_documents';
const LOCAL_PROFILE_KEY = 'sipas_kantor_profile';
const LOCAL_DELETED_KEY = 'sipas_kantor_deleted_ids';

// Optimasi PDF: mode cepat agar download tidak terasa seperti reload lama.
const PDF_RENDER_SCALE = 2.25;
const PDF_IMAGE_QUALITY = 1.0;
const PDF_RENDER_DELAY_MS = 50;
const PDF_IMAGE_TIMEOUT_MS = 5000;
const WORD_RENDER_SCALE = 2;
const STAMPEL_IMAGE_URL = 'assets/stempel-kkg-pjok.png';
const DEFAULT_SIGNATURE_RENDER_OPTIONS = Object.freeze({ showStamp: true, showTtd: true });

// Ukuran logo khusus export Word mengikuti permintaan: lebar 1,95 cm dan tinggi 2,24 cm.
const WORD_LOGO_WIDTH_CM = 1.95;
const WORD_LOGO_HEIGHT_CM = 2.24;
const WORD_LOGO_WIDTH_PX = 74;
const WORD_LOGO_HEIGHT_PX = 85;

const hasSupabaseSdk = typeof window !== 'undefined'
  && window.supabase
  && typeof window.supabase.createClient === 'function';
const supabaseClient = hasSupabaseSdk
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let currentRoute = 'dashboard';
let cachedDocuments = null;
let cachedProfile = null;
let currentUser = null;
let lastPreviewDocument = null;
let lastPreviewElement = null;
let editTargetId = null;
let lastProfileSignatureUploadError = '';

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
  tembusan: '',
  logo_url: 'logo.png',
  ttd_url: '',
  ttd_path: '',
  ttd_name: '',
  ttd_data_url: ''
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
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
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
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
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
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
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
    if (typeof localStorage === 'undefined') return fallback;
    const storedValue = localStorage.getItem(key);
    if (storedValue === null || storedValue === undefined || storedValue === '') return fallback;
    return JSON.parse(storedValue);
  } catch (error) {
    console.warn(`Gagal membaca data lokal: ${key}`, error);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Gagal menyimpan data lokal: ${key}`, error);
    showToast('Penyimpanan lokal browser tidak tersedia atau sudah penuh.', 'warning');
  }
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
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch (error) {
    console.warn('Gagal menghapus sesi lokal:', error);
  }
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

function getProfileSignatureSnapshot(profile = cachedProfile || getLocalProfile() || {}) {
  return {
    // TTD profil untuk surat baru harus berasal dari Supabase Storage.
    // Base64 localStorage tidak dijadikan sumber utama agar tidak hilang saat clear cookies/site data.
    ttd_data_url: '',
    ttd_url: profile?.ttd_url || '',
    ttd_path: profile?.ttd_path || '',
    ttd_name: profile?.ttd_name || ''
  };
}

function syncProfileSignatureToLocalDocuments() {
  // Sengaja dikosongkan.
  // TTD profil hanya menjadi default untuk surat baru.
  // Surat lama harus tetap memakai snapshot TTD yang tersimpan pada data suratnya sendiri.
}

function showApplication() {
  if (el('loginPage')) el('loginPage').style.display = 'none';
  if (el('app')) el('app').style.display = 'block';
  startLiveDateTime();
}

function showLoginError(message) {
  const loginError = el('loginError');
  if (loginError) loginError.textContent = message;
}

let liveDateTimeTimer = null;

function formatIndonesianDateTimeParts(date = new Date()) {
  const timeZone = 'Asia/Jakarta';
  const time = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date).replace(/\./g, ':');

  const dateText = new Intl.DateTimeFormat('id-ID', {
    timeZone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date);

  return {
    time: `${time} WIB`,
    date: dateText
  };
}

function updateLiveDateTime() {
  const clockEl = el('currentClock');
  const dateEl = el('currentDate');
  if (!clockEl && !dateEl) return;

  const parts = formatIndonesianDateTimeParts();
  if (clockEl) clockEl.textContent = parts.time;
  if (dateEl) dateEl.textContent = parts.date;
}

function startLiveDateTime() {
  updateLiveDateTime();
  if (liveDateTimeTimer) window.clearInterval(liveDateTimeTimer);
  liveDateTimeTimer = window.setInterval(updateLiveDateTime, 1000);
}

function applyRoleUI() {
  const email = currentUser?.email || '-';
  const role = currentUser?.role || 'staf';
  const profileName = cachedProfile?.nama_aplikasi || defaultProfile.nama_aplikasi;
  if (el('currentUserEmail')) el('currentUserEmail').textContent = email;
  if (el('currentUserRole')) el('currentUserRole').textContent = `Role: ${titleCase(role)}`;
  if (el('sidebarProfileName')) el('sidebarProfileName').textContent = profileName;
  document.querySelectorAll('[data-route="pengaturan"]').forEach((item) => item.classList.remove('hidden'));
  document.querySelectorAll('.admin-only').forEach((item) => item.classList.toggle('hidden', !getPerm('settings')));
}

async function doLogin(event) {
  event?.preventDefault?.();

  const loginButton = event?.submitter || document.querySelector('#loginPage button[type="submit"], #loginPage button, button[onclick*="doLogin"]') || null;
  const originalText = setButtonBusy(loginButton, 'Masuk...');

  try {
    const emailInput = el('email');
    const passwordInput = el('password');
    if (!emailInput || !passwordInput) {
      showToast('Form login tidak lengkap. Periksa id input email dan password.', 'error');
      return;
    }

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
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
          try {
            await bootstrapApp();
          } catch (bootstrapError) {
            console.error('Login berhasil, tetapi aplikasi gagal dimuat:', bootstrapError);
            showToast(`Login berhasil, tetapi aplikasi gagal dimuat: ${bootstrapError.message || 'Periksa Console.'}`, 'error');
          }
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

    try {
      await bootstrapApp();
    } catch (bootstrapError) {
      console.error('Login lokal berhasil, tetapi aplikasi gagal dimuat:', bootstrapError);
      showToast(`Login lokal berhasil, tetapi aplikasi gagal dimuat: ${bootstrapError.message || 'Periksa Console.'}`, 'error');
    }

    showToast('Login lokal berhasil. Data tersimpan di browser sampai Supabase disiapkan.', 'warning');
  } catch (error) {
    console.error('Crash saat login:', error);
    showLoginError(`Login crash: ${error.message || 'Periksa Console browser.'}`);
  } finally {
    restoreButton(loginButton, originalText);
  }
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
  try {
    const session = await getCurrentSession();
    if (session?.user) {
      currentUser = session.user;
      showApplication();
      try {
        await bootstrapApp();
      } catch (bootstrapError) {
        console.error('Sesi terbaca, tetapi aplikasi gagal dimuat:', bootstrapError);
        showToast(`Aplikasi gagal dimuat: ${bootstrapError.message || 'Periksa Console browser.'}`, 'error');
      }
    }
  } catch (error) {
    console.error('Gagal cek sesi login:', error);
    clearLocalSession();
    showToast(`Gagal membaca sesi login: ${error.message || 'Silakan login ulang.'}`, 'error');
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

      // TTD permanen dibaca dari Supabase. LocalStorage hanya cache, bukan sumber utama.
      cachedProfile.ttd_data_url = '';
      cachedProfile.ttd_path = data.ttd_path || '';
      cachedProfile.ttd_url = cachedProfile.ttd_path
        ? await resolveStoragePublicOrSignedUrl(cachedProfile.ttd_path, data.ttd_url || '')
        : (data.ttd_url || '');
      cachedProfile.ttd_name = data.ttd_name || '';

      setLocalProfile(cachedProfile);
    }
  } catch (error) {
    console.warn('Profil online belum terbaca. Aplikasi memakai cache lokal sementara:', error);
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
    surat_asli_url: row.surat_asli_url || '',
    surat_asli_path: row.surat_asli_path || '',
    surat_asli_name: row.surat_asli_name || '',
    // Snapshot TTD per surat.
    // Jangan ambil fallback dari profil di sini, agar surat lama tidak berubah saat TTD profil diperbarui.
    ttd_data_url: row.ttd_data_url || '',
    ttd_url: row.ttd_url || '',
    ttd_path: row.ttd_path || '',
    ttd_name: row.ttd_name || '',
    local_only: Boolean(row.local_only),
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString()
  };
}

function stripLocalOnly(row) {
  const copy = { ...row };
  delete copy.local_only;
  delete copy.ttd_data_url;

  // Jangan kirim base64 besar ke kolom URL Supabase. Base64 cukup disimpan lokal,
  // sedangkan Supabase memakai ttd_path/ttd_url dari Storage jika upload berhasil.
  if (String(copy.ttd_url || '').startsWith('data:image/')) {
    copy.ttd_url = '';
  }

  return copy;
}

function stripUploadColumns(row) {
  const copy = stripLocalOnly(row);
  delete copy.surat_asli_url;
  delete copy.surat_asli_path;
  delete copy.surat_asli_name;
  delete copy.ttd_url;
  delete copy.ttd_path;
  delete copy.ttd_name;
  return copy;
}

function isMissingUploadColumnError(error) {
  const text = String(error?.message || error?.details || error?.hint || error?.code || '').toLowerCase();
  return text.includes('surat_asli')
    || text.includes('ttd_')
    || text.includes('schema cache')
    || text.includes('could not find');
}

async function fetchDocuments(filter = {}, forceRefresh = false) {
  const localRows = getLocalDocuments().map(normalizeDocument).filter((row) => !isDocumentDeleted(row.id));
  let onlineRows = [];

  try {
    if (!supabaseClient) throw new Error('Supabase SDK tidak tersedia');
    let query = supabaseClient.from(TABLE_SURAT).select('*').order('created_at', { ascending: false });
    if (filter.jenis) query = query.eq('jenis', filter.jenis);
    if (filter.status) query = query.eq('status', filter.status);
    const { data, error } = await query;
    if (error) throw error;
    onlineRows = await Promise.all((data || [])
      .map(normalizeDocument)
      .filter((row) => !isDocumentDeleted(row.id))
      .map((row) => refreshDocumentFileUrls(row)));
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
  const normalized = normalizeDocument({
    ...(row || {}),
    // Simpan snapshot TTD milik surat ini saja.
    // Jangan memakai fallback TTD profil di tahap simpan, agar arsip lama tidak ikut berubah.
    ttd_data_url: row?.ttd_data_url || '',
    ttd_url: row?.ttd_url || row?.ttd_data_url || '',
    ttd_path: row?.ttd_path || '',
    ttd_name: row?.ttd_name || ''
  });
  unmarkDocumentDeleted(normalized.id);
  const localRows = getLocalDocuments().filter((item) => String(item.id) !== String(normalized.id));

  const localMirror = { ...normalized, local_only: true };
  setLocalDocuments([localMirror, ...localRows]);

  try {
    if (!supabaseClient) throw new Error('Supabase SDK tidak tersedia');

    let payload = stripLocalOnly(normalized);
    let result = await supabaseClient
      .from(TABLE_SURAT)
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (result.error && isMissingUploadColumnError(result.error)) {
      console.warn('Kolom upload belum tersedia di Supabase. Mencoba simpan data utama tanpa kolom upload:', result.error);
      payload = stripUploadColumns(normalized);
      result = await supabaseClient
        .from(TABLE_SURAT)
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    const resultData = result.data || {};
    const onlineRow = normalizeDocument({
      ...normalized,
      ...resultData,
      // Jika Supabase mengembalikan null/kosong, tetap pakai snapshot TTD surat ini.
      ttd_data_url: normalized.ttd_data_url || '',
      ttd_url: resultData.ttd_url || normalized.ttd_url || normalized.ttd_data_url || '',
      ttd_path: resultData.ttd_path || normalized.ttd_path || '',
      ttd_name: resultData.ttd_name || normalized.ttd_name || '',
      local_only: false
    });
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
  cachedDocuments = (Array.isArray(cachedDocuments) ? cachedDocuments : []).filter((item) => String(item.id) !== id);

  if (!supabaseClient || row.local_only || id.startsWith('local-')) {
    return { onlineDeleted: false, localDeleted: true };
  }

  let storageError = null;
  const storagePaths = [row.pdf_path, row.surat_asli_path, row.ttd_path].filter(Boolean);
  if (storagePaths.length) {
    try {
      const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).remove(storagePaths);
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
  const pdfPaths = rows.flatMap((row) => [row.pdf_path, row.surat_asli_path, row.ttd_path]).filter(Boolean);
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
  const typeConfig = documentTypes[typeKey] || documentTypes.keluar;
  const data = new FormData(form);
  const isNewDocument = !existing?.id;
  const defaultSignature = isNewDocument ? getProfileSignatureSnapshot() : {};
  return normalizeDocument({
    ...existing,
    ...defaultSignature,
    id: existing.id || newId(),
    jenis: typeKey in documentTypes ? typeKey : 'keluar',
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
    status: data.get('status') || typeConfig.defaultStatus,
    catatan: data.get('catatan')?.trim(),
    dibuat_oleh: existing.dibuat_oleh || currentUser?.email || '-',
    updated_at: new Date().toISOString()
  });

}

function getSelectedFile(form, name) {
  const input = form?.querySelector?.(`[name="${name}"]`);
  return input?.files?.[0] || null;
}

function fileExtension(file) {
  const name = String(file?.name || 'file');
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match ? `.${match[1].toLowerCase()}` : '';
}

function validateUploadFile(file, options = {}) {
  if (!file) return true;
  if (file.size > MAX_UPLOAD_SIZE) {
    showToast(`File ${file.name} terlalu besar. Maksimal 5 MB.`, 'error');
    return false;
  }
  if (options.imageOnly && !String(file.type || '').startsWith('image/')) {
    showToast(`File ${file.name} harus berupa gambar tanda tangan.`, 'error');
    return false;
  }
  return true;
}


function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadAttachmentToSupabase(file, folder, ownerId) {
  if (!file) return null;
  if (!supabaseClient) throw new Error('Supabase belum aktif, file belum bisa diunggah.');

  const baseName = slugify(String(file.name || 'file').replace(/\.[^/.]+$/, ''));
  const path = `${folder}/${ownerId}/${Date.now()}-${baseName}${fileExtension(file)}`;

  const { error } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true
    });

  if (error) throw error;

  const url = await resolveStoragePublicOrSignedUrl(path, '');

  return {
    path,
    url,
    name: file.name || ''
  };
}


async function uploadProfileSignatureFile(file) {
  lastProfileSignatureUploadError = '';

  if (!file) return null;
  if (!validateUploadFile(file, { imageOnly: true })) {
    lastProfileSignatureUploadError = 'File tanda tangan harus berupa gambar PNG, JPG, atau WebP maksimal 5 MB.';
    return null;
  }

  if (!supabaseClient) {
    lastProfileSignatureUploadError = 'Supabase belum aktif. Tanda tangan tidak bisa disimpan permanen.';
    showToast(lastProfileSignatureUploadError, 'error');
    return null;
  }

  try {
    const baseName = slugify(String(file.name || 'tanda-tangan').replace(/\.[^/.]+$/, ''));
    const ext = fileExtension(file) || '.png';
    const path = `profil-tanda-tangan/default/${Date.now()}-${baseName}${ext}`;

    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, {
        contentType: file.type || 'image/png',
        upsert: true
      });

    if (uploadError) {
      lastProfileSignatureUploadError = `Upload TTD gagal: ${uploadError.message || 'Storage menolak upload.'}`;
      console.error('Upload TTD Storage error:', uploadError);
      showToast(lastProfileSignatureUploadError, 'error');
      return null;
    }

    const { data } = supabaseClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    const publicUrl = data?.publicUrl || await resolveStoragePublicOrSignedUrl(path, '');

    if (!publicUrl) {
      lastProfileSignatureUploadError = 'Upload TTD berhasil, tetapi URL publik gagal dibuat.';
      showToast(lastProfileSignatureUploadError, 'error');
      return null;
    }

    const result = {
      path,
      url: publicUrl,
      name: file.name || 'Tanda tangan'
    };

    cachedProfile = {
      ...defaultProfile,
      ...(cachedProfile || {}),
      ttd_data_url: '',
      ttd_url: result.url,
      ttd_path: result.path,
      ttd_name: result.name
    };

    // LocalStorage hanya cache tampilan. Sumber utama tetap Supabase.
    setLocalProfile(cachedProfile);

    return result;
  } catch (error) {
    lastProfileSignatureUploadError = `Upload TTD gagal: ${error.message || 'Periksa bucket Storage dan RLS Supabase.'}`;
    console.error('Upload TTD profil gagal:', error);
    showToast(lastProfileSignatureUploadError, 'error');
    return null;
  }
}


async function resolveStoragePublicOrSignedUrl(path, fallbackUrl = '') {
  if (!path || !supabaseClient) return fallbackUrl || '';

  // Bucket dokumen-surat dibuat public. Public URL lebih stabil setelah clear cookies
  // karena tidak bergantung pada signed URL yang punya masa berlaku.
  try {
    const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    if (data?.publicUrl) return data.publicUrl;
  } catch (error) {
    console.warn('Public URL gagal:', error);
  }

  try {
    const signed = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    if (!signed.error && signed.data?.signedUrl) {
      return signed.data.signedUrl;
    }
  } catch (error) {
    console.warn('Signed URL gagal:', error);
  }

  return fallbackUrl || '';
}

async function refreshDocumentFileUrls(row) {
  const next = normalizeDocument(row || {});

  if (next.ttd_path) {
    next.ttd_url = await resolveStoragePublicOrSignedUrl(next.ttd_path, next.ttd_url);
  }

  if (next.surat_asli_path) {
    next.surat_asli_url = await resolveStoragePublicOrSignedUrl(next.surat_asli_path, next.surat_asli_url);
  }

  if (next.pdf_path) {
    next.pdf_url = await resolveStoragePublicOrSignedUrl(next.pdf_path, next.pdf_url);
  }

  return next;
}

async function attachUploadedFiles(form, row) {
  const nextRow = normalizeDocument(row);
  const originalFile = getSelectedFile(form, 'surat_asli_file');
  const signatureFile = getSelectedFile(form, 'ttd_file');

  if (originalFile && !validateUploadFile(originalFile)) return null;
  if (signatureFile && !validateUploadFile(signatureFile, { imageOnly: true })) return null;

  if (!originalFile && !signatureFile) return nextRow;

  // TTD wajib dibaca menjadi base64 lebih dulu. Ini membuat preview, arsip, edit, dan PDF
  // tetap menampilkan tanda tangan walaupun upload Supabase gagal atau tabel belum punya kolom TTD.
  if (signatureFile) {
    const localDataUrl = await fileToDataUrl(signatureFile);
    nextRow.ttd_data_url = localDataUrl;
    nextRow.ttd_url = localDataUrl;
    nextRow.ttd_path = '';
    nextRow.ttd_name = signatureFile.name || 'Tanda tangan';

    // TTD dari form surat hanya menjadi snapshot untuk surat ini.
    // Jangan update cachedProfile, agar upload TTD baru tidak mengubah surat lama atau default profil.
  }

  if (!supabaseClient) {
    showToast('File tersimpan lokal. Supabase belum aktif, jadi upload Storage dilewati.', 'warning');
    return nextRow;
  }

  try {
    if (nextRow.jenis === 'masuk' && originalFile) {
      const uploaded = await uploadAttachmentToSupabase(originalFile, 'surat-asli', nextRow.id);
      nextRow.surat_asli_path = uploaded.path;
      nextRow.surat_asli_url = uploaded.url;
      nextRow.surat_asli_name = uploaded.name;
    }

    if (signatureFile) {
      const uploaded = await uploadAttachmentToSupabase(signatureFile, 'tanda-tangan', nextRow.id);

      nextRow.ttd_path = uploaded.path || '';
      nextRow.ttd_url = uploaded.url || nextRow.ttd_data_url;
      nextRow.ttd_name = uploaded.name || signatureFile.name || 'Tanda tangan';

      // TTD berhasil diunggah ke Storage, tetapi tetap hanya melekat pada surat ini.
      // Profil/global tidak ikut berubah.
    }

    return nextRow;
  } catch (error) {
    console.warn('Upload file ke Supabase gagal. Data lokal tetap dipertahankan:', error);
    showToast('Upload Supabase gagal. TTD tetap tersimpan lokal untuk preview dan PDF.', 'warning');
    return nextRow;
  }
}

function previewSignatureInput(input) {
  const file = input?.files?.[0] || null;
  const wrapper = input?.closest?.('.upload-card')?.querySelector?.('.ttd-current-preview');
  if (!wrapper) return;

  if (!file) {
    wrapper.hidden = true;
    wrapper.innerHTML = '';
    return;
  }

  if (!validateUploadFile(file, { imageOnly: true })) {
    input.value = '';
    wrapper.hidden = true;
    wrapper.innerHTML = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    wrapper.hidden = false;
    wrapper.innerHTML = `
      <img src="${String(reader.result || '')}" alt="Preview tanda tangan baru">
      <small class="file-current">Preview TTD baru: ${safe(file.name || 'Tanda tangan')}</small>
    `;
  };
  reader.onerror = () => {
    wrapper.hidden = true;
    wrapper.innerHTML = '';
    showToast('Preview tanda tangan gagal dibaca.', 'warning');
  };
  reader.readAsDataURL(file);
}

// DIPERBAIKI: Mengganti penggunaan ${js(x)} dengan ${jsAttr(x)} dan tanda kutip tunggal ('') agar parameter fungsi onclick HTML valid
function documentFormHTML(typeKey, row = {}, mode = 'create') {
  const type = documentTypes[typeKey] || documentTypes.keluar;
  const resolvedTypeKey = typeKey in documentTypes ? typeKey : 'keluar';
  const data = normalizeDocument({ jenis: resolvedTypeKey, status: type.defaultStatus, ...row });
  const formId = mode === 'edit' ? 'editDocumentForm' : 'documentForm';
  const submitHandler = mode === 'edit'
    ? `saveEditedDocument(event, '${jsAttr(data.id)}')`
    : `saveDocument(event, '${jsAttr(resolvedTypeKey)}')`;
  const disabled = !getPerm(mode === 'edit' ? 'edit' : 'create') ? 'disabled' : '';

  return `
    <form id="${formId}" onsubmit="${submitHandler}" enctype="multipart/form-data">
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
        ${resolvedTypeKey === 'masuk' ? `
          <div class="field full upload-card">
            <label>Upload Surat Asli</label>
            <input type="file" name="surat_asli_file" accept=".pdf,.jpg,.jpeg,.png,.webp" ${disabled}>
            <small>Format: PDF/JPG/PNG/WebP. Maksimal 5 MB. File disimpan ke Supabase Storage.</small>
            ${data.surat_asli_url ? `<small class="file-current">File tersimpan: <a href="${safe(data.surat_asli_url)}" target="_blank" rel="noopener">${safe(data.surat_asli_name || 'Lihat surat asli')}</a></small>` : ''}
          </div>` : ''}
        <div class="field full upload-card">
          <label>Upload Tanda Tangan</label>
          <input type="file" name="ttd_file" accept="image/png,image/jpeg,image/webp" onchange="previewSignatureInput(this)" ${disabled}>
          <small>Format: PNG/JPG/WebP. TTD pada form surat hanya tersimpan untuk surat ini dan tidak mengubah surat lama.</small>
          ${(() => {
            const defaultTtd = mode === 'create' ? (cachedProfile?.ttd_url || cachedProfile?.ttd_data_url || '') : '';
            const defaultName = mode === 'create' ? (cachedProfile?.ttd_name || 'Tanda tangan tersimpan') : 'Tanda tangan tersimpan';
            const currentTtd = data.ttd_data_url || data.ttd_url || defaultTtd;
            const currentName = data.ttd_name || defaultName;
            return currentTtd ? `
              <div class="ttd-current-preview">
                <img src="${safe(currentTtd)}" alt="Tanda tangan tersimpan" crossorigin="anonymous">
                <small class="file-current">Tanda tangan aktif: <a href="${safe(currentTtd)}" target="_blank" rel="noopener">${safe(currentName)}</a></small>
              </div>
            ` : `<div class="ttd-current-preview" hidden></div>`;
          })()}
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" onclick="previewForm('${jsAttr(resolvedTypeKey)}', '${jsAttr(formId)}')">Preview Template</button>
        ${mode === 'edit' ? `<button type="button" class="btn secondary" onclick="closeEditModal()">Batal</button>` : ''}
        <button type="submit" class="btn" ${disabled}>${mode === 'edit' ? 'Simpan Perubahan' : 'Simpan Data'}</button>
        ${mode === 'create' ? `<button type="button" class="btn gold" onclick="saveDocumentAndPdf(event, '${jsAttr(resolvedTypeKey)}')" ${disabled}>Simpan & Download PDF</button>` : ''}
        ${mode === 'create' ? `<button type="button" class="btn secondary" onclick="saveDocumentAndWord(event, '${jsAttr(resolvedTypeKey)}')" ${disabled}>Simpan & Download Word</button>` : ''}
      </div>
    </form>`;
}

function statusOptions(selected) {
  const statuses = ['draft', 'diterima', 'diproses', 'diajukan', 'disetujui', 'selesai', 'diarsipkan'];
  return statuses.map((status) => `<option value="${status}" ${selected === status ? 'selected' : ''}>${titleCase(status)}</option>`).join('');
}

async function saveDocument(event, typeKey) {
  event.preventDefault();
  const form = event.target;
  const btn = event.submitter || form?.querySelector('button[type="submit"]') || null;
  const originalText = setButtonBusy(btn, 'Menyimpan...');

  try {
    if (!getPerm('create')) {
      showToast('Role ini tidak dapat membuat dokumen.', 'error');
      return;
    }
    if (!validateForm(form)) return;

    const originalFile = getSelectedFile(form, 'surat_asli_file');
    const signatureFile = getSelectedFile(form, 'ttd_file');
    if (originalFile && !validateUploadFile(originalFile)) return;
    if (signatureFile && !validateUploadFile(signatureFile, { imageOnly: true })) return;

    const row = getFormData(form, typeKey);

    // Simpan data utama lebih dulu agar tombol Simpan tetap bekerja walau upload file gagal.
    let saved = await saveDocumentToStorage(row);

    if (originalFile || signatureFile) {
      const rowWithFiles = await attachUploadedFiles(form, saved);
      if (rowWithFiles) saved = await saveDocumentToStorage(rowWithFiles);
    }

    form.reset();
    const dateInput = form.querySelector('[name="tanggal_surat"]');
    if (dateInput) dateInput.value = todayInput();

    showToast(saved.local_only
      ? `Data tersimpan di browser. Supabase belum menerima data: ${saved.sync_error || 'periksa tabel/RLS.'}`
      : 'Data berhasil disimpan.');

    await refreshCurrentPage();
  } finally {
    restoreButton(btn, originalText);
  }
}

async function saveDocumentAndPdf(event, typeKey) {
  event?.preventDefault?.();
  const btn = event?.currentTarget || event?.target || null;
  const originalText = setButtonBusy(btn, 'Menyimpan & membuat PDF...');

  try {
    if (!getPerm('create')) {
      showToast('Role ini tidak dapat membuat dokumen.', 'error');
      return;
    }

    const form = getButtonForm(event, 'documentForm');
    if (!validateForm(form)) return;

    const originalFile = getSelectedFile(form, 'surat_asli_file');
    const signatureFile = getSelectedFile(form, 'ttd_file');
    if (originalFile && !validateUploadFile(originalFile)) return;
    if (signatureFile && !validateUploadFile(signatureFile, { imageOnly: true })) return;

    const row = getFormData(form, typeKey);

    // Simpan data utama lebih dulu. Upload file dan PDF tidak lagi membuat tombol Simpan terasa mati.
    let saved = await saveDocumentToStorage(row);

    if (originalFile || signatureFile) {
      const rowWithFiles = await attachUploadedFiles(form, saved);
      if (rowWithFiles) saved = await saveDocumentToStorage(rowWithFiles);
    }

    // Download PDF dibuat lokal saja. Upload Storage dibuat opsional agar tidak memperlambat tombol download.
    const pdfResult = await createPdfFromDocument(saved, { download: true, upload: false });
    if (!pdfResult) {
      showToast('Data sudah tersimpan, tetapi PDF gagal dibuat. Periksa library html2canvas dan jsPDF.', 'warning');
      return;
    }

    form.reset();
    const dateInput = form.querySelector('[name="tanggal_surat"]');
    if (dateInput) dateInput.value = todayInput();

    showToast(saved.local_only
      ? `Data lokal tersimpan dan PDF berhasil diunduh. Supabase belum menerima data: ${saved.sync_error || 'periksa tabel/RLS.'}`
      : 'Data tersimpan dan PDF berhasil diunduh.');

    // Tidak langsung refresh halaman setelah PDF dibuat. Ini mencegah proses download terasa seperti reload.
    window.setTimeout(() => refreshCurrentPage().catch((error) => console.warn('Refresh daftar setelah PDF gagal:', error)), 1200);
  } finally {
    restoreButton(btn, originalText);
  }
}


async function saveDocumentAndWord(event, typeKey) {
  event?.preventDefault?.();
  const btn = event?.currentTarget || event?.target || null;
  const originalText = setButtonBusy(btn, 'Menyimpan & membuat Word...');

  try {
    if (!getPerm('create')) {
      showToast('Role ini tidak dapat membuat dokumen.', 'error');
      return;
    }

    const form = getButtonForm(event, 'documentForm');
    if (!validateForm(form)) return;

    const originalFile = getSelectedFile(form, 'surat_asli_file');
    const signatureFile = getSelectedFile(form, 'ttd_file');
    if (originalFile && !validateUploadFile(originalFile)) return;
    if (signatureFile && !validateUploadFile(signatureFile, { imageOnly: true })) return;

    const row = getFormData(form, typeKey);

    // Simpan data utama lebih dulu, sama seperti tombol PDF.
    let saved = await saveDocumentToStorage(row);

    if (originalFile || signatureFile) {
      const rowWithFiles = await attachUploadedFiles(form, saved);
      if (rowWithFiles) saved = await saveDocumentToStorage(rowWithFiles);
    }

    const wordResult = await createWordFromDocument(saved, { download: true });
    if (!wordResult) {
      showToast('Data sudah tersimpan, tetapi file Word gagal dibuat.', 'warning');
      return;
    }

    form.reset();
    const dateInput = form.querySelector('[name="tanggal_surat"]');
    if (dateInput) dateInput.value = todayInput();

    showToast(saved.local_only
      ? `Data lokal tersimpan dan Word berhasil diunduh. Supabase belum menerima data: ${saved.sync_error || 'periksa tabel/RLS.'}`
      : 'Data tersimpan dan Word berhasil diunduh.');

    window.setTimeout(() => refreshCurrentPage().catch((error) => console.warn('Refresh setelah Word gagal:', error)), 0);
  } finally {
    restoreButton(btn, originalText);
  }
}

async function saveEditedDocument(event, id) {
  event.preventDefault();
  const form = event.target;
  const btn = event.submitter || form?.querySelector('button[type="submit"]') || null;
  const originalText = setButtonBusy(btn, 'Menyimpan...');

  try {
    if (!getPerm('edit')) {
      showToast('Role ini tidak dapat mengedit dokumen.', 'error');
      return;
    }
    const existing = findDocumentById(id);
    if (!existing) {
      showToast('Data tidak ditemukan.', 'error');
      return;
    }
    if (!validateForm(form)) return;

    const originalFile = getSelectedFile(form, 'surat_asli_file');
    const signatureFile = getSelectedFile(form, 'ttd_file');
    if (originalFile && !validateUploadFile(originalFile)) return;
    if (signatureFile && !validateUploadFile(signatureFile, { imageOnly: true })) return;

    const row = getFormData(form, existing.jenis, existing);
    let saved = await saveDocumentToStorage(row);

    if (originalFile || signatureFile) {
      const rowWithFiles = await attachUploadedFiles(form, saved);
      if (rowWithFiles) {
        saved = await saveDocumentToStorage(rowWithFiles);

        // FINAL: paksa cache langsung memakai TTD baru hasil edit.
        cachedDocuments = Array.isArray(cachedDocuments)
          ? cachedDocuments.map((item) => String(item.id) === String(saved.id) ? normalizeDocument({ ...item, ...saved }) : item)
          : cachedDocuments;
      }
    }

    closeEditModal();
    showToast(saved.local_only
      ? `Perubahan tersimpan lokal. Supabase belum menerima data: ${saved.sync_error || 'periksa tabel/RLS.'}`
      : 'Data berhasil diperbarui.');
    await refreshCurrentPage();
  } finally {
    restoreButton(btn, originalText);
  }
}

async function previewForm(typeKey, formId = 'documentForm') {
  const form = el(formId);
  if (!form) return showToast('Form tidak ditemukan.', 'error');

  // Kalau preview dibuka dari modal edit, pertahankan data lama termasuk file/TTD yang sudah tersimpan.
  const existing = formId === 'editDocumentForm' && editTargetId
    ? (findDocumentById(editTargetId) || {})
    : {};

  let row = getFormData(form, typeKey, existing);
  const signatureFile = getSelectedFile(form, 'ttd_file');

  // Preview harus menampilkan TTD yang baru dipilih walaupun dokumen belum disimpan.
  if (signatureFile) {
    if (!validateUploadFile(signatureFile, { imageOnly: true })) return;
    try {
      const dataUrl = await fileToDataUrl(signatureFile);
      row = {
        ...row,
        ttd_data_url: dataUrl,
        ttd_url: dataUrl,
        ttd_path: '',
        ttd_name: signatureFile.name || 'Tanda tangan preview'
      };
    } catch (error) {
      console.warn('Preview tanda tangan gagal:', error);
      showToast('Preview tanda tangan gagal dibaca.', 'warning');
    }
  }

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
    <div class="panel form-panel document-form-panel">
      <div class="panel-header"><div><h2>Form ${safe(type.title)}</h2><p>${safe(type.help)}</p></div></div>
      ${documentFormHTML(typeKey, {}, 'create')}
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
  if (row.surat_asli_url) buttons.push(`<a class="action-link" href="${safe(row.surat_asli_url)}" target="_blank" rel="noopener">Surat Asli</a>`);
  if (getPerm('pdf')) {
    buttons.push(`<button type="button" onclick="downloadById(event, '${jsAttr(row.id)}')">PDF</button>`);
    buttons.push(`<button type="button" onclick="downloadWordById(event, '${jsAttr(row.id)}')">Word</button>`);
  }
  if (getPerm('edit')) buttons.push(`<button type="button" onclick="editById('${jsAttr(row.id)}')">Edit</button>`);
  if (getPerm('approve') && row.status === 'diajukan') buttons.push(`<button type="button" class="green" onclick="approveById('${jsAttr(row.id)}')">Setujui</button>`);
  if (getPerm('archive') && row.status !== 'diarsipkan') buttons.push(`<button type="button" onclick="archiveById('${jsAttr(row.id)}')">Arsip</button>`);
  if (getPerm('archive') && row.status === 'diarsipkan') buttons.push(`<button type="button" onclick="restoreById('${jsAttr(row.id)}')">Aktifkan</button>`);
  if (getPerm('delete')) buttons.push(`<button type="button" class="danger" onclick="deleteById('${jsAttr(row.id)}')">Delete</button>`);
  return buttons.join('');
}

function findDocumentById(id) {
  const cachedRows = Array.isArray(cachedDocuments) ? cachedDocuments : [];
  return cachedRows.find((row) => String(row.id) === String(id))
    || getLocalDocuments().map(normalizeDocument).find((row) => String(row.id) === String(id));
}

async function previewById(id) {
  await loadProfile();
  const row = findDocumentById(id) || (await fetchDocuments()).find((item) => String(item.id) === String(id));
  if (!row) return showToast('Data tidak ditemukan.', 'error');
  openPreview(row);
}

async function downloadById(eventOrId, maybeId) {
  const id = maybeId === undefined ? eventOrId : maybeId;
  const btn = maybeId === undefined ? null : (eventOrId?.currentTarget || eventOrId?.target || null);
  const originalText = setButtonBusy(btn, 'PDF...');

  try {
    await loadProfile();
    const row = findDocumentById(id) || (await fetchDocuments()).find((item) => String(item.id) === String(id));
    if (!row) {
      showToast('Data tidak ditemukan.', 'error');
      return;
    }

    // Tombol PDF hanya download. Tidak upload ke Supabase agar proses jauh lebih cepat.
    const pdfResult = await createPdfFromDocument(row, { download: true, upload: false });
    if (!pdfResult) showToast('PDF gagal dibuat. Periksa koneksi library html2canvas dan jsPDF.', 'error');
  } finally {
    restoreButton(btn, originalText);
  }
}


async function downloadWordById(eventOrId, maybeId) {
  const id = maybeId === undefined ? eventOrId : maybeId;
  const btn = maybeId === undefined ? null : (eventOrId?.currentTarget || eventOrId?.target || null);
  const originalText = setButtonBusy(btn, 'Word...');

  try {
    await loadProfile();
    const row = findDocumentById(id) || (await fetchDocuments()).find((item) => String(item.id) === String(id));
    if (!row) {
      showToast('Data tidak ditemukan.', 'error');
      return;
    }

    const wordResult = await createWordFromDocument(row, { download: true });
    if (wordResult) {
      showToast('Word berhasil diunduh.');
    } else {
      showToast('Word gagal dibuat.', 'error');
    }
  } finally {
    restoreButton(btn, originalText);
  }
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
    <form class="panel form-panel" id="profileForm" onsubmit="saveProfile(event)" enctype="multipart/form-data">
      <div class="panel-header"><div><h2>Profil Instansi</h2><p>Data ini muncul otomatis pada kop surat dan tanda tangan.</p></div></div>
      <div class="form-grid">
        <div class="field"><label>Nama Instansi</label><textarea name="nama_instansi" required>${safe(profile.nama_instansi)}</textarea></div>
        <div class="field"><label>Nama Aplikasi</label><input name="nama_aplikasi" value="${safe(profile.nama_aplikasi)}" required></div>
        <div class="field full"><label>Alamat</label><textarea name="alamat" rows="2">${safe(profile.alamat)}</textarea></div>
        <div class="field"><label>Telepon</label><input name="telepon" value="${safe(profile.telepon)}"></div>
        <div class="field"><label>Email</label><input name="email" value="${safe(profile.email)}"></div>
        <div class="field"><label>Website</label><input name="website" value="${safe(profile.website)}"></div>
        <div class="field"><label>Kota Penandatanganan</label><input name="kota" value="${safe(profile.kota)}"></div>
        <div class="field"><label>Nama Penandatangan</label><input name="kepala_nama" value="${safe(profile.kepala_nama)}"></div>
        <div class="field"><label>NIP</label><input name="kepala_nip" value="${safe(profile.kepala_nip)}"></div>
        <div class="field"><label>Jabatan</label><input name="jabatan" value="${safe(profile.jabatan)}"></div>
        <div class="field full"><label>Tembusan</label><textarea name="tembusan" rows="4" placeholder="Contoh: 1. Ketua KKG 2. Bendahara 3. Arsip">${safe(profile.tembusan || '')}</textarea></div>
        <div class="field full"><label>URL Logo</label><input name="logo_url" value="${safe(profile.logo_url)}" placeholder="logo.png atau URL publik Supabase Storage"></div>
        <div class="field full upload-card">
          <label>Upload Tanda Tangan Ketua</label>
          <input type="file" name="profile_ttd_file" accept="image/png,image/jpeg,image/webp">
          <small>TTD ini menjadi default untuk surat baru saja. Surat lama tetap memakai TTD yang tersimpan pada surat tersebut.</small>
          ${(() => {
            const activeTtd = profile.ttd_url || profile.ttd_data_url || '';
            return activeTtd ? `
              <div class="ttd-profile-preview">
                <img src="${safe(activeTtd)}" alt="Tanda tangan tersimpan" crossorigin="anonymous">
                <small>File aktif: <a href="${safe(activeTtd)}" target="_blank" rel="noopener">${safe(profile.ttd_name || 'Lihat tanda tangan')}</a></small>
              </div>
            ` : '';
          })()}
        </div>
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
  event?.preventDefault?.();
  if (!currentUser) return showToast('Sesi login tidak valid. Silakan login ulang.', 'error');

  const profileForm = el('profileForm');
  if (!profileForm) return showToast('Form profil tidak ditemukan.', 'error');

  const btn = event?.submitter || profileForm.querySelector('button[type="submit"]') || null;
  const originalText = setButtonBusy(btn, 'Menyimpan...');

  try {
    if (!supabaseClient) {
      showToast('Supabase belum aktif. Pengaturan tidak disimpan agar TTD tidak hilang saat clear cookies.', 'error');
      return;
    }

    const form = new FormData(profileForm);
    const ttdFile = getSelectedFile(profileForm, 'profile_ttd_file');

    let ttdPayload = {
      // Jangan simpan base64 sebagai sumber utama.
      // Tanda tangan permanen wajib memakai path dan URL dari Supabase Storage.
      ttd_data_url: '',
      ttd_url: cachedProfile?.ttd_url || '',
      ttd_path: cachedProfile?.ttd_path || '',
      ttd_name: cachedProfile?.ttd_name || ''
    };

    if (ttdFile) {
      const uploaded = await uploadProfileSignatureFile(ttdFile);

      if (!uploaded || !uploaded.path || !uploaded.url) {
        showToast(lastProfileSignatureUploadError || 'Tanda tangan gagal diupload ke Supabase Storage.', 'error');
        return;
      }

      ttdPayload = {
        ttd_data_url: '',
        ttd_url: uploaded.url,
        ttd_path: uploaded.path,
        ttd_name: uploaded.name || ttdFile.name || 'Tanda tangan'
      };
    }

    const payload = {
      id: 'default',
      nama_instansi: form.get('nama_instansi')?.trim() || defaultProfile.nama_instansi,
      nama_aplikasi: form.get('nama_aplikasi')?.trim() || defaultProfile.nama_aplikasi,
      alamat: form.get('alamat')?.trim() || '',
      telepon: form.get('telepon')?.trim() || '-',
      email: form.get('email')?.trim() || '-',
      website: form.get('website')?.trim() || '-',
      kota: form.get('kota')?.trim() || defaultProfile.kota,
      kepala_nama: form.get('kepala_nama')?.trim() || '',
      kepala_nip: form.get('kepala_nip')?.trim() || '-',
      jabatan: form.get('jabatan')?.trim() || '',
      tembusan: form.get('tembusan')?.trim() || '',
      logo_url: form.get('logo_url')?.trim() || 'logo.png',
      ...ttdPayload,
      updated_at: new Date().toISOString()
    };

    const supabaseProfilePayload = { ...payload };

    // Jangan kirim base64 ke database.
    // Database cukup menyimpan path dan URL Storage.
    delete supabaseProfilePayload.ttd_data_url;

    const { error } = await supabaseClient
      .from(TABLE_PROFIL)
      .upsert(supabaseProfilePayload, { onConflict: 'id' });

    if (error) {
      console.error('Simpan profil Supabase error:', error);
      showToast(`Pengaturan gagal disimpan: ${error.message || 'Supabase menolak update.'}`, 'error');
      return;
    }

    cachedProfile = { ...defaultProfile, ...(cachedProfile || {}), ...payload };
    setLocalProfile(cachedProfile);

    // Jangan sinkronkan TTD profil ke dokumen lama.
    // TTD profil hanya menjadi default untuk surat baru setelah pengaturan ini disimpan.
    applyRoleUI();

    showToast(ttdFile
      ? 'Pengaturan dan tanda tangan berhasil disimpan permanen.'
      : 'Pengaturan berhasil disimpan.');

    await loadProfile();
    await renderSettingsPage();
  } catch (error) {
    console.error('Pengaturan belum tersimpan online:', error);
    showToast(`Pengaturan belum tersimpan online: ${error.message || 'Periksa tabel, bucket, atau RLS Supabase.'}`, 'error');
  } finally {
    restoreButton(btn, originalText);
  }
}

function letterhead(profile) {
  return `
    <div class="letterhead">
      <img src="${safe(profile.logo_url || 'logo.png')}" alt="Logo" onerror="this.style.display='none'">
      <div>
        <h1 style="white-space: pre-line;">${safe(profile.nama_instansi)}</h1>
        <p>${safe(profile.alamat)}</p>
        <p>Telp. ${safe(profile.telepon)} | Email: ${safe(profile.email)} | Web: ${safe(profile.website)}</p>
      </div>
    </div>
    <div class="letter-line"></div>`;
}


function normalizeSignatureOptions(options = {}) {
  return {
    showStamp: options.showStamp !== false,
    showTtd: options.showTtd !== false
  };
}

function setPreviewSignatureOptions(options = {}) {
  const normalized = normalizeSignatureOptions(options);
  const stamp = el('previewUseStamp');
  const ttd = el('previewUseTtd');
  if (stamp) stamp.checked = normalized.showStamp;
  if (ttd) ttd.checked = normalized.showTtd;
}

function getPreviewSignatureOptions() {
  const stamp = el('previewUseStamp');
  const ttd = el('previewUseTtd');
  return normalizeSignatureOptions({
    showStamp: stamp ? stamp.checked : true,
    showTtd: ttd ? ttd.checked : true
  });
}

function applyPreviewSignatureLayer(preview) {
  if (!preview) return;
  // Jaga lapisan tanda tangan dan stempel tetap di depan tanpa mengubah struktur surat.
  preview.querySelectorAll('.signature-visual-wrap, .signature-stamp-img, .signature-image-wrap, .signature-image-wrap img, .ttd-img').forEach((node) => {
    node.style.visibility = 'visible';
    node.style.opacity = '1';
    if (node.classList?.contains('signature-stamp-img')) {
      node.style.zIndex = '30';
    } else if (node.classList?.contains('ttd-img') || node.closest?.('.signature-image-wrap')) {
      node.style.zIndex = '31';
    }
  });
}

function renderActivePreviewDocument() {
  const preview = el('previewContent');
  if (!preview || !lastPreviewDocument) return;
  preview.innerHTML = buildDocumentHTML(lastPreviewDocument, getPreviewSignatureOptions());
  applyPreviewSignatureLayer(preview);
  lastPreviewElement = preview.querySelector('.pdf-page');
}

function refreshPreviewSignatureOptions() {
  renderActivePreviewDocument();
}


function splitTembusanLines(value) {
  const raw = String(value || '').replace(/\r/g, '\n').trim();
  if (!raw) return [];

  // Mendukung input tembusan per baris atau satu baris seperti:
  // 1. Korwil 2. Ketua K3S 3. Arsip
  const normalized = raw
    .replace(/\s+(?=\d+[\.)]\s+)/g, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+[\.)]\s*/, '').trim())
    .filter(Boolean);

  return normalized;
}

function tembusanListHtml(value) {
  const lines = splitTembusanLines(value);
  if (!lines.length) return '';
  return lines.map((line, index) => `<span class="tembusan-item">${index + 1}. ${safe(line)}</span>`).join('<br>');
}

function signature(profile, row = {}, options = {}) {
  const signatureOptions = normalizeSignatureOptions(options);
  const rowDataTtd = row?.ttd_data_url || '';
  const rowUrlTtd = row?.ttd_url || '';
  const profileTtd = profile?.ttd_url || profile?.ttd_data_url || '';

  // Prioritas TTD:
  // 1. Snapshot TTD pada data surat.
  // 2. TTD profil dari Supabase sebagai fallback.
  // Fallback profil penting agar surat lama yang belum punya kolom TTD tetap menampilkan tanda tangan
  // setelah cookies/site data browser dibersihkan.
  const ttd = signatureOptions.showTtd ? (rowDataTtd || rowUrlTtd || profileTtd || '') : '';
  const ttdName = row?.ttd_name || profile?.ttd_name || 'Tanda tangan';
  const stampHtml = signatureOptions.showStamp
    ? `<img src="${safe(STAMPEL_IMAGE_URL)}" alt="Stempel KKG PJOK" class="signature-stamp-img" crossorigin="anonymous" referrerpolicy="no-referrer">`
    : '';

  return `
    <div class="signature-block" style="position: relative;">
      <p>${safe(profile.kota)}, ${formatDateLong(row.tanggal_surat || todayInput())}</p>
      <p>${safe(profile.jabatan)}</p>

      <div class="signature-visual-wrap" style="position: relative; z-index: 999;">
        ${stampHtml}
        <div class="signature-image-wrap" style="position: relative; z-index: 1000;">
          ${ttd
            ? `<img src="${safe(ttd)}" alt="${safe(ttdName)}" class="ttd-img" crossorigin="anonymous" referrerpolicy="no-referrer" 
                style="display:block; visibility:visible; opacity:1; background:transparent;">`
            : `<div class="signature-space" style="height: 100px;"></div>`
          }
        </div>
      </div>

      <p class="signature-name"><strong>${safe(profile.kepala_nama)}</strong></p>
      <p class="signature-nip">NIP. ${safe(profile.kepala_nip)}</p>


      ${row.disetujui_oleh
        ? `<p class="stamp-space"></p><p><small>Disetujui oleh: ${safe(row.disetujui_oleh)}</small></p>`
        : ''
      }
    </div>

    ${tembusanListHtml(profile.tembusan) ? `
      <div class="tembusan-block">
        <div class="tembusan-title"><strong>Tembusan:</strong></div>
        <div class="tembusan-list">${tembusanListHtml(profile.tembusan)}</div>
      </div>
    ` : ''}
  `;
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


function getFinalDocumentRow(documentRow) {
  const sourceRow = documentRow || {};
  const row = normalizeDocument(sourceRow);

  const rowDataTtd = sourceRow?.ttd_data_url || row.ttd_data_url || '';
  const rowUrlTtd = sourceRow?.ttd_url || row.ttd_url || '';

  return normalizeDocument({
    ...row,

    // Finalisasi snapshot TTD per surat.
    // Tidak ada fallback ke TTD profil agar arsip lama tidak berubah setelah upload TTD baru.
    ttd_data_url: rowDataTtd || '',
    ttd_url: rowUrlTtd || rowDataTtd || '',
    ttd_path: row.ttd_path || '',
    ttd_name: row.ttd_name || 'Tanda tangan'
  });
}
function buildDocumentHTML(documentRow, renderOptions = {}) {
  const profile = cachedProfile || defaultProfile;
  const row = getFinalDocumentRow(documentRow);
  const type = documentTypes[row.jenis] || documentTypes.keluar;
  const signatureOptions = normalizeSignatureOptions(renderOptions);
  if (row.jenis === 'masuk') return buildIncomingTemplate(row, profile, type, signatureOptions);
  if (row.jenis === 'tugas') return buildAssignmentTemplate(row, profile, type, signatureOptions);
  if (row.jenis === 'undangan') return buildInvitationTemplate(row, profile, type, signatureOptions);
  if (row.jenis === 'sk') return buildDecisionTemplate(row, profile, type, signatureOptions);
  return buildOutgoingTemplate(row, profile, type, signatureOptions);
}

function buildOutgoingTemplate(row, profile, type, signatureOptions = DEFAULT_SIGNATURE_RENDER_OPTIONS) {
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
      ${signature(profile, row, signatureOptions)}
    </article>`;
}

function buildIncomingTemplate(row, profile, type, signatureOptions = DEFAULT_SIGNATURE_RENDER_OPTIONS) {
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
      ${signature(profile, row, signatureOptions)}
    </article>`;
}

function buildAssignmentTemplate(row, profile, type, signatureOptions = DEFAULT_SIGNATURE_RENDER_OPTIONS) {
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
      ${signature(profile, row, signatureOptions)}
    </article>`;
}

function buildInvitationTemplate(row, profile, type, signatureOptions = DEFAULT_SIGNATURE_RENDER_OPTIONS) {
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
        <p>${safe(row.alamat_tujuan || '')}</p>
      </div>
      <div class="doc-one-enter-gap"></div>
      <div class="body-text">
        <p>Dengan hormat,</p>
        <p>Sehubungan dengan kegiatan <strong>${safe(row.penerima || row.acara)}</strong>, kami mengundang Bapak/Ibu untuk hadir pada:</p>
        <div class="doc-one-enter-gap"></div>
        ${buildActivityMeta(row)}
        <div class="doc-one-enter-gap"></div>
        ${paragraphText(row.isi_surat)}
        <p>Demikian undangan ini disampaikan. Atas perhatian dan kehadirannya, kami ucapkan terima kasih.</p>
      </div>
      ${signature(profile, row, signatureOptions)}
    </article>`;
}

function buildDecisionTemplate(row, profile, type, signatureOptions = DEFAULT_SIGNATURE_RENDER_OPTIONS) {
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
      ${signature(profile, row, signatureOptions)}
    </article>`;
}

function openPreview(row) {
  lastPreviewDocument = getFinalDocumentRow(row);
  setPreviewSignatureOptions({ showStamp: true, showTtd: true });
  renderActivePreviewDocument();

  const modal = el('previewModal');
  if (modal) {
    // FINAL: preview harus selalu berada di atas modal edit.
    document.body.appendChild(modal);
    modal.hidden = false;
    modal.style.zIndex = '12000';
  }

  const editModal = el('editModal');
  if (editModal) editModal.style.zIndex = '9000';
}

function closePreview() {
  if (el('previewModal')) el('previewModal').hidden = true;
  if (el('previewContent')) el('previewContent').innerHTML = '';
  lastPreviewElement = null;
  lastPreviewDocument = null;
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function printPreview() {
  if (!lastPreviewDocument) return showToast('Tidak ada dokumen untuk dicetak.', 'error');
  renderActivePreviewDocument();
  if (!lastPreviewElement) return showToast('Tidak ada dokumen untuk dicetak.', 'error');

  const previewModal = el('previewModal');
  if (previewModal) previewModal.hidden = false;

  // iPhone/iPad sering tertahan di tab kosong jika cetak memakai window.open().
  // Karena itu cetak langsung dari halaman preview yang sedang aktif.
  document.body.classList.add('printing-preview');

  const cleanupPrintMode = () => {
    document.body.classList.remove('printing-preview');
    window.removeEventListener('afterprint', cleanupPrintMode);
  };

  window.addEventListener('afterprint', cleanupPrintMode, { once: true });

  setTimeout(() => {
    try {
      window.focus();
      window.print();
    } catch (error) {
      console.warn('Cetak gagal:', error);
      showToast('Cetak gagal dibuka. Coba gunakan Download PDF.', 'error');
      cleanupPrintMode();
    }
  }, isIOSDevice() ? 350 : 120);

  // Fallback untuk iOS karena event afterprint kadang tidak selalu terpanggil.
  setTimeout(cleanupPrintMode, 8000);
}


function calculateScale(el) {
  const A4_WIDTH = 794;
  const A4_HEIGHT = 1123;

  const widthScale = A4_WIDTH / el.scrollWidth;
  const heightScale = A4_HEIGHT / el.scrollHeight;

  return Math.min(widthScale, heightScale, 2);
}


// PERBAIKAN: Fungsi trigger download dari preview modal agar tidak mengambil element yang sedang di-hidden
async function downloadPreviewPdf(evt = null) {
  if (!lastPreviewDocument) {
    showToast('Tidak ada data dokumen yang aktif untuk diunduh.', 'error');
    return;
  }

  const fallbackEvent = typeof event !== 'undefined' ? event : null;
  const btn = evt?.currentTarget || evt?.target || fallbackEvent?.currentTarget || fallbackEvent?.target || null;
  const originalText = setButtonBusy(btn, 'Memproses PDF...');

  try {
    renderActivePreviewDocument();
    // Download dari menu Preview harus menangkap elemen preview yang sedang terlihat.
    // Dengan cara ini posisi dan ukuran stempel sama persis seperti tampilan Review.
    const pdfResult = await createPdfFromDocument(lastPreviewDocument, {
      download: true,
      upload: false,
      sourceElement: lastPreviewElement
    });
    if (pdfResult) {
      showToast('PDF berhasil diunduh.');
    } else {
      showToast('Gagal mengunduh PDF. Periksa library html2canvas dan jsPDF.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Gagal mengunduh PDF.', 'error');
  } finally {
    restoreButton(btn, originalText);
  }
}


async function downloadPreviewWord(evt = null) {
  if (!lastPreviewDocument) {
    showToast('Tidak ada data dokumen yang aktif untuk diunduh.', 'error');
    return;
  }

  const fallbackEvent = typeof event !== 'undefined' ? event : null;
  const btn = evt?.currentTarget || evt?.target || fallbackEvent?.currentTarget || fallbackEvent?.target || null;
  const originalText = setButtonBusy(btn, 'Memproses Word...');

  try {
    renderActivePreviewDocument();
    const wordResult = await createWordFromDocument(lastPreviewDocument, {
      download: true,
      sourceElement: lastPreviewElement
    });
    if (wordResult) {
      showToast('Word berhasil diunduh.');
    } else {
      showToast('Gagal mengunduh Word.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Gagal mengunduh Word.', 'error');
  } finally {
    restoreButton(btn, originalText);
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame ? window.requestAnimationFrame(resolve) : window.setTimeout(resolve, 16));
}

function setButtonBusy(button, busyText = 'Memproses...') {
  if (!button) return null;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  return originalText;
}

function restoreButton(button, originalText) {
  if (!button) return;
  button.disabled = false;
  if (originalText !== null && originalText !== undefined) button.textContent = originalText;
}

async function waitForImages(container, timeoutMs = PDF_IMAGE_TIMEOUT_MS) {
  const images = Array.from(container.querySelectorAll('img'));
  if (!images.length) return;

  const imageLoad = Promise.all(images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      image.onload = resolve;
      image.onerror = resolve;
    });
  }));

  await Promise.race([imageLoad, wait(timeoutMs)]);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca gambar.'));
    reader.readAsDataURL(blob);
  });
}

async function inlineImageForPdf(image) {
  const rawSrc = image?.getAttribute?.('src') || '';
  if (!rawSrc || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:')) return;

  try {
    const absoluteUrl = new URL(rawSrc, window.location.href).href;
    const response = await fetch(absoluteUrl, {
      mode: 'cors',
      cache: 'reload',
      credentials: 'omit'
    });

    if (!response.ok) throw new Error(`Gambar gagal diambil: ${response.status}`);
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);

    image.setAttribute('src', dataUrl);
    image.src = dataUrl;
    image.crossOrigin = 'anonymous';
    image.style.visibility = 'visible';
    image.style.opacity = '1';
    image.style.display = 'block';
  } catch (error) {
    console.warn('Gambar tidak bisa di-inline untuk PDF:', rawSrc, error);
  }
}

async function inlineImagesForPdf(container) {
  const images = Array.from(container.querySelectorAll('img'));

  // TTD diproses lebih dulu karena ini yang wajib masuk render PDF.
  images.sort((a, b) => {
    const aTtd = a.classList.contains('ttd-img') || a.classList.contains('signature-stamp-img') || a.closest('.signature-image-wrap') || a.closest('.signature-visual-wrap');
    const bTtd = b.classList.contains('ttd-img') || b.classList.contains('signature-stamp-img') || b.closest('.signature-image-wrap') || b.closest('.signature-visual-wrap');
    return Number(bTtd) - Number(aTtd);
  });

  await Promise.all(images.map((image) => inlineImageForPdf(image)));
  await waitForImages(container, PDF_IMAGE_TIMEOUT_MS);
}

function normalizeSignatureImages(container) {
  const maxWidth = 280;
  const maxHeight = 95;

  container.querySelectorAll('.signature-image-wrap img, img.ttd-img').forEach((img) => {
    const naturalWidth = img.naturalWidth || 0;
    const naturalHeight = img.naturalHeight || 0;
    let renderWidth = maxWidth;
    let renderHeight = '';

    // Jaga rasio asli gambar TTD/stempel. Jangan paksa tinggi tetap,
    // karena itu yang membuat stempel terlihat gepeng dan bisa terpotong.
    if (naturalWidth > 0 && naturalHeight > 0) {
      const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1.25);
      renderWidth = Math.round(naturalWidth * scale);
      renderHeight = Math.round(naturalHeight * scale);
    }

    img.removeAttribute('width');
    img.removeAttribute('height');
    img.style.display = 'block';
    img.style.width = `${renderWidth}px`;
    img.style.maxWidth = `${maxWidth}px`;
    img.style.height = renderHeight ? `${renderHeight}px` : 'auto';
    img.style.maxHeight = `${maxHeight}px`;
    img.style.objectFit = 'contain';
    img.style.objectPosition = 'center';
    img.style.transform = 'none';
    img.style.margin = '0 auto';
    img.style.visibility = 'visible';
    img.style.opacity = '1';
    img.style.background = 'transparent';
  });
}


function wordDocumentStyles() {
  return `
    @page WordSection1 { size: 21cm 29.7cm; margin: 1.4cm 2cm 1cm 2cm; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: "Times New Roman", serif; font-size: 11pt; color: #000; }
    .WordSection1 { page: WordSection1; width: 100%; margin: 0; padding: 0; }
    .pdf-page { width: 100%; min-height: 26.3cm; box-sizing: border-box; background: #fff; margin: 0; padding: 0; box-shadow: none; overflow: visible; }
    p { margin: 0; mso-margin-top-alt: 0; mso-margin-bottom-alt: 0; }

    /* Word tidak stabil membaca display:flex, grid, dan absolute pada kop surat.
       Karena itu kop surat Word memakai tabel 3 kolom: logo kiri, teks tengah, ruang kanan. */
    .word-letterhead-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0 0 3px 0; }
    .word-letterhead-table td { border: none; vertical-align: middle; padding: 0; }
    .word-logo-cell { width: 2.25cm; text-align: left; }
    .word-spacer-cell { width: 2.25cm; }
    .word-letterhead-logo { width: 1.95cm; height: 2.24cm; max-width: 1.95cm; max-height: 2.24cm; }
    .word-letterhead-title { text-align: center; }
    .word-letterhead-title h1 { font-family: "Times New Roman", serif; font-size: 12.5pt; line-height: 1.35; margin: 0 0 4px 0; font-weight: bold; text-transform: uppercase; text-align: center; }
    .word-letterhead-title p { font-family: "Times New Roman", serif; font-size: 8.5pt; line-height: 1.25; margin: 1px 0; font-style: italic; text-align: center; white-space: nowrap; }
    .word-letter-line { border: none; border-top: 3px solid #000; height: 0; margin: 8px 0 12px 0; }

    .letterhead { width: 100%; }
    .letterhead img { width: 85px; height: 85px; max-width: 85px; max-height: 85px; }
    .letterhead h1 { font-size: 12.5pt; margin: 0 0 4px; font-weight: bold; text-transform: uppercase; line-height: 1.35; text-align: center; }
    .letterhead p { font-size: 8.5pt; margin: 1px 0; font-style: italic; text-align: center; }
    .letter-line { border: none; border-top: 3px solid #000; height: 0; margin: 8px 0 12px; }

    .template-title, .center-text, .small-title { text-align: center; }
    .template-title { font-size: 13pt; font-weight: bold; text-decoration: underline; margin: 10px 0 3px; }
    .small-title { font-size: 11pt; margin: 3px 0; }
    .letter-meta-grid { width: 100%; margin: 8px 0 10px; }
    .letter-meta-grid > div { width: 100%; }
    table.meta-table { border-collapse: collapse; width: 10cm; margin: 0 0 8px 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt; table-layout: fixed; }
    table.meta-table td { font-size: 11pt; vertical-align: top; padding: 0; line-height: 1.18; mso-padding-alt: 0cm 0cm 0cm 0cm; }
    table.meta-table td:first-child { width: 1.70cm; white-space: nowrap; }
    table.meta-table td:nth-child(2) { width: .35cm; text-align: center; }
    table.meta-table td:nth-child(3) { width: 7.95cm; }
    .recipient { margin: 8px 0 8px; }
    .recipient p { margin: 0 0 3px 0; line-height: 1.2; }
    .body-text { text-align: justify; margin-top: 8px; }
    .doc-one-enter-gap { height: 13.2pt; line-height: 13.2pt; font-size: 1pt; margin: 0; padding: 0; mso-line-height-rule: exactly; }
    .body-text p, .body-box p, .disposition-box p { margin: 0 0 6px; text-align: justify; line-height: 1.35; }
    .body-box, .disposition-box { border: 1px solid #000; padding: 8px 10px; margin: 10px 0; }
    .body-box h3, .disposition-box h3 { margin: 0 0 6px; font-size: 11pt; }

    .word-signature-row { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    .word-signature-row td { border: none; padding: 0; vertical-align: top; }
    .word-signature-left { width: 55%; }
    .word-signature-cell { width: 45%; text-align: center; font-family: "Times New Roman", serif; font-size: 11pt; line-height: 1.15; padding-top: 0; }
    .word-signature-cell p { margin: 2px 0; line-height: 1.15; text-align: center; }
    .signature-block { width: 300px; text-align: center; page-break-inside: avoid; overflow: visible; position: relative; }
    .signature-block p { margin: 2px 0; line-height: 1.15; position: relative; z-index: 5; text-align: center; }
    .signature-visual-wrap { width: 300px; height: 132px; min-height: 132px; margin: 0 auto -54px auto; position: relative; overflow: visible; text-align: center; }
    .word-signature-composite { width: 300px; height: 132px; max-width: 300px; max-height: 132px; display: block; margin: -2px auto 0 auto; border: 0; }
    .word-signature-blank { height: 132px; line-height: 132px; font-size: 1pt; }
    .signature-stamp-img { position: absolute; left: 6px; top: -2px; width: 138px; height: 130px; max-width: 138px; max-height: 130px; object-fit: contain; opacity: .88; z-index: 1; }
    .signature-image-wrap { height: 98px; min-height: 98px; margin: 0 auto -14px auto; display: block; text-align: center; overflow: visible; position: relative; z-index: 4; }
    .signature-image-wrap img, .ttd-img { width: auto; max-width: 280px; height: auto; max-height: 92px; display: block; margin: 0 auto; object-fit: contain; transform: none; }
    .signature-name { font-weight: bold; text-decoration: underline; margin-top: -18px; margin-bottom: 0; white-space: nowrap; }
    .signature-nip { margin-top: 0; margin-bottom: 0; white-space: nowrap; }
    .tembusan-block { clear: both; margin-top: 18px; text-align: left; font-size: 11pt; line-height: 1.2; page-break-inside: avoid; }
    .tembusan-title { margin: 0; padding: 0; line-height: 1.2; }
    .tembusan-list { margin: 0; padding: 0; line-height: 1.2; }
    .tembusan-item { margin: 0; padding: 0; line-height: 1.2; }
  `;
}

function normalizeWordHeadingBreaks(container) {
  container.querySelectorAll('.letterhead h1, .word-letterhead-title h1').forEach((heading) => {
    const text = heading.textContent || '';
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) return;
    heading.innerHTML = '';
    lines.forEach((line, index) => {
      if (index) heading.appendChild(document.createElement('br'));
      heading.appendChild(document.createTextNode(line));
    });
  });
}

function convertLetterheadForWord(clone) {
  clone.querySelectorAll('.letterhead').forEach((letterhead) => {
    const logo = letterhead.querySelector('img');
    const textBlock = letterhead.querySelector('div');
    const table = document.createElement('table');
    table.className = 'word-letterhead-table';
    table.setAttribute('cellspacing', '0');
    table.setAttribute('cellpadding', '0');
    table.setAttribute('border', '0');
    table.setAttribute('style', 'width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 3px 0;');

    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');

    const logoCell = document.createElement('td');
    logoCell.className = 'word-logo-cell';
    logoCell.setAttribute('style', 'width:2.25cm;text-align:left;vertical-align:middle;padding:0;border:none;');

    if (logo) {
      logo.className = `${logo.className || ''} word-letterhead-logo`.trim();
      logo.setAttribute('width', String(WORD_LOGO_WIDTH_PX));
      logo.setAttribute('height', String(WORD_LOGO_HEIGHT_PX));
      logo.setAttribute('style', `width:${WORD_LOGO_WIDTH_CM}cm;height:${WORD_LOGO_HEIGHT_CM}cm;max-width:${WORD_LOGO_WIDTH_CM}cm;max-height:${WORD_LOGO_HEIGHT_CM}cm;border:0;display:block;object-fit:contain;`);
      logoCell.appendChild(logo);
    }

    const titleCell = document.createElement('td');
    titleCell.className = 'word-letterhead-title';
    titleCell.setAttribute('style', 'text-align:center;vertical-align:middle;padding:0;border:none;');
    if (textBlock) {
      textBlock.setAttribute('style', 'width:100%;text-align:center;margin:0;padding:0;');
      textBlock.querySelectorAll('h1').forEach((h1) => {
        h1.setAttribute('style', 'font-family:"Times New Roman",serif;font-size:12.5pt;line-height:1.35;margin:0 0 4px 0;font-weight:bold;text-transform:uppercase;text-align:center;');
      });
      textBlock.querySelectorAll('p').forEach((p) => {
        p.setAttribute('style', 'font-family:"Times New Roman",serif;font-size:8.5pt;line-height:1.25;margin:1px 0;font-style:italic;text-align:center;white-space:nowrap;');
      });
      titleCell.appendChild(textBlock);
    }

    const spacerCell = document.createElement('td');
    spacerCell.className = 'word-spacer-cell';
    spacerCell.setAttribute('style', 'width:2.25cm;vertical-align:middle;padding:0;border:none;');
    spacerCell.innerHTML = '&nbsp;';

    tr.appendChild(logoCell);
    tr.appendChild(titleCell);
    tr.appendChild(spacerCell);
    tbody.appendChild(tr);
    table.appendChild(tbody);
    letterhead.replaceWith(table);
  });

  clone.querySelectorAll('.letter-line').forEach((line) => {
    const hr = document.createElement('hr');
    hr.className = 'word-letter-line';
    hr.setAttribute('style', 'border:none;border-top:3px solid #000;height:0;margin:8px 0 12px 0;');
    line.replaceWith(hr);
  });

  normalizeWordHeadingBreaks(clone);
}


function drawImageContainToCanvas(ctx, img, x, y, boxWidth, boxHeight) {
  const naturalWidth = img.naturalWidth || img.width || boxWidth;
  const naturalHeight = img.naturalHeight || img.height || boxHeight;
  const scale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
  const renderWidth = Math.max(1, Math.round(naturalWidth * scale));
  const renderHeight = Math.max(1, Math.round(naturalHeight * scale));
  const drawX = Math.round(x + (boxWidth - renderWidth) / 2);
  const drawY = Math.round(y + (boxHeight - renderHeight) / 2);
  ctx.drawImage(img, drawX, drawY, renderWidth, renderHeight);
}

function getImageVisibleBounds(img) {
  const width = img.naturalWidth || img.width || 0;
  const height = img.naturalHeight || img.height || 0;
  if (!width || !height) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = ((y * width) + x) * 4;
        const alpha = data[index + 3];
        if (alpha > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) return null;
    const pad = 2;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    return { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
  } catch (error) {
    return null;
  }
}

function drawImageContainToCanvasCropped(ctx, img, x, y, boxWidth, boxHeight) {
  const bounds = getImageVisibleBounds(img);
  if (!bounds) {
    drawImageContainToCanvas(ctx, img, x, y, boxWidth, boxHeight);
    return;
  }

  const scale = Math.min(boxWidth / bounds.sw, boxHeight / bounds.sh);
  const renderWidth = Math.max(1, Math.round(bounds.sw * scale));
  const renderHeight = Math.max(1, Math.round(bounds.sh * scale));
  const drawX = Math.round(x + (boxWidth - renderWidth) / 2);
  const drawY = Math.round(y + (boxHeight - renderHeight) / 2);
  ctx.drawImage(img, bounds.sx, bounds.sy, bounds.sw, bounds.sh, drawX, drawY, renderWidth, renderHeight);
}

function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function convertSignatureVisualsForWord(root) {
  if (!root) return;

  const visualWraps = Array.from(root.querySelectorAll('.signature-visual-wrap'));
  for (const wrap of visualWraps) {
    const stamp = wrap.querySelector('.signature-stamp-img');
    const ttd = wrap.querySelector('.ttd-img, .signature-image-wrap img');
    const stampSrc = stamp?.getAttribute('src') || '';
    const ttdSrc = ttd?.getAttribute('src') || '';

    if (!stampSrc && !ttdSrc) {
      wrap.innerHTML = '<div class="word-signature-blank">&nbsp;</div>';
      wrap.setAttribute('style', 'width:300px;height:132px;min-height:132px;margin:0 auto -54px auto;text-align:center;overflow:visible;');
      continue;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 264;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const [stampImg, ttdImg] = await Promise.all([
        loadCanvasImage(stampSrc).catch(() => null),
        loadCanvasImage(ttdSrc).catch(() => null)
      ]);

      if (stampImg) {
        ctx.save();
        ctx.globalAlpha = 0.88;
        // Word memakai gambar gabungan supaya posisinya stabil.
        // Stempel dan TTD dibuat saling menimpa seperti tampilan Review/PDF.
        drawImageContainToCanvasCropped(ctx, stampImg, 12, 0, 276, 260);
        ctx.restore();
      }

      if (ttdImg) {
        // Crop margin transparan TTD, lalu geser ke kiri agar tidak berjauhan dari stempel.
        drawImageContainToCanvasCropped(ctx, ttdImg, 20, 10, 560, 184);
      }

      const img = document.createElement('img');
      img.className = 'word-signature-composite';
      img.alt = 'Stempel dan tanda tangan';
      img.src = canvas.toDataURL('image/png');
      img.setAttribute('width', '300');
      img.setAttribute('height', '132');
      img.setAttribute('style', 'display:block;width:300px;height:132px;max-width:300px;max-height:132px;margin:-2px auto 0 auto;border:0;background:transparent;');

      wrap.innerHTML = '';
      wrap.appendChild(img);
      wrap.setAttribute('style', 'width:300px;height:132px;min-height:132px;margin:0 auto -54px auto;text-align:center;overflow:visible;');
    } catch (error) {
      console.warn('Gagal mengubah visual tanda tangan untuk Word:', error);
    }
  }
}

function convertSignatureBlocksForWord(clone) {
  clone.querySelectorAll('.signature-block').forEach((block) => {
    const table = document.createElement('table');
    table.className = 'word-signature-row';
    table.setAttribute('width', '100%');
    table.setAttribute('cellspacing', '0');
    table.setAttribute('cellpadding', '0');
    table.setAttribute('border', '0');
    table.setAttribute('style', 'width:100%;border-collapse:collapse;table-layout:fixed;margin:0;mso-table-lspace:0pt;mso-table-rspace:0pt;');

    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');

    const left = document.createElement('td');
    left.className = 'word-signature-left';
    left.setAttribute('width', '55%');
    left.setAttribute('style', 'width:55%;border:none;padding:0;vertical-align:top;');
    left.innerHTML = '&nbsp;';

    const right = document.createElement('td');
    right.className = 'word-signature-cell';
    right.setAttribute('width', '45%');
    right.setAttribute('style', 'width:45%;border:none;padding:0;vertical-align:top;text-align:center;font-family:"Times New Roman",serif;font-size:11pt;line-height:1.15;');

    block.removeAttribute('style');
    block.setAttribute('style', 'width:300px;text-align:center;page-break-inside:avoid;overflow:visible;position:relative;margin:0;padding:0;');
    block.querySelectorAll('p').forEach((p) => {
      p.setAttribute('style', 'margin:0 0 2px 0;line-height:1.15;text-align:center;');
    });

    right.appendChild(block.cloneNode(true));
    tr.appendChild(left);
    tr.appendChild(right);
    tbody.appendChild(tr);
    table.appendChild(tbody);

    // Spacer 3 baris khusus Word agar teks tempat/tanggal tidak mepet ke kalimat penutup.
    const spacer = document.createElement('p');
    spacer.className = 'word-signature-spacer';
    spacer.innerHTML = '&nbsp;';
    spacer.setAttribute('style', 'margin:0;padding:0;height:24pt;line-height:24pt;font-size:1pt;mso-line-height-rule:exactly;');
    block.replaceWith(spacer, table);
  });
}

function normalizeWordParagraphs(clone) {
  clone.querySelectorAll('.recipient p').forEach((node) => {
    node.setAttribute('style', 'margin:0 0 3px 0;line-height:1.2;');
  });

  clone.querySelectorAll('.body-text').forEach((node) => {
    node.setAttribute('style', 'text-align:justify;margin-top:8px;');
  });

  clone.querySelectorAll('.doc-one-enter-gap').forEach((node) => {
    node.innerHTML = '&nbsp;';
    node.setAttribute('style', 'height:13.2pt;line-height:13.2pt;font-size:1pt;margin:0;padding:0;mso-line-height-rule:exactly;');
  });

  clone.querySelectorAll('.body-text p, .body-box p, .disposition-box p').forEach((node) => {
    node.setAttribute('style', 'margin:0 0 6px 0;text-align:justify;line-height:1.35;');
  });

  clone.querySelectorAll('.tembusan-block').forEach((node) => {
    node.setAttribute('style', 'clear:both;margin-top:16px;text-align:left;font-size:11pt;line-height:1.2;page-break-inside:avoid;');
  });

  clone.querySelectorAll('.tembusan-title').forEach((node) => {
    node.setAttribute('style', 'margin:0;padding:0;line-height:1.2;text-align:left;');
  });

  clone.querySelectorAll('.tembusan-list').forEach((node) => {
    node.setAttribute('style', 'margin:0;padding:0;line-height:1.2;text-align:left;');
  });

  clone.querySelectorAll('.tembusan-item').forEach((node) => {
    node.setAttribute('style', 'margin:0;padding:0;line-height:1.2;text-align:left;');
  });
}

async function prepareWordHtml(root) {
  const clone = root.cloneNode(true);

  clone.querySelectorAll('[contenteditable], [crossorigin], [referrerpolicy]').forEach((node) => {
    node.removeAttribute('contenteditable');
    node.removeAttribute('crossorigin');
    node.removeAttribute('referrerpolicy');
  });

  convertLetterheadForWord(clone);
  await convertSignatureVisualsForWord(clone);

  clone.querySelectorAll('.signature-block').forEach((node) => {
    node.setAttribute('style', 'width:300px;margin-left:auto;margin-right:0;margin-top:0;text-align:center;page-break-inside:avoid;overflow:visible;position:relative;');
  });

  clone.querySelectorAll('.signature-visual-wrap').forEach((node) => {
    node.setAttribute('style', 'width:300px;height:132px;min-height:132px;margin:0 auto -54px auto;position:relative;overflow:visible;');
  });

  clone.querySelectorAll('.signature-stamp-img').forEach((img) => {
    img.removeAttribute('style');
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.setAttribute('style', 'position:absolute;left:6px;top:-2px;width:138px;height:130px;max-width:138px;max-height:130px;object-fit:contain;opacity:.88;z-index:1;background:transparent;');
  });

  clone.querySelectorAll('.signature-image-wrap').forEach((node) => {
    node.setAttribute('style', 'height:98px;min-height:98px;margin:0 auto -14px auto;text-align:center;overflow:visible;position:relative;z-index:4;left:0;');
  });

  clone.querySelectorAll('.signature-image-wrap img, img.ttd-img').forEach((img) => {
    img.removeAttribute('style');
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.setAttribute('style', 'display:block;width:auto;max-width:280px;height:auto;max-height:92px;margin:0 auto;object-fit:contain;transform:none;background:transparent;');
  });

  // KHUSUS WORD: naikkan nama ketua dan NIP pada hasil download Word saja.
  // Tidak mengubah Review/PDF karena yang diubah adalah clone di prepareWordHtml().
  clone.querySelectorAll('.signature-name').forEach((node) => {
    node.setAttribute('style', 'font-weight:bold;text-decoration:underline;margin-top:-18px;margin-bottom:0;white-space:nowrap;');
  });

  clone.querySelectorAll('.signature-nip').forEach((node) => {
    node.setAttribute('style', 'margin-top:0;margin-bottom:0;white-space:nowrap;');
  });

  clone.querySelectorAll('table.meta-table').forEach((table) => {
    // Khusus export Word: tabel Nomor/Lampiran/Sifat/Perihal dibuat fixed-width,
    // bukan full-width, agar titik dua dan isi tidak terdorong jauh ke kanan di Microsoft Word.
    table.setAttribute('cellspacing', '0');
    table.setAttribute('cellpadding', '0');
    table.setAttribute('border', '0');
    table.setAttribute('width', '378');
    table.setAttribute('style', 'border-collapse:collapse;width:10cm;margin:0 0 8px 0;mso-table-lspace:0pt;mso-table-rspace:0pt;table-layout:fixed;');

    let colgroup = table.querySelector('colgroup');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      table.insertBefore(colgroup, table.firstChild);
    }
    colgroup.innerHTML = '<col style="width:1.70cm"><col style="width:.35cm"><col style="width:7.95cm">';

    table.querySelectorAll('td').forEach((td, index) => {
      const col = index % 3;
      td.removeAttribute('style');
      if (col === 0) {
        td.setAttribute('width', '64');
        td.setAttribute('style', 'font-size:11pt;vertical-align:top;padding:0;width:1.70cm;white-space:nowrap;line-height:1.18;mso-padding-alt:0cm 0cm 0cm 0cm;');
      }
      if (col === 1) {
        td.setAttribute('width', '13');
        td.setAttribute('style', 'font-size:11pt;vertical-align:top;padding:0;width:.35cm;text-align:center;line-height:1.18;mso-padding-alt:0cm 0cm 0cm 0cm;');
      }
      if (col === 2) {
        td.setAttribute('width', '301');
        td.setAttribute('style', 'font-size:11pt;vertical-align:top;padding:0;width:7.95cm;line-height:1.18;mso-padding-alt:0cm 0cm 0cm 0cm;');
      }
    });
  });

  clone.querySelectorAll('.body-text p, .body-box p, .disposition-box p').forEach((node) => {
    node.setAttribute('style', 'margin:0 0 6px 0;text-align:justify;line-height:1.35;');
  });

  convertSignatureBlocksForWord(clone);
  normalizeWordParagraphs(clone);

  return clone.outerHTML;
}

function wordSafeHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\scontenteditable="[^"]*"/gi, '');
}


async function canvasFromA4Element(sourceElement, useLiveClone = false) {
  if (!sourceElement) return null;

  const workerDiv = document.createElement('div');
  workerDiv.style.position = 'absolute';
  workerDiv.style.top = '-9999px';
  workerDiv.style.left = '-9999px';
  workerDiv.style.width = '210mm';
  workerDiv.style.height = '297mm';
  workerDiv.style.background = '#ffffff';
  workerDiv.style.color = '#000000';
  workerDiv.style.overflow = 'hidden';

  const captureTarget = useLiveClone ? sourceElement.cloneNode(true) : sourceElement;
  captureTarget.classList.add(useLiveClone ? 'pdf-live-capture' : 'pdf-export-page');
  captureTarget.style.width = '210mm';
  captureTarget.style.height = '297mm';
  captureTarget.style.minHeight = '297mm';
  captureTarget.style.maxHeight = '297mm';
  captureTarget.style.boxSizing = 'border-box';
  captureTarget.style.boxShadow = 'none';
  captureTarget.style.margin = '0';
  captureTarget.style.overflow = 'hidden';

  if (useLiveClone) {
    workerDiv.appendChild(captureTarget);
    document.body.appendChild(workerDiv);
  } else {
    // Elemen sudah berada dalam workerDiv pemanggil. Tambahkan workerDiv hanya bila belum terpasang.
    if (!captureTarget.isConnected) {
      workerDiv.appendChild(captureTarget);
      document.body.appendChild(workerDiv);
    }
  }

  try {
    await inlineImagesForPdf(captureTarget);
    normalizeSignatureImages(captureTarget);
    await nextFrame();
    await wait(PDF_RENDER_DELAY_MS);

    const targetWidth = captureTarget.offsetWidth || 794;
    const targetHeight = Math.round(targetWidth * 297 / 210);

    return await html2canvas(captureTarget, {
      scale: WORD_RENDER_SCALE,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      width: targetWidth,
      height: targetHeight,
      windowWidth: targetWidth,
      windowHeight: targetHeight,
      scrollX: 0,
      scrollY: 0,
      imageTimeout: PDF_IMAGE_TIMEOUT_MS
    });
  } finally {
    if (useLiveClone && workerDiv.parentNode) workerDiv.remove();
  }
}

function createWordBlobFromCanvas(canvas, documentData) {
  const imgData = canvas.toDataURL('image/png');
  const title = safe(documentData.nomor_surat || 'Dokumen Word');
  const fullHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
  <style>
    @page WordSection1 { size: 21cm 29.7cm; margin: 0.25cm 0.25cm 0.25cm 0.25cm; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    .WordSection1 { margin: 0; padding: 0; width: 20.5cm; height: 29.2cm; overflow: hidden; text-align: center; }
    img.preview-word-page { display: block; width: 20.3cm; height: auto; max-height: 29.1cm; margin: 0 auto; padding: 0; border: 0; }
  </style>
</head>
<body><div class="WordSection1"><img class="preview-word-page" src="${imgData}" alt="${title}"></div></body>
</html>`;

  const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword;charset=utf-8' });
  const fileName = `${slugify(documentData.nomor_surat || documentData.perihal || 'surat')}.doc`;
  return { fileName, wordBlob: blob };
}

async function createVisualWordFromElement(sourceElement, documentData, wordOptions) {
  const canvas = await canvasFromA4Element(sourceElement, true);
  if (!canvas) return null;
  const result = createWordBlobFromCanvas(canvas, documentData);
  if (wordOptions.download) downloadBlob(result.wordBlob, result.fileName);
  return result;
}

async function createVisualWordFromDocument(documentData, wordOptions) {
  const workerDiv = document.createElement('div');
  workerDiv.style.position = 'absolute';
  workerDiv.style.top = '-9999px';
  workerDiv.style.left = '-9999px';
  workerDiv.style.width = '210mm';
  workerDiv.style.height = '297mm';
  workerDiv.style.background = '#ffffff';
  workerDiv.style.color = '#000000';
  workerDiv.style.overflow = 'hidden';
  workerDiv.innerHTML = buildDocumentHTML(documentData, wordOptions);
  document.body.appendChild(workerDiv);

  try {
    const captureTarget = workerDiv.querySelector('.pdf-page') || workerDiv;
    const canvas = await canvasFromA4Element(captureTarget, false);
    if (!canvas) return null;
    const result = createWordBlobFromCanvas(canvas, documentData);
    if (wordOptions.download) downloadBlob(result.wordBlob, result.fileName);
    return result;
  } finally {
    if (workerDiv.parentNode) workerDiv.remove();
  }
}

async function createWordFromDocument(data, options = { download: true }) {
  const wordOptions = { download: true, ...options };
  const documentData = getFinalDocumentRow(data);

  // FINAL: Word dibuat sebagai HTML teks, bukan hasil screenshot/canvas.
  // Dengan cara ini isi surat tetap bisa diedit di Word dan tidak terpotong ke kanan.
  const workerDiv = document.createElement('div');
  workerDiv.style.position = 'absolute';
  workerDiv.style.top = '-9999px';
  workerDiv.style.left = '-9999px';
  workerDiv.style.width = '210mm';
  workerDiv.style.background = '#ffffff';
  workerDiv.style.color = '#000000';

  if (wordOptions.sourceElement && wordOptions.sourceElement.isConnected) {
    workerDiv.appendChild(wordOptions.sourceElement.cloneNode(true));
  } else {
    workerDiv.innerHTML = buildDocumentHTML(documentData, wordOptions);
  }

  document.body.appendChild(workerDiv);

  try {
    const wordTarget = workerDiv.querySelector('.pdf-page') || workerDiv;

    // Hilangkan style khusus capture agar Word tidak membaca ukuran screenshot.
    wordTarget.classList.remove('pdf-live-capture', 'pdf-export-page');
    wordTarget.style.width = '';
    wordTarget.style.height = '';
    wordTarget.style.minHeight = '';
    wordTarget.style.maxHeight = '';
    wordTarget.style.overflow = '';
    wordTarget.style.boxShadow = '';
    wordTarget.style.margin = '';

    // Inline logo, stempel permanen, dan TTD agar tetap muncul saat file dibuka di Word.
    await inlineImagesForPdf(wordTarget);
    await waitForImages(wordTarget, PDF_IMAGE_TIMEOUT_MS);
    await nextFrame();

    const htmlContent = wordSafeHtml(await prepareWordHtml(wordTarget));
    const fullHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${safe(documentData.nomor_surat || 'Dokumen Word')}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
  <style>${wordDocumentStyles()}</style>
</head>
<body><div class="WordSection1">${htmlContent}</div></body>
</html>`;

    const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword;charset=utf-8' });
    const fileName = `${slugify(documentData.nomor_surat || documentData.perihal || 'surat')}.doc`;

    if (wordOptions.download) {
      downloadBlob(blob, fileName);
    }

    return { fileName, wordBlob: blob };
  } catch (error) {
    console.error('Gagal membuat Word:', error);
    showToast('Gagal memproses file Word.', 'error');
    return null;
  } finally {
    if (workerDiv.parentNode) workerDiv.remove();
  }
}

function hasPdfLibraries() {
  return typeof html2canvas === 'function'
    && typeof window !== 'undefined'
    && window.jspdf
    && typeof window.jspdf.jsPDF === 'function';
}


async function finalizePdfFromCanvas(canvas, documentData, pdfOptions) {
  const imgData = canvas.toDataURL('image/png');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Anti gepeng: jangan paksa canvas yang rasionya berubah untuk memenuhi A4.
  // Gambar selalu dimasukkan dengan rasio asli, lalu dipusatkan di halaman A4.
  const pageWidth = 210;
  const pageHeight = 297;
  const canvasRatio = canvas.width / canvas.height;
  const pageRatio = pageWidth / pageHeight;
  let renderWidth = pageWidth;
  let renderHeight = pageHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (Math.abs(canvasRatio - pageRatio) > 0.003) {
    if (canvasRatio > pageRatio) {
      renderWidth = pageWidth;
      renderHeight = pageWidth / canvasRatio;
      offsetY = (pageHeight - renderHeight) / 2;
    } else {
      renderHeight = pageHeight;
      renderWidth = pageHeight * canvasRatio;
      offsetX = (pageWidth - renderWidth) / 2;
    }
  }

  pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderWidth, renderHeight, undefined, 'FAST');

  const fileName = `${slugify(documentData.nomor_surat || 'surat')}.pdf`;
  const pdfBlob = pdf.output('blob');

  if (pdfOptions.upload) {
    await uploadPdf(documentData, pdfBlob, fileName);
  }

  if (pdfOptions.download) {
    downloadBlob(pdfBlob, fileName);
  }

  return { fileName, pdfBlob };
}

async function createPdfFromVisiblePreview(sourceElement, documentData, pdfOptions) {
  if (!sourceElement || !sourceElement.isConnected) return null;

  // Anti gepeng: jangan capture elemen modal yang tingginya bisa berubah karena scroll.
  // Clone preview dibuat off-screen dengan ukuran A4 pasti, lalu baru dirender ke PDF.
  const workerDiv = document.createElement('div');
  workerDiv.style.position = 'absolute';
  workerDiv.style.top = '-9999px';
  workerDiv.style.left = '-9999px';
  workerDiv.style.width = '210mm';
  workerDiv.style.height = '297mm';
  workerDiv.style.background = '#ffffff';
  workerDiv.style.color = '#000000';
  workerDiv.style.overflow = 'hidden';

  const captureClone = sourceElement.cloneNode(true);
  captureClone.classList.add('pdf-live-capture');
  captureClone.style.width = '210mm';
  captureClone.style.height = '297mm';
  captureClone.style.minHeight = '297mm';
  captureClone.style.maxHeight = '297mm';
  captureClone.style.boxSizing = 'border-box';
  captureClone.style.boxShadow = 'none';
  captureClone.style.margin = '0';
  captureClone.style.overflow = 'hidden';

  workerDiv.appendChild(captureClone);
  document.body.appendChild(workerDiv);

  try {
    await inlineImagesForPdf(captureClone);
    normalizeSignatureImages(captureClone);
    await nextFrame();
    await wait(PDF_RENDER_DELAY_MS);

    const targetWidth = captureClone.offsetWidth || 794;
    const targetHeight = Math.round(targetWidth * 297 / 210);

    const canvas = await html2canvas(captureClone, {
      scale: PDF_RENDER_SCALE,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      width: targetWidth,
      height: targetHeight,
      windowWidth: targetWidth,
      windowHeight: targetHeight,
      scrollX: 0,
      scrollY: 0,
      imageTimeout: PDF_IMAGE_TIMEOUT_MS
    });

    return await finalizePdfFromCanvas(canvas, documentData, pdfOptions);
  } finally {
    if (workerDiv.parentNode) workerDiv.remove();
  }
}

// PERBAIKAN FINAL ANTI-BLANK: Menggunakan teknik Off-Screen Rendering posisi absolut
async function createPdfFromDocument(data, options = { download: true, upload: false }) {
  const pdfOptions = { download: true, upload: false, ...options };
  const documentData = getFinalDocumentRow(data);
  if (!hasPdfLibraries()) {
    showToast('Library PDF belum lengkap. Pastikan html2canvas dan jsPDF sudah dimuat di index.html.', 'error');
    return null;
  }

  // Khusus tombol PDF dari menu Review: ambil tampilan preview aktif supaya ukuran dan posisi stempel sama.
  if (pdfOptions.sourceElement && pdfOptions.sourceElement.isConnected) {
    return await createPdfFromVisiblePreview(pdfOptions.sourceElement, documentData, pdfOptions);
  }

  // 1. Buat kontainer khusus rendering di luar layar (off-screen)
  const workerDiv = document.createElement('div');
  
  // PENTING: Jangan gunakan opacity: 0 atau display: none agar html2canvas tidak blank!
  // Kita lempar posisinya jauh ke kiri luar layar (-9999px) agar tidak mengganggu pandangan user.
  workerDiv.style.position = 'absolute';
  workerDiv.style.top = '-9999px';
  workerDiv.style.left = '-9999px';
  workerDiv.style.width = '210mm'; // Paksa lebar A4 presisi
  workerDiv.style.background = '#ffffff';
  workerDiv.style.color = '#000000';
  
  // Ambil template HTML surat Anda
  let htmlContent = buildDocumentHTML(documentData, pdfOptions);
  
  // Cek jika class .pdf-page tidak ikut terpasang, bungkus manual agar styling CSS Anda aktif
  if (!htmlContent.includes('class="pdf-page"')) {
    htmlContent = `<div class="pdf-page">${htmlContent}</div>`;
  }
  
  workerDiv.innerHTML = htmlContent;
  document.body.appendChild(workerDiv);

  try {
    // 2. Paksa seluruh gambar eksternal/Supabase menjadi data URL lokal sebelum html2canvas.
    // Ini memperbaiki kasus TTD tampil di preview, tetapi hilang saat render PDF.
    const captureTarget = workerDiv.querySelector('.pdf-page') || workerDiv;
    captureTarget.classList.add('pdf-export-page');
    captureTarget.style.width = '210mm';
    captureTarget.style.height = '297mm';
    captureTarget.style.minHeight = '297mm';
    captureTarget.style.maxHeight = '297mm';
    captureTarget.style.overflow = 'hidden';
    captureTarget.style.boxSizing = 'border-box';

    await inlineImagesForPdf(captureTarget);
    normalizeSignatureImages(captureTarget);
    await nextFrame();
    await wait(PDF_RENDER_DELAY_MS);

    captureTarget.querySelectorAll('.signature-image-wrap, .signature-image-wrap img, .ttd-img').forEach((node) => {
      node.style.visibility = 'visible';
      node.style.opacity = '1';
      if (node.tagName === 'IMG') node.style.display = 'block';
    });

    const targetWidth = captureTarget.offsetWidth || 794;
    const targetHeight = captureTarget.offsetHeight || Math.round(targetWidth * 297 / 210);

    // 3. Eksekusi html2canvas dengan ukuran A4 tetap.
    // Ini mencegah hasil PDF gepeng karena canvas tidak lagi dipaksa masuk ke A4 dengan rasio berbeda.
    const canvas = await html2canvas(captureTarget, {
      scale: PDF_RENDER_SCALE,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      width: targetWidth,
      height: targetHeight,
      windowWidth: targetWidth,
      windowHeight: targetHeight,
      scrollX: 0,
      scrollY: 0,
      imageTimeout: PDF_IMAGE_TIMEOUT_MS
    });

    // Setelah canvas berhasil dicapture, langsung hapus elemen pembantu dari DOM
    workerDiv.remove();

    // 4. Konversi hasil tangkapan gambar menjadi PDF halaman tunggal.
    return await finalizePdfFromCanvas(canvas, documentData, pdfOptions);
  } catch (error) {
    console.error('Gagal membuat PDF:', error);
    showToast('Gagal memproses file PDF.', 'error');
    if (workerDiv.parentNode) workerDiv.remove();
    return null;
  }
}
    
async function uploadPdf(documentRow, pdfBlob, fileName) {
  try {
    if (!supabaseClient) throw new Error('Supabase belum aktif');

    const path = `surat-pdf/${documentRow.id || 'tanpa-id'}/${Date.now()}-${fileName}`;

    const { error } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(path, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) throw error;

    const { data } = supabaseClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    const updated = normalizeDocument({
      ...documentRow,
      pdf_path: path,
      pdf_url: data?.publicUrl || '',
      updated_at: new Date().toISOString()
    });

    await saveDocumentToStorage(updated);
    showToast('PDF berhasil diunggah.');
  } catch (error) {
    console.warn('Upload gagal:', error);
    showToast('PDF dibuat tapi gagal upload.', 'warning');
  }
}

async function exportCsv(scope = '') {
  if (!getPerm('export')) return showToast('Role ini tidak dapat export data.', 'error');
  const rows = await fetchDocuments(scope === 'arsip' ? { status: 'diarsipkan' } : {});
  const headers = ['jenis','nomor_surat','nomor_agenda','tanggal_surat','perihal','pengirim','penerima','hari','tanggal_kegiatan','waktu','tempat','acara','status','surat_asli_url','ttd_url','dibuat_oleh','disetujui_oleh'];
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


function resetLocalCacheAndReload() {
  try {
    localStorage.removeItem(LOCAL_SESSION_KEY);
    localStorage.removeItem(LOCAL_DOC_KEY);
    localStorage.removeItem(LOCAL_PROFILE_KEY);
    localStorage.removeItem(LOCAL_DELETED_KEY);
  } catch (error) {
    console.warn('Gagal menghapus cache lokal:', error);
  }
  location.reload();
}

window.doLogin = doLogin;
window.logout = logout;
window.resetLocalCacheAndReload = resetLocalCacheAndReload;
window.startLiveDateTime = startLiveDateTime;
window.navigate = navigate;
window.refreshCurrentPage = refreshCurrentPage;
window.saveDocument = saveDocument;
window.saveDocumentAndPdf = saveDocumentAndPdf;
window.saveDocumentAndWord = saveDocumentAndWord;
window.saveEditedDocument = saveEditedDocument;
window.previewForm = previewForm;
window.previewSignatureInput = previewSignatureInput;
window.closePreview = closePreview;
window.printPreview = printPreview;
window.downloadPreviewPdf = downloadPreviewPdf;
window.downloadPreviewWord = downloadPreviewWord;
window.refreshPreviewSignatureOptions = refreshPreviewSignatureOptions;
window.filterTable = filterTable;
window.previewById = previewById;
window.downloadById = downloadById;
window.downloadWordById = downloadWordById;
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

document.addEventListener('DOMContentLoaded', () => {
  startLiveDateTime();
  checkSession();
});
