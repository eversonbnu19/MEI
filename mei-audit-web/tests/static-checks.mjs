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

assert.match(index,/Gestão de Contratos v21/,'index deve identificar visualmente a versao v21');
assert.match(index,/boot\.js\?v=21/,'index deve carregar boot v21');
assert.match(boot,/const APP_VERSION='v21'/,'boot deve declarar v21');
assert.match(boot,/app\.js\?v=21/,'boot deve carregar app v21');
assert.match(boot,/patch-direct-users\.js\?v=21/,'boot deve carregar patch v21');

assert.match(app,/document\.querySelector\('#logout'\)\.onclick=logout/,'Sair deve usar handler interno original');
assert.match(app,/document\.querySelectorAll\('\[data-tab\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{tab=b\.dataset\.tab;render\(\);\}\)/,'abas devem navegar internamente via render');

assert.match(patch,/role:'company',status:'active'/,'usuario Empresa deve ser incluido como ativo');
assert.match(patch,/roleLabel=isCompany\?'Empresa'/,'tabela deve identificar perfil Empresa');
assert.match(patch,/const deleteButton=isCompany\?'':/,'usuario Empresa nao deve receber Excluir');
assert.match(patch,/Nova senha \(opcional\)/,'edicao de usuario ativo deve permitir nova senha opcional');
assert.match(patch,/if\(password\) body\.password=password/,'nova senha deve ser enviada apenas quando preenchida');
assert.match(patch,/password\.length<8/,'nova senha deve exigir ao menos 8 caracteres');
assert.match(patch,/role\.disabled=true/,'perfil Empresa deve ficar travado durante edicao');
assert.match(patch,/data-edit-managed/,'usuarios devem manter acao Editar');
assert.match(patch,/data-delete-managed/,'MEI Auditoria e pendentes devem manter Excluir');
assert.match(patch,/mei-manage-user/,'edicao deve usar funcao administrativa');
assert.doesNotMatch(patch,/location\.reload\(\)/,'gestao de usuarios nao deve recarregar pagina');
assert.match(patch,/const appRoot=document\.querySelector\('#app'\)/,'observer deve ficar restrito ao app');

assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve limitar-se a acoes operacionais');
assert.match(sw,/gestao-contratos-v21/,'service worker deve usar cache v21');

console.log('OK - edicao de senha e usuario Empresa validada para v21.');
