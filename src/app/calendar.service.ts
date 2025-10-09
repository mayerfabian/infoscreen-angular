import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, catchError, of } from 'rxjs';

export interface CalendarApiResponse {
  ok: boolean;
  timezone?: string;
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
  description?: string;   // <— Beschreibung für die UI
  startMs: number;
  endMs?: number;
  allDay?: boolean;
}


@Injectable({ providedIn: 'root' })
export class CalendarService {
  // <<< HIER auf deinen Endpoint umgestellt >>>
  private url = 'https://info.ff-wuerflach.at/api/ics-json.php';

  constructor(private http: HttpClient) {}

  /** Lädt Events und liefert sortiert (aufsteigend) zurück. */
  loadUpcoming(daysAhead = 90) {
    return this.http.get<any>(this.url).pipe(
      map(res => {
        const tz = (res && res.timezone) ? res.timezone : 'Europe/Zurich';
        // Bei dir ist res direkt ein Array (ICS-JSON) – fallback auf res.items falls vorhanden
        const rawItems: any[] = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);
        const normalized = rawItems
          .map(raw => this.normalizeIcsItem(raw))
          .filter((e): e is CalendarItem => !!e && !!e.startMs)
          .sort((a, b) => a.startMs - b.startMs);
        return { timezone: tz, items: normalized };
      }),
      catchError(() => of({ timezone: 'Europe/Zurich', items: [] as CalendarItem[] }))
    );
  }

    /** Map vom ICS-JSON (uid, summary, location, start, end, allDay) auf euer CalendarItem */
private normalizeIcsItem(raw: any): CalendarItem | null {
  if (!raw) return null;

  const summary  = (raw.summary || '').trim();
  const location = (raw.location || '').trim() || undefined;

  // --- Beschreibung/Kategorie nach deinen Regeln ---
  const rawDesc = String(raw.description || '').trim();
  let category: string | undefined = undefined;
  let desc: string | undefined = undefined;

  if (rawDesc.includes('#')) {
    const [catRaw, descRaw = ''] = rawDesc.split('#', 2);
    category = (catRaw || '').trim() || 'Termin';
    desc = descRaw.trim() || undefined;
  } else if (!rawDesc) {
    category = 'Termin';
  } else {
    const words = rawDesc.split(/\s+/).filter(Boolean);
    if (words.length > 2) {
      category = 'Termin';
      desc = rawDesc;
    } else {
      category = rawDesc;   // 1–2 Wörter => Kategorie
    }
  }

  // --- HIDE: wenn "hide" irgendwo in Kategorie oder Description vorkommt -> Event ausblenden ---
  const hideHit =
    (category && /(^|\s)hide(\s|$)/i.test(category)) ||
    /(^|#|\s)hide(\s|$)/i.test(rawDesc);
  if (hideHit) return null; // <- Termin wird gar nicht erst geliefert

  // Zeiten
  const startMs = raw.start ? new Date(raw.start).getTime() : NaN;
  const endMs   = raw.end   ? new Date(raw.end).getTime()   : undefined;
  if (!startMs || isNaN(startMs)) return null;

  const id     = String(raw.uid || (summary || '') + '_' + (raw.start || ''));
  const title  = summary || '(ohne Titel)';
  const allDay = !!raw.allDay;

  return { id, title, location, category, description: desc, startMs, endMs, allDay };
}




}
