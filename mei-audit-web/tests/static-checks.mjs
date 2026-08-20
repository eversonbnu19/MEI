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

assert.match(index,/Gestão de Contratos v20/,'index deve identificar visualmente a versao v20');
assert.match(index,/boot\.js\?v=20/,'index deve carregar boot v20');
assert.match(boot,/const APP_VERSION='v20'/,'boot deve declarar v20');
assert.match(boot,/app\.js\?v=20/,'boot deve carregar app v20');
assert.match(boot,/patch-direct-users\.js\?v=20/,'boot deve carregar patch v20');

assert.match(app,/document\.querySelector\('#logout'\)\.onclick=logout/,'Sair deve usar handler interno original');
assert.match(app,/document\.querySelectorAll\('\[data-tab\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{tab=b\.dataset\.tab;render\(\);\}\)/,'abas devem navegar internamente via render');

assert.match(patch,/data-edit-managed/,'todas as linhas devem receber acao Editar');
assert.match(patch,/data-delete-managed/,'todas as linhas devem receber acao Excluir');
assert.match(patch,/data-invite-email/,'usuarios pendentes devem ser identificados por email');
assert.match(patch,/data-invite-role/,'usuarios pendentes devem ser identificados por perfil');
assert.match(patch,/function loadIntoUserForm/,'Editar deve carregar dados no formulario superior');
assert.match(patch,/formBtn\.textContent='Atualizar usuário'/,'formulario deve entrar em modo de atualizacao');
assert.match(patch,/editingTarget/,'formulario deve guardar o alvo em edicao');
assert.match(patch,/action:'update'/,'edicao deve usar acao update');
assert.match(patch,/action:'delete'/,'exclusao deve usar acao delete');
assert.match(patch,/mei-manage-user/,'acoes devem usar funcao administrativa segura');
assert.match(patch,/refreshUserManagement\(true\)/,'acoes devem forcar atualizacao da tabela sem reload');
assert.doesNotMatch(patch,/location\.reload\(\)/,'gestao de usuarios nao deve recarregar a pagina');
assert.match(patch,/table\.dataset\.managementSignature/,'observer nao deve recriar a tabela sem mudanca de dados');
assert.match(patch,/const appRoot=document\.querySelector\('#app'\)/,'observer deve ficar restrito ao app');

assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve limitar-se a acoes operacionais');
assert.match(sw,/gestao-contratos-v20/,'service worker deve usar cache v20');

console.log('OK - gestao completa de usuarios v20 validada.');
