# Lembretes de fechamento — v37

Configurações > Lembretes de fechamento permite à Empresa principal ativar cada contrato por hora e cadastrar frequência mensal/quinzenal, dias de encerramento e de aviso, e vigência. Não há ativação automática dos contratos existentes.

Os períodos são contínuos, entre encerramentos consecutivos. Dias 29–31 são limitados ao último dia do mês. Na frequência quinzenal, o primeiro encerramento é limitado ao dia 27 para manter dois períodos também em fevereiro. O aviso ocorre estritamente depois do encerramento; se o dia escolhido já passou, ocorre no mês seguinte. A prévia mostra as próximas datas.

## Envio
- Às 9h de America/Sao_Paulo, inclusive fins de semana; o Cron roda a cada 10 minutos, mas só chama o processador entre 9h e 10h para recuperar falhas.
- Um e-mail consolidado por empresa/dia, para o endereço autenticado atual do titular, com todos os contratos/períodos elegíveis.
- Apenas contratos ativos por hora e lançamentos não cancelados com closure_id nulo. A data usada é ended_at em Brasília (igual a mei_close_period); registros sem saída usam started_at e aparecem com aviso para correção.
- Um reforço após três dias da data do envio inicial bem-sucedido, caso ainda haja pendência. Não há repetição diária.
- O painel continua mostrando o período enquanto houver horas pendentes, inclusive entre os dois e-mails e depois do reforço.
- O envio revalida cada lançamento antes de chamar o provedor; alteração/fechamento cancela a entrega congelada. Pendências remanescentes podem entrar na execução do dia seguinte.
- O assunto e corpo são configuráveis em E-mails automáticos > Lembrete de fechamento de horas. O botão Ver fechamentos leva à aba de fechamento após autenticação.
- Nenhum lançamento é fechado, alterado ou pago automaticamente.

## Segurança e confiabilidade
RLS, revogação de escrita direta (inclusive TRUNCATE), salvamento por RPC com titular/perfil verificados, revisão concorrente e auditoria atômica. O processador tem segredo próprio guardado no Vault; a função nova valida esse segredo por RPC exclusiva do service_role, sem chave privilegiada no navegador. A chamada usa verify_jwt=false exclusivamente porque autentica o token interno; as demais funções mantêm JWT ativo.

Uma lease impede execuções concorrentes. Entregas guardam destinatário, conteúdo e ocorrências; retentativas usam o mesmo conteúdo e Idempotency-Key. A data do envio e a revisão da configuração impedem duplicações. O titular vê os 20 avisos mais recentes e suas falhas/cancelamentos.

## Validação e publicação
Node 24: verificações estáticas e carregamento LF/CRLF, oito testes de pré-fechamento, 52 verificações de e-mails e 32 de lembretes. A tela é conferida no navegador com dados fictícios, incluindo quinzenas personalizadas e troca para o editor de e-mails.

1. CI aprovado na branch.
2. Aplicar closure_reminders.sql; o Cron nasce desativado.
3. Rodar closure_reminders_test.sql em transação revertida e conferir que as linhas de teste não persistiram.
4. Publicar mei-closure-reminders e atualizar os pacotes de mei-send-notification e mei-invite-user com email-core.mjs/_shared/email.ts novos.
5. Verificar autenticação do processador e a chamada interna pelo Vault, sem expor o segredo.
6. Ativar o job mei-closure-reminders e publicar o frontend somente após os testes.
7. Conferir a versão v37 no site.

O CLI Supabase está ausente neste ambiente; após aplicar a migração pelo serviço, arquivar o SQL com a versão efetivamente registrada. O teste de integração usa linhas descartáveis e rollback; não envia e-mails.
