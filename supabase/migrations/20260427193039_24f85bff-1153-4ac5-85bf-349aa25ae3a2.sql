UPDATE public.tasks
SET title = regexp_replace(title, '\s+(util|útil)\s*$', '', 'i'),
    recurrence_rule = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
WHERE (title ~* '\s(util|útil)\s*$')
  AND (recurrence_rule IN ('FREQ=DAILY','FREQ=DAILY;INTERVAL=1') OR recurrence_rule IS NULL);