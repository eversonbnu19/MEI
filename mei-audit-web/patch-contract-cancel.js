const sb=window.__GESTAO_SB__;
const appRoot=document.querySelector('#app');
let patching=false;

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const fmtDate=s=>{
  if(!s) return '—';
  const [y,m,d]=String(s).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR').format(new Date(y,m-1,d));
};

function isContractsTab(){
  const active=document.querySelector('[data-tab="contratos"].active');
  const companyLabel=document.querySelector('.top > div:first-child small')?.textContent||'';
  return Boolean(active)&&companyLabel.includes('Gestão da empresa');
}

async function getCompanyId(){
  const {data:{user},error:userErr}=await sb.auth.getUser();
  if(userErr||!user) throw new Error('Sessão inválida.');
  const {data,error}=await sb.from('mei_company_users').select('company_id').eq('user_id',user.id).limit(1);
  if(error||!data?.length) throw new Error('Empresa não encontrada.');
  return data[0].company_id;
}

function contractsTable(){
  const title=[...document.querySelectorAll('.card h2')].find(x=>x.textContent?.trim()==='Contratos');
  return title?.closest('.card')?.querySelector('table')||null;
}

function closeCancelForm(){document.querySelector('#contractCancelForm')?.remove();}

function showCancelForm(contract){
  closeCancelForm();
  const table=contractsTable();
  const card=table?.closest('.card');
  if(!card) return;
  const form=document.createElement('div');
  form.id='contractCancelForm';
  form.className='card';
  form.style.marginTop='14px';
  form.innerHTML=`<h2>Cancelar contrato ${esc(contract.code||'')}</h2><p class="meta">O contrato permanecerá no histórico com status Cancelado.</p><div class="two"><div class="field"><label>Data do cancelamento</label><input id="cancelContractDate" type="date" value="${today()}"></div><div class="field"><label>Motivo do cancelamento</label><input id="cancelContractReason" placeholder="Obrigatório"></div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="danger" id="confirmContractCancel">Confirmar cancelamento</button><button class="sec" id="cancelContractCancel">Voltar</button></div>`;
  card.append(form);
  document.querySelector('#cancelContractCancel').onclick=closeCancelForm;
  document.querySelector('#confirmContractCancel').onclick=async()=>{
    const btn=document.querySelector('#confirmContractCancel');
    const cancelDate=document.querySelector('#cancelContractDate')?.value||'';
    const reason=(document.querySelector('#cancelContractReason')?.value||'').trim();
    if(!cancelDate) return alert('Informe a data do cancelamento.');
    if(!reason) return alert('Informe o motivo do cancelamento.');
    if(!confirm(`Confirmar o cancelamento do contrato ${contract.code}?`)) return;
    try{
      btn.disabled=true;btn.textContent='Cancelando...';
      const {error}=await sb.rpc('mei_cancel_contract',{p_contract:contract.id,p_cancel_date:cancelDate,p_reason:reason});
      if(error) throw error;
      await sb.rpc('mei_audit',{event_type:'contract_cancelled',entity_type:'contract',entity_id:String(contract.id),details:{code:contract.code,cancel_date:cancelDate,reason}}).catch(()=>{});
      alert('Contrato cancelado com sucesso.');
      closeCancelForm();
      await patchContracts(true);
    }catch(e){alert(e?.message||String(e));}
    finally{btn.disabled=false;btn.textContent='Confirmar cancelamento';}
  };
  form.scrollIntoView({behavior:'smooth',block:'center'});
}

async function patchContracts(force=false){
  if(!sb||!isContractsTab()||patching) return;
  const table=contractsTable();
  if(!table) return;
  if(!force&&table.dataset.cancelPatched==='1') return;
  patching=true;
  try{
    const cid=await getCompanyId();
    const {data,error}=await sb.from('mei_contracts').select('id,code,service,model,hour_rate,status,start_date,end_date,cancelled_at,cancellation_reason').eq('company_id',cid);
    if(error) throw error;
    const contracts=data||[];
    const rows=[...table.querySelectorAll('tr')].slice(1);
    const header=[...table.querySelectorAll('tr:first-child th')];
    if(header.length&&!header.some(x=>x.textContent?.trim()==='Status')){
      const statusTh=document.createElement('th');statusTh.textContent='Status';
      header[header.length-1].before(statusTh);
    }
    rows.forEach(row=>{
      const cells=[...row.querySelectorAll('td')];
      if(cells.length<5) return;
      const code=cells[0]?.textContent?.trim()||'';
      const contract=contracts.find(c=>String(c.code||'').trim()===code);
      if(!contract) return;
      let statusCell=row.querySelector('[data-contract-status]');
      if(!statusCell){
        statusCell=document.createElement('td');
        statusCell.dataset.contractStatus='1';
        cells[cells.length-1].before(statusCell);
      }
      const actionCell=row.querySelector('td:last-child');
      if(contract.status==='cancelled'){
        statusCell.innerHTML=`<span class="badge b-warn">Cancelado</span><div class="meta">${fmtDate(contract.cancelled_at)}</div>`;
        if(contract.cancellation_reason) statusCell.innerHTML+=`<div class="meta">${esc(contract.cancellation_reason)}</div>`;
        actionCell.querySelector('[data-cancel-contract]')?.remove();
      }else{
        statusCell.innerHTML=`<span class="badge b-ok">${contract.status==='active'?'Ativo':esc(contract.status)}</span>`;
        if(contract.status==='active'&&!actionCell.querySelector('[data-cancel-contract]')){
          const cancelBtn=document.createElement('button');
          cancelBtn.className='danger';
          cancelBtn.style.marginLeft='8px';
          cancelBtn.textContent='Cancelar contrato';
          cancelBtn.dataset.cancelContract=contract.id;
          cancelBtn.onclick=()=>showCancelForm(contract);
          actionCell.append(cancelBtn);
        }
      }
    });
    table.dataset.cancelPatched='1';
  }catch(e){console.error('Falha ao preparar cancelamento de contratos:',e);}
  finally{patching=false;}
}

function apply(){if(!isContractsTab()) closeCancelForm();patchContracts();}

if(appRoot){
  let scheduled=false;
  const observer=new MutationObserver(()=>{
    if(scheduled) return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;apply();});
  });
  observer.observe(appRoot,{subtree:true,childList:true});
}

apply();
