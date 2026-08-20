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

assert.match(index,/Gestão de Contratos v18/,'index deve identificar visualmente a versao v18');
assert.match(index,/boot\.js\?v=18/,'index deve carregar boot v18');
assert.match(boot,/const APP_VERSION='v18'/,'boot deve declarar v18');
assert.match(boot,/app\.js\?v=18/,'boot deve carregar app v18');
assert.match(boot,/patch-direct-users\.js\?v=18/,'boot deve carregar patch v18');

assert.match(app,/document\.querySelector\('#logout'\)\.onclick=logout/,'Sair deve usar handler interno original');
assert.match(app,/document\.querySelectorAll\('\[data-tab\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{tab=b\.dataset\.tab;render\(\);\}\)/,'abas devem navegar internamente via render');
assert.match(app,/async function logout\(\)/,'funcao logout deve existir');
assert.match(app,/async function render\(\)/,'funcao render deve existir');

assert.doesNotMatch(boot,/href=\\"\?tab=/,'boot nao deve converter abas em links');
assert.doesNotMatch(boot,/\?logout=1/,'boot nao deve converter Sair em rota');
assert.doesNotMatch(boot,/get\('tab'\)/,'boot nao deve depender de parametro tab para navegar');
assert.doesNotMatch(boot,/handleLogoutRoute/,'boot nao deve possuir rota externa de logout');

assert.match(patch,/const appRoot=document\.querySelector\('#app'\)/,'observer deve ficar restrito ao app');
assert.match(patch,/observer\.observe\(appRoot,\{subtree:true,childList:true\}\)/,'observer deve observar apenas o app');
assert.doesNotMatch(patch,/observer\.observe\(document\.documentElement/,'observer do patch nao pode observar documento inteiro');
assert.match(patch,/if\(scheduled\) return/,'observer deve agrupar mutacoes repetidas');

assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve limitar-se a acoes operacionais');
assert.doesNotMatch(guard,/data-tab|#logout/,'guard nao pode interceptar abas ou sair');
assert.match(sw,/gestao-contratos-v18/,'service worker deve usar cache v18');

console.log('OK - navegacao interna dos botoes validada para v18.');
