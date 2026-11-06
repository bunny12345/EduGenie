begin;

create table public.support_tickets (
  id uuid primary key,
  requester_id uuid not null,
  requester_role text not null check (requester_role in ('student', 'teacher', 'school_admin')),
  school_id uuid not null,
  requester_name text not null,
  class_name text not null default '',
  category text not null check (category in ('glitch', 'technician')),
  subject text not null check (char_length(subject) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_messages (
  id uuid primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_role text not null check (author_role in ('student', 'bot', 'owner')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index support_tickets_requester_idx on public.support_tickets(requester_id, school_id, updated_at desc);
create index support_tickets_inbox_idx on public.support_tickets(updated_at desc);
create index support_messages_ticket_idx on public.support_messages(ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_tickets, public.support_messages from anon, authenticated;
grant select on public.support_tickets, public.support_messages to authenticated;
grant all on public.support_tickets, public.support_messages to service_role;

create policy support_student_read_ticket on public.support_tickets for select to authenticated
using (
  requester_role = 'student'
  and auth.jwt()->>'role' = 'student'
  and requester_id::text = auth.jwt()->>'sub'
  and school_id::text = auth.jwt()->>'schoolId'
);
create policy support_student_read_messages on public.support_messages for select to authenticated
using (exists (select 1 from public.support_tickets t where t.id = ticket_id));

-- Service-only operations keep tickets and their messages atomic. Ownership
-- arguments come from verified backend identities, never from request bodies.
create function public.support_create_ticket(
  p_ticket jsonb, p_messages jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  ticket_id uuid := (p_ticket->>'id')::uuid;
  existing public.support_tickets;
begin
  insert into public.support_tickets(id, requester_id, requester_role, school_id, requester_name, class_name, category, subject)
  values (ticket_id, (p_ticket->>'requester_id')::uuid, p_ticket->>'requester_role',
    (p_ticket->>'school_id')::uuid, p_ticket->>'requester_name', p_ticket->>'class_name',
    p_ticket->>'category', p_ticket->>'subject')
  on conflict (id) do nothing;
  if not found then
    select * into existing from public.support_tickets where id = ticket_id;
    if existing.requester_id::text <> p_ticket->>'requester_id'
      or existing.school_id::text <> p_ticket->>'school_id' then
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

create function public.support_append_message(
  p_ticket_id uuid, p_requester_id uuid, p_school_id uuid,
  p_message_id uuid, p_author_role text, p_content text
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  ticket public.support_tickets;
  existing public.support_messages;
begin
  select * into ticket from public.support_tickets where id = p_ticket_id for update;
  if not found then raise exception 'Ticket not found'; end if;
  if p_author_role not in ('student', 'owner') then raise exception 'Invalid author'; end if;
  if p_author_role = 'student' and
    (ticket.requester_id <> p_requester_id or ticket.school_id <> p_school_id) then
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
