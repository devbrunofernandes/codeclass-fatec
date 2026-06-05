
-- Enums
CREATE TYPE public.app_role AS ENUM ('teacher', 'student');
CREATE TYPE public.member_role AS ENUM ('owner', 'collaborator', 'student');
CREATE TYPE public.invite_role AS ENUM ('collaborator', 'student');
CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE public.task_type AS ENUM ('coding', 'trivia', 'quiz');
CREATE TYPE public.submission_status AS ENUM ('submitted', 'returned');

-- Updated-at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================
-- profiles
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  email_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================
-- user_roles
-- =========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users can read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- =========================================
-- email_tokens
-- =========================================
CREATE TABLE public.email_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_tokens TO service_role;
ALTER TABLE public.email_tokens ENABLE ROW LEVEL SECURITY;
-- Only service role accesses tokens. No grants to authenticated.

-- =========================================
-- classrooms
-- =========================================
CREATE TABLE public.classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  chat_private BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classrooms TO authenticated;
GRANT ALL ON public.classrooms TO service_role;
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER classrooms_updated_at BEFORE UPDATE ON public.classrooms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================
-- classroom_members
-- =========================================
CREATE TABLE public.classroom_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.member_role NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(classroom_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classroom_members TO authenticated;
GRANT ALL ON public.classroom_members TO service_role;
ALTER TABLE public.classroom_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_classroom_members_user ON public.classroom_members(user_id);
CREATE INDEX idx_classroom_members_classroom ON public.classroom_members(classroom_id);

-- Membership helper functions (security definer to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_classroom_member(_classroom_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.classroom_members WHERE classroom_id = _classroom_id AND user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_classroom_teacher(_classroom_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classroom_members
    WHERE classroom_id = _classroom_id AND user_id = _user_id AND role IN ('owner','collaborator')
  )
$$;

-- profiles policies (after helper exists)
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "members read co-member profiles" ON public.profiles FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.classroom_members m1
    JOIN public.classroom_members m2 ON m1.classroom_id = m2.classroom_id
    WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id
  )
);

-- classrooms policies
CREATE POLICY "members read classroom" ON public.classrooms FOR SELECT TO authenticated USING (public.is_classroom_member(id, auth.uid()));
CREATE POLICY "teachers create classroom" ON public.classrooms FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "owner/collab update classroom" ON public.classrooms FOR UPDATE TO authenticated USING (public.is_classroom_teacher(id, auth.uid()));
CREATE POLICY "owner deletes classroom" ON public.classrooms FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- classroom_members policies
CREATE POLICY "members read membership" ON public.classroom_members FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.is_classroom_member(classroom_id, auth.uid())
);
CREATE POLICY "teachers manage membership" ON public.classroom_members FOR ALL TO authenticated
  USING (public.is_classroom_teacher(classroom_id, auth.uid()))
  WITH CHECK (public.is_classroom_teacher(classroom_id, auth.uid()));
CREATE POLICY "self join via accept" ON public.classroom_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- =========================================
-- classroom_invites
-- =========================================
CREATE TABLE public.classroom_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.invite_role NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status public.invite_status NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classroom_invites TO authenticated;
GRANT ALL ON public.classroom_invites TO service_role;
ALTER TABLE public.classroom_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teachers manage invites" ON public.classroom_invites FOR ALL TO authenticated
  USING (public.is_classroom_teacher(classroom_id, auth.uid()))
  WITH CHECK (public.is_classroom_teacher(classroom_id, auth.uid()));
CREATE POLICY "invitee reads own invites" ON public.classroom_invites FOR SELECT TO authenticated USING (
  email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);

-- =========================================
-- materials
-- =========================================
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read materials" ON public.materials FOR SELECT TO authenticated USING (public.is_classroom_member(classroom_id, auth.uid()));
CREATE POLICY "teachers manage materials" ON public.materials FOR ALL TO authenticated
  USING (public.is_classroom_teacher(classroom_id, auth.uid()))
  WITH CHECK (public.is_classroom_teacher(classroom_id, auth.uid()));

-- =========================================
-- tasks
-- =========================================
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  type public.task_type NOT NULL,
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "members read tasks" ON public.tasks FOR SELECT TO authenticated USING (public.is_classroom_member(classroom_id, auth.uid()));
CREATE POLICY "teachers manage tasks" ON public.tasks FOR ALL TO authenticated
  USING (public.is_classroom_teacher(classroom_id, auth.uid()))
  WITH CHECK (public.is_classroom_teacher(classroom_id, auth.uid()));

-- =========================================
-- submissions
-- =========================================
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  language TEXT,
  status public.submission_status NOT NULL DEFAULT 'submitted',
  grade NUMERIC,
  teacher_feedback TEXT,
  ai_feedback JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  returned_at TIMESTAMPTZ,
  UNIQUE(task_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student reads own submission" ON public.submissions FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "teachers read class submissions" ON public.submissions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_classroom_teacher(t.classroom_id, auth.uid()))
);
CREATE POLICY "student writes own submission" ON public.submissions FOR INSERT TO authenticated WITH CHECK (
  student_id = auth.uid() AND
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_classroom_member(t.classroom_id, auth.uid()))
);
CREATE POLICY "student updates own submission" ON public.submissions FOR UPDATE TO authenticated USING (student_id = auth.uid() AND status = 'submitted') WITH CHECK (student_id = auth.uid());
CREATE POLICY "teachers update submission (devolutiva)" ON public.submissions FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_classroom_teacher(t.classroom_id, auth.uid()))
);

-- =========================================
-- notifications
-- =========================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  payload JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

CREATE POLICY "user reads own notifs" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user updates own notifs" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =========================================
-- messages (classroom chat)
-- =========================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_messages_classroom_created ON public.messages(classroom_id, created_at);

CREATE POLICY "members read messages" ON public.messages FOR SELECT TO authenticated USING (public.is_classroom_member(classroom_id, auth.uid()));
CREATE POLICY "members post messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid() AND public.is_classroom_member(classroom_id, auth.uid()) AND (
    public.is_classroom_teacher(classroom_id, auth.uid()) OR
    NOT (SELECT chat_private FROM public.classrooms WHERE id = classroom_id)
  )
);
CREATE POLICY "sender edits own message" ON public.messages FOR UPDATE TO authenticated USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
