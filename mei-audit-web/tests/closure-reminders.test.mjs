import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import * as calendar from '../closure-reminders-core.mjs';
import * as core from '../email-core.mjs';
const schedule={frequency:'monthly',end_day_one:31,notify_day_one:1,end_day_two:null,notify_day_two:null,effective_from:'2026-01-01'};
export async function runReminderTests(){
 let checks=0;const check=(v,msg)=>{assert.ok(v,msg);checks++;};
 const feb=calendar.periods(schedule,'2026-03-01').find(p=>p.period_end==='2026-02-28');
 assert.deepEqual(feb,{period_start:'2026-02-01',period_end:'2026-02-28',due_date:'2026-03-01'});checks++;
 check(calendar.periods({...schedule,effective_from:'2024-01-01'},'2024-03-01').some(p=>p.period_end==='2024-02-29'),'Fevereiro bissexto');
 check(calendar.periods(schedule,'2026-02-01').some(p=>p.period_start==='2026-01-01'&&p.period_end==='2026-01-31'),'Virada de mês');
 const fortnight={...schedule,frequency:'fortnightly',end_day_one:15,notify_day_one:16,end_day_two:31,notify_day_two:1,effective_from:'2026-02-01'};
 const fp=calendar.periods(fortnight,'2026-03-01');
 check(fp.some(p=>p.period_start==='2026-02-01'&&p.period_end==='2026-02-15'&&p.due_date==='2026-02-16'),'Primeira quinzena');
 check(fp.some(p=>p.period_start==='2026-02-16'&&p.period_end==='2026-02-28'&&p.due_date==='2026-03-01'),'Segunda quinzena em fevereiro');
 const custom=calendar.periods({...fortnight,end_day_one:10,end_day_two:25,notify_day_one:12,notify_day_two:28},'2026-03-01');
 check(custom.some(p=>p.period_start==='2026-01-26'&&p.period_end==='2026-02-10'&&p.due_date==='2026-02-12'),'Quinzenas personalizadas');
 check(calendar.periods({...schedule,end_day_one:20,notify_day_one:20},'2026-02-20').some(p=>p.period_end==='2026-01-20'&&p.due_date==='2026-02-20'),'Aviso sempre posterior ao período');
 check(calendar.periods({...schedule,effective_from:'2026-06-10'},'2026-07-01').every(p=>p.due_date>='2026-06-10'),'Respeita vigência sem retroagir');
 check(calendar.nextPeriods({...schedule,effective_from:'2027-02-01'},'2026-11-06').length===2,'Vigência futura com prévia');
 assert.throws(()=>calendar.validateSchedule({...fortnight,end_day_one:28}));checks++;
 assert.throws(()=>calendar.validateSchedule({...schedule,notify_day_one:0}));checks++;
 assert.throws(()=>calendar.validateSchedule({...schedule,effective_from:'2026-02-30'}));checks++;
 check(calendar.localDate('2026-11-07T01:00:00Z')==='2026-11-06','Data de Brasília');
 const year=calendar.periods({...schedule,effective_from:'2026-12-01'},'2027-02-01');
 check(year.some(p=>p.period_start==='2026-12-01'&&p.due_date==='2027-01-01'),'Virada de ano');
 const moved={...schedule,binding_from:'2026-11-06'};
 check(calendar.periods(moved,'2026-11-06').length===0,'Troca não gera avisos retroativos');
 check(calendar.nextPeriods(moved,'2026-11-06')[0].due_date==='2026-12-01','Troca preserva o próximo aviso mensal');
 check(calendar.periods({...schedule,binding_from:'2026-10-15'},'2026-11-01').some(p=>p.due_date==='2026-11-01'),'Vínculo vigente permite aviso futuro');
 const text=calendar.summaryText([{contract_code:'CT-1',mei_name:'Maria',period_start:'2026-10-01',period_end:'2026-10-31',total_hours:80,open_entries:1,stage:'followup'}]);
 check(text.includes('80')&&text.includes('sem saída')&&text.includes('Reforço após 3 dias'),'Resumo de horas e reforço');
 const mail=core.renderTemplate(core.definition('closure_reminder','company'),{...core.EXAMPLE,lista_contratos_pendentes:'<img src=x>\nCT-2'});
 check(mail.html.includes('Ver fechamentos</a>')&&mail.html.includes('<br>CT-2')&&!mail.html.includes('<img'),'Link e resumo seguros');
 const worker=fs.readFileSync(new URL('../../supabase/functions/mei-closure-reminders/index.ts',import.meta.url),'utf8');
 const clean=s=>stripTypeScriptTypes(s.replace(/^import .*;\n/gm,''),{mode:'transform'}).replace(/\bexport /g,'');
 async function invoke(options={}){
  const calls=[],sent=[];
  const delivery={id:'delivery-one',company_id:'company',owner_id:'owner',company_name:'Empresa',items:[{occurrence_id:'one',contract_id:'contract1',contract_code:'CT-1',mei_name:'Maria',period_start:'2026-10-01',period_end:'2026-10-31',total_hours:80,entry_ids:['a'],stage:'initial'},{occurrence_id:'two',contract_id:'contract2',contract_code:'CT-2',mei_name:'José',period_start:'2026-10-01',period_end:'2026-10-31',total_hours:20,entry_ids:['b'],stage:'followup'}]};
  if(options.snapshot){delivery.content={subject:'Snapshot estável',html:'Snapshot'};delivery.email='owner@example.com';}
  const admin={auth:{admin:{getUserById:async id=>({data:{user:{id,email:options.changedEmail?'new@example.com':'owner@example.com'}}})}},from(table){
   const q={select(){return q},eq(){return q},single(){return q},then(resolve,reject){return Promise.resolve({data:table==='mei_profiles'?{name:'Dono'}:[{...schedule,contract_id:'contract1',company_id:'company',revision:1,effective_from:'2026-11-01'}],error:null}).then(resolve,reject);}};return q;
  },rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='mei_begin_reminder_run')return options.badToken?{error:{code:'42501'}}:{data:options.skipped?null:'run'};
   const action=args.p_action,payload=args.p_payload;
   if(action==='claim')return {data:options.noPending?[]:[delivery]};
   if(action==='content')return {data:{...delivery,email:payload.email,content:payload.content}};
   if(action==='validate')return {data:{valid:!options.closed}};
   return {data:{ok:true}};
  }};
  let handler;
  const context={...calendar,...core,Response,Date,Intl,JSON,Set,console,createClient:()=>admin,Deno:{env:{get:()=>''},serve:fn=>handler=fn},
   contentFor:async()=>core.definition('closure_reminder','company'),
   sendMail:async(...args)=>{sent.push(args);if(options.providerFailure)throw new Error('Falha simulada');return {id:'provider'};}};
  vm.createContext(context);vm.runInContext(clean(worker),context);
  const request=new Request('https://example.com',{method:options.method||'POST',headers:options.noToken?{}:{'X-Reminder-Token':'fake-token'}});
  const response=await handler(request);
  return {status:response.status,body:await response.json(),calls,sent};
 }
 const noToken=await invoke({noToken:true});
 check(noToken.status===401&&noToken.calls.length===0,'Sem token não acessa banco');
 check((await invoke({badToken:true})).status===403,'Token incorreto bloqueado');
 check((await invoke({method:'GET'})).status===405,'Método indevido bloqueado');
 const skipped=await invoke({skipped:true});
 check(skipped.body.skipped&&skipped.sent.length===0,'Sem envio fora da janela ou com lease ocupado');
 const consolidated=await invoke();
 check(consolidated.sent.length===1&&consolidated.sent[0][0]==='owner@example.com','Um e-mail para titular');
 check(consolidated.sent[0][1].html.includes('CT-1')&&consolidated.sent[0][1].html.includes('CT-2'),'Contratos reunidos');
 check(consolidated.sent[0][2]==='closure-reminder/delivery-one','Chave de idempotência persistida');
 check(consolidated.calls.some(c=>c.args.p_action==='sync')&&consolidated.calls.some(c=>c.args.p_action==='finish'&&c.args.p_payload.status==='sent'),'Ocorrências sincronizadas e envio registrado');
 check(consolidated.calls.at(-1).args.p_action==='release','Lease liberado');
 const closed=await invoke({closed:true});
 check(closed.sent.length===0,'Fechamento antes do envio cancela mensagem');
 check((await invoke({noPending:true})).sent.length===0,'Sem pendências não envia');
 const retry=await invoke({snapshot:true});
 check(retry.sent[0][1].subject==='Snapshot estável'&&retry.sent[0][2]==='closure-reminder/delivery-one','Retentativa usa conteúdo e chave estáveis');
 const changed=await invoke({snapshot:true,changedEmail:true});
 check(changed.sent.length===0,'Endereço antigo do titular não recebe retentativa');
 const failure=await invoke({providerFailure:true});
 check(failure.calls.some(c=>c.args.p_action==='finish'&&c.args.p_payload.status==='failed'),'Falha do provedor registrada');
 const helper=fs.readFileSync(new URL('../../supabase/functions/_shared/email.ts',import.meta.url),'utf8');
 let providerRequest;const ctx={...core,Deno:{env:{get:()=> 'fake'}},fetch:async(url,request)=>{providerRequest=request;return new Response('{"id":"sent"}');}};
 vm.createContext(ctx);vm.runInContext(clean(helper),ctx);await ctx.sendMail('owner@example.com',{subject:'s',html:'h'},'stable-key');
 check(providerRequest.headers['Idempotency-Key']==='stable-key','Provedor recebe chave de idempotência');
 check(JSON.parse(providerRequest.body).from===core.MAIL_FROM,'Remetente fixo preservado');
 return checks;
}
console.log('OK - '+await runReminderTests()+' verificações de lembretes aprovadas.');
