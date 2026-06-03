# Sincronização TaskFlow (projeto COMERCIAL) ↔ Proposal Creator Hub (atividades)

## Como vai funcionar (resumo)

- Um job roda a cada **15 minutos** (você pediu 30, mas 15 traz a sensação de "instantâneo" sem custo perceptível — se preferir 30, me diga).
- Cada execução faz **três passos**:
  1. Lê atividades novas/alteradas no Proposal Hub desde a última sync → cria/atualiza tarefas aqui no projeto COMERCIAL.
  2. Lê tarefas novas/alteradas do projeto COMERCIAL desde a última sync → cria/atualiza atividades no Proposal Hub.
  3. Marca como concluído / soft-delete dos dois lados quando um lado mudou.
- Uma **tabela-ponte** (`crm_activity_links`) guarda o par `(task_id, atividade_id, updated_at_lf, updated_at_pch, last_synced_at)` para que nada vire duplicado e nada seja perdido.
- Conflito (alterado nos dois lados desde a última sync): o lado **mais recente** vence (last-writer-wins), e o evento é registrado no `activity_log` para você revisar.

## Mapeamento de usuários (por e-mail)

- Quando alguém cria atividade no Proposal Hub, pego o `usuarios.email` do `vendedor_id` e busco o `auth.users.email` correspondente aqui → vira o `assignee_ids` da tarefa.
- Quando alguém cria tarefa aqui em COMERCIAL, pego o e-mail do assignee → busco o `usuarios.id` lá → vira `vendedor_id`.
- Se não houver match por e-mail, a atividade entra **sem responsável** (fica visível, não some) e logo um aviso.

## Mapeamento de campos

| TaskFlow (tasks) | Proposal Hub (atividades) |
|---|---|
| `title` | `titulo` |
| `description` | `descricao` |
| `due_date` + `due_time` | `data_prevista` (timestamptz) |
| `completed` / `completed_at` | `concluida` / `data_realizada` |
| `duration_minutes` (já existe) | `duracao_minutos` |
| `project_id` = COMERCIAL (fixo) | `tipo` = "tarefa" (default) |
| `assignee_ids[0]` (por e-mail) | `vendedor_id` |
| `deleted_at` | soft-delete via `concluida=false` + tag, ou exclusão real |

Campos extras do Proposal Hub (`cliente_id`, `oportunidade_id`, `resultado`, `proxima_acao`, `proxima_data`, `latitude/longitude`) **são preservados na tabela-ponte** em `extra_pch jsonb` para não perder informação no roundtrip — quando a atividade volta pra lá, esses campos voltam intactos.

Campos extras das tasks daqui (labels, priority, recurrence, comments) **ficam só aqui** — não fazem sentido lá.

## Setup que preciso de você

Para o edge function aqui falar com o banco do Proposal Hub eu preciso de **dois secrets** que você vai colar (uma vez):

1. `PCH_SUPABASE_URL` — URL do projeto Proposal Hub (algo como `https://xxxxx.supabase.co`)
2. `PCH_SERVICE_ROLE_KEY` — service role key dele

Você acha no Proposal Hub em **Lovable Cloud → Backend → API Keys**. Quando aprovar o plano eu já abro o diálogo pra você colar.

## Detalhes técnicos

**Nova tabela neste projeto:**
```sql
create table public.crm_activity_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  atividade_id uuid not null,            -- id no Proposal Hub
  pch_updated_hash text,                 -- hash do conteúdo lá
  lf_updated_hash  text,                 -- hash do conteúdo aqui
  extra_pch jsonb default '{}'::jsonb,   -- cliente_id, oport_id, resultado, etc.
  last_synced_at timestamptz default now(),
  unique (task_id), unique (atividade_id)
);
```
RLS: só service_role lê/escreve (é tabela interna do sync).

**Tabela de estado da sync:**
```sql
create table public.crm_sync_state (
  id int primary key default 1,
  last_run_at timestamptz,
  last_pch_cursor timestamptz,   -- created_at > cursor lá
  last_lf_cursor  timestamptz,   -- updated_at > cursor aqui
  last_error text,
  stats jsonb
);
```

**Edge function**: `crm-comercial-sync` (verify_jwt = false, chamada por cron).
**Cron**: `pg_cron` + `pg_net` → roda a cada 15min.

**Botão manual** "Sincronizar agora" na página de Settings → Integrações (para você forçar sync sem esperar o cron).

## Garantias contra perda de dados

- Nada é deletado físico nos dois lados sem confirmação dos dois `updated_at`.
- Se a tarefa some daqui (`deleted_at`), no Hub ela vira concluída + comentário "removida do TaskFlow em X" (não some).
- Se a atividade some de lá, aqui ela vira tarefa concluída arquivada (não some da agenda).
- Toda execução grava `stats` (criados/atualizados/erros) que você consulta no painel.

## Ordem de execução

1. Você aprova esse plano.
2. Eu peço os 2 secrets do Proposal Hub.
3. Migration: cria `crm_activity_links` + `crm_sync_state` + habilita `pg_cron`/`pg_net`.
4. Edge function `crm-comercial-sync` (lê estado, faz os 3 passos, atualiza estado).
5. Agendo o cron a cada 15min.
6. Botão "Sincronizar agora" na tela de Configurações.
7. Faço uma primeira sync de bootstrap (importa tudo que existe lá pra cá e vice-versa, casando pelo título+data quando possível para não duplicar histórico).
