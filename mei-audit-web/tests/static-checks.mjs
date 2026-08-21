import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(process.cwd(),'mei-audit-web');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const index=read('index.html');
const boot=read('boot.js');
const app=read('app.js');
const adjustments=read('patch-entry-adjustments.js');
const guard=read('entry-guard.js');
const sw=read('sw.js');

assert.match(index,/Gestão de Contratos v25/,'index deve identificar visualmente a versao v25');
assert.match(index,/boot\.js\?v=25/,'index deve carregar boot v25');
assert.match(boot,/const APP_VERSION='v25'/,'boot deve declarar v25');
assert.match(boot,/app\.js\?v=25/,'boot deve carregar app v25');
assert.match(boot,/patch-entry-adjustments\.js\?v=25/,'boot deve carregar modulo de ajustes v25');

assert.match(app,/document\.querySelectorAll\('\[data-tab\]'\)/,'abas devem manter navegacao interna');
assert.match(adjustments,/Correção de lançamentos/,'empresa deve ter area de correcao de lancamentos');
assert.match(adjustments,/mei_adjust_hour_entry/,'hora deve usar funcao segura de ajuste');
assert.match(adjustments,/mei_adjust_piece_entry/,'peca deve usar funcao segura de ajuste');
assert.match(adjustments,/Motivo do ajuste/,'ajustes devem exigir motivo');
assert.match(adjustments,/Cancelar lançamento/,'deve existir cancelamento logico do lancamento');
assert.match(adjustments,/Bloqueado após envio da NF/,'interface deve bloquear ajustes apos NF');
assert.match(adjustments,/Valor unitário contratado/,'valor unitario da peca deve permanecer contratual');
assert.match(adjustments,/Ajuste da Empresa/,'MEI deve visualizar sinalizacao de ajuste');
assert.match(adjustments,/Motivo:/,'MEI deve visualizar motivo do ajuste');
assert.match(adjustments,/is_voided/,'cancelamento deve ser logico e preservado');
assert.doesNotMatch(adjustments,/\.delete\(/,'ajustes nao devem excluir fisicamente lancamentos');
assert.doesNotMatch(adjustments,/location\.reload\(\)/,'ajustes nao devem recarregar a pagina');
assert.match(adjustments,/const appRoot=document\.querySelector\('#app'\)/,'observer deve ficar restrito ao app');

assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve manter escopo operacional');
assert.match(sw,/gestao-contratos-v25/,'service worker deve usar cache v25');
assert.match(sw,/patch-entry-adjustments\.js/,'service worker deve incluir modulo de ajustes');

console.log('OK - ajustes auditaveis de lancamentos validados para v25.');
