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

function jsAttr(value) {
  return String(value ?? '')
    .replace(/\/g, '\\')
    .replace(/'/g, "\'")
    .replace(/
/g, '')
    .replace(/
/g, '\n');
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
    ttd_data_url: '',
    ttd_url: profile?.ttd_url || '',
    ttd_path: profile?.ttd_path || '',
    ttd_name: profile?.ttd_name || ''
  };
}

function syncProfileSignatureToLocalDocuments() {}

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

// Validasi berkas
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
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => {
      console.error('Gagal mengonversi file ke Data URL:', error);
      reject(error);
    };
    reader.readAsDataURL(file);
  });
}

async function resolveStoragePublicOrSignedUrl(path, fallbackUrl = '') {
  if (!supabaseClient || !path) return fallbackUrl;
  try {
    const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    if (data?.publicUrl) return data.publicUrl;
  } catch (error) {
    console.warn('Gagal mendapatkan Public URL, menggunakan URL cadangan:', error);
  }
  return fallbackUrl;
}

async function refreshDocumentFileUrls(row) {
  if (!row || row.local_only) return row;
  
  if (row.pdf_path) {
    row.pdf_url = await resolveStoragePublicOrSignedUrl(row.pdf_path, row.pdf_url);
  }
  if (row.surat_asli_path) {
    row.surat_asli_url = await resolveStoragePublicOrSignedUrl(row.surat_asli_path, row.surat_asli_url);
  }
  if (row.ttd_path) {
    row.ttd_url = await resolveStoragePublicOrSignedUrl(row.ttd_path, row.ttd_url);
  }
  
  return row;
}

function setButtonBusy(button, temporaryText) {
  if (!button) return '';
  const originalText = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner"></span> \${safe(temporaryText)}`;
  return originalText;
}

function restoreButton(button, originalText) {
  if (!button) return;
  button.disabled = false;
  button.innerHTML = originalText;
}

// =========================================================================
// STRUKTUR STRIP TTD & EDITAN KHUSUS UNTUK EXPORT WORD
// MENAIKKAN NAMA KETUA & NIP AGAR MENEMPEL DAN LEBIH TINGGI DI HALAMAN WORD
// =========================================================================
function generateWordDocumentHTML(doc, profile = cachedProfile || defaultProfile) {
  const ttdUrl = doc.ttd_url || profile.ttd_url || '';
  
  return `
    <div style="font-family: 'Arial', sans-serif; font-size: 12pt; line-height: 1.3; color: #000000; padding: 20px;">
      <!-- Bagian Kop Surat -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border-bottom: 3px double #000000;">
        <tr>
          <td style="width: \${WORD_LOGO_WIDTH_CM}cm; vertical-align: middle; padding-bottom: 10px;">
            <img src="\${profile.logo_url}" width="\${WORD_LOGO_WIDTH_PX}" height="\${WORD_LOGO_HEIGHT_PX}" style="display: block;" />
          </td>
          <td style="text-align: center; vertical-align: middle; padding-bottom: 10px;">
            <span style="font-size: 14pt; font-weight: bold; text-transform: uppercase;">\${safe(profile.nama_instansi)}</span><br/>
            <span style="font-size: 10pt;">Alamat: \${safe(profile.alamat)} | Telp: \${safe(profile.telepon)}</span><br/>
            <span style="font-size: 10pt;">Email: \${safe(profile.email)} | Website: \${safe(profile.website)}</span>
          </td>
        </tr>
      </table>

      <!-- Konten Surat Pokok -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
        <tr><td style="width: 15%;">Nomor</td><td style="width: 2%;">:</td><td>\${safe(doc.nomor_surat || '-')}</td><td style="text-align: right;">\${safe(profile.kota)}, \${formatDateLong(doc.tanggal_surat)}</td></tr>
        <tr><td>Sifat</td><td>:</td><td>\${safe(doc.sifat_surat)}</td><td></td></tr>
        <tr><td>Lampiran</td><td>:</td><td>\${safe(doc.lampiran)}</td><td></td></tr>
        <tr><td>Perihal</td><td>:</td><td><strong>\${safe(doc.perihal || '-')}</strong></td><td></td></tr>
      </table>

      <div style="margin-top: 15px; margin-bottom: 20px; text-align: justify;">
        \${doc.isi_surat || '<p>[Isi Surat Belum Diinput]</p>'}
      </div>

      <!-- KELOMPOK PENUTUP TANDA TANGAN (DIOPTIMASI UNTUK EXPORT WORD) -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 25px;">
        <tr>
          <td style="width: 55%;"></td>
          <td style="width: 45%; text-align: center; vertical-align: top;">
            <!-- Jabatan Penandatangan -->
            <p style="margin: 0 0 2px 0; padding: 0; font-size: 11pt;">\${safe(profile.jabatan)}</p>
            
            <!-- Ruang TTD & Stempel dipersempit (height dikurangi dari standar agar teks di bawah naik) -->
            <div style="height: 55px; position: relative; margin: 2px 0; text-align: center;">
              \${ttdUrl ? `<img src="\${ttdUrl}" style="height: 55px; width: auto; max-width: 130px; display: inline-block;" />` : `<div style="height: 55px;"></div>`}
            </div>

            <!-- Teks Nama Ketua diangkat naik melalui margin-top minimal, padding nol dan line-height rapat -->
            <p style="margin: 2px 0 0 0; padding: 0; font-weight: bold; text-decoration: underline; font-size: 11pt; line-height: 1.1;">
              \${safe(profile.kepala_nama)}
            </p>
            
            <!-- Teks NIP menempel tepat di bawah Nama Ketua tanpa ada celah kosong -->
            <p style="margin: 0; padding: 0; font-size: 11pt; line-height: 1.1;">
              NIP. \${safe(profile.kepala_nip)}
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

// Fungsi trigger untuk melakukan download naskah Word (.doc)
function exportDocumentToWord(docId) {
  const targetDoc = cachedDocuments?.find(d => String(d.id) === String(docId));
  if (!targetDoc) { showToast('Dokumen tidak ditemukan untuk di-export.', 'error'); return; }
  
  const contentHTML = generateWordDocumentHTML(targetDoc);
  const fullContent = printableHTML(contentHTML);
  
  const blob = new Blob(['\ufeff' + fullContent], { type: 'application/msword' });
  const filename = `Surat-\${slugify(targetDoc.jenis)}-\${slugify(targetDoc.nomor_surat || targetDoc.id)}.doc`;
  downloadBlob(blob, filename);
  showToast('Dokumen Word berhasil dibuat.');
}
