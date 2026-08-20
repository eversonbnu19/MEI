import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const APP_VERSION='v16';
window.__GESTAO_BOOT_STARTED__=true;
window.__GESTAO_APP_VERSION__=APP_VERSION;
const app=document.querySelector('#app');
const params=new URLSearchParams(window.location.search||'');
const isCompanySignup=params.get('cadastro')==='empresa';
const isLogout=params.get('logout')==='1';
let sb=null;
let appOpenPromise=null;
document.title=`Gestão de Contratos ${APP_VERSION}`;

function clean(s){return String(s??'').replace(/[<>&]/g,'');}
function status(msg){const el=document.querySelector('#connectionStatus');if(el)el.textContent=msg||'';}
function versionBadge(){return `<p class="meta" style="margin-top:6px"><b>Versão ${APP_VERSION}</b></p>`;}
function timeout(ms,label){return new Promise((_,reject)=>setTimeout(()=>reject(new Error(label||'Tempo limite excedido')),ms));}
async function withTimeout(promise,ms,label){return Promise.race([promise,timeout(ms,label)]);}

function showPanelVersion(){
  const role=document.querySelector('.top > div:first-child small');
  if(role && !role.textContent.includes(`Versão ${APP_VERSION}`)){
    role.textContent=`${role.textContent} • Versão ${APP_VERSION}`;
  }
}
new MutationObserver(showPanelVersion).observe(document.documentElement,{subtree:true,childList:true});

async function ensureSb(){
  if(sb) return sb;
  status('Conectando ao sistema...');
  try{
    const mod=await withTimeout(import('https://esm.sh/@supabase/supabase-js@2.57.4'),8000,'Falha ao carregar a biblioteca do sistema.');
    if(!mod?.createClient) throw new Error('Biblioteca do sistema inválida.');
    sb=mod.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
    window.__GESTAO_SB__=sb;
    status('');
    return sb;
  }catch(e){status('Falha de conexão.');throw e;}
}

async function signInWithMigration(client,email,password,btn){
  let result=await withTimeout(client.auth.signInWithPassword({email,password}),10000,'A autenticação demorou demais.');
  if(!result.error) return result;
  const code=String(result.error?.code||'');
  const message=String(result.error?.message||'').toLowerCase();
  const invalid=code==='invalid_credentials'||message.includes('invalid login credentials')||message.includes('invalid credentials');
  if(!invalid) throw result.error;
  btn.textContent='Migrando acesso...';
  const migrated=await withTimeout(client.functions.invoke('mei-migrate-login',{body:{email,password}}),12000,'A migração do acesso demorou demais.');
  if(migrated.error) throw new Error(migrated.data?.error||migrated.error.message||'Não foi possível migrar o acesso.');
  if(!migrated.data?.ok) throw new Error(migrated.data?.error||'Credenciais inválidas.');
  btn.textContent='Validando acesso...';
  result=await withTimeout(client.auth.signInWithPassword({email,password}),10000,'A autenticação demorou demais.');
  if(result.error) throw result.error;
  return result;
}

function showAccess(){
  app.innerHTML=`<div class="login"><div class="card"><h1>Gestão de Contratos</h1>${versionBadge()}<p class="meta">Use seu e-mail e senha para entrar como Empresa, MEI ou Auditoria.</p><div class="field"><label>E-mail</label><input id="accessEmail" type="email" autocomplete="email"></div><div class="field"><label>Senha</label><input id="accessPassword" type="password" autocomplete="current-password"></div><button class="pri full" id="accessBtn">Entrar</button><p class="meta" id="connectionStatus"></p><hr style="border:0;border-top:1px solid #e4e7ec;margin:20px 0"><h3>Cadastro inicial</h3><p class="meta">O cadastro da empresa é separado do acesso dos usuários.</p><button class="sec full" id="openCompanySignup">Cadastrar empresa</button></div></div>`;
  document.querySelector('#accessBtn').onclick=async()=>{
    const btn=document.querySelector('#accessBtn');
    try{
      const email=(document.querySelector('#accessEmail')?.value||'').trim();
      const password=document.querySelector('#accessPassword')?.value||'';
      if(!email||!password) throw new Error('Informe e-mail e senha.');
      btn.disabled=true;btn.textContent='Validando acesso...';
      const client=await withTimeout(ensureSb(),8000,'Falha ao conectar.');
      await signInWithMigration(client,email,password,btn);
      btn.textContent='Carregando painel...';
      await withTimeout(openApp(),10000,'O painel demorou demais para carregar. Tente atualizar a página.');
    }catch(e){alert(clean(e?.message||e));btn.disabled=false;btn.textContent='Entrar';}
  };
  document.querySelector('#openCompanySignup').onclick=()=>{location.href='?cadastro=empresa';};
}

