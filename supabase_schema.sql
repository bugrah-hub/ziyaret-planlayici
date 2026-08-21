-- Supabase SQL Editor'a yapıştırıp "Run" tuşuna basın.
-- Bu, uygulamanın ihtiyaç duyduğu 3 tabloyu oluşturur.

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
  name text unique not null
);

create table if not exists visits (
  id serial primary key,
  org_key text not null references organizations(key),
  org_name text not null,
  salesperson text not null,
  visit_date date not null,
  notes text default '',
  order_in_day integer default 0,
  created_at timestamptz default now()
);

-- Varsayılan satışçılar (istersen düzenle/sil)
insert into salespeople (name) values
  ('Ahmet Yılmaz'), ('Elif Kaya'), ('Mehmet Demir'), ('Zeynep Şahin')
on conflict (name) do nothing;
