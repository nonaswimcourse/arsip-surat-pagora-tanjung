
import { supabase } from "../config/supabase.js";

/* AUTH */
window.login = async function(){
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email, password
  });

  if(!error){
    document.getElementById("authBox").style.display="none";
    document.getElementById("app").style.display="block";
    load();
  }else{
    alert("Login gagal");
  }
};

window.logout = async function(){
  await supabase.auth.signOut();
  location.reload();
};

/* TOGGLE FORM */
document.getElementById("jenisSurat").addEventListener("change",(e)=>{
  document.getElementById("formMasuk").style.display =
    e.target.value==="masuk"?"block":"none";
});

/* SAVE */
window.save = async function(){

  const user = await supabase.auth.getUser();

  let fileURL = null;

  const file = document.getElementById("fileSurat").files[0];

  if(file){
    const name = Date.now()+"_"+file.name;

    await supabase.storage.from("surat").upload(name,file);

    fileURL = supabase.storage.from("surat").getPublicUrl(name).data.publicUrl;
  }

  const jenis = document.getElementById("jenisSurat").value;

  const base = {
    nomor: document.getElementById("nomorSurat").value,
    tanggal: document.getElementById("tanggalSurat").value,
    perihal: document.getElementById("perihal").value,
    file_url: fileURL,
    user_id: user.data.user.id
  };

  if(jenis==="masuk"){
    base.pengirim = document.getElementById("pengirim").value;
    await supabase.from("surat_masuk").insert([base]);
  }else{
    base.tujuan = document.getElementById("tujuan").value;
    base.isi = document.getElementById("isi").value;
    await supabase.from("surat_keluar").insert([base]);
  }

  load();
};

/* LOAD + ROLE + EDIT DELETE */
async function load(){

  const { data: user } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.data.user.id)
    .single();

  const role = profile?.role || "staff";

  const { data: masuk } = await supabase.from("surat_masuk").select("*");
  const { data: keluar } = await supabase.from("surat_keluar").select("*");

  let html="";

  masuk.forEach(d=>{
    html += `
      <div>
        <b>${d.nomor}</b>
        <button onclick="view('${d.file_url}')">Preview</button>
        ${role!=="arsip" ? `<button onclick="hapus('surat_masuk','${d.id}')">Hapus</button>`:""}
      </div>`;
  });

  keluar.forEach(d=>{
    html += `
      <div>
        <b>${d.nomor}</b>
        ${role==="admin" ? `<button onclick="hapus('surat_keluar','${d.id}')">Hapus</button>`:""}
      </div>`;
  });

  document.getElementById("list").innerHTML=html;
}

window.view = function(url){
  document.getElementById("viewer").src = url;
};

window.hapus = async function(table,id){
  await supabase.from(table).delete().eq("id",id);
  load();
};

load();
