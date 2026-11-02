-- Read-only deployment verification; returns metadata, not names or emails.
select jsonb_build_object(
 'profiles_rls',(select relrowsecurity from pg_class where oid='public.profiles'::regclass),
 'anonymous_profile_read',has_table_privilege('anon','public.profiles','select'),
 'authenticated_direct_insert',has_table_privilege('authenticated','public.profiles','insert'),
 'authenticated_direct_update',has_table_privilege('authenticated','public.profiles','update'),
 'authenticated_direct_delete',has_table_privilege('authenticated','public.profiles','delete'),
 'authenticated_name_rpc',has_function_privilege('authenticated','public.set_display_name(text)','execute'),
 'anonymous_name_rpc',has_function_privilege('anon','public.set_display_name(text)','execute'),
 'creator_trigger',(select count(*)=1 from pg_trigger where tgrelid='public.entities'::regclass and tgname='entity_creator' and tgenabled='O'),
 'creator_columns',(select count(*)=2 from information_schema.columns where table_schema='public' and table_name='entities' and column_name in ('created_by','created_at')),
 'profiles_realtime',(select exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles')),
 'migration_recorded',(select exists(select 1 from supabase_migrations.schema_migrations where version='008'))
) as display_name_verification;
