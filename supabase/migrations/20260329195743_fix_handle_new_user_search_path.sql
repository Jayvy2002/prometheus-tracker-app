/*
  # Fix handle_new_user function search path

  1. Changes
    - Recreate `handle_new_user` function with an immutable search_path set to 'public'
    - This prevents search_path manipulation attacks

  2. Security
    - Sets search_path explicitly to prevent mutable search_path vulnerability
    - Function behavior is unchanged
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;
