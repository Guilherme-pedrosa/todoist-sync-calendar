# Diagnóstico: latência de tarefas e comentários para colaboradores

## O que descobri

### 1. Realtime de tarefas: refetch global pesado (causa principal da demora)
Em `src/lib/realtimeTasks.ts`, qualquer evento em `tasks`, `projects`, `sections`, `task_labels`, `task_assignees` ou `meeting_invitations` dispara o mesmo callback `scheduleRefetch`, que:

- aguarda **400ms** de debounce
- chama `useTaskStore.fetchData()`, que faz **3 queries em paralelo** (todos os projetos + todas as labels + todas as tasks com joins de `task_labels`, `task_assignees`, `meeting_invitations`)
- roda `cleanupLocalCalendarDuplicates` (pode disparar deletes)
- roda `syncGoogleCalendarEvents` (pode chamar API do Google)
- só então o `set({...})` atualiza o estado

Resultado: cada mudança feita pelo Colab A leva **400ms + tempo do refetch completo + sync GCal** para aparecer no Colab B. Em workspaces com muitas tarefas, isso vira 2–5s facilmente. Pior: se múltiplos eventos chegam, todos colapsam num único refetch após 400ms — bom para spam, ruim para latência percebida.

### 2. Comentários: realtime amarrado ao painel da tarefa
Em `src/components/TaskDetailPanel.tsx` (linha 212), o canal `comments-${task.id}` só existe enquanto o **painel de detalhes daquela tarefa específica está aberto**. Se o Colab B não estiver com o painel aberto, ele não recebe o evento — quando abrir, busca via SELECT inicial, então parece "atrasado". Não há canal global de comentários e nenhum mecanismo de notificação/badge para indicar comentário novo enquanto o painel está fechado.

### 3. Realtime já está habilitado no banco
`supabase_realtime` cobre `tasks`, `comments`, `task_assignees`, `task_labels`, `projects`, `sections`, `messages`, `notifications`, `conversations`, `conversation_participants`. `REPLICA IDENTITY FULL` está ok nas tabelas relevantes. Não é problema de configuração.

## Proposta de correção

### A. Aplicar mudanças incrementais no estado (eliminar refetch global)
Refatorar `src/lib/realtimeTasks.ts` para processar `payload.new`/`payload.old` por tabela e atualizar diretamente o Zustand:

- `tasks` INSERT → `addTaskLocal(mapDbTaskToTask(payload.new))`
- `tasks` UPDATE → `updateTaskLocal(id, partial)`
- `tasks` DELETE → `removeTaskLocal(id)`
- `task_labels` / `task_assignees` / `meeting_invitations` → atualizar só o array correspondente da tarefa afetada
- `projects` / `sections` → atualizar map local
- Manter `fetchData()` apenas como fallback (ex.: ao montar o app, ao reconectar o canal, ao receber `system` event de erro)
- Reduzir debounce para 50ms ou eliminar para INSERT/UPDATE de tarefas individuais

Adicionar ao `taskStore` actions atômicas: `applyTaskUpsert`, `applyTaskDelete`, `applyAssigneeChange`, `applyLabelChange`, `applyProjectUpsert`, `applySectionUpsert`.

### B. Comentários globais + indicador de novo
Criar um canal global `comments-workspace-${workspaceId}` (ou por usuário) em `src/lib/realtimeTasks.ts` (ou novo `src/lib/realtimeComments.ts`) que:

- escuta INSERT/UPDATE/DELETE em `comments`
- mantém um contador "comentários não lidos" por `task_id` em uma store
- exibe badge na lista de tarefas (ex.: pequeno indicador laranja na linha da tarefa)
- ao abrir o painel da tarefa, marca como lido

O canal por-task em `TaskDetailPanel` continua existindo para atualização ao vivo enquanto o painel está aberto, mas o canal global garante que o Colab B receba o evento mesmo com o painel fechado.

### C. Saneamento extra
- Remover `syncGoogleCalendarEvents` do caminho do realtime (ele só deve rodar no boot e em sync manual — hoje ele roda a cada evento realtime, o que multiplica o custo).
- Remover `cleanupLocalCalendarDuplicates` do caminho do realtime pelo mesmo motivo.
- Verificar se `NOTIFY pgrst, 'reload schema'` recente não derrubou o canal — se sim, adicionar reconexão automática.

## Escopo desta proposta (a executar quando aprovado)

1. Refatorar `src/lib/realtimeTasks.ts` com handlers por tabela e updates incrementais.
2. Adicionar actions atômicas em `src/store/taskStore.ts`.
3. Criar canal global de `comments` + estado de "não lido" + badge na linha da tarefa.
4. Remover `syncGoogleCalendarEvents` e `cleanupLocalCalendarDuplicates` do callback realtime (mantendo no boot/manual).

## Validação

- Logar timestamp do evento recebido vs. timestamp do `set()` no console (`[realtime] applied in Xms`).
- Teste manual: Colab A cria tarefa → Colab B vê em < 1s.
- Teste manual: Colab A comenta numa tarefa → Colab B vê badge na lista em < 1s; ao abrir painel, comentário aparece imediatamente.

## Restrições

- ZERO alteração em policies RLS.
- ZERO alteração em triggers/funções do banco.
- Mudança puramente frontend + Zustand.
