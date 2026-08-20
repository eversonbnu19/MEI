import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const app = document.querySelector('#app');
const SITE_URL = 'https://eversonbnu19.github.io/MEI/';
const originalHash = window.location.hash || '';
const originalSearch = window.location.search || '';
const params = new URLSearchParams(originalSearch);
const isInvite = /type=invite/.test(originalHash) || params.get('type') === 'invite';
const isCompanySignup = params.get('cadastro') === 'empresa';
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function showAccess(){
  app.innerHTML=`<div class="login"><div class="card"><h1>Acesso ao sistema</h1><p class="meta">Use seu e-mail e senha para entrar como Empresa, MEI ou Auditoria.</p><div class="field"><label>E-mail</label><input id="accessEmail" type="email" autocomplete="email"></div><div class="field"><label>Senha</label><input id="accessPassword" type="password" autocomplete="current-password"></div><button class="pri full" id="accessBtn">Entrar</button><hr style="border:0;border-top:1px solid #e4e7ec;margin:20px 0"><h3>Primeiro cadastro da empresa</h3><p class="meta">O cadastro da empresa é separado do acesso dos usuários.</p><button class="sec full" id="openCompanySignup">Cadastrar empresa</button></div></div>`;

  document.querySelector('#accessBtn').onclick=async()=>{
    const email=(document.querySelector('#accessEmail')?.value||'').trim();
    const password=document.querySelector('#accessPassword')?.value||'';
    if(!email||!password){alert('Informe e-mail e senha.');return;}
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error){alert(error.message);return;}
    location.reload();
  };
  document.querySelector('#openCompanySignup').onclick=()=>{
    location.href='?cadastro=empresa';
  };
}

function showCompanySignup(){
  app.innerHTML=`<div class="login"><div class="card"><h1>Cadastrar empresa</h1><p class="meta">Esta tela é exclusiva para o cadastro inicial da empresa administradora.</p><div class="field"><label>Nome do responsável</label><input id="companyOwner"></div><div class="field"><label>Razão social / Nome da empresa</label><input id="companyName"></div><div class="field"><label>CNPJ da empresa</label><input id="companyCnpj"></div><div class="field"><label>E-mail de acesso da empresa</label><input id="companyEmail" type="email" autocomplete="email"></div><div class="field"><label>Crie uma senha</label><input id="companyPassword" type="password" autocomplete="new-password" minlength="8"></div><button class="pri full" id="createCompanyBtn">Cadastrar empresa</button><button class="sec full" id="backToAccess" style="margin-top:10px">Voltar para o acesso</button><p class="meta">Depois que a empresa estiver criada, MEIs e Auditoria serão cadastrados somente por convite dentro do painel.</p></div></div>`;

  document.querySelector('#backToAccess').onclick=()=>{location.href='./';};
  document.querySelector('#createCompanyBtn').onclick=async()=>{
    const name=(document.querySelector('#companyOwner')?.value||'').trim();
    const companyName=(document.querySelector('#companyName')?.value||'').trim();
    const cnpj=(document.querySelector('#companyCnpj')?.value||'').trim();
    const email=(document.querySelector('#companyEmail')?.value||'').trim();
    const password=document.querySelector('#companyPassword')?.value||'';
    if(!companyName||!email||!password){alert('Preencha nome da empresa, e-mail e senha.');return;}
    if(password.length<8){alert('A senha deve ter pelo menos 8 caracteres.');return;}
    const {error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:SITE_URL,data:{name,company_name:companyName,cnpj}}});
    if(error){alert(error.message);return;}
    app.innerHTML=`<div class="login"><div class="card"><h1>Cadastro enviado</h1><p>Verifique o e-mail <b>${email}</b> para confirmar o cadastro da empresa.</p><button class="pri full" id="goAccess">Ir para o acesso</button></div></div>`;
    document.querySelector('#goAccess').onclick=()=>{location.href='./';};
  };
}

function showInviteSetup(){
  app.innerHTML = `<div class="login"><div class="card"><h1>Ativar acesso</h1><p class="meta">Seu acesso foi criado pela empresa contratante. Defina sua senha para concluir a ativação.</p><div class="field"><label>Nova senha</label><input id="newPassword" type="password" autocomplete="new-password" minlength="8"></div><div class="field"><label>Confirmar senha</label><input id="confirmPassword" type="password" autocomplete="new-password" minlength="8"></div><button class="pri full" id="savePassword">Ativar conta</button><p class="meta">Use pelo menos 8 caracteres. Não compartilhe sua senha ou o link de convite.</p></div></div>`;
  document.querySelector('#savePassword').onclick = async () => {
    const p1=document.querySelector('#newPassword')?.value||'';
    const p2=document.querySelector('#confirmPassword')?.value||'';
    if(p1.length<8){alert('A senha deve ter pelo menos 8 caracteres.');return;}
    if(p1!==p2){alert('As senhas não conferem.');return;}
    const {error}=await sb.auth.updateUser({password:p1});
    if(error){alert(error.message);return;}
    history.replaceState({},'',location.pathname);
    location.reload();
  };
}

if(isInvite){
  const {data:{session}}=await sb.auth.getSession();
  if(session) showInviteSetup();
  else {
    app.innerHTML='<div class="login"><div class="card"><h1>Validando convite...</h1><p class="meta">Se o convite for válido, a ativação será exibida automaticamente.</p></div></div>';
    const {data:{subscription}}=sb.auth.onAuthStateChange((event,session)=>{
      if(session){subscription.unsubscribe();showInviteSetup();}
    });
    setTimeout(async()=>{
      const {data:{session:s}}=await sb.auth.getSession();
      if(!s) app.innerHTML='<div class="login"><div class="card"><h1>Convite inválido ou expirado</h1><p class="meta">Solicite à empresa um novo convite por e-mail.</p></div></div>';
    },3500);
  }
}else if(isCompanySignup){
  showCompanySignup();
}else{
  const {data:{session}}=await sb.auth.getSession();
  if(session) await import('./app.js');
  else showAccess();
}
