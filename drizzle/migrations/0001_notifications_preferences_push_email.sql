-- Expand application types
ALTER TYPE public.application_type ADD VALUE IF NOT EXISTS 'part_time';
ALTER TYPE public.application_type ADD VALUE IF NOT EXISTS 'contract';
ALTER TYPE public.application_type ADD VALUE IF NOT EXISTS 'other';

-- Notification preferences (one row per user)
CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  browser_enabled boolean NOT NULL DEFAULT false,
  deadline_reminders boolean NOT NULL DEFAULT true,
  interview_reminders boolean NOT NULL DEFAULT true,
  overdue_reminders boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own prefs select" ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own prefs insert" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own prefs update" ON public.notification_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- In-app notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  event_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('deadline_3d','deadline_1d','deadline_today','deadline_overdue','interview_24h','status_change')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own notifications select" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own notifications insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own notifications update" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own notifications delete" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id, created_at DESC) WHERE dismissed_at IS NULL;

-- Browser push subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  endpoint text NOT NULL UNIQUE,
  keys jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own push select" ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own push insert" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own push update" ON public.push_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own push delete" ON public.push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Email delivery log (also dedupes sends)
CREATE TABLE public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','suppressed','skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own email events select" ON public.email_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Indexes for reminder scans
CREATE INDEX applications_deadline_idx ON public.applications (deadline) WHERE deadline IS NOT NULL;
CREATE INDEX applications_interview_idx ON public.applications (interview_at) WHERE interview_at IS NOT NULL;

-- Auto-create preferences on signup (extend existing handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Reminder generator: inserts deduped in-app notifications and pending email
-- events for deadlines (3d/1d/today/overdue) and interviews (<24h),
-- respecting each user's preferences. Safe to run repeatedly.
CREATE OR REPLACE FUNCTION public.generate_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  pref record;
  email text;
  tz text;
  local_date date;
  days int;
  key text;
  kind text;
  title text;
  body text;
  inserted int := 0;
BEGIN
  FOR r IN
    SELECT a.*, u.email AS user_email
    FROM public.applications a
    JOIN auth.users u ON u.id = a.user_id
    WHERE (a.deadline IS NOT NULL AND a.status = 'saved')
       OR (a.interview_at IS NOT NULL AND a.status = 'interview'
           AND a.interview_at > now() AND a.interview_at <= now() + interval '24 hours')
  LOOP
    SELECT * INTO pref FROM public.notification_preferences p WHERE p.user_id = r.user_id;
    IF NOT FOUND THEN
      pref := (r.user_id, true, false, true, true, false, 'UTC', now(), now());
    END IF;
    tz := COALESCE(NULLIF(pref.timezone, ''), 'UTC');
    email := r.user_email;

    -- Deadline reminders
    IF r.deadline IS NOT NULL AND r.status = 'saved' AND pref.deadline_reminders THEN
      local_date := (now() AT TIME ZONE tz)::date;
      days := r.deadline - local_date;
      kind := NULL;
      IF days = 3 THEN kind := 'deadline_3d'; title := 'Deadline in 3 days';
      ELSIF days = 1 THEN kind := 'deadline_1d'; title := 'Deadline tomorrow';
      ELSIF days = 0 THEN kind := 'deadline_today'; title := 'Deadline today';
      ELSIF days < 0 AND pref.overdue_reminders AND days >= -7 THEN kind := 'deadline_overdue'; title := 'Deadline passed';
      END IF;
      IF kind IS NOT NULL THEN
        key := kind || ':' || r.id || ':' || r.deadline::text;
        body := r.role || ' at ' || r.company || ' — deadline ' || to_char(r.deadline, 'Mon DD, YYYY');
        INSERT INTO public.notifications (user_id, event_key, kind, title, body, application_id)
        VALUES (r.user_id, key, kind, title, body, r.id)
        ON CONFLICT (user_id, event_key) DO NOTHING;
        IF FOUND THEN inserted := inserted + 1; END IF;
        IF pref.email_enabled AND email IS NOT NULL THEN
          INSERT INTO public.email_events (user_id, event_key, kind, recipient, subject)
          VALUES (r.user_id, key, kind, email, title || ': ' || r.role || ' at ' || r.company)
          ON CONFLICT (event_key) DO NOTHING;
        END IF;
      END IF;
    END IF;

    -- Interview reminders (within next 24h)
    IF r.interview_at IS NOT NULL AND r.status = 'interview' AND pref.interview_reminders
       AND r.interview_at > now() AND r.interview_at <= now() + interval '24 hours' THEN
      kind := 'interview_24h';
      key := kind || ':' || r.id || ':' || date_trunc('hour', r.interview_at)::text;
      title := 'Interview within 24 hours';
      body := r.role || ' at ' || r.company || ' — ' || to_char(r.interview_at AT TIME ZONE tz, 'Mon DD, YYYY HH24:MI') || ' (' || tz || ')';
      INSERT INTO public.notifications (user_id, event_key, kind, title, body, application_id)
      VALUES (r.user_id, key, kind, title, body, r.id)
      ON CONFLICT (user_id, event_key) DO NOTHING;
      IF FOUND THEN inserted := inserted + 1; END IF;
      IF pref.email_enabled AND email IS NOT NULL THEN
        INSERT INTO public.email_events (user_id, event_key, kind, recipient, subject)
        VALUES (r.user_id, key, kind, email, title || ': ' || r.role || ' at ' || r.company)
        ON CONFLICT (event_key) DO NOTHING;
      END IF;
    END IF;
  END LOOP;
  RETURN inserted;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_reminders() TO service_role;