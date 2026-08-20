import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let companyIdCache=null;
let usersRefreshPromise=null;
let editingTarget=null;

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

function userSignature(people){
  return JSON.stringify(people.map(p=>[p.user_id||'',p.name||'',p.email||'',p.cnpj||'',p.role||'',p.status||'']));
}

async function refreshUserManagement(force=false){
  const table=usersTable();
  if(!table) return;
  if(usersRefreshPromise) return usersRefreshPromise;
  usersRefreshPromise=(async()=>{
    try{
      const companyId=await getCompanyId();
      const {data,error}=await sb.rpc('mei_company_people',{p_company:companyId});
      if(error) throw error;
      const people=data||[];
      const signature=userSignature(people);
      if(!force && table.dataset.managementSignature===signature) return;
      table.dataset.managementSignature=signature;
      table.innerHTML=`<tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr>${people.map(p=>{
        const active=Boolean(p.user_id)&&p.status==='active';
        const common=`data-name="${esc(p.name||'')}" data-email="${esc(p.email||'')}" data-role="${esc(p.role||'')}" data-cnpj="${esc(p.cnpj||'')}" data-status="${esc(p.status||'')}"`;
        const target=active?`data-user-id="${esc(p.user_id)}"`:`data-invite-email="${esc(p.email||'')}" data-invite-role="${esc(p.role||'')}"`;
        return `<tr><td>${esc(p.name||'—')}</td><td>${esc(p.email||'')}</td><td>${p.role==='mei'?'MEI':'Auditoria'}</td><td>${active?'<span class="badge b-ok">Ativo</span>':'<span class="badge b-warn">Pendente</span>'}</td><td><button class="sec" data-edit-managed ${target} ${common}>Editar</button> <button class="sec" data-delete-managed ${target} ${common}>Excluir</button></td></tr>`;
      }).join('')||'<tr><td colspan="5">Nenhum usuário cadastrado.</td></tr>'}`;
      bindUserActions();
    }catch(e){console.error('Falha ao carregar gestão de usuários:',e);}
  })();
  try{return await usersRefreshPromise;}finally{usersRefreshPromise=null;}
}

function clearEditMode(){
  editingTarget=null;
  const formBtn=document.querySelector('#sendInvite');
  const cancel=document.querySelector('#cancelUserEdit');
  if(formBtn) formBtn.textContent='Salvar';
  if(cancel) cancel.remove();
  const password=document.querySelector('#invitePassword');
  if(password){password.value='';password.disabled=false;password.closest('.field')?.removeAttribute('hidden');}
}

function loadIntoUserForm(btn){
  const role=document.querySelector('#inviteRole');
  const name=document.querySelector('#inviteName');
  const email=document.querySelector('#inviteEmail');
  const cnpj=document.querySelector('#inviteCnpj');
  const password=document.querySelector('#invitePassword');
  const formBtn=document.querySelector('#sendInvite');
  if(!role||!name||!email||!cnpj||!formBtn) throw new Error('Formulário de usuário não encontrado.');

  role.value=btn.dataset.role||'mei';
  name.value=btn.dataset.name||'';
  email.value=btn.dataset.email||'';
  cnpj.value=btn.dataset.cnpj||'';
  if(password){password.value='';password.disabled=true;password.closest('.field')?.setAttribute('hidden','');}

  editingTarget={
    user_id:btn.dataset.userId||'',
    invite_email:btn.dataset.inviteEmail||'',
    invite_role:btn.dataset.inviteRole||'',
    status:btn.dataset.status||''
  };
  formBtn.textContent='Atualizar usuário';

  if(!document.querySelector('#cancelUserEdit')){
    const cancel=document.createElement('button');
    cancel.type='button';
    cancel.id='cancelUserEdit';
    cancel.className='sec';
    cancel.style.marginLeft='8px';
    cancel.textContent='Cancelar edição';
    cancel.onclick=()=>{
      clearEditMode();
      name.value='';email.value='';cnpj.value='';role.value='mei';
    };
    formBtn.insertAdjacentElement('afterend',cancel);
  }
  formBtn.scrollIntoView({behavior:'smooth',block:'center'});
  name.focus();
}

