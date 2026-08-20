import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(process.cwd(),'mei-audit-web');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const index=read('index.html');
const boot=read('boot.js');
const app=read('app.js');
const patch=read('patch-direct-users.js');
const guard=read('entry-guard.js');
const sw=read('sw.js');

assert.match(index,/Gestão de Contratos v16/,'index deve identificar visualmente a versao v16 atual');
assert.match(index,/boot\.js\?v=16/,'index deve carregar boot v16');
assert.match(boot,/const APP_VERSION='v16'/,'boot deve declarar v16');

assert.match(app,/document\.querySelector\('#logout'\)\.onclick=logout/,'Sair deve manter handler original');
assert.match(app,/document\.querySelectorAll\('\[data-tab\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{tab=b\.dataset\.tab;render\(\);\}\)/,'abas devem manter handlers originais');
assert.match(app,/async function logout\(\)/,'funcao logout deve existir');
assert.match(app,/async function render\(\)/,'funcao render deve existir');

assert.match(patch,/const appRoot=document\.querySelector\('#app'\)/,'observer deve ficar restrito ao app');
assert.match(patch,/observer\.observe\(appRoot,\{subtree:true,childList:true\}\)/,'observer deve observar apenas o app');
assert.doesNotMatch(patch,/observer\.observe\(document\.documentElement/,'observer nao pode observar documento inteiro');
assert.match(patch,/if\(document\.title!==['"]Gestão de Contratos['"]\) document\.title=['"]Gestão de Contratos['"]/,'titulo so deve ser alterado quando necessario');
assert.match(patch,/if\(next!==current\) el\.textContent=next/,'renomeacao so deve mutar DOM quando texto mudar');
assert.match(patch,/if\(scheduled\) return/,'observer deve agrupar mutacoes repetidas');

assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve limitar-se a acoes operacionais');
assert.doesNotMatch(guard,/data-tab|#logout/,'guard nao pode interceptar abas ou sair');
assert.match(sw,/gestao-contratos-v16/,'service worker deve usar cache v16 atual');

console.log('OK - logica dos botoes e observer validada para v16.');
