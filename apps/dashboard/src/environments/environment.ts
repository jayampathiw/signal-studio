export const environment = {
  production: false,
  supabaseUrl: 'https://nnxtvbolhuvihlpwppbj.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ueHR2Ym9saHV2aWhscHdwcGJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMjYwNDEsImV4cCI6MjA5MzcwMjA0MX0.uSUZ7gbOCS7Q3i6SkWadpWEe5XmsEMiYyKIDWOCvuZU',
  // P5.1 — the *engine* Supabase project (`signal-studio-engine-dev`),
  // distinct from the legacy news/video one above. Used only for the new
  // /engine/* console's login — every job/project mutation still goes
  // through `apiBaseUrl` (apps/api), never a direct table write, per
  // P5.1's own exit criterion.
  engineSupabaseUrl: 'https://tgvugvhhtfnrzpmwkhoe.supabase.co',
  engineSupabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndnVndmhodGZucnpwbXdraG9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MTIyNTgsImV4cCI6MjEwNTI4ODI1OH0.vt-Kixxa1Y8PHtEaz9zxn7343vdVs2u9qcqtR836-Xk',
  apiBaseUrl: 'http://localhost:8787',
};
