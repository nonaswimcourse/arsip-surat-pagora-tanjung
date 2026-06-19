import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";


        function normalizeSupabaseUrl(url) {
            return String(url || "")
                .trim()
                .replace(/\/rest\/v1\/?$/i, "")
                .replace(/\/+$/g, "");
        }

        const RAW_SUPABASE_URL = "https://toelltwumbadffoxnjjk.supabase.co";
        const SUPABASE_URL = normalizeSupabaseUrl(RAW_SUPABASE_URL);
        const SUPABASE_ANON_KEY = "sb_publishable_mNWooRD5HVKMi085byEHcw_M_2ouAEK";
        const TABLE_SURAT = "surat";
        const BUCKET_SURAT_ASLI = "surat-asli";
        const BUCKET_SURAT_HASIL = "surat-hasil";

        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        let tandaTanganBase64 = "";
        let currentUser = null;

        const authBox = document.getElementById("authBox");
        const app = document.getElementById("app");
        const authMessage = document.getElementById("authMessage");
        const messageBox = document.getElementById("messageBox");
        const btnLogin = document.getElementById("btnLogin");
        const btnLogout = document.getElementById("btnLogout");
        const btnPreview = document.getElementById("btnPreview");
        const btnSave = document.getElementById("btnSave");
        const btnPrint = document.getElementById("btnPrint");
        const btnReset = document.getElementById("btnReset");
        const btnRefresh = document.getElementById("btnRefresh");
        const jenisSurat = document.getElementById("jenisSurat");
        const fileTandaTangan = document.getElementById("fileTandaTangan");

        function showMessage(text, type = "info") {
            if (!messageBox) {
                console.log(`[${type}] ${text}`);
                return;
            }
            messageBox.className = `notice notice-${type}`;
            messageBox.textContent = text;
        }

        function showAuthMessage(text, type = "info") {
            if (!authMessage) {
                console.log(`[auth:${type}] ${text}`);
                return;
            }
            authMessage.className = `notice notice-${type}`;
            authMessage.textContent = text;
        }

        async function handleSupabaseVerifyRedirect() {
            const hash = window.location.hash || "";
            const query = window.location.search || "";

            if (!hash.includes("access_token") && !hash.includes("error") && !query.includes("code=")) {
                return false;
            }

            const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
            const errorCode = hashParams.get("error");
            const errorDescription = hashParams.get("error_description");
            const accessToken = hashParams.get("access_token");
            const refreshToken = hashParams.get("refresh_token");

            if (errorCode) {
                window.history.replaceState({}, document.title, window.location.pathname);
                showAuthMessage(`Verifikasi gagal: ${errorDescription || errorCode}`, "error");
                return false;
            }

            try {
                if (accessToken && refreshToken) {
                    const { data, error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken
                    });

                    window.history.replaceState({}, document.title, window.location.pathname);

                    if (error) throw error;
                    currentUser = data.session?.user || data.user || null;
                    showAuthMessage("Verifikasi berhasil. Anda sudah login.", "success");
                    return true;
                }

                if (query.includes("code=")) {
                    const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
                    window.history.replaceState({}, document.title, window.location.pathname);

                    if (error) throw error;
                    currentUser = data.session?.user || data.user || null;
                    showAuthMessage("Verifikasi berhasil. Anda sudah login.", "success");
                    return true;
                }
            } catch (error) {
                showAuthMessage(`Verify gagal: ${error.message}`, "error");
                return false;
            }

            return false;
        }

        function validateConfig() {
            const urlEmpty = !SUPABASE_URL.trim();
            const keyEmpty = SUPABASE_ANON_KEY === "ISI_SUPABASE_ANON_KEY_ANDA" || !SUPABASE_ANON_KEY.trim();
            const urlInvalid = !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL);

            if (urlEmpty || keyEmpty) {
                showAuthMessage("Isi SUPABASE_URL dan SUPABASE_ANON_KEY di file assets/app.js terlebih dahulu.", "error");
                return false;
            }

            if (urlInvalid) {
                showAuthMessage("SUPABASE_URL harus memakai Project URL, contoh: https://project-ref.supabase.co. Jangan pakai /rest/v1/.", "error");
                return false;
            }

            return true;
        }

        async function login() {
            if (!validateConfig()) return;

            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;

            if (!email || !password) {
                showAuthMessage("Email dan password wajib diisi.", "error");
                return;
            }

            btnLogin.disabled = true;
            btnLogin.textContent = "Memproses...";

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });

            btnLogin.disabled = false;
            btnLogin.textContent = "Login";

            if (error) {
                showAuthMessage(error.message, "error");
                return;
            }

            currentUser = data.user;
            authBox.classList.add("hidden");
            app.classList.remove("hidden");
            showMessage("Login berhasil. Aplikasi siap digunakan.", "success");
            generatePreview();
            await loadSurat();
        }

        async function logout() {
            await supabase.auth.signOut();
            currentUser = null;
            app.classList.add("hidden");
            authBox.classList.remove("hidden");
            showAuthMessage("Anda sudah logout.", "info");
        }

        async function checkSession() {
            if (!validateConfig()) return;

            const verifiedFromUrl = await handleSupabaseVerifyRedirect();
            const { data, error } = await supabase.auth.getSession();

            if (error) {
                showAuthMessage(`Gagal membaca sesi login: ${error.message}`, "error");
                return;
            }

            currentUser = data.session?.user || currentUser || null;

            if (currentUser) {
                authBox?.classList.add("hidden");
                app?.classList.remove("hidden");
                generatePreview();
                await loadSurat();

                if (verifiedFromUrl) {
                    showMessage("Verifikasi berhasil. Aplikasi siap digunakan.", "success");
                }
            } else {
                authBox?.classList.remove("hidden");
                app?.classList.add("hidden");
            }
        }

        function ubahJenisSurat() {
            const jenis = jenisSurat.value;
            const formMasuk = document.getElementById("formSuratMasuk");
            const formKeluar = document.getElementById("formSuratKeluar");

            if (jenis === "masuk") {
                formMasuk.classList.remove("hidden");
                formKeluar.classList.add("hidden");
            } else {
                formMasuk.classList.add("hidden");
                formKeluar.classList.remove("hidden");
            }

            generatePreview();
        }

        function uploadTandaTangan(event) {
            const file = event.target.files[0];

            if (!file) {
                tandaTanganBase64 = "";
                generatePreview();
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                tandaTanganBase64 = e.target.result;
                generatePreview();
            };
            reader.readAsDataURL(file);
        }

        function formatTanggalIndonesia(tanggal) {
            if (!tanggal || tanggal === "-") return "-";

            const bulan = [
                "Januari",
                "Februari",
                "Maret",
                "April",
                "Mei",
                "Juni",
                "Juli",
                "Agustus",
                "September",
                "Oktober",
                "November",
                "Desember"
            ];

            const date = new Date(tanggal + "T00:00:00");
            const hari = date.getDate();
            const namaBulan = bulan[date.getMonth()];
            const tahun = date.getFullYear();

            return `${hari} ${namaBulan} ${tahun}`;
        }

        function escapeHtml(text) {
            return String(text ?? "")
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#039;");
        }

        function getValue(id, fallback = "-") {
            const element = document.getElementById(id);
            if (!element) return fallback;

            const value = element.value.trim();
            return value || fallback;
        }

        function generatePreview() {
            const jenis = jenisSurat.value;
            const namaInstansi = getValue("namaInstansi", "Nama Instansi / Lembaga");
            const alamatInstansi = getValue("alamatInstansi", "Alamat lengkap instansi.");
            const nomorSurat = getValue("nomorSurat");
            const tanggalSurat = formatTanggalIndonesia(getValue("tanggalSurat", ""));
            const perihalSurat = getValue("perihalSurat");
            const namaPenandatangan = getValue("namaPenandatangan");
            const jabatanPenandatangan = getValue("jabatanPenandatangan", "Petugas Administrasi");

            document.getElementById("previewInstansi").textContent = namaInstansi;
            document.getElementById("previewAlamat").textContent = alamatInstansi;

            if (jenis === "masuk") {
                generateSuratMasuk(nomorSurat, tanggalSurat, perihalSurat, namaPenandatangan, jabatanPenandatangan);
            } else {
                generateSuratKeluar(nomorSurat, tanggalSurat, perihalSurat, namaPenandatangan, jabatanPenandatangan);
            }
        }

        function getTandaTanganHtml() {
            return tandaTanganBase64
                ? `<img src="${tandaTanganBase64}" class="signature-img" alt="Tanda Tangan">`
                : `<div class="signature-space"></div>`;
        }

        function generateSuratMasuk(nomorSurat, tanggalSurat, perihalSurat, namaPenandatangan, jabatanPenandatangan) {
            const tanggalDiterima = formatTanggalIndonesia(getValue("tanggalDiterima", ""));
            const pengirimSurat = getValue("pengirimSurat");
            const bagianTujuan = getValue("bagianTujuan");
            const statusMasuk = getValue("statusMasuk", "Baru");

            const html = `
                <div class="judul-surat">
                    <h2>Lembar Arsip Surat Masuk</h2>
                    <p class="nomor-surat">Nomor: ${escapeHtml(nomorSurat)}</p>
                </div>

                <table class="meta-table">
                    <tr>
                        <td class="meta-label">Tanggal Surat</td>
                        <td class="meta-separator">:</td>
                        <td>${escapeHtml(tanggalSurat)}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Tanggal Diterima</td>
                        <td class="meta-separator">:</td>
                        <td>${escapeHtml(tanggalDiterima)}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Pengirim</td>
                        <td class="meta-separator">:</td>
                        <td>${escapeHtml(pengirimSurat)}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Perihal</td>
                        <td class="meta-separator">:</td>
                        <td>${escapeHtml(perihalSurat)}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Bagian Tujuan</td>
                        <td class="meta-separator">:</td>
                        <td>${escapeHtml(bagianTujuan)}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Status</td>
                        <td class="meta-separator">:</td>
                        <td><span class="status-badge">${escapeHtml(statusMasuk)}</span></td>
                    </tr>
                </table>

                <div class="arsip-box">
                    <p>
                        Dokumen ini merupakan lembar arsip penerimaan surat masuk.
                        Data surat dicatat sebagai bagian dari administrasi persuratan instansi.
                    </p>
                </div>

                <div class="signature-area">
                    <p>Indonesia, ${escapeHtml(tanggalDiterima)}</p>
                    <p>${escapeHtml(jabatanPenandatangan)}</p>
                    ${getTandaTanganHtml()}
                    <p class="signature-name">${escapeHtml(namaPenandatangan)}</p>
                </div>
            `;

            document.getElementById("previewContent").innerHTML = html;
        }

        function generateSuratKeluar(nomorSurat, tanggalSurat, perihalSurat, namaPenandatangan, jabatanPenandatangan) {
            const tujuanSurat = getValue("tujuanSurat");
            const alamatTujuan = getValue("alamatTujuan", "");
            const lampiranSurat = getValue("lampiranSurat", "-");
            const isiSurat = getValue("isiSurat", "Isi surat belum ditulis.");
            const statusKeluar = getValue("statusKeluar", "Draft");

            const html = `
                <table class="meta-table">
                    <tr>
                        <td class="meta-label">Nomor</td>
                        <td class="meta-separator">:</td>
                        <td>${escapeHtml(nomorSurat)}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Lampiran</td>
                        <td class="meta-separator">:</td>
                        <td>${escapeHtml(lampiranSurat)}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Perihal</td>
                        <td class="meta-separator">:</td>
                        <td>${escapeHtml(perihalSurat)}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Status</td>
                        <td class="meta-separator">:</td>
                        <td><span class="status-badge">${escapeHtml(statusKeluar)}</span></td>
                    </tr>
                </table>

                <div class="recipient">
                    <p>Kepada Yth.</p>
                    <p>
                        ${escapeHtml(tujuanSurat)}<br>
                        ${escapeHtml(alamatTujuan).replaceAll("\n", "<br>")}
                    </p>
                </div>

                <div class="letter-body">${escapeHtml(isiSurat)}</div>

                <div class="signature-area">
                    <p>Indonesia, ${escapeHtml(tanggalSurat)}</p>
                    <p>${escapeHtml(jabatanPenandatangan)}</p>
                    ${getTandaTanganHtml()}
                    <p class="signature-name">${escapeHtml(namaPenandatangan)}</p>
                </div>
            `;

            document.getElementById("previewContent").innerHTML = html;
        }

        function sanitizeFileName(text) {
            return String(text || "surat")
                .toLowerCase()
                .replace(/[^a-z0-9._-]+/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "") || "surat";
        }

        function getPublicUrl(bucket, path) {
            const { data } = supabase.storage.from(bucket).getPublicUrl(path);
            return data.publicUrl;
        }

        async function uploadFileToSupabase(bucket, path, fileOrBlob, contentType) {
            const options = {
                cacheControl: "3600",
                upsert: false
            };

            if (contentType) {
                options.contentType = contentType;
            }

            const { data, error } = await supabase.storage.from(bucket).upload(path, fileOrBlob, options);

            if (error) throw error;

            return {
                path: data.path,
                publicUrl: getPublicUrl(bucket, data.path)
            };
        }

        async function createPdfBlob() {
            generatePreview();

            if (!window.html2pdf) {
                throw new Error("Library html2pdf gagal dimuat. Jalankan aplikasi dengan Live Server dan pastikan koneksi internet aktif.");
            }

            const areaSurat = document.getElementById("areaSurat");
            const options = {
                margin: 0,
                filename: "hasil-surat.pdf",
                image: { type: "jpeg", quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
                jsPDF: { unit: "px", format: [794, 1123], orientation: "portrait" }
            };

            return await window.html2pdf()
                .set(options)
                .from(areaSurat)
                .outputPdf("blob");
        }

        function validateSurat() {
            const jenis = jenisSurat.value;
            const nomor = getValue("nomorSurat", "");
            const tanggal = getValue("tanggalSurat", "");
            const perihal = getValue("perihalSurat", "");

            if (!nomor || nomor === "-") return "Nomor surat wajib diisi.";
            if (!tanggal || tanggal === "-") return "Tanggal surat wajib diisi.";
            if (!perihal || perihal === "-") return "Perihal surat wajib diisi.";

            if (jenis === "masuk") {
                const fileAsli = document.getElementById("fileSuratAsli").files[0];
                if (!fileAsli) return "File asli surat masuk wajib diunggah.";
            }

            return "";
        }

        async function saveToSupabase() {
            if (!currentUser) {
                showMessage("Sesi login tidak aktif. Silakan login ulang.", "error");
                return;
            }

            const validationError = validateSurat();
            if (validationError) {
                showMessage(validationError, "error");
                return;
            }

            btnSave.disabled = true;
            btnSave.textContent = "Menyimpan...";
            showMessage("Sedang mengunggah file ke Supabase.", "info");

            try {
                const jenis = jenisSurat.value;
                const nomorSurat = getValue("nomorSurat");
                const nomorSlug = sanitizeFileName(nomorSurat);
                const stamp = new Date().toISOString().replace(/[:.]/g, "-");

                let fileAsliNama = null;
                let fileAsliPath = null;
                let fileAsliUrl = null;

                if (jenis === "masuk") {
                    const fileAsli = document.getElementById("fileSuratAsli").files[0];
                    const originalName = sanitizeFileName(fileAsli.name);
                    const pathAsli = `surat-masuk/asli/${stamp}-${nomorSlug}-${originalName}`;
                    const uploadedAsli = await uploadFileToSupabase(BUCKET_SURAT_ASLI, pathAsli, fileAsli, fileAsli.type || "application/octet-stream");

                    fileAsliNama = fileAsli.name;
                    fileAsliPath = uploadedAsli.path;
                    fileAsliUrl = uploadedAsli.publicUrl;
                }

                showMessage("File asli selesai diunggah. Aplikasi sedang membuat PDF hasil surat.", "info");

                const pdfBlob = await createPdfBlob();
                const hasilFileName = `hasil-${jenis}-${nomorSlug}.pdf`;
                const pathHasil = `${jenis === "masuk" ? "surat-masuk" : "surat-keluar"}/hasil/${stamp}-${hasilFileName}`;
                const uploadedHasil = await uploadFileToSupabase(BUCKET_SURAT_HASIL, pathHasil, pdfBlob, "application/pdf");

                const record = {
                    user_id: currentUser.id,
                    jenis,
                    nomor_surat: nomorSurat,
                    tanggal_surat: getValue("tanggalSurat", null),
                    perihal: getValue("perihalSurat"),
                    nama_instansi: getValue("namaInstansi"),
                    alamat_instansi: getValue("alamatInstansi"),
                    pengirim: jenis === "masuk" ? getValue("pengirimSurat") : null,
                    tanggal_diterima: jenis === "masuk" ? getValue("tanggalDiterima", null) : null,
                    bagian_tujuan: jenis === "masuk" ? getValue("bagianTujuan") : null,
                    status_masuk: jenis === "masuk" ? getValue("statusMasuk") : null,
                    file_asli_nama: fileAsliNama,
                    file_asli_path: fileAsliPath,
                    file_asli_url: fileAsliUrl,
                    tujuan: jenis === "keluar" ? getValue("tujuanSurat") : null,
                    alamat_tujuan: jenis === "keluar" ? getValue("alamatTujuan") : null,
                    lampiran: jenis === "keluar" ? getValue("lampiranSurat") : null,
                    isi_surat: jenis === "keluar" ? getValue("isiSurat") : null,
                    status_keluar: jenis === "keluar" ? getValue("statusKeluar") : null,
                    nama_penandatangan: getValue("namaPenandatangan"),
                    jabatan_penandatangan: getValue("jabatanPenandatangan"),
                    file_hasil_nama: hasilFileName,
                    file_hasil_path: uploadedHasil.path,
                    file_hasil_url: uploadedHasil.publicUrl
                };

                const { error } = await supabase.from(TABLE_SURAT).insert(record);
                if (error) throw error;

                showMessage("Surat berhasil disimpan. File asli dan hasil PDF sudah masuk ke Supabase.", "success");
                resetForm(false);
                await loadSurat();
            } catch (error) {
                showMessage(`Gagal menyimpan: ${error.message}`, "error");
            } finally {
                btnSave.disabled = false;
                btnSave.textContent = "Simpan ke Supabase";
            }
        }

        async function loadSurat() {
            const tbody = document.getElementById("suratTableBody");
            tbody.innerHTML = `<tr><td colspan="6">Memuat data...</td></tr>`;

            const { data, error } = await supabase
                .from(TABLE_SURAT)
                .select("id, created_at, jenis, nomor_surat, perihal, file_asli_url, file_asli_nama, file_hasil_url, file_hasil_nama")
                .order("created_at", { ascending: false })
                .limit(50);

            if (error) {
                tbody.innerHTML = `<tr><td colspan="6">Gagal memuat data: ${escapeHtml(error.message)}</td></tr>`;
                return;
            }

            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6">Belum ada data.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.map((item) => {
                const tanggal = new Date(item.created_at).toLocaleString("id-ID");
                const fileAsli = item.file_asli_url
                    ? `<a href="${item.file_asli_url}" target="_blank" rel="noopener">Buka file asli</a><br><span class="small-text">${escapeHtml(item.file_asli_nama || "")}</span>`
                    : `<span class="small-text">Tidak ada</span>`;
                const fileHasil = item.file_hasil_url
                    ? `<a href="${item.file_hasil_url}" target="_blank" rel="noopener">Buka hasil PDF</a><br><span class="small-text">${escapeHtml(item.file_hasil_nama || "")}</span>`
                    : `<span class="small-text">Tidak ada</span>`;

                return `
                    <tr>
                        <td>${escapeHtml(tanggal)}</td>
                        <td><span class="status-badge">${escapeHtml(item.jenis)}</span></td>
                        <td>${escapeHtml(item.nomor_surat)}</td>
                        <td>${escapeHtml(item.perihal || "-")}</td>
                        <td>${fileAsli}</td>
                        <td>${fileHasil}</td>
                    </tr>
                `;
            }).join("");
        }

        function resetForm(showResetMessage = true) {
            document.getElementById("jenisSurat").value = "masuk";
            document.getElementById("namaInstansi").value = "Nama Instansi / Lembaga";
            document.getElementById("alamatInstansi").value = "Alamat lengkap instansi, nomor telepon, email, dan kode pos.";
            document.getElementById("nomorSurat").value = "";
            document.getElementById("tanggalSurat").value = "";
            document.getElementById("perihalSurat").value = "";
            document.getElementById("pengirimSurat").value = "";
            document.getElementById("tanggalDiterima").value = "";
            document.getElementById("bagianTujuan").value = "";
            document.getElementById("statusMasuk").value = "Baru";
            document.getElementById("fileSuratAsli").value = "";
            document.getElementById("tujuanSurat").value = "";
            document.getElementById("alamatTujuan").value = "";
            document.getElementById("lampiranSurat").value = "";
            document.getElementById("isiSurat").value = "";
            document.getElementById("statusKeluar").value = "Draft";
            document.getElementById("namaPenandatangan").value = "";
            document.getElementById("jabatanPenandatangan").value = "";
            document.getElementById("fileTandaTangan").value = "";

            tandaTanganBase64 = "";
            ubahJenisSurat();
            generatePreview();

            if (showResetMessage) {
                showMessage("Form sudah dikosongkan.", "info");
            }
        }

        function safeAddListener(element, eventName, handler) {
            if (!element) return;
            element.addEventListener(eventName, handler);
        }

        function safeAddInputListener(id) {
            const element = document.getElementById(id);
            if (!element) return;
            element.addEventListener("input", generatePreview);
            element.addEventListener("change", generatePreview);
        }

        safeAddListener(btnLogin, "click", login);
        safeAddListener(btnLogout, "click", logout);
        safeAddListener(btnPreview, "click", generatePreview);
        safeAddListener(btnSave, "click", saveToSupabase);
        safeAddListener(btnPrint, "click", () => window.print());
        safeAddListener(btnReset, "click", () => resetForm(true));
        safeAddListener(btnRefresh, "click", loadSurat);
        safeAddListener(jenisSurat, "change", ubahJenisSurat);
        safeAddListener(fileTandaTangan, "change", uploadTandaTangan);

        [
            "namaInstansi",
            "alamatInstansi",
            "nomorSurat",
            "tanggalSurat",
            "perihalSurat",
            "pengirimSurat",
            "tanggalDiterima",
            "bagianTujuan",
            "statusMasuk",
            "tujuanSurat",
            "alamatTujuan",
            "lampiranSurat",
            "isiSurat",
            "statusKeluar",
            "namaPenandatangan",
            "jabatanPenandatangan"
        ].forEach(safeAddInputListener);

        safeAddListener(document.getElementById("email"), "keydown", (event) => {
            if (event.key === "Enter") login();
        });

        safeAddListener(document.getElementById("password"), "keydown", (event) => {
            if (event.key === "Enter") login();
        });

        window.addEventListener("load", () => {
            generatePreview();
            checkSession();
        });
