import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let companyIdCache=null;
let usersRefreshPromise=null;

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

async function getCompanyId(){
  if(companyIdCache) return companyIdCache;
  const {data:{user},error:userErr}=await sb.auth.getUser();
  if(userErr||!user) throw new Error('Sessão inválida.');
  const {data:links,error:linkErr}=await sb.from('mei_company_users').select('company_id').eq('user_id',user.id).limit(1);
  if(linkErr||!links?.length) throw new Error('Empresa não encontrada para este usuário.');
  companyIdCache=links[0].company_id;
  return companyIdCache;
}

function usersTable(){
  const title=[...document.querySelectorAll('.card h2')].find(x=>['Usuários e convites','Usuários cadastrados'].includes(x.textContent||''));
  if(title && title.textContent!=='Usuários cadastrados') title.textContent='Usuários cadastrados';
  return title?.closest('.card')?.querySelector('table')||null;
}

async function refreshUserManagement(){
  const table=usersTable();
  if(!table) return;
  if(usersRefreshPromise) return usersRefreshPromise;
  usersRefreshPromise=(async()=>{
    try{
      const companyId=await getCompanyId();
      const {data,error}=await sb.rpc('mei_company_people',{p_company:companyId});
      if(error) throw error;
      const people=data||[];
      table.innerHTML=`<tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr>${people.map(p=>`<tr data-managed-user="${esc(p.user_id||'')}"><td>${esc(p.name||'—')}</td><td>${esc(p.email||'')}</td><td>${p.role==='mei'?'MEI':'Auditoria'}</td><td>${p.status==='active'?'<span class="badge b-ok">Ativo</span>':'<span class="badge b-warn">Pendente</span>'}</td><td>${p.user_id&&p.status==='active'?`<button class="sec" data-edit-user="${esc(p.user_id)}" data-name="${esc(p.name||'')}" data-email="${esc(p.email||'')}" data-role="${esc(p.role||'')}" data-cnpj="${esc(p.cnpj||'')}">Editar</button> <button class="sec" data-delete-user="${esc(p.user_id)}" data-name="${esc(p.name||p.email||'usuário')}">Excluir</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum usuário cadastrado.</td></tr>'}`;
      bindUserActions();
    }catch(e){console.error('Falha ao carregar gestão de usuários:',e);}
  })();
  try{return await usersRefreshPromise;}finally{usersRefreshPromise=null;}
}

function bindUserActions(){
  document.querySelectorAll('[data-edit-user]').forEach(btn=>{
    if(btn.dataset.bound==='1') return;
    btn.dataset.bound='1';
    btn.onclick=async()=>{
      try{
        const currentName=btn.dataset.name||'';
        const currentEmail=btn.dataset.email||'';
        const currentRole=btn.dataset.role||'mei';
        const currentCnpj=btn.dataset.cnpj||'';
        const name=prompt('Nome do usuário:',currentName);
        if(name===null) return;
        const email=prompt('E-mail do usuário:',currentEmail);
        if(email===null) return;
        const roleAnswer=prompt('Perfil: digite MEI ou AUDITORIA',currentRole==='mei'?'MEI':'AUDITORIA');
        if(roleAnswer===null) return;
        const role=roleAnswer.trim().toLowerCase()==='mei'?'mei':roleAnswer.trim().toLowerCase()==='auditoria'?'auditor':'';
        if(!role) throw new Error('Perfil inválido. Use MEI ou AUDITORIA.');
        const cnpj=prompt('CNPJ do MEI (deixe vazio para Auditoria):',currentCnpj);
        if(cnpj===null) return;
        if(!name.trim()||!email.trim()) throw new Error('Nome e e-mail são obrigatórios.');
        btn.disabled=true; btn.textContent='Salvando...';
        const companyId=await getCompanyId();
        const {data,error}=await sb.functions.invoke('mei-manage-user',{body:{action:'update',company_id:companyId,user_id:btn.dataset.editUser,name:name.trim(),email:email.trim(),role,cnpj:cnpj.trim()}});
        if(error) throw error;
        if(!data?.ok) throw new Error(data?.error||'Não foi possível editar o usuário.');
        alert('Usuário atualizado com sucesso.');
        await refreshUserManagement();
      }catch(e){alert(e?.message||String(e));}
      finally{btn.disabled=false;btn.textContent='Editar';}
    };
  });

  document.querySelectorAll('[data-delete-user]').forEach(btn=>{
    if(btn.dataset.bound==='1') return;
    btn.dataset.bound='1';
    btn.onclick=async()=>{
      const name=btn.dataset.name||'este usuário';
      if(!confirm(`Excluir o acesso de ${name}?\n\nO histórico de contratos, horas, peças e fechamentos será preservado.`)) return;
      try{
        btn.disabled=true; btn.textContent='Excluindo...';
        const companyId=await getCompanyId();
        const {data,error}=await sb.functions.invoke('mei-manage-user',{body:{action:'delete',company_id:companyId,user_id:btn.dataset.deleteUser}});
        if(error) throw error;
        if(!data?.ok) throw new Error(data?.error||'Não foi possível excluir o usuário.');
        alert('Acesso do usuário removido. O histórico foi preservado.');
        await refreshUserManagement();
      }catch(e){alert(e?.message||String(e));}
      finally{btn.disabled=false;btn.textContent='Excluir';}
    };
  });
}

async function patchUserForm(){
  const btn=document.querySelector('#sendInvite');
  if(!btn) return;
  if(btn.dataset.directPatched!=='1'){
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
        const companyId=await getCompanyId();
        const {data,error}=await sb.functions.invoke('mei-create-user',{body:{company_id:companyId,email,role,name,cnpj,password}});
        if(error) throw error;
        if(!data?.ok) throw new Error(data?.error||'Não foi possível salvar o usuário.');
        alert('Usuário salvo com sucesso.');
        document.querySelector('#inviteName').value='';
        document.querySelector('#inviteEmail').value='';
        document.querySelector('#inviteCnpj').value='';
        document.querySelector('#invitePassword').value='';
        await refreshUserManagement();
      }catch(e){alert(e?.message||String(e));}
      finally{btn.disabled=false;btn.textContent='Salvar';}
    };
  }
  await refreshUserManagement();
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
