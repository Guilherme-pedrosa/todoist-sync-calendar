# Abrir tarefas da agenda imediatamente

## Objetivo
Ao tocar ou clicar em uma tarefa já visível na agenda, abrir o painel de detalhes imediatamente, sem exigir uma segunda tentativa e sem aguardar outra consulta ao banco.

## Diagnóstico confirmado
- No calendário mobile, um toque curto apenas inicia uma janela de 300 ms; o painel só abre quando ocorre um segundo toque dentro desse intervalo.
- O clique envia somente o ID ao painel. Se a tarefa exibida veio da consulta específica da agenda e ainda não estiver no estado global, o painel mostra um carregamento e faz outra consulta antes de renderizar.
- Comentários, responsáveis e demais dados complementares já são carregados por efeitos separados; eles não precisam bloquear a exibição dos dados básicos da tarefa.

## Implementação
1. Alterar a interação mobile dos blocos da agenda para:
   - toque curto único: abrir a tarefa;
   - movimento após pressão longa: continuar arrastando/reagendando;
   - toque no botão de conclusão: continuar concluindo sem abrir o painel.
2. Passar ao painel um snapshot da tarefa que já está renderizada na agenda, junto do contexto da ocorrência recorrente.
3. Renderizar título, descrição, projeto, data, horário e duração imediatamente a partir desse snapshot; usar consulta sob demanda apenas como fallback quando a abertura vier de link/busca e nenhum dado local existir.
4. Manter os carregamentos secundários assíncronos, sem bloquear a abertura: comentários, perfis, responsáveis, anexos e histórico entram depois que o painel já estiver visível.
5. Evitar regressões em tarefas recorrentes: uma ocorrência continuará abrindo a tarefa-base com a data da ocorrência preservada.

## Validação
- Adicionar teste de regressão para toque único em uma tarefa da agenda.
- Validar no navegador desktop e em viewport mobile:
  - tarefa comum;
  - tarefa concluída visível na agenda;
  - ocorrência recorrente;
  - abrir, fechar e abrir outra tarefa em sequência;
  - arrastar por pressão longa sem abrir o painel acidentalmente.
- Medir o clique/toque até o painel visível; a abertura básica deve acontecer no mesmo ciclo de interação, sem depender de resposta de rede.

## Arquivos previstos
- `src/pages/views/UpcomingPage.tsx`
- `src/store/taskDetailStore.ts`
- `src/components/TaskDetailPanel.tsx`
- teste de regressão da interação da agenda
