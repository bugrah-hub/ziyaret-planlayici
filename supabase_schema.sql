-- Supabase SQL Editor'a yapıştırıp "Run" tuşuna basın.
-- Bu, uygulamanın ihtiyaç duyduğu tabloları oluşturur.

create table if not exists organizations (
  key text primary key,
  name text not null,
  squad text,
  address text,
  formatted_address text,
  lat double precision,
  lng double precision,
  placeholder boolean default false
);

create table if not exists salespeople (
  id serial primary key,
  name text unique not null,
  calendar_email text
);

create table if not exists visits (
  id serial primary key,
  org_key text not null references organizations(key),
  org_name text not null,
  salesperson text not null,
  visit_date date not null,
  notes text default '',
  order_in_day integer default 0,
  source text default 'manual',
  created_at timestamptz default now()
);

-- Takvimden çekilen ama düşük güvenle eşleşen veya eşleşemeyen toplantılar
-- (kullanıcı onayı / manuel firma seçimi bekler)
create table if not exists pending_matches (
  id serial primary key,
  salesperson text not null,
  calendar_email text,
  event_title text not null,
  event_start timestamptz,
  visit_date date not null,
  suggested_org_key text references organizations(key),
  suggested_org_name text,
  confidence text, -- 'high' | 'medium' | 'low' | 'none'
  score numeric,
  status text default 'pending', -- 'pending' | 'confirmed' | 'dismissed'
  created_at timestamptz default now()
);

-- Varsayılan satışçılar (istersen düzenle/sil). calendar_email'i
-- uygulamadaki Ayarlar panelinden de girebilirsin.
insert into salespeople (name, calendar_email) values
  ('Ahmet Yılmaz', null), ('Elif Kaya', null), ('Mehmet Demir', null), ('Zeynep Şahin', null)
on conflict (name) do nothing;

-- Zaten kurulu bir veritabanınız varsa (organizations/salespeople/visits daha
-- önce oluşturulmuşsa) bu iki satırı SQL Editor'da ayrıca çalıştırın:
alter table salespeople add column if not exists calendar_email text;
alter table visits add column if not exists source text default 'manual';
