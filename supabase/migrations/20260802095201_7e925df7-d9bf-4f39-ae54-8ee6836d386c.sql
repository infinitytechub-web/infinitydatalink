CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, ghana_card, date_of_birth, region, district)
  VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'ghana_card', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'date_of_birth', '')::date,
    NULLIF(NEW.raw_user_meta_data ->> 'region', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'district', '')
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        ghana_card = COALESCE(public.profiles.ghana_card, EXCLUDED.ghana_card),
        date_of_birth = COALESCE(public.profiles.date_of_birth, EXCLUDED.date_of_birth),
        region = COALESCE(public.profiles.region, EXCLUDED.region),
        district = COALESCE(public.profiles.district, EXCLUDED.district);
  RETURN NEW;
END;
$$;