# Lembretes editáveis — v38

A tela passa a listar somente lembretes cadastrados, com Novo lembrete, Editar, Ativar/Desativar e Excluir (com confirmação na própria tela). O formulário permite escolher ou trocar o contrato, mostrando código, MEI e serviço. Somente contratos ativos por hora ficam disponíveis; contratos que já possuem um lembrete não são oferecidos para uma segunda configuração.

Datas e frequência são preservadas ao trocar o contrato. A prévia reflete o novo vínculo e avisa que a vigência deve ser compatível com o contrato escolhido. Ao trocar, somente avisos com data a partir do dia da troca ficam elegíveis; não há recuperação de avisos vencidos de outro contrato.

## Banco e histórico

A nova RPC mei_manage_closure_reminder faz inclusão, edição, troca, ativação e exclusão em uma transação. Verifica titular, perfil, empresa, contrato ativo por hora e revisões de origem e destino. Bloqueia os dois vínculos em ordem estável para impedir sobrescritas concorrentes.

Exclusão é lógica: o lembrete sai da lista e para de gerar avisos. A linha mantém revisão, auditoria e vínculo histórico. Reincluir exige a revisão atual e preserva os avisos anteriores. A troca arquiva a configuração da origem, cria/reativa a do destino e registra move_from/move_to com ambos os contratos na auditoria. Entregas enviadas e períodos antigos não são transferidos ou reescritos.

A RPC anterior continua disponível para abas antigas, delegando à mesma validação. O processador e as consultas de pendência respeitam binding_from e a exclusão. Não há alteração nas regras de fechamento, horário de envio, reforço ou e-mail consolidado.

## Validação e publicação

- Calendário/processador: 35 verificações de lembretes.
- E-mails: 52 verificações; carregamento LF/CRLF e verificações estáticas.
- O CI mantém os oito testes de pré-fechamento.
- Teste transacional editable_closure_reminders_test.sql: inclusão, edição, duplicidade, destino ocupado, troca, preservação de datas e histórico, ausência de avisos retroativos, ativação, exclusão, reinclusão, revisão concorrente, inativos/peças, troca entre empresas e falta de autorização.
- Repetir closure_reminders_test.sql para validar compatibilidade da RPC anterior.
- Conferência em navegador com dados fictícios: seleção por contrato ativo, troca mantendo datas, ativação/desativação e exclusão com histórico preservado.

Aplicar o banco somente após CI aprovado, executar testes com rollback, atualizar mei-closure-reminders com o calendário revisado e publicar v38. O agendamento existente permanece em funcionamento. O CLI Supabase está ausente; arquivar a migração com a versão efetivamente registrada pelo serviço.
