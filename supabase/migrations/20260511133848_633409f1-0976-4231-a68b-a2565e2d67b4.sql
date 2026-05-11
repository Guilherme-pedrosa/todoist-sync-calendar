UPDATE public.tasks
SET due_date = NULL, due_time = NULL, due_at = NULL
WHERE title ILIKE '[Frota]%' OR title ILIKE '%[Frota]%';