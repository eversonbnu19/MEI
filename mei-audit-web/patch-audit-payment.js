const sb=window.__GESTAO_SB__;
const appRoot=document.querySelector('#app');
let running=false;

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const statusLabel=s=>({awaiting_invoice:'Aguardando NF',invoice_sent:'NF enviada',invoice_received:'NF confirmada',sent_to_payment:'Enviado ao pagamento'}[s]||s||'—');

function isAuditClosures(){
  const tab=document.querySelector('[data-tab="fechamentos"].active');
  const role=document.querySelector('.top > div:first-child small')?.textContent||'';
  return Boolean(tab)&&role.includes('Auditoria da empresa');
}

async function auditorCompany(){
  const {data:{user},error:userErr}=await sb.auth.getUser();
  if(userErr||!user) throw new Error('Sessão inválida.');
  const {data,error}=await sb.from('mei_company_auditors').select('company_id').eq('user_id',user.id).limit(1);
  if(error||!data?.length) throw new Error('Auditoria não vinculada a uma empresa.');
  return data[0].company_id;
}

async function renderAuditClosures(){
  if(!sb||!isAuditClosures()||running) return;
  const card=[...document.querySelectorAll('.card h2')].find(h=>h.textContent?.trim()==='Fechamentos')?.closest('.card');
  if(!card||card.dataset.paymentPatched==='1') return;
  running=true;
  try{
    const cid=await auditorCompany();
    const [{data:closures,error:clErr},{data:invoices,error:invErr}]=await Promise.all([
      sb.from('mei_closures').select('*').eq('company_id',cid).order('closed_at',{ascending:false}),
      sb.from('mei_invoices').select('*')
    ]);
    if(clErr) throw clErr;
    if(invErr) throw invErr;
    const invs=invoices||[];
    card.innerHTML=`<h2>Fechamentos</h2><div class="table"><table><tr><th>Período</th><th>Modelo</th><th>Valor</th><th>Status</th><th>Nota fiscal</th></tr>${(closures||[]).map(c=>{
      const i=invs.find(x=>x.closure_id===c.id);
      const canDownload=c.status==='sent_to_payment'&&i?.storage_path;
      return `<tr><td>${esc(c.period_start)} a ${esc(c.period_end)}</td><td>${esc(c.model)}</td><td>${brl(c.total_value)}</td><td>${esc(statusLabel(c.status))}</td><td>${i?`${esc(i.invoice_number||'NF')} ${canDownload?`<button class="sec" data-audit-download="${esc(i.storage_path)}">Baixar NF</button>`:'<span class="meta">— aguardando envio ao pagamento</span>'}`:'—'}</td></tr>`;
    }).join('')||'<tr><td colspan="5">Nenhum fechamento.</td></tr>'}</table></div>`;
    card.dataset.paymentPatched='1';
    card.querySelectorAll('[data-audit-download]').forEach(btn=>{
      btn.onclick=async()=>{
        try{
          btn.disabled=true;btn.textContent='Abrindo...';
          const {data,error}=await sb.storage.from('mei-invoices').createSignedUrl(btn.dataset.auditDownload,120);
          if(error) throw error;
          window.open(data.signedUrl,'_blank','noopener');
        }catch(e){alert(e?.message||String(e));}
        finally{btn.disabled=false;btn.textContent='Baixar NF';}
      };
    });
  }catch(e){
    console.error('Falha ao carregar NFs para pagamento:',e);
  }finally{running=false;}
}

function apply(){renderAuditClosures();}
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
