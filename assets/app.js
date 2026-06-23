const SUPABASE_URL = 'https://bixyaowckwvjpgwffoci.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_phZErDKE6oDEDN5whvlk3Q_8LpXylcG';
const TABLE_SURAT = 'surat';
const TABLE_PROFIL = 'profil_instansi';
const STORAGE_BUCKET = 'dokumen-surat';
const LOCAL_SESSION_KEY = 'sipas_kantor_session';
const LOCAL_DOC_KEY = 'sipas_kantor_documents';
const LOCAL_PROFILE_KEY = 'sipas_kantor_profile';
const LOCAL_DELETED_KEY = 'sipas_kantor_deleted_ids';


// ===== HARDENING CORE GUARD =====
window.__APP_STATE__ = { ready: false, user: null, bootstrapped: false };

window.addEventListener('error', (e) => console.error('GLOBAL ERROR:', e.error));
window.addEventListener('unhandledrejection', (e) => console.error('PROMISE ERROR:', e.reason));

// SAFE ELEMENT ACCESS
function el(id) {
  const node = document.getElementById(id);
  if (!node) console.warn('Missing element:', id);
  return node;
}


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
  const profileName = cachedProfile?.nama_aplikasi || defaultProfile.nama_aplikasi;
  if (el('currentUserEmail')) el('currentUserEmail').textContent = email;
  if (el('currentUserRole')) el('currentUserRole').textContent = `Role: ${titleCase(role)}`;
  if (el('sidebarProfileName')) el('sidebarProfileName').textContent = profileName;
  document.querySelectorAll('[data-route="pengaturan"]').forEach((item) => item.classList.remove('hidden'));
  document.querySelectorAll('.admin-only').forEach((item) => item.classList.toggle('hidden', !getPerm('settings')));
}


async function doLogin() {
  const emailEl = el('email');
  const passEl = el('password');

  if (!emailEl || !passEl) {
    showLoginError('Form login tidak ditemukan.');
    return;
  }

  const email = emailEl.value?.trim()?.toLowerCase() || '';
  const password = passEl.value || '';

  if (!email || !password) {
    showLoginError('Email dan password wajib diisi.');
    return;
  }

  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (data?.user && !error) {
        currentUser = buildSupabaseUser(data.user);
        await safeBoot();
        return;
      }
    }

    const demo = demoAccounts[email];

    if (!demo || demo.password !== password) {
      showLoginError('Login gagal.');
      return;
    }

    currentUser = { id: email, email, role: demo.role, name: demo.name };
    await safeBoot();

  } catch (e) {
    console.error(e);
    showLoginError('System error login.');
  }
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

  currentUser = { id: email, email, role: demo.role, name: setLocalSession({ name: demo.name, local_only: true });
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
  try {
    currentRoute = route;

    document.querySelectorAll('.menu-item')?.forEach(m => {
      if (m?.dataset) m.classList.toggle('active', m.dataset.route === route);
    });

    if (route === 'dashboard') return renderDashboard();
    if (route === 'arsip') return renderArchivePage();
    if (route === 'pengaturan') return renderSettingsPage();
    if (documentTypes[route]) return renderDocumentPage(route);

    renderEmptyState('Menu tidak ditemukan','');
  } catch (e) {
    console.error('NAV ERROR', e);
    showToast('Navigasi error','error');
  }
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
  if (pageContent) 
function renderEmptyState(title, message) {
  setPageHeader(title, message);
  const pageContent = el('pageContent');
  if (pageContent) {
    pageContent.innerHTML = '';
  }
}
