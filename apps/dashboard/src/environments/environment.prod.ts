export const environment = {
  production: true,
  supabaseUrl: 'https://nnxtvbolhuvihlpwppbj.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ueHR2Ym9saHV2aWhscHdwcGJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMjYwNDEsImV4cCI6MjA5MzcwMjA0MX0.uSUZ7gbOCS7Q3i6SkWadpWEe5XmsEMiYyKIDWOCvuZU',
  engineSupabaseUrl: 'https://tgvugvhhtfnrzpmwkhoe.supabase.co',
  engineSupabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndnVndmhodGZucnpwbXdraG9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MTIyNTgsImV4cCI6MjEwNTI4ODI1OH0.vt-Kixxa1Y8PHtEaz9zxn7343vdVs2u9qcqtR836-Xk',
  // P5.1 — genuinely unset: apps/api has no production deploy target yet
  // (P4.2's hosting decision is still open). A production build of the
  // dashboard's /engine/* console will fail loudly against this placeholder
  // rather than silently pointing at localhost — flagged here, not guessed.
  apiBaseUrl: 'https://engine-api.not-yet-deployed.invalid',
};
