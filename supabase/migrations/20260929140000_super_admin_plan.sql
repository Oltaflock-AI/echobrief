-- Super-admin plan, and the guard that makes it safe to have one.
--
-- 1. `plan_override` gains 'admin' (unmetered internal accounts, see PLANS.admin
--    in _shared/entitlements.ts) and 'trial'. 'trial' was missing from the
--    original CHECK, so `redeem_access_code` — which writes the code's plan into
--    this column — failed on every trial code.
--
-- 2. Billing columns become service-role-only. The owner UPDATE policy on
--    profiles has no column list, so until now any signed-in user could PATCH
--    their own row to `plan_override = 'pro'` through PostgREST and record for
--    free. With an unmetered plan in the CHECK list that would be unlimited.
--    RLS cannot compare OLD and NEW, so this is a trigger. It only restricts the
--    client roles: the service role (edge functions, dodo-webhook) and SECURITY
--    DEFINER functions (redeem_access_code runs as its owner) pass untouched.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_override_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_override_check
    CHECK (plan_override IS NULL OR plan_override IN ('free', 'trial', 'starter', 'pro', 'teams', 'admin'));

CREATE OR REPLACE FUNCTION public.protect_profile_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.plan_override IS NOT NULL
       OR NEW.plan_override_expires_at IS NOT NULL
       OR COALESCE(NEW.subscription_status, 'none') <> 'none'
       OR NEW.subscription_product_id IS NOT NULL
       OR NEW.subscription_renews_at IS NOT NULL
       OR NEW.subscription_quantity IS NOT NULL
       OR NEW.dodo_customer_id IS NOT NULL
       OR NEW.dodo_subscription_id IS NOT NULL THEN
      RAISE EXCEPTION 'billing fields on profiles are managed by the server'
        USING ERRCODE = '42501';
    END IF;
  ELSIF (NEW.plan_override, NEW.plan_override_expires_at, NEW.subscription_status,
         NEW.subscription_product_id, NEW.subscription_renews_at, NEW.subscription_quantity,
         NEW.dodo_customer_id, NEW.dodo_subscription_id)
        IS DISTINCT FROM
        (OLD.plan_override, OLD.plan_override_expires_at, OLD.subscription_status,
         OLD.subscription_product_id, OLD.subscription_renews_at, OLD.subscription_quantity,
         OLD.dodo_customer_id, OLD.dodo_subscription_id) THEN
    RAISE EXCEPTION 'billing fields on profiles are managed by the server'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_billing_columns ON public.profiles;
CREATE TRIGGER protect_profile_billing_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_billing_columns();
