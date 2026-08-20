import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(process.cwd(),'mei-audit-web');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const index=read('index.html');
const boot=read('boot.js');
const app=read('app.js');
const guard=read('entry-guard.js');
const sw=read('sw.js');

assert.match(index,/Gestão de Contratos v14/,'index deve identificar visualmente a versao v14');
assert.match(index,/entry-guard\.js\?v=14/,'index deve carregar a protecao v14');
assert.match(index,/boot\.js\?v=14/,'index deve carregar o boot v14');
assert.match(index,/styles\.css\?v=14/,'index deve carregar estilos v14');
assert.match(boot,/const APP_VERSION='v14'/,'boot deve declarar a versao v14');
assert.match(boot,/import\('\.\/app\.js\?v=14'\)/,'boot deve importar app.js diretamente');
assert.doesNotMatch(boot,/patchPanelSource/,'boot nao deve reescrever app.js');
assert.doesNotMatch(boot,/URL\.createObjectURL/,'boot nao deve executar app por Blob');
assert.doesNotMatch(boot,/new Blob/,'boot nao deve criar modulo dinamico por Blob');
assert.match(app,/document\.querySelectorAll\('\[data-tab\]'\)\.forEach/,'app deve vincular os botoes de aba diretamente');
assert.match(app,/document\.querySelector\('#logout'\)\.onclick=logout/,'app deve vincular o botao sair');
assert.match(app,/mei_start_hour/,'fluxo MEI deve possuir RPC de entrada');
assert.match(app,/mei_end_hour/,'fluxo MEI deve possuir RPC de saida');
assert.match(guard,/data-start/,'guard deve proteger entrada');
assert.match(guard,/data-end/,'guard deve proteger saida');
assert.match(sw,/gestao-contratos-v14/,'service worker deve usar cache v14');

console.log('OK - v14 usa app nativo sem transformacao dinamica e preserva handlers dos botoes.');
