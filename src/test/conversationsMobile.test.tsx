import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  mobile: true,
  chat: {
    conversations: [
      { id: 'general', type: 'workspace', taskId: null, title: 'Geral', updatedAt: '2026-09-12T10:00:00Z' },
      { id: 'service', type: 'task', taskId: 'task-1', title: 'Chat antigo', updatedAt: '2026-09-12T10:00:00Z' },
    ],
    unreadByConversation: {},
    fetchConversations: vi.fn().mockResolvedValue(undefined),
    subscribeRealtime: vi.fn(),
  },
  tasks: [{ id: 'task-1', title: 'Revisar forno', taskNumber: 42, completed: false }],
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => fixture.mobile }));
vi.mock('@/store/chatStore', () => ({ useChatStore: (selector: (state: unknown) => unknown) => selector(fixture.chat) }));
vi.mock('@/store/workspaceStore', () => ({ useWorkspaceStore: (selector: (state: unknown) => unknown) => selector({ currentWorkspaceId: 'workspace' }) }));
vi.mock('@/store/taskStore', () => ({ useTaskStore: (selector: (state: unknown) => unknown) => selector({ tasks: fixture.tasks }) }));
vi.mock('@/components/ChatThread', () => ({ ChatThread: ({ conversationId }: { conversationId: string }) => <div data-testid="thread"><p>{conversationId}</p><textarea aria-label="Mensagem" /></div> }));

import ConversationsPage from '@/pages/Conversations';

const initialViewport = window.visualViewport;
function LocationProbe() {
  return <output data-testid="route">{useLocation().pathname}</output>;
}
function mount(path = '/conversations') {
  return render(<MemoryRouter initialEntries={[path]}><LocationProbe /><Routes><Route path="/conversations" element={<ConversationsPage />} /><Route path="/conversations/:id" element={<ConversationsPage />} /></Routes></MemoryRouter>);
}

beforeEach(() => { fixture.mobile = true; vi.clearAllMocks(); });
afterEach(() => { cleanup(); Object.defineProperty(window, 'visualViewport', { configurable: true, value: initialViewport }); });

describe('conversations mobile navigation', () => {
  it('starts with the full list and returns to it without reopening a channel', () => {
    mount();
    expect(screen.getByLabelText('Lista de conversas')).toBeVisible();
    expect(screen.queryByTestId('thread')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Geral' }));
    expect(screen.getByTestId('route')).toHaveTextContent('/conversations/general');
    expect(screen.getByTestId('thread')).toHaveTextContent('general');
    expect(screen.queryByLabelText('Lista de conversas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar às conversas' }));
    expect(screen.getByTestId('route')).toHaveTextContent(/^\/conversations$/);
    expect(screen.getByLabelText('Lista de conversas')).toBeVisible();
    expect(screen.queryByTestId('thread')).not.toBeInTheDocument();
  });

  it('opens the exact linked conversation and displays its task title', () => {
    mount('/conversations/service');
    expect(screen.getByTestId('thread')).toHaveTextContent('service');
    expect(screen.getByRole('heading', { name: 'Revisar forno' })).toBeVisible();
    expect(screen.getByTestId('route')).toHaveTextContent('/conversations/service');
  });

  it('does not replace a mobile deep link before its conversation has loaded', () => {
    mount('/conversations/not-loaded-yet');
    expect(screen.getByTestId('route')).toHaveTextContent('/conversations/not-loaded-yet');
    expect(screen.getByTestId('thread')).toHaveTextContent('not-loaded-yet');
  });

  it('sizes the conversation to the visible viewport and blurs the composer on back', () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { offsetTop: 0, height: 844 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    mount('/conversations/general');
    const composer = screen.getByRole('textbox', { name: 'Mensagem' });
    composer.focus();
    act(() => { Object.assign(viewport, { offsetTop: 18, height: 430 }); viewport.dispatchEvent(new Event('resize')); });
    expect(screen.getByLabelText('Conversa aberta')).toHaveStyle({ top: '18px', height: '430px' });
    expect(composer).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar às conversas' }));
    expect(composer).not.toHaveFocus();
    expect(screen.getByLabelText('Lista de conversas')).toBeVisible();
  });

  it('preserves the desktop list, automatic first channel, and conversation changes', async () => {
    fixture.mobile = false;
    mount();
    expect(screen.getByLabelText('Lista de conversas')).toBeVisible();
    await waitFor(() => expect(screen.getByTestId('thread')).toHaveTextContent('general'));
    expect(screen.queryByRole('button', { name: 'Voltar às conversas' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Revisar forno/ }));
    await waitFor(() => expect(screen.getByTestId('thread')).toHaveTextContent('service'));
    expect(screen.getByLabelText('Lista de conversas')).toBeVisible();
  });
});
