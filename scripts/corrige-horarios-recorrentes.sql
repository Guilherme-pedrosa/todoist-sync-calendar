-- Correção dos horários corrompidos pelo bug de fuso nas séries recorrentes
-- (rrule interpretava DTSTART naive como UTC; cada recálculo deslocava -3h).
--
-- Para cada tarefa: restaura due_time ao horário original (evidenciado pelo
-- histórico em recurring_task_completions) e regrava a hora embutida em
-- TODOS os DTSTART/EXDATE da recurrence_rule para casar com ele — sem isso,
-- as exclusões de ocorrência ("EXDATE") param de funcionar.
--
-- EXECUTAR SOMENTE DEPOIS do código corrigido estar publicado, senão o app
-- antigo volta a corromper no próximo "concluir".
--
-- Horários confirmados pelo Guilherme antes de rodar. Tarefas com histórico
-- ambíguo estão marcadas; "Apresentação Resultado Financeiro" (11:30) não
-- precisa de correção.

BEGIN;

-- ALMOÇO: 52 conclusões às 13:00 (abr–ago). Atual: 07:00.
UPDATE tasks SET due_time = '13:00:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T130000', 'g')
WHERE id = '7c2c1bca-948b-4c75-8571-174b9bcd8be4';

-- AGENDAMENTO DE MANUTENÇÕES: histórico começa 13:00 (mai). Atual: 04:00.
UPDATE tasks SET due_time = '13:00:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T130000', 'g')
WHERE id = '83631c16-7ce6-441a-9945-61803621b1e3';

-- ENCERRAMENTO DE OS DIA ANTERIOR: histórico começa 15:00 (jun). Atual: 00:00.
UPDATE tasks SET due_time = '15:00:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T150000', 'g')
WHERE id = 'd0af076b-0129-4cf9-96b9-75bbf6a92a50';

-- DSS SEMANAL: histórico começa 08:00 (mai). Atual: 02:00.
UPDATE tasks SET due_time = '08:00:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T080000', 'g')
WHERE id = 'e5bd0550-abf1-4345-8102-d058e1d564b2';

-- TRABALHAR no sistema (auditoria de preços): estável 11:00 jun–ago. Atual: 08:00.
UPDATE tasks SET due_time = '11:00:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T110000', 'g')
WHERE id = 'a4088fa7-ffed-4ca0-ab8b-41b75aa2b417';

-- Fazer pedido das peças Rational: estável 14:00 jul–ago. Atual: 11:00.
UPDATE tasks SET due_time = '14:00:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T140000', 'g')
WHERE id = 'c31a7839-5d71-4a69-a253-cb8c8b081e8a';

-- TERAPIA (série ativa 4856b680): estável 15:00 jun–ago. Atual: 12:00.
UPDATE tasks SET due_time = '15:00:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T150000', 'g')
WHERE id = '4856b680-2270-4918-808d-eee82dc18b59';

-- TERAPIA (série 4a479172): histórico 15:00 (mai). Atual: 12:00.
UPDATE tasks SET due_time = '15:00:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T150000', 'g')
WHERE id = '4a479172-233e-49c7-a4f0-60b769bb1ec4';

-- TERAPIA (série 4c2a83fe): estável 14:00 jun–jul. Atual: 08:00.
UPDATE tasks SET due_time = '14:00:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T140000', 'g')
WHERE id = '4c2a83fe-7413-48b0-a2e2-50e7eeae6827';

-- Responsivo: única conclusão 07:15 (mai). Atual: 04:15.
UPDATE tasks SET due_time = '07:15:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T071500', 'g')
WHERE id = '02246293-4c58-4011-a232-9cfa332ae8e1';

-- DETRAN (AMBÍGUO: histórico 15:45→09:45→06:45; atual 03:45). Proposta: 06:45.
UPDATE tasks SET due_time = '06:45:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T064500', 'g')
WHERE id = 'c4758bb1-9906-498e-854f-2de314353d64';

-- Academia (AMBÍGUO: 18:45 em jun, 20:00 em ago, atual 17:00). Proposta: 20:00.
UPDATE tasks SET due_time = '20:00:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T200000', 'g')
WHERE id = '4439c36b-0f09-4a94-b8e7-3fb54ed52a55';

-- Puxar faturas (AMBÍGUO: 12:00 em mai, 09:00 em jun; atual 00:00). Proposta: 09:00.
UPDATE tasks SET due_time = '09:00:00',
  recurrence_rule = regexp_replace(recurrence_rule, '(DTSTART:\d{8}|EXDATE:\d{8})T\d{6}', '\1T090000', 'g')
WHERE id = 'ceda0284-cd6d-4680-94e8-501a771f86ee';

COMMIT;

-- Conferência pós-execução:
-- SELECT title, due_time, substring(recurrence_rule from 'DTSTART:[0-9T]+')
-- FROM tasks WHERE completed = false AND recurrence_rule LIKE '%DTSTART%' ORDER BY title;
