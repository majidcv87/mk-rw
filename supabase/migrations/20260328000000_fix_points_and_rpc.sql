-- Ensure app profile fields exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cv_upload_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS free_analysis_used boolean NOT NULL DEFAULT false;

-- Signup bonus stored as point transaction (frontend reads balance from point_transactions)
CREATE OR REPLACE FUNCTION public.grant_initial_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.point_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 30, 'signup_bonus', 'Welcome bonus - 30 points');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_points ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_points
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_initial_points();

-- Atomic point deduction based on transaction balance
CREATE OR REPLACE FUNCTION public.deduct_points_atomic(
  p_user_id uuid,
  p_cost integer,
  p_type text,
  p_description text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance integer := 0;
BEGIN
  PERFORM 1 FROM public.profiles WHERE user_id = p_user_id FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_balance
  FROM public.point_transactions
  WHERE user_id = p_user_id;

  IF v_balance < p_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient points', 'balance', v_balance);
  END IF;

  INSERT INTO public.point_transactions (user_id, amount, type, description)
  VALUES (p_user_id, -p_cost, p_type, COALESCE(p_description, p_type || ' service usage'));

  RETURN json_build_object('success', true, 'balance', v_balance - p_cost, 'deducted', p_cost);
END;
$$;
