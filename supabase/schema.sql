-- places 테이블
create table if not exists places (
  id uuid default gen_random_uuid() primary key,
  name_ko text not null,
  name_zh text,
  name_pinyin text,
  address text,
  lat double precision not null,
  lng double precision not null,
  category text not null,
  google_place_id text unique,
  google_rating numeric(2,1),
  wants_count integer default 0,
  created_at timestamptz default now()
);

-- RLS 활성화
alter table places enable row level security;

create policy "누구나 장소 조회 가능"
  on places for select using (true);

create policy "누구나 장소 추가 가능"
  on places for insert with check (true);

-- 가고 싶어요 카운트 증가 함수
create or replace function increment_wants(place_id uuid)
returns void as $$
  update places set wants_count = wants_count + 1 where id = place_id;
$$ language sql security definer;

grant execute on function increment_wants to anon;
