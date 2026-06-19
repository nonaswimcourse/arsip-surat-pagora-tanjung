const SUPABASE_URL='https://rwbbxytowtnoyjcngevk.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_1Vq-L40vJKQMT6CfuORWMQ_Iom2dRSj';

const supabaseClient = supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

console.log('SIPAS KKG PJOK Ready');
async function testSupabase() {
  const { data, error } = await supabaseClient
    .from('pengaturan')
    .select('*');

  console.log('DATA =', data);
  console.log('ERROR =', error);
}

testSupabase();
async function testConnection() {
  const { data, error } = await supabaseClient
    .from('pengaturan')
    .select('*');

  console.log('DATA:', data);
  console.log('ERROR:', error);
}

testConnection();
