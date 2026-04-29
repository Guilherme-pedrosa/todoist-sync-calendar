## Objetivo

Permitir que o Auvo GC Sync (e outros sites) embute o chat do TaskFlow via `<iframe>`. Cada iframe abre **uma conversa específica** identificada por um `contextId` (ex.: ID de cliente, OS, etc.). Na primeira visita o usuário faz login no TaskFlow dentro do iframe; depois fica logado por semanas.

## Como vai funcionar (visão do usuário)

1. Auvo coloca um iframe apontando para `https://calendar-todo-dance.lovable.app/embed/chat?contextId=cliente-123&title=Cliente%20ACME`.
2. Primeira vez: aparece tela compacta com botão "Entrar com Google" (ou email/senha).
3. Após login: aparece o chat daquela conversa (mensagens, envio, anexos).
4. Visitas seguintes: já abre logado direto no chat.

## Escopo desta entrega

- Nova rota pública `/embed/chat` que renderiza só o chat (sem sidebar, sem header da app).
- Tela de login compacta embutida (mesma auth já existente, layout enxuto pra caber em iframe).
- Lógica para localizar/criar uma conversa por `contextId`:
  - Procura conversa existente do usuário com aquele `external_context_id`.
  - Se não existir, cria uma nova vinculada ao workspace pessoal do usuário.
- Ajustes para o iframe funcionar embedado em outro domínio (CSP/headers).

## O que muda no banco

Adicionar coluna `external_context_id` (texto) na tabela `conversations` para amarrar uma conversa a um identificador externo (vindo do Auvo). Criar índice único por `(workspace_id, external_context_id)` pra evitar duplicação.

## O que muda no código

```text
src/pages/EmbedChat.tsx        ← nova página, layout minimalista
src/components/EmbedAuthForm.tsx ← login compacto (Google + email/senha)
src/App.tsx                     ← rota /embed/chat (fora do AppLayout, sem ProtectedRoute padrão)
src/store/chatStore.ts          ← nova função ensureContextConversation(contextId, title)
supabase/migration              ← adiciona coluna external_context_id em conversations
index.html                      ← remover X-Frame-Options se houver; permitir embed
```

## Como o Auvo vai usar (instrução pro outro lado)

Você (ou eu, em outro projeto) vai colar isso no Auvo onde quiser que o chat apareça:

```html
<iframe
  src="https://calendar-todo-dance.lovable.app/embed/chat?contextId=CLIENTE_123&title=Cliente%20ACME"
  width="400" height="600"
  style="border:0;border-radius:12px"
  allow="clipboard-write"
></iframe>
```

`contextId` deve ser único por "assunto" (cliente, OS, projeto). Mesma string = mesma conversa.

## Limitações conhecidas (Caminho A)

- Login pedido na primeira vez por usuário/navegador (já combinado).
- Se o usuário usar navegação anônima ou limpar cookies, vai pedir login de novo.
- Conversa fica vinculada ao workspace **pessoal** do usuário logado — se duas pessoas diferentes abrirem o mesmo `contextId`, cada uma vê a sua conversa (não é compartilhada). Para chat compartilhado entre usuários do Auvo, precisaríamos do Caminho B (SSO) numa próxima etapa.

## Detalhes técnicos (para referência)

- Rota `/embed/chat` envolvida em `AuthProvider` mas com guarda própria que mostra `<EmbedAuthForm>` em vez de redirecionar para `/auth`.
- Após login bem-sucedido: chama `ensureContextConversation(contextId, title)` que faz upsert em `conversations` com `type='context'` (novo valor do enum) ou reaproveita `type='workspace'` com a coluna nova — vou usar um novo valor de enum `context` pra não colidir com a lógica existente.
- Reutiliza `<ChatThread>` existente para a UI de mensagens.
- Headers: removo `X-Frame-Options` (se existir) e configuro `Content-Security-Policy: frame-ancestors *` no `index.html` via meta — Lovable hosting permite embed por padrão, então provavelmente não precisa de nada extra.
- RLS: a conversa criada já fica protegida pelas policies existentes (`is_conversation_participant`), e o usuário é adicionado como participante automaticamente no momento da criação.

## Próximo passo após aprovação

1. Rodar migration (adicionar `external_context_id` + novo valor do enum `conversation_type`).
2. Implementar `EmbedChat`, `EmbedAuthForm`, ajustes no store e rota.
3. Te entregar a URL e o snippet de iframe pronto pra colar no Auvo.