function bindUserActions(){
  document.querySelectorAll('[data-edit-managed]').forEach(btn=>{
    if(btn.dataset.bound==='1') return;
    btn.dataset.bound='1';
    btn.onclick=()=>{
      try{loadIntoUserForm(btn);}catch(e){alert(e?.message||String(e));}
    };
  });

  document.querySelectorAll('[data-delete-managed]').forEach(btn=>{
    if(btn.dataset.bound==='1') return;
    btn.dataset.bound='1';
    btn.onclick=async()=>{
      const name=btn.dataset.name||btn.dataset.email||'este usuário';
      if(!confirm(`Excluir ${name}?\n\nUsuários ativos terão o acesso bloqueado e o histórico preservado. Convites pendentes serão removidos.`)) return;
      try{
        btn.disabled=true;btn.textContent='Excluindo...';
        const companyId=await getCompanyId();
        const body={action:'delete',company_id:companyId};
        if(btn.dataset.userId) body.user_id=btn.dataset.userId;
        else {body.invite_email=btn.dataset.inviteEmail||'';body.invite_role=btn.dataset.inviteRole||'';}
        const {data,error}=await sb.functions.invoke('mei-manage-user',{body});
        if(error) throw error;
        if(!data?.ok) throw new Error(data?.error||'Não foi possível excluir o usuário.');
        if(editingTarget && ((editingTarget.user_id&&editingTarget.user_id===btn.dataset.userId)||(!editingTarget.user_id&&editingTarget.invite_email===btn.dataset.inviteEmail&&editingTarget.invite_role===btn.dataset.inviteRole))) clearEditMode();
        alert(btn.dataset.userId?'Acesso removido. O histórico foi preservado.':'Convite pendente removido.');
        await refreshUserManagement(true);
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
    const meta=card?.querySelector('.meta'); if(meta && meta.textContent!=='Cadastre ou atualize MEI e Auditoria diretamente.') meta.textContent='Cadastre ou atualize MEI e Auditoria diretamente.';
    if(!document.querySelector('#invitePassword')){
      const wrap=document.createElement('div');
      wrap.className='field';
      wrap.innerHTML='<label>Senha inicial</label><input id="invitePassword" type="password" minlength="8" autocomplete="new-password">';
      btn.parentNode.insertBefore(wrap,btn);
    }

    btn.onclick=async(ev)=>{
      ev.preventDefault();ev.stopImmediatePropagation();
      try{
        btn.disabled=true;
        const email=(document.querySelector('#inviteEmail')?.value||'').trim();
        const role=document.querySelector('#inviteRole')?.value||'';
        const name=(document.querySelector('#inviteName')?.value||'').trim();
        const cnpj=(document.querySelector('#inviteCnpj')?.value||'').trim();
        const password=document.querySelector('#invitePassword')?.value||'';
        if(!email||!name) throw new Error('Informe nome e e-mail.');
        const companyId=await getCompanyId();

        if(editingTarget){
          btn.textContent='Atualizando...';
          const body={action:'update',company_id:companyId,name,email,role,cnpj};
          if(editingTarget.user_id) body.user_id=editingTarget.user_id;
          else {body.invite_email=editingTarget.invite_email;body.invite_role=editingTarget.invite_role;}
          const {data,error}=await sb.functions.invoke('mei-manage-user',{body});
          if(error) throw error;
          if(!data?.ok) throw new Error(data?.error||'Não foi possível atualizar o usuário.');
          alert('Usuário atualizado com sucesso.');
          clearEditMode();
        }else{
          btn.textContent='Salvando...';
          if(password.length<8) throw new Error('A senha inicial deve ter pelo menos 8 caracteres.');
          const {data,error}=await sb.functions.invoke('mei-create-user',{body:{company_id:companyId,email,role,name,cnpj,password}});
          if(error) throw error;
          if(!data?.ok) throw new Error(data?.error||'Não foi possível salvar o usuário.');
          alert('Usuário salvo com sucesso.');
        }

        document.querySelector('#inviteName').value='';
        document.querySelector('#inviteEmail').value='';
        document.querySelector('#inviteCnpj').value='';
        document.querySelector('#inviteRole').value='mei';
        const pass=document.querySelector('#invitePassword');
        if(pass){pass.value='';pass.disabled=false;pass.closest('.field')?.removeAttribute('hidden');}
        await refreshUserManagement(true);
      }catch(e){alert(e?.message||String(e));}
      finally{btn.disabled=false;btn.textContent=editingTarget?'Atualizar usuário':'Salvar';}
    };
  }
  await refreshUserManagement();
}

function applyPatches(){renameApp();patchUserForm();}

const appRoot=document.querySelector('#app');
if(appRoot){
  let scheduled=false;
  const observer=new MutationObserver(()=>{
    if(scheduled) return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;applyPatches();});
  });
  observer.observe(appRoot,{subtree:true,childList:true});
}

applyPatches();
