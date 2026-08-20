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

assert.match(index,/Gestão de Contratos v19/,'index deve identificar visualmente a versao v19');
assert.match(index,/boot\.js\?v=19/,'index deve carregar boot v19');
assert.match(boot,/const APP_VERSION='v19'/,'boot deve declarar v19');
assert.match(boot,/app\.js\?v=19/,'boot deve carregar app v19');
assert.match(boot,/patch-direct-users\.js\?v=19/,'boot deve carregar patch v19');

assert.match(app,/document\.querySelector\('#logout'\)\.onclick=logout/,'Sair deve usar handler interno original');
assert.match(app,/document\.querySelectorAll\('\[data-tab\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{tab=b\.dataset\.tab;render\(\);\}\)/,'abas devem navegar internamente via render');

assert.match(patch,/data-edit-user/,'tabela de usuarios deve ter acao Editar');
assert.match(patch,/data-delete-user/,'tabela de usuarios deve ter acao Excluir');
assert.match(patch,/mei-manage-user/,'acoes devem usar funcao administrativa segura');
assert.match(patch,/action:'update'/,'edicao deve usar acao update');
assert.match(patch,/action:'delete'/,'exclusao deve usar acao delete');
assert.match(patch,/O histórico de contratos, horas, peças e fechamentos será preservado/,'exclusao deve informar preservacao de historico');
assert.match(patch,/refreshUserManagement\(\)/,'acoes devem atualizar a tabela sem reload');
assert.doesNotMatch(patch,/location\.reload\(\)/,'gestao de usuarios nao deve recarregar a pagina');
assert.match(patch,/const appRoot=document\.querySelector\('#app'\)/,'observer deve ficar restrito ao app');
assert.match(patch,/observer\.observe\(appRoot,\{subtree:true,childList:true\}\)/,'observer deve observar apenas o app');

assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve limitar-se a acoes operacionais');
assert.match(sw,/gestao-contratos-v19/,'service worker deve usar cache v19');

console.log('OK - gestao de usuarios v19 validada.');
