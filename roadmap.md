# ApplyTrack master-prompt roadmap

- [x] Phase 1: Inspect existing project
- [x] Phase 2: DB — notification_preferences, notifications, push_subscriptions, email_events + RLS + indexes; expanded application_type enum
- [x] Phase 3: CRUD/filters/sorting/dashboard verified; expanded types wired into UI
- [x] Phase 4: Notification center + persistent deduped reminders (browser sync + hourly pg_cron generate_reminders)
- [x] Phase 5: Browser notifications (opt-in, permission handling, while-app-open). Background Web Push NOT implemented (no VAPID infra) — disclosed
- [~] Phase 6: Email reminder pipeline + delivery log built; sending blocked until user sets up a sender domain (email setup dialog shown)
- [x] Phase 7: 9 vitest tests pass; browser verification signed-in (dashboard, bell, settings, dark theme); build OK
- [x] Phase 8: Dark/light theme, README updated, publish
