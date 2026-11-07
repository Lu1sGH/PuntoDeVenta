-- =============================================================================
-- ESQUEMA INICIAL DE BASE DE DATOS PARA PUNTO DE VENTA (PDV) EN SUPABASE
-- Ejecuta este script en el SQL Editor de tu proyecto en Supabase
-- =============================================================================

-- Extensión para UUIDs
create extension if not exists "pgcrypto";

-- 1. TABLA DE CATEGORÍAS
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text not null default '#2563eb',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. TABLA DE PRODUCTOS
-- Nota: `price` se almacena en centavos (MXN * 100) como número entero
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  sku text unique,
  barcode text unique,
  name text not null,
  description text,
  price integer not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 5,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. TABLA DE CLIENTES
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  tax_id text,
  created_at timestamptz not null default now()
);

-- 4. TABLA DE VENTAS (CABECERA) - montos en centavos
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity unique,
  customer_id uuid references public.customers(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  subtotal integer not null default 0,
  tax integer not null default 0,
  discount integer not null default 0,
  total integer not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'transfer')),
  amount_received integer not null default 0,
  change_amount integer not null default 0,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

-- 5. TABLA DE DETALLE DE VENTA (ITEMS) - montos en centavos
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  subtotal integer not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

-- Índices para búsquedas rápidas en PDV
create index if not exists idx_products_barcode on public.products(barcode);
create index if not exists idx_products_sku on public.products(sku);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_sales_created_at on public.sales(created_at desc);
create index if not exists idx_sale_items_sale_id on public.sale_items(sale_id);

-- Trigger para actualizar updated_at en productos
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

-- =============================================================================
-- FUNCIÓN TRANSACCIONAL RPC PARA REGISTRAR VENTA Y DESCONTAR STOCK
-- =============================================================================
create or replace function public.create_pos_sale(
  p_payment_method text,
  p_subtotal integer,
  p_tax integer,
  p_discount integer,
  p_total integer,
  p_amount_received integer,
  p_change_amount integer,
  p_items jsonb,
  p_customer_id uuid default null,
  p_notes text default null
)
returns public.sales
language plpgsql
security definer
as $$
declare
  v_sale public.sales;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price integer;
  v_product_name text;
  v_current_stock integer;
begin
  insert into public.sales (
    customer_id,
    user_id,
    subtotal,
    tax,
    discount,
    total,
    payment_method,
    amount_received,
    change_amount,
    notes
  ) values (
    p_customer_id,
    auth.uid(),
    p_subtotal,
    p_tax,
    p_discount,
    p_total,
    p_payment_method,
    p_amount_received,
    p_change_amount,
    p_notes
  )
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::integer;
    v_product_name := v_item->>'product_name';

    select stock into v_current_stock
    from public.products
    where id = v_product_id
    for update;

    if v_current_stock is null then
      raise exception 'Producto % no encontrado', v_product_name;
    end if;

    if v_current_stock < v_quantity then
      raise exception 'Stock insuficiente para % (Disponible: %, Solicitado: %)',
        v_product_name, v_current_stock, v_quantity;
    end if;

    insert into public.sale_items (
      sale_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal
    ) values (
      v_sale.id,
      v_product_id,
      v_product_name,
      v_quantity,
      v_unit_price,
      v_quantity * v_unit_price
    );

    update public.products
    set stock = stock - v_quantity
    where id = v_product_id;
  end loop;

  return v_sale;
end;
$$;

-- =============================================================================
-- FUNCIÓN RPC PARA ELIMINAR / VACIAR LA BASE DE DATOS DEL PDV
-- =============================================================================
create or replace function public.reset_pos_database()
returns void
language plpgsql
security definer
as $$
begin
  truncate table
    public.sale_items,
    public.sales,
    public.products,
    public.customers,
    public.categories
  restart identity cascade;
end;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

drop policy if exists "Acceso público categorias" on public.categories;
create policy "Acceso público categorias" on public.categories
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "Acceso público productos" on public.products;
create policy "Acceso público productos" on public.products
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "Acceso público clientes" on public.customers;
create policy "Acceso público clientes" on public.customers
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "Acceso público ventas" on public.sales;
create policy "Acceso público ventas" on public.sales
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "Acceso público items de venta" on public.sale_items;
create policy "Acceso público items de venta" on public.sale_items
  for all to anon, authenticated using (true) with check (true);

-- =============================================================================
-- STORAGE BUCKET PARA FOTOS DE PRODUCTOS
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "Lectura pública de fotos de productos" on storage.objects;
create policy "Lectura pública de fotos de productos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Subida pública de fotos de productos" on storage.objects;
create policy "Subida pública de fotos de productos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'product-images');
