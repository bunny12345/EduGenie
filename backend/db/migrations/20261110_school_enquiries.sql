begin;

-- Separate from account support: prospects have no access to school records.
create table public.school_enquiry_challenges (
  id uuid primary key,
  email text not null,
  name text not null check (char_length(name) between 1 and 100),
  school_name text not null check (char_length(school_name) between 1 and 160),
  message text not null check (char_length(message) between 1 and 4000),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.school_enquiries (
  id uuid primary key,
  email text not null,
  name text not null,
  school_name text not null,
  session_hash text not null unique check (session_hash ~ '^[0-9a-f]{64}$'),
  session_expires_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.school_enquiry_messages (
  id uuid primary key,
  enquiry_id uuid not null references public.school_enquiries(id) on delete cascade,
  author_role text not null check (author_role in ('visitor', 'owner')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index school_enquiries_inbox_idx on public.school_enquiries(updated_at desc, id);
create index school_enquiry_messages_thread_idx on public.school_enquiry_messages(enquiry_id, created_at, id);

alter table public.school_enquiry_challenges enable row level security;
alter table public.school_enquiries enable row level security;
alter table public.school_enquiry_messages enable row level security;
revoke all on public.school_enquiry_challenges, public.school_enquiries, public.school_enquiry_messages from public, anon, authenticated;
grant all on public.school_enquiry_challenges, public.school_enquiries, public.school_enquiry_messages to service_role;

create function public.school_enquiry_verify(p_challenge_id uuid, p_code_hash text, p_session_hash text)
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
  insert into public.school_enquiries(id, email, name, school_name, session_hash, session_expires_at)
  values (enquiry_id, challenge.email, challenge.name, challenge.school_name, p_session_hash, now() + interval '30 days');
  insert into public.school_enquiry_messages(id, enquiry_id, author_role, content)
  values (gen_random_uuid(), enquiry_id, 'visitor', challenge.message);
  update public.school_enquiry_challenges set consumed = true where id = p_challenge_id;
  return jsonb_build_object('verified', true, 'id', enquiry_id);
end;
$$;

create function public.school_enquiry_append(
  p_enquiry_id uuid, p_session_hash text, p_message_id uuid, p_author_role text, p_content text
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  enquiry public.school_enquiries;
  existing public.school_enquiry_messages;
begin
  select * into enquiry from public.school_enquiries where id = p_enquiry_id for update;
  if not found then raise exception 'Enquiry not found'; end if;
  if p_author_role is null or p_author_role not in ('visitor', 'owner') then raise exception 'Invalid author'; end if;
  if p_author_role = 'visitor' and (enquiry.session_hash is distinct from p_session_hash or enquiry.session_expires_at <= now()) then
    raise exception 'Enquiry access denied';
  end if;
  select * into existing from public.school_enquiry_messages where id = p_message_id;
  if found then
    if existing.enquiry_id <> p_enquiry_id or existing.author_role <> p_author_role or existing.content is distinct from p_content then
      raise exception 'Message identity mismatch';
    end if;
    return p_message_id;
  end if;
  insert into public.school_enquiry_messages(id, enquiry_id, author_role, content)
  values (p_message_id, p_enquiry_id, p_author_role, p_content);
  update public.school_enquiries set updated_at = now(), status = 'open' where id = p_enquiry_id;
  return p_message_id;
end;
$$;

revoke all on function public.school_enquiry_verify(uuid, text, text) from public, anon, authenticated;
revoke all on function public.school_enquiry_append(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.school_enquiry_verify(uuid, text, text) to service_role;
grant execute on function public.school_enquiry_append(uuid, text, uuid, text, text) to service_role;
commit;
