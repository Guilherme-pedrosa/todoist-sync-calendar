import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Paperclip, Pencil, ExternalLink, X, Bell, FileText, Image as ImageIcon, ListChecks } from 'lucide-react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useChatStore, type Message } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useTaskDetailStore } from '@/store/taskDetailStore';

interface Props {
  conversationId: string;
  compact?: boolean;
  showOpenFull?: boolean;
}

const EMPTY_MESSAGES: Message[] = [];

interface MentionPick {
  userId: string;
  display: string;
}

function getInitials(name: string | null | undefined) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function renderBodyWithMentions(body: string, members: { userId: string; display: string }[], myId: string | null) {
  // Substitui @nome por chip; destaca se for eu
  const parts: Array<{ type: 'text' | 'mention'; text: string; isMe?: boolean }> = [];
  const regex = /@([A-Za-zÀ-ÿ0-9_.\-]+(?:\s[A-Za-zÀ-ÿ0-9_.\-]+)?)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', text: body.slice(lastIndex, match.index) });
    const handle = match[1].trim();
    const member = members.find((m) => m.display.toLowerCase() === handle.toLowerCase());
    parts.push({
      type: 'mention',
      text: '@' + handle,
      isMe: member?.userId === myId,
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) parts.push({ type: 'text', text: body.slice(lastIndex) });
  return parts;
}

export function ChatThread({ conversationId, compact, showOpenFull }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const messagesMap = useChatStore((s) => s.messagesByConversation);
  const messages = useMemo(() => messagesMap[conversationId] ?? EMPTY_MESSAGES, [messagesMap, conversationId]);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const editMessage = useChatStore((s) => s.editMessage);
  const markRead = useChatStore((s) => s.markRead);
  const setActive = useChatStore((s) => s.setActiveConversation);
  const uploadAttachment = useChatStore((s) => s.uploadAttachment);
  const conversations = useChatStore((s) => s.conversations);
  const conversation = useMemo(() => conversations.find((c) => c.id === conversationId), [conversations, conversationId]);
  const members = useWorkspaceStore((s) => s.members);
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers);

  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mentionState, setMentionState] = useState<{ open: boolean; query: string; pos: number }>({
    open: false,
    query: '',
    pos: 0,
  });
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mentionable members (workspace)
  const mentionables = useMemo(
    () =>
      members.map((m) => ({
        userId: m.userId,
        display: (m.displayName || 'Membro').replace(/\s+/g, ' ').trim(),
        avatar: m.avatarUrl,
      })),
    [members]
  );

  // Fetch members of conversation's workspace
  useEffect(() => {
    if (conversation?.workspaceId) fetchMembers(conversation.workspaceId);
  }, [conversation?.workspaceId, fetchMembers]);

  useEffect(() => {
    fetchMessages(conversationId);
    setActive(conversationId);
    markRead(conversationId);
    return () => setActive(null);
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-mark read on new message arrival while open
  useEffect(() => {
    if (messages.length > 0) markRead(conversationId);
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, conversationId]);

  // Detect @ for autocomplete
  const handleDraftChange = (value: string) => {
    setDraft(value);
    const el = inputRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const m = before.match(/@([A-Za-zÀ-ÿ0-9_.\-]*)$/);
    if (m) {
      setMentionState({ open: true, query: m[1], pos: cursor - m[0].length });
    } else {
      setMentionState({ open: false, query: '', pos: 0 });
    }
  };

  const filteredMentions = useMemo(() => {
    const q = mentionState.query.toLowerCase();
    return mentionables
      .filter((m) => m.display.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionState.query, mentionables]);

  // Reset highlighted item when list changes
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionState.query, mentionState.open]);

  const insertMention = (m: MentionPick) => {
    const el = inputRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? draft.length;
    const before = draft.slice(0, mentionState.pos);
    const after = draft.slice(cursor);
    const handle = m.display.replace(/\s+/g, '\u00A0'); // non-breaking space
    const newText = `${before}@${handle} ${after}`;
    setDraft(newText);
    setMentionState({ open: false, query: '', pos: 0 });
    requestAnimationFrame(() => {
      el.focus();
      const newCursor = (before + '@' + handle + ' ').length;
      el.setSelectionRange(newCursor, newCursor);
    });
  };

  const extractMentionedUserIds = (text: string): string[] => {
    const ids = new Set<string>();
    const regex = /@([A-Za-zÀ-ÿ0-9_.\-\u00A0]+)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const name = m[1].replace(/\u00A0/g, ' ').trim().toLowerCase();
      const member = mentionables.find((x) => x.display.toLowerCase() === name);
      if (member) ids.add(member.userId);
    }
    return [...ids];
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text && pendingAttachments.length === 0) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of pendingAttachments) {
        const att = await uploadAttachment(conversationId, f);
        if (att) uploaded.push(att);
      }
      const mentionedIds = extractMentionedUserIds(text);
      await sendMessage(conversationId, text || '(anexo)', uploaded, mentionedIds);

      if (user) {
        // Determina quem deve receber notificação:
        // - Conversa de tarefa: apenas criador + responsáveis (assignees) da tarefa.
        // - Conversa de workspace/contexto: todos os participantes.
        // Mencionados (@) sempre recebem, independentemente.
        let recipientIds: string[] = [];
        if (conversation?.type === 'task' && conversation.taskId) {
          const [{ data: taskRow }, { data: assignees }] = await Promise.all([
            supabase.from('tasks').select('user_id, created_by, assignee').eq('id', conversation.taskId).maybeSingle(),
            supabase.from('task_assignees').select('user_id').eq('task_id', conversation.taskId),
          ]);
          const set = new Set<string>();
          if (taskRow?.created_by) set.add(taskRow.created_by as string);
          if (taskRow?.user_id) set.add(taskRow.user_id as string);
          if (taskRow?.assignee) set.add(taskRow.assignee as string);
          for (const a of assignees || []) if ((a as any).user_id) set.add((a as any).user_id);
          recipientIds = [...set];
        } else {
          const { data: parts } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId);
          recipientIds = (parts || []).map((p: any) => p.user_id as string);
        }
        const mentionedSet = new Set(mentionedIds);
        // Mencionados são sempre notificados, mesmo fora dos responsáveis.
        const targetIds = new Set<string>([...recipientIds, ...mentionedIds]);
        const participantIds = [...targetIds].filter((id) => id !== user.id);
        const rows: any[] = [];
        for (const id of participantIds) {
          if (id === user.id) continue;
          if (mentionedSet.has(id)) {
            rows.push({
              user_id: id,
              type: 'chat_mention',
              workspace_id: conversation?.workspaceId,
              payload: {
                conversation_id: conversationId,
                task_id: conversation?.taskId,
                from_user: user.id,
                snippet: text.slice(0, 140),
              },
            });
          } else {
            rows.push({
              user_id: id,
              type: 'chat_message',
              workspace_id: conversation?.workspaceId,
              payload: {
                conversation_id: conversationId,
                task_id: conversation?.taskId,
                from_user: user.id,
                snippet: text.slice(0, 140),
              },
            });
          }
        }
        if (rows.length > 0) await supabase.from('notifications').insert(rows);
      }

      setDraft('');
      setPendingAttachments([]);
    } catch (e) {
      toast.error('Falha ao enviar mensagem');
    } finally {
      setUploading(false);
    }
  };

  const handleEditSave = async () => {
    if (!editing) return;
    await editMessage(editing.id, conversationId, editing.body);
    setEditing(null);
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setPendingAttachments((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const memberMap = useMemo(() => {
    const map = new Map<string, { name: string; avatar: string | null }>();
    for (const m of members) {
      map.set(m.userId, { name: m.displayName || 'Membro', avatar: m.avatarUrl });
    }
    return map;
  }, [members]);

  const getAttachmentUrl = async (path: string) => {
    const { data } = await supabase.storage.from('chat-attachments').createSignedUrl(path, 3600);
    return data?.signedUrl;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {(showOpenFull || conversation?.taskId) && conversation && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
          <div className="text-sm font-medium truncate">
            {conversation.title || (conversation.type === 'task' ? 'Conversa da tarefa' : 'Canal')}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {conversation.taskId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => useTaskDetailStore.getState().open(conversation.taskId!)}
                title="Ver tarefa"
              >
                <ListChecks className="h-3.5 w-3.5 mr-1" />
                Ver tarefa
              </Button>
            )}
            {showOpenFull && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => navigate(`/conversations/${conversationId}`)}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Abrir
              </Button>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-8">
            Sem mensagens ainda. Diga olá 👋
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isMine={m.userId === user?.id}
              author={memberMap.get(m.userId)}
              compact={compact}
              members={mentionables}
              myId={user?.id || null}
              onEdit={() => setEditing({ id: m.id, body: m.body })}
              isEditing={editing?.id === m.id}
              editValue={editing?.body || ''}
              onEditChange={(v) => setEditing((e) => (e ? { ...e, body: v } : e))}
              onEditSave={handleEditSave}
              onEditCancel={() => setEditing(null)}
              getSignedUrl={getAttachmentUrl}
            />
          ))
        )}
      </div>

      {/* Pending attachments preview */}
      {pendingAttachments.length > 0 && (
        <div className="px-3 py-2 border-t flex flex-wrap gap-2">
          {pendingAttachments.map((f, i) => (
            <Badge key={i} variant="secondary" className="gap-1.5 pl-2 pr-1">
              {f.type.startsWith('image/') ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button
                onClick={() => setPendingAttachments((p) => p.filter((_, idx) => idx !== i))}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input + mention popover */}
      <div className="relative border-t p-2">
        {mentionState.open && filteredMentions.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-2 bg-popover border rounded-lg shadow-lg overflow-hidden z-10 max-h-56 overflow-y-auto">
            {filteredMentions.map((m, idx) => (
              <button
                key={m.userId}
                onMouseEnter={() => setMentionIndex(idx)}
                onClick={() => insertMention(m)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left text-sm',
                  idx === mentionIndex ? 'bg-accent' : 'hover:bg-accent/60'
                )}
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={m.avatar || undefined} />
                  <AvatarFallback className="text-[10px]">{getInitials(m.display)}</AvatarFallback>
                </Avatar>
                <span>{m.display}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onPickFiles}
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={(e) => {
              const mentionOpen = mentionState.open && filteredMentions.length > 0;
              if (mentionOpen) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % filteredMentions.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIndex((i) => (i - 1 + filteredMentions.length) % filteredMentions.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  const pick = filteredMentions[mentionIndex] || filteredMentions[0];
                  if (pick) insertMention(pick);
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
              if (e.key === 'Escape') setMentionState({ open: false, query: '', pos: 0 });
            }}
            placeholder="Mensagem... (use @ para mencionar)"
            className="min-h-[40px] max-h-32 resize-none flex-1"
            rows={1}
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={uploading || (!draft.trim() && pendingAttachments.length === 0)}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface BubbleProps {
  message: Message;
  isMine: boolean;
  author?: { name: string; avatar: string | null };
  compact?: boolean;
  members: { userId: string; display: string }[];
  myId: string | null;
  onEdit: () => void;
  isEditing: boolean;
  editValue: string;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  getSignedUrl: (path: string) => Promise<string | undefined>;
}

function MessageBubble({
  message,
  isMine,
  author,
  compact,
  members,
  myId,
  onEdit,
  isEditing,
  editValue,
  onEditChange,
  onEditSave,
  onEditCancel,
  getSignedUrl,
}: BubbleProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const att of message.attachments) {
        const u = await getSignedUrl(att.path);
        if (u) next[att.path] = u;
      }
      if (active) setUrls(next);
    })();
    return () => {
      active = false;
    };
  }, [message.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const parts = renderBodyWithMentions(message.body, members, myId);
  const time = format(parseISO(message.createdAt), 'HH:mm', { locale: ptBR });

  return (
    <div className={cn('flex gap-2', isMine && 'flex-row-reverse')}>
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarImage src={author?.avatar || undefined} />
        <AvatarFallback className="text-[10px]">{getInitials(author?.name)}</AvatarFallback>
      </Avatar>
      <div className={cn('flex flex-col gap-1 max-w-[78%]', isMine && 'items-end')}>
        <div className={cn('flex items-baseline gap-2 text-xs text-muted-foreground', isMine && 'flex-row-reverse')}>
          <span className="font-medium text-foreground/80">{author?.name || 'Usuário'}</span>
          <span>{time}</span>
          {message.editedAt && <span className="italic">(editada)</span>}
        </div>

        {isEditing ? (
          <div className="w-full space-y-1.5">
            <Textarea
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              className="min-h-[60px]"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={onEditCancel}>Cancelar</Button>
              <Button size="sm" onClick={onEditSave}>Salvar</Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap',
              isMine
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-muted rounded-bl-sm'
            )}
          >
            {parts.map((p, i) =>
              p.type === 'mention' ? (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center px-1 rounded font-medium',
                    p.isMe
                      ? 'bg-yellow-400/30 text-yellow-100 ring-1 ring-yellow-400/60'
                      : isMine
                        ? 'bg-primary-foreground/20'
                        : 'bg-primary/15 text-primary'
                  )}
                >
                  {p.text}
                </span>
              ) : (
                <span key={i}>{p.text}</span>
              )
            )}

            {message.attachments.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {message.attachments.map((att) => {
                  const url = urls[att.path];
                  const isImg = att.mimeType.startsWith('image/');
                  if (isImg && url) {
                    return (
                      <button
                        key={att.path}
                        type="button"
                        onClick={() => setLightbox({ url, name: att.name })}
                        className="block focus:outline-none focus:ring-2 focus:ring-primary rounded-lg"
                      >
                        <img src={url} alt={att.name} className="rounded-lg max-h-56 object-cover cursor-zoom-in" />
                      </button>
                    );
                  }
                  return (
                    <a
                      key={att.path}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs',
                        isMine ? 'bg-primary-foreground/15' : 'bg-background/60'
                      )}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span className="truncate">{att.name}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {isMine && !isEditing && (
          <button
            onClick={onEdit}
            className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Pencil className="h-2.5 w-2.5" /> editar
          </button>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-background/20 hover:bg-background/30 text-white flex items-center justify-center"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-h-[90vh] max-w-[95vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
