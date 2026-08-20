import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const app = document.querySelector('#app');
const originalHash = window.location.hash || '';
const originalSearch = window.location.search || '';
const isInvite = /type=invite/.test(originalHash) || new URLSearchParams(originalSearch).get('type') === 'invite';
const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function showInviteSetup(){
  app.innerHTML = `<div class="login"><div class="card"><h1>Ativar acesso</h1><p class="meta">Seu acesso foi criado pela empresa contratante. Defina sua senha para concluir a ativação.</p><div class="field"><label>Nova senha</label><input id="newPassword" type="password" autocomplete="new-password" minlength="8"></div><div class="field"><label>Confirmar senha</label><input id="confirmPassword" type="password" autocomplete="new-password" minlength="8"></div><button class="pri full" id="savePassword">Ativar conta</button><p class="meta">Use pelo menos 8 caracteres. Não compartilhe sua senha ou o link de convite.</p></div></div>`;
  document.querySelector('#savePassword').onclick = async () => {
    const p1=document.querySelector('#newPassword').value;
    const p2=document.querySelector('#confirmPassword').value;
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
}else{
  await import('./app.js');
}
