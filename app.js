const SUPABASE_URL='https://rwbbxytowtnoyjcngevk.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_1Vq-L40vJKQMT6CfuORWMQ_Iom2dRSj';

const supabaseClient=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

async function doLogin(){
const email=document.getElementById('email').value.trim();
const password=document.getElementById('password').value;

const {error}=await supabaseClient.auth.signInWithPassword({email,password});

if(error){
document.getElementById('loginError').textContent=error.message;
return;
}

document.getElementById('loginPage').style.display='none';
document.getElementById('app').style.display='block';

loadDashboard();
}

async function logout(){
await supabaseClient.auth.signOut();
location.reload();
}

async function loadDashboard(){
try{
const {data}=await supabaseClient.from('dashboard_statistik').select('*').single();

if(data){
document.getElementById('totalSurat').textContent=data.total_surat||0;
document.getElementById('totalMasuk').textContent=data.total_surat_masuk||0;
document.getElementById('totalArsip').textContent=data.total_arsip||0;
}
}catch(e){console.log(e)}
}

async function checkSession(){
const {data:{session}}=await supabaseClient.auth.getSession();

if(session){
document.getElementById('loginPage').style.display='none';
document.getElementById('app').style.display='block';
loadDashboard();
}
}

checkSession();