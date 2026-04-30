CREATE OR REPLACE FUNCTION public.add_conversation_creator_as_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (NEW.id, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_conversation_creator ON public.conversations;
CREATE TRIGGER trg_add_conversation_creator
AFTER INSERT ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.add_conversation_creator_as_participant();