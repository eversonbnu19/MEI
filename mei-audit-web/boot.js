import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const app = document.querySelector('#app');
const params = new URLSearchParams(window.location.search || '');
const isCompanySignup = params.get('cadastro') === 'empresa';
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function showAccess(){
  app.innerHTML=`<div class="login"><div class="card"><h1>Acesso ao sistema</h1><p class="meta">Use seu e-mail e senha para entrar como Empresa, MEI ou Auditoria.</p><div class="field"><label>E-mail</label><input id="accessEmail" type="email" autocomplete="email"></div><div class="field"><label>Senha</label><input id="accessPassword" type="password" autocomplete="current-password"></div><button class="pri full" id="accessBtn">Entrar</button><hr style="border:0;border-top:1px solid #e4e7ec;margin:20px 0"><h3>Cadastro inicial</h3><p class="meta">O cadastro da empresa é separado do acesso dos usuários.</p><button class="sec full" id="openCompanySignup">Cadastrar empresa</button></div></div>`;

  document.querySelector('#accessBtn').onclick=async()=>{
    const email=(document.querySelector('#accessEmail')?.value||'').trim();
    const password=document.querySelector('#accessPassword')?.value||'';
    if(!email||!password){alert('Informe e-mail e senha.');return;}
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error){alert(error.message);return;}
    location.reload();
  };
  document.querySelector('#openCompanySignup').onclick=()=>{location.href='?cadastro=empresa';};
}

function showCompanySignup(){
  app.innerHTML=`<div class="login"><div class="card"><h1>Cadastrar empresa</h1><p class="meta">Cadastro direto nesta fase. Não será enviado e-mail de convite ou confirmação.</p><div class="field"><label>Nome do responsável</label><input id="companyOwner"></div><div class="field"><label>Razão social / Nome da empresa</label><input id="companyName"></div><div class="field"><label>CNPJ da empresa</label><input id="companyCnpj"></div><div class="field"><label>E-mail de acesso da empresa</label><input id="companyEmail" type="email" autocomplete="email"></div><div class="field"><label>Crie uma senha</label><input id="companyPassword" type="password" autocomplete="new-password" minlength="8"></div><button class="pri full" id="createCompanyBtn">Cadastrar empresa</button><button class="sec full" id="backToAccess" style="margin-top:10px">Voltar para o acesso</button><p class="meta">Depois, dentro do painel da empresa, cadastre diretamente os MEIs e a Auditoria com e-mail e senha inicial.</p></div></div>`;

  document.querySelector('#backToAccess').onclick=()=>{location.href='./';};
  document.querySelector('#createCompanyBtn').onclick=async()=>{
    const name=(document.querySelector('#companyOwner')?.value||'').trim();
    const companyName=(document.querySelector('#companyName')?.value||'').trim();
    const cnpj=(document.querySelector('#companyCnpj')?.value||'').trim();
    const email=(document.querySelector('#companyEmail')?.value||'').trim();
    const password=document.querySelector('#companyPassword')?.value||'';
    if(!companyName||!email||!password){alert('Preencha nome da empresa, e-mail e senha.');return;}
    if(password.length<8){alert('A senha deve ter pelo menos 8 caracteres.');return;}

    const {data,error}=await sb.functions.invoke('mei-create-user',{body:{role:'company',name,company_name:companyName,cnpj,email,password}});
    if(error){alert(error.message);return;}
    if(!data?.ok){alert(data?.error||'Não foi possível cadastrar a empresa.');return;}

    const login=await sb.auth.signInWithPassword({email,password});
    if(login.error){
      alert('Empresa criada. Retorne ao acesso e entre com o e-mail e senha cadastrados.');
      location.href='./';
      return;
    }
    location.href='./';
  };
}

if(isCompanySignup){
  showCompanySignup();
}else{
  const {data:{session}}=await sb.auth.getSession();
  if(session){
    await import('./direct-registration.js');
    await import('./app.js');
  }else showAccess();
}
