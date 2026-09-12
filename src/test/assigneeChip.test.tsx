import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  mobile: true,
  projects: [{ id: 'project', name: 'TIME WEDO', workspaceId: 'workspace' }],
  workspace: {
    membersWorkspaceId: 'workspace',
    loadingMembers: false,
    fetchMembers: vi.fn(),
    members: [
      { userId: 'ana', displayName: 'Ana Silva', email: 'ana@example.com', avatarUrl: null },
      { userId: 'bruno', displayName: 'Bruno Souza', email: 'bruno@example.com', avatarUrl: null },
    ],
  },
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => fixture.mobile }));
vi.mock('@/store/taskStore', () => ({ useTaskStore: (selector: (state: unknown) => unknown) => selector({ projects: fixture.projects }) }));
vi.mock('@/store/workspaceStore', () => ({ useWorkspaceStore: (selector: (state: unknown) => unknown) => selector(fixture.workspace) }));

import { AssigneeChip } from '@/components/AssigneeChip';

const initialViewport = window.visualViewport;

describe('AssigneeChip', () => {
  beforeEach(() => {
    fixture.mobile = true;
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: initialViewport });
  });

  it.each([true, false])('keeps the search editable with zero matches (mobile=%s)', async (mobile) => {
    fixture.mobile = mobile;
    render(<AssigneeChip projectId="project" value={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Responsável: Responsável' }));
    const search = screen.getByRole('textbox', { name: 'Buscar membro' });
    search.focus();
    fireEvent.change(search, { target: { value: 'Nome inexistente' } });
    expect(screen.getByText('Nenhum membro encontrado. Tente outro nome.')).toBeVisible();
    expect(search).toHaveFocus();
    expect(search).toBeVisible();
    fireEvent.change(search, { target: { value: 'Ana' } });
    expect(screen.getByRole('button', { name: /Ana Silva/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Bruno Souza/ })).not.toBeInTheDocument();
  });

  it('opens mobile selection without forcing the keyboard and preserves the selection when closed', async () => {
    function Harness() {
      const [selected, setSelected] = useState<string[]>([]);
      return <AssigneeChip projectId="project" value={selected} onChange={setSelected} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Responsável: Responsável' }));
    expect(screen.getByRole('dialog', { name: 'Responsáveis' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Buscar membro' })).not.toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /Ana Silva/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Concluir' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(screen.getByRole('button', { name: 'Responsável: Ana Silva' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Responsável: Ana Silva' }));
    expect(screen.getByRole('button', { name: /Ana Silva/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('waits for assignment persistence before accepting another change', async () => {
    let finishSave!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    render(<AssigneeChip projectId="project" value={[]} onChange={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Responsável: Responsável' }));
    fireEvent.click(screen.getByRole('button', { name: /Ana Silva/ }));
    fireEvent.click(screen.getByRole('button', { name: /Bruno Souza/ }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(['ana']);
    expect(screen.getByRole('button', { name: /Bruno Souza/ })).toBeDisabled();
    await act(async () => finishSave());
    expect(screen.getByRole('button', { name: /Bruno Souza/ })).toBeEnabled();
  });

  it('keeps the selector inside the visible viewport when the keyboard opens', () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { offsetTop: 0, height: 800 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    render(<AssigneeChip projectId="project" value={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Responsável: Responsável' }));
    const picker = screen.getByRole('dialog', { name: 'Responsáveis' });
    expect(picker).toHaveStyle({ top: '64px', height: '736px' });
    act(() => {
      Object.assign(viewport, { offsetTop: 22, height: 340 });
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(picker).toHaveStyle({ top: '56px', height: '306px' });
    expect(screen.getByRole('textbox', { name: 'Buscar membro' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeVisible();
  });
});
