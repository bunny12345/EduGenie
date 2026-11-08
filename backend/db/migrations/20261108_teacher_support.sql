begin;

alter table public.support_messages drop constraint support_messages_author_role_check;
alter table public.support_messages add constraint support_messages_author_role_check
  check (author_role in ('student', 'teacher', 'bot', 'owner'));

-- Existing RLS policies remain unchanged. Teacher access is through the
-- authenticated backend, which scopes each operation by account, role and school.
create or replace function public.support_create_ticket(
  p_ticket jsonb, p_messages jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  ticket_id uuid := (p_ticket->>'id')::uuid;
  existing public.support_tickets;
begin
  if p_ticket->>'requester_role' is null or p_ticket->>'requester_role' not in ('student', 'teacher') then
    raise exception 'Invalid requester role';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_messages) m
    where m->>'author_role' is distinct from p_ticket->>'requester_role'
  ) then raise exception 'Invalid message author'; end if;
  insert into public.support_tickets(id, requester_id, requester_role, school_id, requester_name, class_name, category, subject)
  values (ticket_id, (p_ticket->>'requester_id')::uuid, p_ticket->>'requester_role',
    (p_ticket->>'school_id')::uuid, p_ticket->>'requester_name', p_ticket->>'class_name',
    p_ticket->>'category', p_ticket->>'subject')
  on conflict (id) do nothing;
  if not found then
    select * into existing from public.support_tickets where id = ticket_id;
    if existing.requester_id::text is distinct from p_ticket->>'requester_id'
      or existing.school_id::text is distinct from p_ticket->>'school_id'
      or existing.requester_role is distinct from p_ticket->>'requester_role' then
      raise exception 'Ticket ownership mismatch';
    end if;
    return ticket_id;
  end if;
  insert into public.support_messages(id, ticket_id, author_role, content, created_at)
  select (m->>'id')::uuid, ticket_id, m->>'author_role', m->>'content',
    now() + (ordinality * interval '1 microsecond')
  from jsonb_array_elements(p_messages) with ordinality as messages(m, ordinality);
  return ticket_id;
end;
$$;

create or replace function public.support_append_message(
  p_ticket_id uuid, p_requester_id uuid, p_school_id uuid,
  p_message_id uuid, p_author_role text, p_content text
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  ticket public.support_tickets;
  existing public.support_messages;
begin
  select * into ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Ticket not found'; end if;
  if p_author_role is null or p_author_role not in ('student', 'teacher', 'owner') then
    raise exception 'Invalid author';
  end if;
  if p_author_role <> 'owner' and
    (ticket.requester_id is distinct from p_requester_id
      or ticket.school_id is distinct from p_school_id
      or ticket.requester_role is distinct from p_author_role) then
    raise exception 'Ticket ownership mismatch';
  end if;
  select * into existing from public.support_messages where id = p_message_id;
  if found then
    if existing.ticket_id <> p_ticket_id or existing.author_role <> p_author_role then
      raise exception 'Message ownership mismatch';
    end if;
    return p_message_id;
  end if;
  insert into public.support_messages(id, ticket_id, author_role, content)
  values (p_message_id, p_ticket_id, p_author_role, p_content);
  update public.support_tickets set updated_at = now(), status = 'open' where id = p_ticket_id;
  return p_message_id;
end;
$$;

revoke all on function public.support_create_ticket(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.support_append_message(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.support_create_ticket(jsonb, jsonb) to service_role;
grant execute on function public.support_append_message(uuid, uuid, uuid, uuid, text, text) to service_role;

commit;
