# E-mails automáticos — v36

Configurações > E-mails automáticos está disponível somente ao usuário principal registrado em mei_email_owners. A vinculação não pode ser alterada pelo cliente. O cadastro existente tem um único usuário Empresa; empresas com múltiplos usuários não recebem titular inferido.

## Inventário
- closure_created / mei: fechamento realizado;
- invoice_sent / company: NFSe enviada;
- sent_to_payment / auditor: conferência final (todos os auditores atuais);
- erp_posted / company: lançamento no ERP;
- invoice_received / auditor: reenvios do histórico;
- user_invited / mei e auditor: convite de acesso legado.

O fluxo atual cadastra usuários diretamente e confirma o e-mail no servidor, sem disparar e-mail. O convite legado continua com o mesmo link de ativação e metadados do Supabase, gerado com generateLink e entregue pelo provedor de e-mail do app. Os fluxos atuais não usam recuperação de senha, OTP ou confirmação por e-mail do Auth.

## Conteúdo e segurança
- Assunto em uma linha, máximo 500 caracteres; mensagem em texto/Markdown, máximo 30.000.
- Toolbar insere negrito, títulos, listas e quebras; variáveis são inseridas por botões e listadas com destaque.
- O mesmo renderizador atende a prévia e o envio. HTML do autor e valores do app são escapados.
- Variáveis ausentes geram aviso sem bloquear; variável desconhecida é exibida como campo indisponível.
- Remetente fixo no servidor: Gestão de Contratos <enviados@gelasio.com.br>.
- Testes usam rascunho + dados fictícios e vão somente ao e-mail retornado por auth.getUser. Não entram na fila de notificações reais.
- Limite de teste: 30 segundos entre solicitações, até 20 por hora, com reserva atômica no banco.
- Salvamento/restauração usam RPC com titular verificado, controle de revisão, bloqueio concorrente e auditoria na mesma transação.
- Auditoria mantém conteúdo anterior/novo, ID, nome e e-mail do ator, data/hora; clientes não podem inserir, alterar ou excluir histórico.

## Publicação
1. Executar testes estáticos, pré-fechamento e e-mails em Node 24; aguardar CI aprovado na branch.
2. Aplicar email_settings.sql pelo Supabase e validar permissões, salvamento, restauração e auditoria em transação revertida.
3. Publicar mei-send-notification e mei-invite-user com _shared/email.ts e mei-audit-web/email-core.mjs, JWT mantido ativo.
4. Integrar a branch na main. O workflow de Pages repete os testes antes de publicar.
5. Verificar v36 no site e funções ativas. Novos módulos estão no service worker; fallback local ignora apenas parâmetros de versão, sem armazenar dados do Supabase.

Em falha de publicação das funções, não integrar o frontend. Os modelos padrão mantêm os eventos/destinatários e a fila de notificação atual. Para reverter, restaurar os arquivos anteriores das funções/frontend; as novas tabelas podem permanecer para preservar a auditoria.
