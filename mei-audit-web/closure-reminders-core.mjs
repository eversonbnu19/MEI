// Calendar dates are evaluated in America/Sao_Paulo. No browser clock drives delivery.
export const SITE_URL='https://eversonbnu19.github.io/MEI/?aba=fechamentos';
export const localDate=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(now));
const iso=d=>d.toISOString().slice(0,10);
const parse=s=>new Date(s+'T12:00:00Z');
export const addDays=(s,n)=>{const d=parse(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);};
const monthDate=(y,m,day)=>iso(new Date(Date.UTC(y,m,Math.min(day,new Date(Date.UTC(y,m+1,0)).getUTCDate()),12)));
export function validateSchedule(s){
 if(!['monthly','fortnightly'].includes(s.frequency))throw new Error('Escolha mensal ou quinzenal.');
 const valid=n=>Number.isInteger(n)&&n>=1&&n<=31;
 if(!valid(s.end_day_one)||!valid(s.notify_day_one))throw new Error('Informe dias entre 1 e 31.');
 if(s.frequency==='fortnightly'&&(!valid(s.end_day_two)||!valid(s.notify_day_two)||s.end_day_one>27||s.end_day_two<=s.end_day_one))throw new Error('Na frequência quinzenal, o primeiro encerramento deve ser entre 1 e 27 e o segundo deve ser posterior, até 31.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s.effective_from)||Number.isNaN(parse(s.effective_from).getTime())||iso(parse(s.effective_from))!==s.effective_from)throw new Error('Informe uma data de início válida.');
}
export function periods(s,until,{future=false}={}){
 validateSchedule(s);
 const from=parse(s.effective_from),limit=parse(future&&until<s.effective_from?s.effective_from:until);
 if(limit<from)return [];
 const firstMonth=new Date(Date.UTC(from.getUTCFullYear(),from.getUTCMonth()-2,1,12));
 const lastMonth=new Date(Date.UTC(limit.getUTCFullYear(),limit.getUTCMonth()+(future?2:0),1,12));
 const result=[];
 for(let date=firstMonth,n=0;date<=lastMonth&&n<1200;n++,date=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1,12))){
  const y=date.getUTCFullYear(),m=date.getUTCMonth();
  const ends=s.frequency==='monthly'?[s.end_day_one]:[s.end_day_one,s.end_day_two];
  ends.forEach((day,i)=>{
   const end=monthDate(y,m,day);
   const previous=i===0?monthDate(y,m-1,ends[ends.length-1]):monthDate(y,m,ends[i-1]);
   const start=addDays(previous,1);
   const notify=i===0?s.notify_day_one:s.notify_day_two;
   let due=monthDate(y,m,notify);
   if(due<=end)due=monthDate(y,m+1,notify);
   if(due>=s.effective_from&&(future||due<=until))result.push({period_start:start,period_end:end,due_date:due});
  });
 }
 return result.sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.period_end.localeCompare(b.period_end));
}
export function nextPeriods(s,today){return periods(s,today,{future:true}).filter(p=>p.due_date>=today).slice(0,2);}
export function summaryText(items){
 const fmt=s=>s.split('-').reverse().join('/');
 return items.map(x=>x.contract_code+' — '+x.mei_name+'\nPeríodo: '+fmt(x.period_start)+' a '+fmt(x.period_end)+'\nHoras sem fechamento: '+Number(x.total_hours||0).toLocaleString('pt-BR',{maximumFractionDigits:2})+(x.open_entries?' • '+x.open_entries+' registro(s) sem saída':'')+(x.stage==='followup'?' • Reforço após 3 dias':'')).join('\n\n');
}
