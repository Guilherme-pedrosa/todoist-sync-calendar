DELETE FROM public.fleetdesk_task_links
WHERE task_id IN (
  SELECT id FROM public.tasks
  WHERE project_id = '72e77628-8e19-4937-8a4c-e570727905b3'
    AND external_source = 'fleetdesk'
);

DELETE FROM public.tasks
WHERE project_id = '72e77628-8e19-4937-8a4c-e570727905b3'
  AND external_source = 'fleetdesk';