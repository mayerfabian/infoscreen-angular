import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, catchError, of } from 'rxjs';

export interface CalendarApiResponse {
  ok: boolean;
  timezone?: string; // z.B. "Europe/Zurich"
  page?: number;
  limit?: number;
  count?: number;
  items: any[];
}

export interface CalendarItem {
  id: string;
  title: string;
  location?: string;
  category?: string;
  startMs: number;   // Unix ms (normalisiert)
  endMs?: number;    // optional
}

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private url = 'https://info.ff-wuerflach.at/api/events.php';

  constructor(private http: HttpClient) {}

  /** Lädt Events, normalisiert Start/Endzeit und liefert sortiert (aufsteigend ab jetzt). */
  loadUpcoming(daysAhead = 90) {
    const now = Date.now();
    const until = now + daysAhead * 24 * 60 * 60 * 1000;

    return this.http.get<CalendarApiResponse>(this.url).pipe(
      map(res => {
        const tz = res?.timezone || 'Europe/Zurich';
        const items = Array.isArray(res?.items) ? res.items : [];
        const normalized = items
          .map(raw => this.normalizeItem(raw, tz))
          .filter((e): e is CalendarItem => !!e && !!e.startMs)
          // nur zukünftige/jetzt Events bis „daysAhead“
          .filter(e => e.startMs >= now && e.startMs <= until)
          .sort((a, b) => a.startMs - b.startMs);
        return { timezone: tz, items: normalized };
      }),
      catchError(() => of({ timezone: 'Europe/Zurich', items: [] as CalendarItem[] }))
    );
  }

  private normalizeItem(raw: any, tz: string): CalendarItem | null {
    const id = String(raw?.id ?? '');
    const title = String(raw?.title ?? '').trim();
    if (!id || !title) return null;

    const location = (raw?.location ?? '').toString();
    const category = (raw?.category ?? '').toString();

    const startMs = this.pickTimestamp(raw, 'start') ?? this.composeFromDateTime(raw, 'start', tz)
                  ?? this.pickTimestamp(raw, 'date')  ?? this.composeFromDateTime(raw, '', tz)
                  ?? 0;

    const endMs = this.pickTimestamp(raw, 'end') ?? this.composeFromDateTime(raw, 'end', tz) ?? undefined;

    return { id, title, location, category, startMs, endMs };
  }

  /** Versucht viele gängige Varianten: start_ts, start, start_iso, startDate, start_time, etc. */
  private pickTimestamp(raw: any, base: 'start'|'end'|'date'): number | null {
    const keys = [
      `${base}_ts`, `${base}_ms`, `${base}Ms`,
      base, `${base}_iso`, `${base}Iso`,
      `${base}Date`, `${base}Time`,
      `${base}_date`, `${base}_time`
    ];
    for (const k of keys) {
      const v = raw?.[k];
      if (typeof v === 'number' && isFinite(v)) return v;          // epoch ms/seconds
      if (typeof v === 'string' && v) {
        // ISO oder epoch als string
        const num = Number(v);
        if (Number.isFinite(num)) {
          return num > 2_000_000_000 ? num : num * 1000; // Sekunden->ms
        }
        const t = Date.parse(v);
        if (!Number.isNaN(t)) return t;
      }
    }
    return null;
  }

  /** Baut Timestamp aus Paaren wie d/t oder start_date + start_time (lokale Zeitzone) */
  private composeFromDateTime(raw: any, prefix: ''|'start'|'end', tz: string): number | null {
    const dateKey = prefix ? `${prefix}_date` : 'd';
    const timeKey = prefix ? `${prefix}_time` : 't';
    const d = (raw?.[dateKey] ?? raw?.['d'] ?? '').toString(); // "22.07.2025"
    const t = (raw?.[timeKey] ?? raw?.['t'] ?? '').toString(); // "19:45:00"
    if (!d) return null;

    const [dd, mm, yyyy] = d.split('.');
    const [HH='00', MM='00', SS='00'] = (t || '').split(':');
    const day = parseInt(dd || '1', 10);
    const mon = (parseInt(mm || '1', 10) - 1);
    const yr  = parseInt(yyyy || '1970', 10);
    const h   = parseInt(HH, 10);
    const m   = parseInt(MM, 10);
    const s   = parseInt(SS, 10);
    // lokale Zeit reicht hier völlig (Anzeige)
    return new Date(yr, mon, day, h, m, s).getTime();
  }
}
