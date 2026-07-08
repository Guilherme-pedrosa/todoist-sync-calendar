import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspaceStore';

export interface MentionMember {
  userId: string;
  display: string;
  avatar?: string | null;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  workspaceId?: string | null;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  disabled?: boolean;
}

function getInitials(name: string | null | undefined) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

/** Extract mentioned user IDs from a body given the mentionable member list. */
export function extractMentionedUserIds(text: string, members: MentionMember[]): string[] {
  const ids = new Set<string>();
  const regex = /@([A-Za-zÀ-ÿ0-9_.\-\u00A0]+(?:\u00A0[A-Za-zÀ-ÿ0-9_.\-]+)*)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const name = m[1].replace(/\u00A0/g, ' ').trim().toLowerCase();
    const member = members.find((x) => x.display.toLowerCase() === name);
    if (member) ids.add(member.userId);
  }
  return [...ids];
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function MentionTextarea(
  { value, onChange, workspaceId, onSubmit, placeholder, className, rows = 2, disabled },
  ref
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  const members = useWorkspaceStore((s) => s.members);
  const membersWorkspaceId = useWorkspaceStore((s) => s.membersWorkspaceId);
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers);

  useEffect(() => {
    if (workspaceId && workspaceId !== membersWorkspaceId) {
      void fetchMembers(workspaceId);
    }
  }, [workspaceId, membersWorkspaceId, fetchMembers]);

  const mentionables: MentionMember[] = useMemo(
    () =>
      members.map((m) => ({
        userId: m.userId,
        display: (m.displayName || m.email || 'Membro').replace(/\s+/g, ' ').trim(),
        avatar: m.avatarUrl,
      })),
    [members]
  );

  const [state, setState] = useState<{ open: boolean; query: string; pos: number }>({
    open: false,
    query: '',
    pos: 0,
  });
  const [idx, setIdx] = useState(0);

  const filtered = useMemo(() => {
    const q = state.query.toLowerCase();
    return mentionables.filter((m) => m.display.toLowerCase().includes(q)).slice(0, 6);
  }, [state.query, mentionables]);

  useEffect(() => {
    setIdx(0);
  }, [state.query, state.open]);

  const handleChange = (v: string) => {
    onChange(v);
    const el = innerRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? v.length;
    const before = v.slice(0, cursor);
    const m = before.match(/@([A-Za-zÀ-ÿ0-9_.-]*)$/);
    if (m) setState({ open: true, query: m[1], pos: cursor - m[0].length });
    else setState({ open: false, query: '', pos: 0 });
  };

  const pick = (m: MentionMember) => {
    const el = innerRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, state.pos);
    const after = value.slice(cursor);
    const handle = m.display.replace(/\s+/g, '\u00A0');
    const newText = `${before}@${handle} ${after}`;
    onChange(newText);
    setState({ open: false, query: '', pos: 0 });
    requestAnimationFrame(() => {
      el.focus();
      const newCursor = (before + '@' + handle + ' ').length;
      el.setSelectionRange(newCursor, newCursor);
    });
  };

  const open = state.open && filtered.length > 0;

  return (
    <div className="relative">
      {open && (
        <div className="absolute bottom-full left-0 mb-1 z-50 w-64 rounded-md border bg-popover shadow-lg overflow-hidden">
          {filtered.map((m, i) => (
            <button
              key={m.userId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left',
                i === idx ? 'bg-accent' : 'hover:bg-accent/60'
              )}
            >
              <Avatar className="h-5 w-5">
                <AvatarImage src={m.avatar || undefined} />
                <AvatarFallback className="text-[9px]">{getInitials(m.display)}</AvatarFallback>
              </Avatar>
              <span className="truncate">{m.display}</span>
            </button>
          ))}
        </div>
      )}
      <Textarea
        ref={innerRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIdx((i) => (i + 1) % filtered.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIdx((i) => (i - 1 + filtered.length) % filtered.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(filtered[idx] || filtered[0]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setState({ open: false, query: '', pos: 0 });
              return;
            }
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder={placeholder}
        className={className}
        rows={rows}
        disabled={disabled}
      />
    </div>
  );
});
