const erpSb=window.__GESTAO_SB__;
const erpRoot=document.querySelector('#app');
let erpBusy=false;

const erpEsc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const erpMoney=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0));
const erpDate=value=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'';

function isAuditorHome(){
  const tab=document.querySelector('[data-tab="inicio"].active');
  const role=document.querySelector('.top > div:first-child small')?.textContent||'';
  return Boolean(tab)&&role.includes('Auditoria da empresa');
}

async function erpCompany(){
  const {data:{user},error:userError}=await erpSb.auth.getUser();
  if(userError||!user) throw new Error('Sessão inválida.');
  const {data,error}=await erpSb.from('mei_company_auditors').select('company_id').eq('user_id',user.id).limit(1);
  if(error||!data?.length) throw new Error('Auditoria não vinculada a uma empresa.');
  return data[0].company_id;
}

async function openInvoice(path){
  const {data,error}=await erpSb.storage.from('mei-invoices').createSignedUrl(path,120);
  if(error) throw error;
  window.open(data.signedUrl,'_blank','noopener');
}

async function markErpPosted(closureId){
  if(!confirm('Confirma que a NFSe foi conferida e lançada no ERP?')) return;
  const {error}=await erpSb.rpc('mei_mark_erp_posted',{p_closure:closureId});
  if(error) throw error;
  // Aguarda o registro assíncrono sem permitir que uma falha de e-mail reverta a confirmação.
  await Promise.resolve(window.__GESTAO_NOTIFY__?.('erp_posted',closureId));
  location.reload();
}

async function renderErpPending(){
  if(!erpSb||!isAuditorHome()||erpBusy||document.querySelector('[data-erp-pending]')) return;
  erpBusy=true;
  try{
    const companyId=await erpCompany();
    const [{data:closures,error:closureError},{data:invoices,error:invoiceError},{data:postings,error:postingError}]=await Promise.all([
      erpSb.from('mei_closures').select('id,period_start,period_end,total_value,model,status').eq('company_id',companyId).eq('status','sent_to_payment').order('closed_at',{ascending:false}),
      erpSb.from('mei_invoices').select('closure_id,invoice_number,storage_path'),
      erpSb.from('mei_erp_postings').select('closure_id')
    ]);
    if(closureError) throw closureError;
    if(invoiceError) throw invoiceError;
    if(postingError) throw postingError;
    const posted=new Set((postings||[]).map(posting=>posting.closure_id));
    const pending=(closures||[]).filter(closure=>!posted.has(closure.id));
    const panel=document.createElement('section');
    panel.className='card';panel.dataset.erpPending='1';
    panel.innerHTML=`<h2>NFSe aguardando conferência final e lançamento no ERP</h2><p class="meta">${pending.length?`${pending.length} NFSe${pending.length===1?'':'s'} precisa${pending.length===1?'':'m'} da sua ação.`:'Não há NFSe pendente de lançamento no ERP.'}</p>${pending.length?`<div class="table"><table><tr><th>Período</th><th>NFSe</th><th>Valor</th><th>Ações</th></tr>${pending.map(closure=>{const invoice=(invoices||[]).find(item=>item.closure_id===closure.id);return `<tr><td>${erpEsc(closure.period_start)} a ${erpEsc(closure.period_end)}</td><td>${erpEsc(invoice?.invoice_number||'—')}</td><td>${erpMoney(closure.total_value)}</td><td class="actions">${invoice?.storage_path?`<button class="sec" data-erp-download="${erpEsc(invoice.storage_path)}">Baixar NFSe</button>`:''}<button class="pri" data-erp-posted="${erpEsc(closure.id)}">NFSe lançada no ERP</button></td></tr>`;}).join('')}</table></div>`:''}`;
    const grid=document.querySelector('.grid');
    if(grid) grid.insertAdjacentElement('afterend',panel);
    else erpRoot?.prepend(panel);
    panel.querySelectorAll('[data-erp-download]').forEach(button=>button.onclick=async()=>{try{button.disabled=true;await openInvoice(button.dataset.erpDownload);}catch(error){alert(error?.message||String(error));}finally{button.disabled=false;}});
    panel.querySelectorAll('[data-erp-posted]').forEach(button=>button.onclick=async()=>{try{button.disabled=true;await markErpPosted(button.dataset.erpPosted);}catch(error){button.disabled=false;alert(error?.message||String(error));}});
  }catch(error){console.error('Pendências de ERP indisponíveis:',error);}
  finally{erpBusy=false;}
}

function applyErpPending(){renderErpPending();}
if(erpRoot){
  let scheduled=false;
  new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;applyErpPending();});}).observe(erpRoot,{childList:true,subtree:true});
}
applyErpPending();
