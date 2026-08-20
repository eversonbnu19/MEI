import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const app = document.querySelector('#app');
const params = new URLSearchParams(window.location.search || '');
const isCompanySignup = params.get('cadastro') === 'empresa';
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
document.title='Gestão de Contratos';

function fatal(e){
  console.error(e);
  const msg=e?.message||String(e||'Erro desconhecido');
  app.innerHTML=`<div class="login"><div class="card"><h1>Gestão de Contratos</h1><h3>Falha ao carregar</h3><p class="meta">${msg.replace(/[<>&]/g,'')}</p><button class="pri full" id="retryBoot">Tentar novamente</button></div></div>`;
  document.querySelector('#retryBoot').onclick=()=>location.reload();
}

function showAccess(){
  app.innerHTML=`<div class="login"><div class="card"><h1>Gestão de Contratos</h1><p class="meta">Use seu e-mail e senha para entrar como Empresa, MEI ou Auditoria.</p><div class="field"><label>E-mail</label><input id="accessEmail" type="email" autocomplete="email"></div><div class="field"><label>Senha</label><input id="accessPassword" type="password" autocomplete="current-password"></div><button class="pri full" id="accessBtn">Entrar</button><hr style="border:0;border-top:1px solid #e4e7ec;margin:20px 0"><h3>Cadastro inicial</h3><p class="meta">O cadastro da empresa é separado do acesso dos usuários.</p><button class="sec full" id="openCompanySignup">Cadastrar empresa</button></div></div>`;
  document.querySelector('#accessBtn').onclick=async()=>{
    try{
      const email=(document.querySelector('#accessEmail')?.value||'').trim();
      const password=document.querySelector('#accessPassword')?.value||'';
      if(!email||!password) throw new Error('Informe e-mail e senha.');
      const {error}=await sb.auth.signInWithPassword({email,password});
      if(error) throw error;
      location.reload();
    }catch(e){alert(e?.message||String(e));}
  };
  document.querySelector('#openCompanySignup').onclick=()=>{location.href='?cadastro=empresa';};
}

function showCompanySignup(){
  app.innerHTML=`<div class="login"><div class="card"><h1>Cadastrar empresa</h1><p class="meta">Cadastro direto nesta fase. Não será enviado e-mail de convite ou confirmação.</p><div class="field"><label>Nome do responsável</label><input id="companyOwner"></div><div class="field"><label>Razão social / Nome da empresa</label><input id="companyName"></div><div class="field"><label>CNPJ da empresa</label><input id="companyCnpj"></div><div class="field"><label>E-mail de acesso da empresa</label><input id="companyEmail" type="email" autocomplete="email"></div><div class="field"><label>Crie uma senha</label><input id="companyPassword" type="password" autocomplete="new-password" minlength="8"></div><button class="pri full" id="createCompanyBtn">Cadastrar empresa</button><button class="sec full" id="backToAccess" style="margin-top:10px">Voltar para o acesso</button><p class="meta">Depois, dentro do painel da empresa, cadastre diretamente os MEIs e a Auditoria com e-mail e senha inicial.</p></div></div>`;
  document.querySelector('#backToAccess').onclick=()=>{location.href='./';};
  document.querySelector('#createCompanyBtn').onclick=async()=>{
    try{
      const name=(document.querySelector('#companyOwner')?.value||'').trim();
      const companyName=(document.querySelector('#companyName')?.value||'').trim();
      const cnpj=(document.querySelector('#companyCnpj')?.value||'').trim();
      const email=(document.querySelector('#companyEmail')?.value||'').trim();
      const password=document.querySelector('#companyPassword')?.value||'';
      if(!companyName||!email||!password) throw new Error('Preencha nome da empresa, e-mail e senha.');
      if(password.length<8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
      const {data,error}=await sb.functions.invoke('mei-create-user',{body:{role:'company',name,company_name:companyName,cnpj,email,password}});
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error||'Não foi possível cadastrar a empresa.');
      const login=await sb.auth.signInWithPassword({email,password});
      if(login.error) throw login.error;
      location.href='./';
    }catch(e){alert(e?.message||String(e));}
  };
}

async function start(){
  if(isCompanySignup){showCompanySignup();return;}
  const {data,error}=await sb.auth.getSession();
  if(error) throw error;
  if(!data.session){showAccess();return;}
  await import('./app.js');
  import('./patch-direct-users.js').catch(console.error);
}

start().catch(fatal);
