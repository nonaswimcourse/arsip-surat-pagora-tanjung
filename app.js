const SUPABASE_URL = "https://rwbbxytowtnoyjcngevk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1Vq-L40vJKQMT6CfuORWMQ_Iom2dRSj";

const supabaseClient = supabase.createClient(
SUPABASE_URL,
SUPABASE_ANON_KEY
);

console.log("SIPAS KKG PJOK Ready");

async function login() {

const email = document.getElementById("email").value.trim();
const password = document.getElementById("password").value;

if (!email || !password) {
alert("Email dan Password wajib diisi");
return;
}

try {

```
const { data, error } =
  await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

console.log("LOGIN DATA =", data);
console.log("LOGIN ERROR =", error);

if (error) {
  alert(error.message);
  return;
}

document.getElementById("loginPage").style.display = "none";
document.getElementById("app").style.display = "block";

loadDashboard();
```

} catch (err) {

```
console.error(err);
alert("Gagal terhubung ke Supabase");
```

}

}

async function logout() {

await supabaseClient.auth.signOut();
location.reload();

}

async function checkSession() {

try {

```
const {
  data: { session }
} = await supabaseClient.auth.getSession();

console.log("SESSION =", session);

if (session) {

  document.getElementById("loginPage").style.display = "none";
  document.getElementById("app").style.display = "block";

  loadDashboard();

}
```

} catch (err) {

```
console.error(err);
```

}

}

async function loadDashboard() {

try {

```
const { data, error } =
  await supabaseClient
    .from("dashboard_statistik")
    .select("*")
    .single();

console.log("DASHBOARD =", data);
console.log("ERROR =", error);

if (data) {

  document.getElementById("totalSurat").textContent =
    data.total_surat || 0;

  document.getElementById("totalMasuk").textContent =
    data.total_surat_masuk || 0;

  document.getElementById("totalArsip").textContent =
    data.total_arsip || 0;

}
```

} catch (err) {

```
console.error(err);
```

}

}

checkSession();
