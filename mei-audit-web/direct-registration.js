import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const app=document.querySelector('#app');
let busy=false;

async function getCompanyId(){
  const {data:{user}}=await sb.auth.getUser();
  if(!user) return null;
  const {data,error}=await sb.from('mei_company_users').select('company_id').eq('user_id',user.id).maybeSingle();
  if(error) return null;
  return data?.company_id||null;
}

async function enhanceDirectRegistration(){
  if(busy) return;
  const title=[...document.querySelectorAll('h2')].find(x=>x.textContent?.trim()==='Convidar usuário');
  if(!title) return;
  const card=title.closest('.card');
  if(!card||card.dataset.directReady==='1') return;
  busy=true;
  try{
    const cid=await getCompanyId();
    if(!cid) return;
    card.dataset.directReady='1';
    card.innerHTML=`<h2>Cadastrar usuário</h2><p class="meta">Cadastro direto nesta fase. Não será enviado e-mail de convite ou confirmação.</p><div class="two"><div class="field"><label>Tipo</label><select id="directRole"><option value="mei">MEI</option><option value="auditor">Auditoria</option></select></div><div class="field"><label>Nome</label><input id="directName"></div></div><div class="field"><label>E-mail de acesso</label><input id="directEmail" type="email" autocomplete="email"></div><div class="field"><label>CNPJ do MEI (quando aplicável)</label><input id="directCnpj"></div><div class="field"><label>Senha inicial</label><input id="directPassword" type="password" autocomplete="new-password" minlength="8"></div><div class="field"><label>Confirmar senha</label><input id="directPassword2" type="password" autocomplete="new-password" minlength="8"></div><button class="pri" id="directCreate">Cadastrar usuário</button><p class="meta">O usuário poderá entrar imediatamente com o e-mail e a senha cadastrados.</p>`;

    document.querySelector('#directCreate').onclick=async()=>{
      const role=document.querySelector('#directRole')?.value||'';
      const name=(document.querySelector('#directName')?.value||'').trim();
      const email=(document.querySelector('#directEmail')?.value||'').trim();
      const cnpj=(document.querySelector('#directCnpj')?.value||'').trim();
      const password=document.querySelector('#directPassword')?.value||'';
      const password2=document.querySelector('#directPassword2')?.value||'';
      if(!name||!email){alert('Informe nome e e-mail.');return;}
      if(password.length<8){alert('A senha deve ter pelo menos 8 caracteres.');return;}
      if(password!==password2){alert('As senhas não conferem.');return;}

      const btn=document.querySelector('#directCreate');
      btn.disabled=true; btn.textContent='Cadastrando...';
      try{
        const {data,error}=await sb.functions.invoke('mei-create-user',{body:{company_id:cid,email,password,role,name,cnpj}});
        if(error) throw error;
        if(!data?.ok) throw new Error(data?.error||'Não foi possível cadastrar o usuário.');
        alert(`${role==='mei'?'MEI':'Auditoria'} cadastrado com sucesso.`);
        location.reload();
      }catch(e){
        alert(e?.message||String(e));
        btn.disabled=false; btn.textContent='Cadastrar usuário';
      }
    };
  }finally{busy=false;}
}

const observer=new MutationObserver(()=>enhanceDirectRegistration());
observer.observe(app,{childList:true,subtree:true});
enhanceDirectRegistration();
