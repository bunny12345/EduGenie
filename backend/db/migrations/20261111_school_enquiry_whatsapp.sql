begin;

-- A stored number means the visitor explicitly requested WhatsApp contact.
alter table public.school_enquiry_challenges
  add column whatsapp_number text check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$');
alter table public.school_enquiries
  add column whatsapp_number text check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$');

create or replace function public.school_enquiry_verify(p_challenge_id uuid, p_code_hash text, p_session_hash text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  challenge public.school_enquiry_challenges;
  enquiry_id uuid := gen_random_uuid();
begin
  select * into challenge from public.school_enquiry_challenges where id = p_challenge_id for update;
  if not found or challenge.consumed or challenge.expires_at <= now() or challenge.attempts >= 5 then
    return jsonb_build_object('verified', false);
  end if;
  update public.school_enquiry_challenges set attempts = attempts + 1 where id = p_challenge_id;
  if challenge.code_hash is distinct from p_code_hash then return jsonb_build_object('verified', false); end if;
  insert into public.school_enquiries(id, email, name, school_name, session_hash, session_expires_at, whatsapp_number)
  values (enquiry_id, challenge.email, challenge.name, challenge.school_name, p_session_hash,
    now() + interval '30 days', challenge.whatsapp_number);
  insert into public.school_enquiry_messages(id, enquiry_id, author_role, content)
  values (gen_random_uuid(), enquiry_id, 'visitor', challenge.message);
  update public.school_enquiry_challenges set consumed = true where id = p_challenge_id;
  return jsonb_build_object('verified', true, 'id', enquiry_id);
end;
$$;

revoke all on function public.school_enquiry_verify(uuid, text, text) from public, anon, authenticated;
grant execute on function public.school_enquiry_verify(uuid, text, text) to service_role;
commit;
