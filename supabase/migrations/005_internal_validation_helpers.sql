-- Internal validation helpers run through authorized security-definer RPCs.
-- Supabase's default function grants may include authenticated at creation time.
revoke execute on function public.validate_payload(text,jsonb,uuid) from public,anon,authenticated;
revoke execute on function public.assert_money(numeric) from public,anon,authenticated;
alter function public.assert_money(numeric) set search_path=public,extensions;
