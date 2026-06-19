const SUPABASE_URL = 'https://rwbbxytowtnoyjcngevk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1Vq-L40vJKQMT6CfuORWMQ_Iom2dRSj';

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log('SIPAS KKG PJOK Ready');

async function testSupabase() {
  const { data, error } = await supabaseClient
    .from('pengaturan')
    .select('*');

  console.log('DATA =', data);
  console.log('ERROR =', error);
}

testSupabase();
async function login() {

  const email =
    document.getElementById("email").value;

  const password =
    document.getElementById("password").value;

  const { data, error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

  if(error){
    alert(error.message);
    return;
  }

  document.getElementById("loginPage")
    .style.display = "none";

  document.getElementById("app")
    .style.display = "block";
}
async function checkSession(){

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if(session){

    document.getElementById("loginPage")
      .style.display = "none";

    document.getElementById("app")
      .style.display = "block";
  }
}

checkSession();
async function logout(){

  await supabaseClient.auth.signOut();

  location.reload();
}
