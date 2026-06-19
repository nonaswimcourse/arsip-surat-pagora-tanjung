const SUPABASE_URL='https://rwbbxytowtnoyjcngevk.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_1Vq-L40vJKQMT6CfuORWMQ_Iom2dRSj';
const supabaseClient=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

async function login(){
 const email=document.getElementById('email').value;
 const password=document.getElementById('password').value;
 const {error}=await supabaseClient.auth.signInWithPassword({email,password});
 if(error){alert(error.message);return;}
 document.getElementById('loginPage').style.display='none';
 document.getElementById('app').style.display='block';
}

async function logout(){
 await supabaseClient.auth.signOut();
 location.reload();
}

async function checkSession(){
 const {data:{session}}=await supabaseClient.auth.getSession();
 if(session){
   document.getElementById('loginPage').style.display='none';
   document.getElementById('app').style.display='block';
 }
}
checkSession();
