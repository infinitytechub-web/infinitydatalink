-- Add profile FKs so PostgREST can embed profiles from user-owned tables.
-- profiles.id is 1:1 with auth.users.id (handle_new_user trigger ensures this).
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.savings_accounts
  ADD CONSTRAINT savings_accounts_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.loans
  ADD CONSTRAINT loans_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';