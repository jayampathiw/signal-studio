import { Injectable, NgZone } from '@angular/core';
import { createClient, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * P5.1 — a second, separate Supabase client for the *engine* project,
 * distinct from `SupabaseService` (the legacy news/video project). The
 * /engine/* console's own login lives here; every actual job/project
 * mutation still goes through `EngineApiService` (apps/api), never a
 * direct table write — this client's only job is producing a real access
 * token for `EngineApiService` to send as `Authorization: Bearer`.
 */
@Injectable({ providedIn: 'root' })
export class EngineAuthService {
  private client: SupabaseClient;
  private _user = new BehaviorSubject<User | null>(null);

  user$ = this._user.asObservable();

  constructor(private zone: NgZone) {
    this.client = createClient(environment.engineSupabaseUrl, environment.engineSupabaseAnonKey);
    this.client.auth.onAuthStateChange((_event, session) => {
      this.zone.run(() => this._user.next(session?.user ?? null));
    });
    this.client.auth.getSession().then(({ data }) => {
      this._user.next(data.session?.user ?? null);
    });
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession();
    return data.session;
  }

  async getAccessToken(): Promise<string | null> {
    const session = await this.getSession();
    return session?.access_token ?? null;
  }

  async signIn(email: string, password: string) {
    return this.client.auth.signInWithPassword({ email, password });
  }

  async signOut() {
    return this.client.auth.signOut();
  }
}
