-- ============================================================
-- ストックノート: グループ分離 + RLS セットアップ SQL
-- Supabase Dashboard > SQL Editor で順番に実行してください
-- ============================================================

-- 1. グループ定義（3グループ）
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

insert into public.groups (name, slug) values
  ('夫婦共有', 'couple'),
  ('妹（単独）', 'sister'),
  ('娘（単独）', 'daughter')
on conflict (slug) do nothing;

-- 2. ユーザーとグループの紐付け
create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists group_members_user_id_idx
  on public.group_members (user_id);

-- 3. 在庫テーブル（既存 items がある場合は group_id 列を追加）
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  category text not null default '食材',
  status text not null default 'あり',
  expiration_date date,
  is_shopping_list boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.items
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

-- 既存行がある場合: 管理者が手動で group_id を埋めてから NOT NULL 制約を有効化
-- alter table public.items alter column group_id set not null;

create index if not exists items_group_id_idx on public.items (group_id);

-- 4. updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
before update on public.items
for each row execute function public.set_updated_at();

-- 5. RLS 有効化
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.items enable row level security;

-- 6. groups: 自分が所属するグループ + 参加候補グループを閲覧可
drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member"
on public.groups
for select
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = groups.id
      and gm.user_id = auth.uid()
  )
  or slug in ('couple', 'sister', 'daughter')
);

-- 7. group_members: 自分の所属情報のみ閲覧可
drop policy if exists "group_members_select_own" on public.group_members;
create policy "group_members_select_own"
on public.group_members
for select
to authenticated
using (user_id = auth.uid());

-- 初回ログイン時にデフォルトグループ（couple）へ自己登録可能
drop policy if exists "group_members_insert_self" on public.group_members;
create policy "group_members_insert_self"
on public.group_members
for insert
to authenticated
with check (user_id = auth.uid());

-- 8. items: 所属グループのデータのみ CRUD 可
drop policy if exists "items_select_own_group" on public.items;
create policy "items_select_own_group"
on public.items
for select
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = items.group_id
      and gm.user_id = auth.uid()
  )
);

drop policy if exists "items_insert_own_group" on public.items;
create policy "items_insert_own_group"
on public.items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = items.group_id
      and gm.user_id = auth.uid()
  )
);

drop policy if exists "items_update_own_group" on public.items;
create policy "items_update_own_group"
on public.items
for update
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = items.group_id
      and gm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = items.group_id
      and gm.user_id = auth.uid()
  )
);

drop policy if exists "items_delete_own_group" on public.items;
create policy "items_delete_own_group"
on public.items
for delete
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = items.group_id
      and gm.user_id = auth.uid()
  )
);

-- ============================================================
-- 9. 初期ユーザー作成後のメンバー登録例
-- Authentication > Users でユーザーを作成し、UUID を確認してから実行
-- ============================================================

-- 例: 夫婦アカウント2名をグループAへ
-- insert into public.group_members (group_id, user_id, role)
-- select g.id, 'HUSBAND_USER_UUID'::uuid, 'member'
-- from public.groups g where g.slug = 'couple';
--
-- insert into public.group_members (group_id, user_id, role)
-- select g.id, 'WIFE_USER_UUID'::uuid, 'member'
-- from public.groups g where g.slug = 'couple';

-- 例: 妹をグループBへ
-- insert into public.group_members (group_id, user_id, role)
-- select g.id, 'SISTER_USER_UUID'::uuid, 'owner'
-- from public.groups g where g.slug = 'sister';

-- 例: 娘をグループCへ
-- insert into public.group_members (group_id, user_id, role)
-- select g.id, 'DAUGHTER_USER_UUID'::uuid, 'owner'
-- from public.groups g where g.slug = 'daughter';
