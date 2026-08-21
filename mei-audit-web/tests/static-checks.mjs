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
const cancelPatch=read('patch-contract-cancel.js');
const guard=read('entry-guard.js');
const sw=read('sw.js');

assert.match(index,/Gestão de Contratos v23/,'index deve identificar visualmente a versao v23');
assert.match(index,/boot\.js\?v=23/,'index deve carregar boot v23');
assert.match(boot,/const APP_VERSION='v23'/,'boot deve declarar v23');
assert.match(boot,/app\.js\?v=23/,'boot deve carregar app v23');
assert.match(boot,/patch-direct-users\.js\?v=23/,'boot deve carregar patch de usuarios v23');
assert.match(boot,/patch-company-dashboard\.js\?v=23/,'boot deve carregar patch do painel v23');
assert.match(boot,/patch-contract-cancel\.js\?v=23/,'boot deve carregar patch de cancelamento v23');

assert.match(app,/document\.querySelector\('#logout'\)\.onclick=logout/,'Sair deve usar handler interno original');
assert.match(app,/document\.querySelectorAll\('\[data-tab\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{tab=b\.dataset\.tab;render\(\);\}\)/,'abas devem navegar internamente via render');

assert.match(usersPatch,/Nova senha \(opcional\)/,'gestao de usuarios deve permanecer');
assert.match(dashboardPatch,/Avaliar renovação de contratos/,'painel deve manter alerta de renovacao');
assert.match(dashboardPatch,/status==='active'/,'alerta de renovacao deve ignorar contratos cancelados');

assert.match(cancelPatch,/Cancelar contrato/,'aba Contratos deve oferecer cancelamento');
assert.match(cancelPatch,/Data do cancelamento/,'cancelamento deve exigir data');
assert.match(cancelPatch,/Motivo do cancelamento/,'cancelamento deve exigir motivo');
assert.match(cancelPatch,/if\(!cancelDate\)/,'data do cancelamento deve ser obrigatoria');
assert.match(cancelPatch,/if\(!reason\)/,'motivo do cancelamento deve ser obrigatorio');
assert.match(cancelPatch,/mei_cancel_contract/,'cancelamento deve usar funcao segura do banco');
assert.match(cancelPatch,/contract_cancelled/,'cancelamento deve registrar auditoria');
assert.match(cancelPatch,/status==='cancelled'/,'contrato cancelado deve permanecer visivel no historico');
assert.match(cancelPatch,/cancellation_reason/,'motivo deve ser exibido apos cancelamento');
assert.doesNotMatch(cancelPatch,/\.delete\(/,'interface nao deve excluir fisicamente o contrato');
assert.doesNotMatch(cancelPatch,/location\.reload\(\)/,'cancelamento nao deve recarregar a pagina');
assert.match(cancelPatch,/const appRoot=document\.querySelector\('#app'\)/,'observer de contratos deve ficar restrito ao app');

assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve limitar-se a acoes operacionais');
assert.match(sw,/gestao-contratos-v23/,'service worker deve usar cache v23');
assert.match(sw,/patch-contract-cancel\.js/,'service worker deve incluir patch de cancelamento');

console.log('OK - cancelamento de contratos validado para v23.');
