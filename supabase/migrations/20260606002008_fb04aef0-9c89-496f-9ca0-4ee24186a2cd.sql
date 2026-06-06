
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_role public.app_role NOT NULL DEFAULT 'student';

-- Backfill active_role with the user's first existing role
UPDATE public.profiles p
SET active_role = ur.role
FROM public.user_roles ur
WHERE ur.user_id = p.id
  AND ur.role IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = p.id AND ur2.role = p.active_role
  );

-- Ensure every existing user has BOTH roles so the toggle works
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'teacher'::public.app_role FROM public.profiles p
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'student'::public.app_role FROM public.profiles p
ON CONFLICT (user_id, role) DO NOTHING;
