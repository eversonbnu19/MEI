import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const source=fs.readFileSync(new URL('../patch-preclose-review.js',import.meta.url),'utf8');
function setup(){
  const nodes={},calls=[];
  const context=vm.createContext({window:{__GESTAO_SB__:{rpc:async(...args)=>{calls.push(args);return {};}}},document:{querySelector:s=>nodes[s]||null,querySelectorAll:()=>[]},alert:()=>{},location:{reload:()=>{}},console});
  vm.runInContext(source,context);
  return {context,nodes,calls,run:code=>vm.runInContext(code,context)};
}
const hour=(start,end,date='2026-09-29',extra={})=>({started_at:`${date}T${start}:00-03:00`,ended_at:end?`${date}T${end}:00-03:00`:null,minutes_worked:120,total_value:100,...extra});
function review(hours,pieces=[],model='hour'){
  const env=setup();Object.assign(env.context,{hours,pieces,model});
  env.run("reviewState={contract:{model},hours,pieces,start:'2026-09-29',end:'2026-09-29'};reviewState.issues=reviewIssues(reviewState.contract,hours,pieces,reviewState.start,reviewState.end)");
  return {...env,issues:env.run('reviewState.issues')};
}
const conflicts=env=>Array.from(env.issues.blocks).filter(x=>x.startsWith('Conflito'));
test('contained interval: exact pair, blocking button',()=>{
  const env=review([hour('08:00','16:00'),hour('10:00','15:00')]);
  assert.deepEqual(conflicts(env),['Conflito em 29/09/2026: 08:00-16:00 x 10:00-15:00']);
  assert.match(env.run('details()'),/id="reviewConfirm" disabled/);
});
test('touching and separate intervals allow confirmation',()=>{
  const env=review([hour('08:00','12:00'),hour('12:00','17:00'),hour('18:00','20:00')]);
  assert.equal(conflicts(env).length,0);
  assert.doesNotMatch(env.run('details()'),/id="reviewConfirm" disabled/);
  assert.ok(!env.issues.warnings.some(x=>x.includes('duplicidade')));
});
test('partial overlap, identical intervals and reverse order',()=>{
  for(const rows of [[hour('08:00','12:00'),hour('11:00','16:00')],[hour('08:00','12:00'),hour('08:00','12:00')],[hour('10:00','15:00'),hour('08:00','16:00')]])assert.equal(conflicts(review(rows)).length,1);
});
test('all actual pairs, excluding touching pair',()=>{
  const env=review([hour('08:00','16:00'),hour('10:00','12:00'),hour('12:00','15:00')]);
  assert.deepEqual(conflicts(env),['Conflito em 29/09/2026: 08:00-16:00 x 10:00-12:00','Conflito em 29/09/2026: 08:00-16:00 x 12:00-15:00']);
  assert.equal(conflicts(review([hour('08:00','16:00'),hour('09:00','15:00'),hour('10:00','14:00')])).length,3);
  assert.equal(conflicts(review(Array.from({length:3},()=>hour('08:00','16:00')))).length,3);
});
test('cancelled entries, different days and piece entries do not conflict',()=>{
  assert.equal(conflicts(review([hour('08:00','16:00'),hour('10:00','15:00','2026-09-29',{is_voided:true})])).length,0);
  assert.equal(conflicts(review([hour('08:00','16:00'),hour('10:00','15:00','2026-09-30')])).length,0);
  const env=review([],Array.from({length:2},()=>({produced_at:'2026-09-29T10:00:00-03:00'})),'piece');
  assert.equal(env.issues.blocks.length,0);
  assert.ok(!env.issues.warnings.some(x=>x.includes('duplicidade')));
});
test('open entry keeps existing blocking validation',()=>{
  const env=review([hour('08:00',null),hour('10:00','15:00')]);
  assert.equal(conflicts(env).length,0);
  assert.ok(env.issues.blocks.some(x=>x.includes('sem saída')));
});
test('comparison uses instants and display uses Sao Paulo timezone',()=>{
  const env=review([hour('08:00','16:00'),{...hour('10:00','15:00'),started_at:'2026-09-29T13:00:00Z',ended_at:'2026-09-29T18:00:00Z'}]);
  assert.deepEqual(conflicts(env),['Conflito em 29/09/2026: 08:00-16:00 x 10:00-15:00']);
});
test('confirmation rechecks and refuses RPC until conflict corrected',async()=>{
  const env=review([hour('08:00','16:00'),hour('10:00','15:00')]);
  let click;
  env.nodes['#reviewConfirm']={addEventListener:(_,fn)=>{click=fn;}};
  env.run('refreshReview=async()=>{reviewState.issues=reviewIssues(reviewState.contract,hours,pieces,reviewState.start,reviewState.end)};bindReview()');
  await click();assert.equal(env.calls.length,0);
  env.context.hours[1]=hour('16:00','18:00');
  await click();assert.equal(env.calls.length,1);assert.equal(env.calls[0][0],'mei_close_period');
});
