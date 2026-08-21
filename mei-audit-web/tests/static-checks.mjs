import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(process.cwd(),'mei-audit-web');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const index=read('index.html');
const boot=read('boot.js');
const app=read('app.js');
const usersPatch=read('patch-direct-users.js');
const dashboardPatch=read('patch-company-dashboard.js');
const guard=read('entry-guard.js');
const sw=read('sw.js');

assert.match(index,/Gestão de Contratos v22/,'index deve identificar visualmente a versao v22');
assert.match(index,/boot\.js\?v=22/,'index deve carregar boot v22');
assert.match(boot,/const APP_VERSION='v22'/,'boot deve declarar v22');
assert.match(boot,/app\.js\?v=22/,'boot deve carregar app v22');
assert.match(boot,/patch-direct-users\.js\?v=22/,'boot deve carregar patch de usuarios v22');
assert.match(boot,/patch-company-dashboard\.js\?v=22/,'boot deve carregar patch do painel v22');

assert.match(app,/document\.querySelector\('#logout'\)\.onclick=logout/,'Sair deve usar handler interno original');
assert.match(app,/document\.querySelectorAll\('\[data-tab\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{tab=b\.dataset\.tab;render\(\);\}\)/,'abas devem navegar internamente via render');

assert.match(usersPatch,/Nova senha \(opcional\)/,'gestao de usuarios v21 deve permanecer');
assert.match(dashboardPatch,/Fluxo seguro de cadastro/,'patch deve localizar e remover o bloco antigo');
assert.match(dashboardPatch,/Avaliar renovação de contratos/,'painel deve exibir titulo de renovacao');
assert.match(dashboardPatch,/c\.days<=30/,'alerta deve considerar contratos ate 30 dias do vencimento e vencidos');
assert.match(dashboardPatch,/Vencido há/,'painel deve diferenciar contrato vencido');
assert.match(dashboardPatch,/Vence em/,'painel deve mostrar dias restantes');
assert.match(dashboardPatch,/Ação recomendada:<\/b> avaliar a renovação destes contratos/,'painel deve recomendar renovacao');
assert.match(dashboardPatch,/status==='active'/,'alerta deve considerar contratos ativos');
assert.match(dashboardPatch,/const appRoot=document\.querySelector\('#app'\)/,'observer do painel deve ficar restrito ao app');

assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve limitar-se a acoes operacionais');
assert.match(sw,/gestao-contratos-v22/,'service worker deve usar cache v22');
assert.match(sw,/patch-company-dashboard\.js/,'service worker deve incluir patch do painel');

console.log('OK - painel de renovacao de contratos validado para v22.');
