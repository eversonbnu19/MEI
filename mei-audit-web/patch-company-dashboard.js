const sb=window.__GESTAO_SB__;
const appRoot=document.querySelector('#app');
let running=false;

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const formatDate=s=>{
  if(!s) return '—';
  const [y,m,d]=String(s).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR').format(new Date(y,m-1,d));
};
const localToday=()=>{
  const iso=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const [y,m,d]=iso.split('-').map(Number);
  return new Date(y,m-1,d);
};
const daysUntil=s=>{
  const [y,m,d]=String(s).split('-').map(Number);
  return Math.round((new Date(y,m-1,d)-localToday())/86400000);
};

function removeOldFlowCard(){
  const title=[...document.querySelectorAll('.card h2')].find(el=>el.textContent?.trim()==='Fluxo seguro de cadastro');
  title?.closest('.card')?.remove();
}

function isCompanyDashboard(){
  const panelBtn=document.querySelector('[data-tab="inicio"].active');
  const companyLabel=document.querySelector('.top > div:first-child small')?.textContent||'';
  return Boolean(panelBtn)&&companyLabel.includes('Gestão da empresa');
}

async function companyId(){
  const {data:{user},error:userErr}=await sb.auth.getUser();
  if(userErr||!user) throw new Error('Sessão inválida.');
  const {data,error}=await sb.from('mei_company_users').select('company_id').eq('user_id',user.id).limit(1);
  if(error||!data?.length) throw new Error('Empresa não encontrada.');
  return data[0].company_id;
}

async function patchDashboard(){
  removeOldFlowCard();
  if(!sb||!isCompanyDashboard()) return;
  const main=document.querySelector('main.wrap');
  if(!main||main.dataset.renewalChecked==='1'||running) return;
  running=true;
  try{
    const cid=await companyId();
    const {data,error}=await sb.from('mei_contracts').select('id,code,service,end_date,status').eq('company_id',cid);
    if(error) throw error;
    const due=(data||[])
      .filter(c=>c.status==='active'&&c.end_date)
      .map(c=>({...c,days:daysUntil(c.end_date)}))
      .filter(c=>c.days<=30)
      .sort((a,b)=>a.days-b.days);

    document.querySelector('#contractRenewalAlert')?.remove();
    if(due.length){
      const card=document.createElement('div');
      card.className='card';
      card.id='contractRenewalAlert';
      card.innerHTML=`<h2>Avaliar renovação de contratos</h2><p class="meta">Contratos com vencimento nos próximos 30 dias ou já vencidos.</p><div class="table"><table><tr><th>Contrato</th><th>Serviço</th><th>Vencimento</th><th>Situação</th></tr>${due.map(c=>`<tr><td>${esc(c.code||'—')}</td><td>${esc(c.service||'—')}</td><td>${formatDate(c.end_date)}</td><td>${c.days<0?`<span class="badge b-warn">Vencido há ${Math.abs(c.days)} dia${Math.abs(c.days)===1?'':'s'}</span>`:c.days===0?'<span class="badge b-warn">Vence hoje</span>':`<span class="badge b-warn">Vence em ${c.days} dia${c.days===1?'':'s'}</span>`}</td></tr>`).join('')}</table></div><p><b>Ação recomendada:</b> avaliar a renovação destes contratos.</p>`;
      const grid=main.querySelector('.grid');
      if(grid) grid.insertAdjacentElement('afterend',card); else main.prepend(card);
    }
    main.dataset.renewalChecked='1';
  }catch(e){
    console.error('Falha ao verificar vencimentos de contratos:',e);
  }finally{
    running=false;
  }
}

function apply(){
  removeOldFlowCard();
  patchDashboard();
}

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
