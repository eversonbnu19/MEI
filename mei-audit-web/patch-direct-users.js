import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

function renameApp(){
  if(document.title!=='Gestão de Contratos') document.title='Gestão de Contratos';
  document.querySelectorAll('b,h1,h2,h3,p,small').forEach(el=>{
    if(el.childElementCount!==0) return;
    const current=el.textContent||'';
    let next=current;
    if(next.includes('MEI Contratos Auditáveis')) next=next.replaceAll('MEI Contratos Auditáveis','Gestão de Contratos');
    if(next.includes('Convide e ative pelo menos um MEI')) next=next.replace('Convide e ative pelo menos um MEI','Cadastre pelo menos um MEI');
    if(next!==current) el.textContent=next;
  });
}

async function patchUserForm(){
  const btn=document.querySelector('#sendInvite');
  if(!btn || btn.dataset.directPatched==='1') return;
  btn.dataset.directPatched='1';
  btn.textContent='Salvar';
  const card=btn.closest('.card');
  const h2=card?.querySelector('h2'); if(h2 && h2.textContent!=='Cadastrar usuário') h2.textContent='Cadastrar usuário';
  const meta=card?.querySelector('.meta'); if(meta && meta.textContent!=='Cadastre MEI ou Auditoria diretamente. Nesta fase não há envio de e-mail.') meta.textContent='Cadastre MEI ou Auditoria diretamente. Nesta fase não há envio de e-mail.';
  if(!document.querySelector('#invitePassword')){
    const wrap=document.createElement('div');
    wrap.className='field';
    wrap.innerHTML='<label>Senha inicial</label><input id="invitePassword" type="password" minlength="8" autocomplete="new-password">';
    btn.parentNode.insertBefore(wrap,btn);
  }
  const tableTitle=[...document.querySelectorAll('.card h2')].find(x=>x.textContent==='Usuários e convites');
  if(tableTitle) tableTitle.textContent='Usuários cadastrados';

  btn.onclick=async(ev)=>{
    ev.preventDefault(); ev.stopImmediatePropagation();
    try{
      btn.disabled=true; btn.textContent='Salvando...';
      const email=(document.querySelector('#inviteEmail')?.value||'').trim();
      const role=document.querySelector('#inviteRole')?.value||'';
      const name=(document.querySelector('#inviteName')?.value||'').trim();
      const cnpj=(document.querySelector('#inviteCnpj')?.value||'').trim();
      const password=document.querySelector('#invitePassword')?.value||'';
      if(!email||!name) throw new Error('Informe nome e e-mail.');
      if(password.length<8) throw new Error('A senha inicial deve ter pelo menos 8 caracteres.');
      const {data:{user},error:userErr}=await sb.auth.getUser(); if(userErr||!user) throw new Error('Sessão inválida.');
      const {data:links,error:linkErr}=await sb.from('mei_company_users').select('company_id').eq('user_id',user.id).limit(1);
      if(linkErr||!links?.length) throw new Error('Empresa não encontrada para este usuário.');
      const {data,error}=await sb.functions.invoke('mei-create-user',{body:{company_id:links[0].company_id,email,role,name,cnpj,password}});
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error||'Não foi possível salvar o usuário.');
      alert('Usuário salvo com sucesso.');
      location.reload();
    }catch(e){alert(e?.message||String(e)); btn.disabled=false; btn.textContent='Salvar';}
  };
}

function applyPatches(){
  renameApp();
  patchUserForm();
}

const appRoot=document.querySelector('#app');
if(appRoot){
  let scheduled=false;
  const observer=new MutationObserver(()=>{
    if(scheduled) return;
    scheduled=true;
    queueMicrotask(()=>{
      scheduled=false;
      applyPatches();
    });
  });
  observer.observe(appRoot,{subtree:true,childList:true});
}

applyPatches();
