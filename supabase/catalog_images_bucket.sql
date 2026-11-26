-- Fotos del catálogo: en lugar de guardarlas como base64 dentro del documento de la tienda,
-- se suben a un bucket público (lectura abierta) y cada comercio solo escribe en su carpeta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-images', 'catalog-images', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists rf_catalog_images_insert on storage.objects;
create policy rf_catalog_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog-images'
    and (public.is_superadmin() or (storage.foldername(name))[1] = public.auth_business_id()));

drop policy if exists rf_catalog_images_update on storage.objects;
create policy rf_catalog_images_update on storage.objects for update to authenticated
  using (bucket_id = 'catalog-images'
    and (public.is_superadmin() or (storage.foldername(name))[1] = public.auth_business_id()))
  with check (bucket_id = 'catalog-images'
    and (public.is_superadmin() or (storage.foldername(name))[1] = public.auth_business_id()));

drop policy if exists rf_catalog_images_delete on storage.objects;
create policy rf_catalog_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalog-images'
    and (public.is_superadmin() or (storage.foldername(name))[1] = public.auth_business_id()));