function showCompanySignup(){
  app.innerHTML=`<div class="login"><div class="card"><h1>Cadastrar empresa</h1>${versionBadge()}<p class="meta">Cadastro direto nesta fase. Não será enviado e-mail de convite ou confirmação.</p><div class="field"><label>Nome do responsável</label><input id="companyOwner"></div><div class="field"><label>Razão social / Nome da empresa</label><input id="companyName"></div><div class="field"><label>CNPJ da empresa</label><input id="companyCnpj"></div><div class="field"><label>E-mail de acesso da empresa</label><input id="companyEmail" type="email"></div><div class="field"><label>Crie uma senha</label><input id="companyPassword" type="password" minlength="8"></div><button class="pri full" id="createCompanyBtn">Cadastrar empresa</button><p class="meta" id="connectionStatus"></p><button class="sec full" id="backToAccess" style="margin-top:10px">Voltar para o acesso</button></div></div>`;
  document.querySelector('#backToAccess').onclick=()=>{location.href='./';};
  document.querySelector('#createCompanyBtn').onclick=async()=>{
    const btn=document.querySelector('#createCompanyBtn');
    try{
      const name=(document.querySelector('#companyOwner')?.value||'').trim();
      const companyName=(document.querySelector('#companyName')?.value||'').trim();
      const cnpj=(document.querySelector('#companyCnpj')?.value||'').trim();
      const email=(document.querySelector('#companyEmail')?.value||'').trim();
      const password=document.querySelector('#companyPassword')?.value||'';
      if(!companyName||!email||!password) throw new Error('Preencha nome da empresa, e-mail e senha.');
      if(password.length<8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
      btn.disabled=true;btn.textContent='Salvando...';
      const client=await withTimeout(ensureSb(),8000,'Falha ao conectar.');
      const result=await withTimeout(client.functions.invoke('mei-create-user',{body:{role:'company',name,company_name:companyName,cnpj,email,password}}),10000,'O cadastro demorou demais.');
      if(result.error)throw result.error;if(!result.data?.ok)throw new Error(result.data?.error||'Não foi possível cadastrar a empresa.');
      const login=await withTimeout(client.auth.signInWithPassword({email,password}),10000,'A autenticação demorou demais.');if(login.error)throw login.error;
      btn.textContent='Carregando painel...';
      await withTimeout(openApp(),10000,'O painel demorou demais para carregar. Tente atualizar a página.');
    }catch(e){alert(clean(e?.message||e));btn.disabled=false;btn.textContent='Cadastrar empresa';}
  };
}

function patchPanelSource(source){
  source=source.replace(
    "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';\nimport { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';\n\nconst sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);",
    "const sb = window.__GESTAO_SB__;\nif(!sb) throw new Error('Cliente do sistema não inicializado.');"
  );

  source=source.replace(
    "let profile = null, sessionId = null, tab = 'inicio';",
    "let profile = null, sessionId = null, tab = new URLSearchParams(location.search).get('tab') || 'inicio';"
  );

  source=source.replace(
    '<button data-tab="${x[0]}" class="${tab===x[0]?\'active\':\'\'}">${x[1]}</button>',
    '<a href="?tab=${encodeURIComponent(x[0])}" data-tab="${x[0]}" class="${tab===x[0]?\'active\':\'\'}">${x[1]}</a>'
  );

  source=source.replace(
    '<button id="logout" class="sec">Sair</button>',
    '<a href="?logout=1" id="logout" class="sec" style="display:inline-block;text-decoration:none;border-radius:10px;padding:11px 14px;font-weight:800">Sair</a>'
  );

  const oldAfterLogin=`async function afterLogin(){
  await loadProfile();
  const d={user_agent:navigator.userAgent,platform:navigator.platform||'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
  const {data}=await sb.from('mei_access_sessions').insert({user_id:profile.id,...d}).select().single();
  sessionId=data?.id||null; await audit('login','access_session',sessionId,d); tab='inicio'; render();
}`;

  const safeAfterLogin=`async function afterLogin(){
  if(window.__GESTAO_AFTER_LOGIN_PROMISE__) return window.__GESTAO_AFTER_LOGIN_PROMISE__;
  window.__GESTAO_AFTER_LOGIN_PROMISE__=(async()=>{
    await loadProfile();
    if(!profile) throw new Error('Perfil do usuário não encontrado.');
    const requestedTab=new URLSearchParams(location.search).get('tab');
    if(requestedTab) tab=requestedTab;
    if(window.__GESTAO_AFTER_LOGIN_USER__===profile.id){await render();return;}
    const d={user_agent:navigator.userAgent,platform:navigator.platform||'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
    try{
      const sessionResult=await Promise.race([
        Promise.resolve(sb.from('mei_access_sessions').insert({user_id:profile.id,...d}).select().single()),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('Registro de sessão excedeu o tempo limite.')),3000))
      ]);
      if(sessionResult?.error) console.warn('Não foi possível registrar sessão:',sessionResult.error);
      sessionId=sessionResult?.data?.id||null;
    }catch(e){sessionId=null;console.warn('Sessão de auditoria não bloqueou o acesso:',e);}
    Promise.resolve(audit('login','access_session',sessionId,d)).catch(e=>console.warn('Auditoria de login indisponível:',e));
    window.__GESTAO_AFTER_LOGIN_USER__=profile.id;
    await render();
  })();
  try{return await window.__GESTAO_AFTER_LOGIN_PROMISE__;}finally{window.__GESTAO_AFTER_LOGIN_PROMISE__=null;}
}`;

  if(!source.includes(oldAfterLogin)) throw new Error('Versão do painel incompatível com o carregador.');
  return source.replace(oldAfterLogin,safeAfterLogin);
}

function openApp(){
  if(appOpenPromise) return appOpenPromise;
  appOpenPromise=(async()=>{
    window.__GESTAO_SB__=sb;
    const response=await fetch('./app.js?v=16',{cache:'no-store'});
    if(!response.ok) throw new Error('Não foi possível carregar o painel.');
    const source=patchPanelSource(await response.text());
    const blobUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    try{await import(blobUrl);}finally{URL.revokeObjectURL(blobUrl);}
    showPanelVersion();
    import('./patch-direct-users.js?v=16').catch(console.error);
  })();
  appOpenPromise.catch(()=>{appOpenPromise=null;});
  return appOpenPromise;
}

async function restoreSession(){
  try{
    const client=await ensureSb();
    const {data}=await withTimeout(client.auth.getSession(),8000,'Sessão indisponível.');
    if(data?.session) await withTimeout(openApp(),10000,'O painel demorou demais para carregar.');
  }catch(e){console.warn('Sessão automática indisponível:',e);status('');}
}

async function handleLogoutRoute(){
  try{
    const client=await ensureSb();
    await withTimeout(client.auth.signOut(),4000,'Saída demorou demais.');
  }catch(e){console.warn('Falha ao encerrar sessão:',e);}
  finally{location.replace('./');}
}

if(isLogout){handleLogoutRoute();}
else if(isCompanySignup){showCompanySignup();}
else{showAccess();restoreSession();}
