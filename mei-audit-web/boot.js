import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

window.__GESTAO_BOOT_STARTED__=true;
const app=document.querySelector('#app');
const params=new URLSearchParams(window.location.search||'');
const isCompanySignup=params.get('cadastro')==='empresa';
let sb=null;
document.title='Gestão de Contratos';

function clean(s){return String(s??'').replace(/[<>&]/g,'');}
function status(msg){const el=document.querySelector('#connectionStatus');if(el)el.textContent=msg||'';}
function timeout(ms,label){return new Promise((_,reject)=>setTimeout(()=>reject(new Error(label||'Tempo limite excedido')),ms));}
function withTimeout(promise,ms,label){return Promise.race([promise,timeout(ms,label)]);}
async function importWithTimeout(src,ms=7000){return withTimeout(import(src),ms,'Tempo limite ao carregar biblioteca externa.');}
async function ensureSb(){
  if(sb) return sb;
  status('Conectando ao sistema...');
  const sources=['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm','https://esm.sh/@supabase/supabase-js@2.57.4'];
  let last=null;
  for(const src of sources){
    try{
      const mod=await importWithTimeout(src);
      if(mod?.createClient){sb=mod.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);window.__GESTAO_SB__=sb;status('');return sb;}
    }catch(e){last=e;console.warn(e);}
  }
  status('Falha de conexão.');
  throw new Error('Não foi possível conectar ao serviço. '+(last?.message||''));
}

function showAccess(){
  app.innerHTML=`<div class="login"><div class="card"><h1>Gestão de Contratos</h1><p class="meta">Use seu e-mail e senha para entrar como Empresa, MEI ou Auditoria.</p><div class="field"><label>E-mail</label><input id="accessEmail" type="email" autocomplete="email"></div><div class="field"><label>Senha</label><input id="accessPassword" type="password" autocomplete="current-password"></div><button class="pri full" id="accessBtn">Entrar</button><p class="meta" id="connectionStatus"></p><hr style="border:0;border-top:1px solid #e4e7ec;margin:20px 0"><h3>Cadastro inicial</h3><p class="meta">O cadastro da empresa é separado do acesso dos usuários.</p><button class="sec full" id="openCompanySignup">Cadastrar empresa</button></div></div>`;
  document.querySelector('#accessBtn').onclick=async()=>{
    const btn=document.querySelector('#accessBtn');
    try{
      const email=(document.querySelector('#accessEmail')?.value||'').trim();
      const password=document.querySelector('#accessPassword')?.value||'';
      if(!email||!password) throw new Error('Informe e-mail e senha.');
      btn.disabled=true;btn.textContent='Entrando...';
      const client=await ensureSb();
      status('Validando acesso...');
      const login=await withTimeout(client.auth.signInWithPassword({email,password}),12000,'A autenticação demorou mais que o esperado. Tente novamente.');
      if(login.error) throw login.error;
      status('Carregando painel...');
      await withTimeout(openApp(),12000,'O acesso foi validado, mas o painel demorou para carregar. Atualize a página e tente novamente.');
    }catch(e){
      console.error('Falha no login:',e);
      status('');
      alert(clean(e?.message||e));
      btn.disabled=false;
      btn.textContent='Entrar';
    }
  };
  document.querySelector('#openCompanySignup').onclick=()=>{location.href='?cadastro=empresa';};
}

function showCompanySignup(){
  app.innerHTML=`<div class="login"><div class="card"><h1>Cadastrar empresa</h1><p class="meta">Cadastro direto nesta fase. Não será enviado e-mail de convite ou confirmação.</p><div class="field"><label>Nome do responsável</label><input id="companyOwner"></div><div class="field"><label>Razão social / Nome da empresa</label><input id="companyName"></div><div class="field"><label>CNPJ da empresa</label><input id="companyCnpj"></div><div class="field"><label>E-mail de acesso da empresa</label><input id="companyEmail" type="email"></div><div class="field"><label>Crie uma senha</label><input id="companyPassword" type="password" minlength="8"></div><button class="pri full" id="createCompanyBtn">Cadastrar empresa</button><p class="meta" id="connectionStatus"></p><button class="sec full" id="backToAccess" style="margin-top:10px">Voltar para o acesso</button></div></div>`;
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
      const client=await ensureSb();
      const {data,error}=await withTimeout(client.functions.invoke('mei-create-user',{body:{role:'company',name,company_name:companyName,cnpj,email,password}}),12000,'O cadastro demorou mais que o esperado. Tente novamente.');
      if(error)throw error;if(!data?.ok)throw new Error(data?.error||'Não foi possível cadastrar a empresa.');
      const login=await withTimeout(client.auth.signInWithPassword({email,password}),12000,'A autenticação demorou mais que o esperado.');
      if(login.error)throw login.error;
      await withTimeout(openApp(),12000,'Cadastro concluído, mas o painel demorou para carregar. Atualize a página.');
    }catch(e){alert(clean(e?.message||e));btn.disabled=false;btn.textContent='Cadastrar empresa';}
  };
}

async function openApp(){
  window.__GESTAO_SB__=sb;
  await import('./app.js?v=6');
  import('./patch-direct-users.js?v=6').catch(console.error);
}

async function restoreSession(){
  try{
    const client=await ensureSb();
    const {data}=await withTimeout(client.auth.getSession(),8000,'Tempo limite ao recuperar sessão.');
    if(data?.session){status('Carregando painel...');await withTimeout(openApp(),12000,'O painel demorou para carregar.');}
  }catch(e){console.warn('Sessão automática indisponível:',e);status('');}
}

if(isCompanySignup)showCompanySignup();else showAccess();
restoreSession();
