/**
 * Flags centrais. Mude aqui para religar uma integração desligada.
 *
 * ENABLE_GOOGLE_CALENDAR:
 *   Quando false, TODA a integração com Google Calendar fica inerte:
 *   - UI escondida (botão na sidebar, seção em Configurações, banners).
 *   - Nenhuma chamada à edge function `google-calendar`.
 *   - cleanupLocalCalendarDuplicates e orphan-delete viram no-op.
 *   - Colunas `gcal_event_id` / `google_calendar_event_id` permanecem
 *     no banco (nullable) — só não são lidas/escritas.
 *
 *   Para religar, troque para `true`. Nenhuma migration necessária.
 */
export const ENABLE_GOOGLE_CALENDAR = false;
