const SUPABASE_URL='https://rwbbxytowtnoyjcngevk.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_1Vq-L40vJKQMT6CfuORWMQ_Iom2dRSj';
const supabaseClient=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

function showPage(id){
document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
document.getElementById(id).classList.remove('hidden');
}

async function doLogin() {

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    document.getElementById("loginError").textContent =
      "Email dan Password wajib diisi";
    return;
  }

  const { data, error } =
    await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

  console.log("LOGIN DATA =", data);
  console.log("LOGIN ERROR =", error);

  if (error) {
    document.getElementById("loginError").textContent =
      error.message;
    return;
  }

  document.getElementById("loginPage").style.display = "none";
  document.getElementById("app").style.display = "block";

  loadDashboard();
}

async function logout(){await supabaseClient.auth.signOut();location.reload();}

async function loadDashboard(){
try{
const {data}=await supabaseClient.from('dashboard_statistik').select('*').single();
if(data){
totalSurat.textContent=data.total_surat||0;
totalMasuk.textContent=data.total_surat_masuk||0;
totalArsip.textContent=data.total_arsip||0;
}}catch(e){console.log(e)}
}

async function loadSuratMasuk(){
const {data}=await supabaseClient.from('surat_masuk').select('*').limit(20);
document.getElementById('suratMasukList').innerHTML=(data||[]).map(x=>`<p>${x.nomor_surat||''} - ${x.perihal||''}</p>`).join('');
}

async function simpanSurat(){
await supabaseClient.from('surat').insert({perihal:perihal.value,isi_surat:isiSurat.value,jenis_surat:'Surat Tugas'});
alert('Surat tersimpan');
}

async function loadTemplate(jenis){
const {data}=await supabaseClient.from('template_surat').select('*').eq('jenis_surat',jenis).single();
if(data) templateIsi.value=data.isi_template;
}

checkSession();
async function checkSession(){
const {data:{session}}=await supabaseClient.auth.getSession();
if(session){loginPage.style.display='none';app.style.display='block';loadDashboard();}
}
