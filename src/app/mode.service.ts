import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  BehaviorSubject,
  Observable,
  Subscription,
  catchError,
  of,
  switchMap,
  timer,
} from 'rxjs';
import type { Einsatz } from './models/lea.interfaces';

export type ScreenMode = 'ruhe' | 'einsatz';
type ManualOverride = 'none' | ScreenMode;

@Injectable({ providedIn: 'root' })
export class ModeService {
  /** Datenquellen */
  private readonly liveUrl = 'https://info.ff-wuerflach.at/lea.php';
  private readonly mockUrl = 'assets/mock/lea-active.json';

  /** Aktuelle Quelle (live | mock) wird per Subject gesteuert */
  private source$ = new BehaviorSubject<'live' | 'mock'>('live');

  /** Automatik-Modus (aus Polling) */
  private autoModeSignal = signal<ScreenMode>('ruhe');

  /** Manuelles Test-/Override-Flag (nur für explizit 'ruhe'/'einsatz') */
  private manualOverrideSignal = signal<ManualOverride>('none');

  /** Daten */
  private einsatzSignal = signal<Einsatz[]>([]);

  /** Öffentliche Read-APIs */
  readonly einsaetze = computed<Einsatz[]>(() => this.einsatzSignal());

  /** Effektiver Modus: Override > Automatik */
  readonly mode = computed<ScreenMode>(() => {
    const manual = this.manualOverrideSignal();
    return manual === 'none' ? this.autoModeSignal() : manual;
  });

  /** Bequeme booleans */
  readonly isEinsatz = computed<boolean>(() => this.mode() === 'einsatz');
  readonly isRuhe    = computed<boolean>(() => this.mode() === 'ruhe');

  /** Polling-Abo, damit wir beim Source-Switch sauber neu subscriben */
  private pollSub?: Subscription;

  constructor(private http: HttpClient) {
    // Polling: reagiert auf Source-Wechsel und pollt dann die jeweilige URL
    this.pollSub = this.source$
      .pipe(
        switchMap((source) => {
          const url = source === 'mock' ? this.mockUrl : this.liveUrl;
          return timer(0, 10_000).pipe(
            switchMap(() =>
              this.http.get<Einsatz[] | any>(url).pipe(
                // Das Live-Endpoint kann z.B. {einsaetze: []} oder [] liefern – normalize:
                switchMap((raw) => {
                  let list: Einsatz[] = [];
                  if (Array.isArray(raw)) {
                    list = raw as Einsatz[];
                  } else if (raw && Array.isArray(raw.einsaetze)) {
                    list = raw.einsaetze as Einsatz[];
                  } else if (raw && Array.isArray(raw.data)) {
                    list = raw.data as Einsatz[];
                  }
                  return of(list);
                }),
                catchError(() => of([] as Einsatz[]))
              )
            )
          );
        })
      )
      .subscribe((list) => {
        const safe = Array.isArray(list) ? list : [];
        this.einsatzSignal.set(safe);
        this.autoModeSignal.set(safe.length > 0 ? 'einsatz' : 'ruhe');
      });

    // Beim ersten Start Query berücksichtigen (nur Datenquelle & optionaler Explizit-Override)
    try {
      const qs = new URLSearchParams(window.location.search);
      const test = (qs.get('test') || '').toLowerCase();

      if (test === '1') {
        this.useMockData(true);      // Testdaten verwenden
        this.clearManualOverride();  // kein Modus-Override
      } else {
        this.useMockData(false);     // Live
      }

      // Optional: expliziter Modus-Override falls gewünscht
      if (test === 'ruhe')  this.setManualOverride('ruhe');
      if (test === 'einsatz') this.setManualOverride('einsatz');
    } catch {
      // SSR/ohne window: ignorieren → default live
    }
  }

  /** Extern aufrufbar (z.B. aus Infoscreen): Live/Mock wählen */
  useMockData(enable: boolean) {
    const next = enable ? 'mock' : 'live';
    if (this.source$.value !== next) this.source$.next(next);
  }

  /** Für Buttons/Tests manuell setzen (nur für explizite ruhe/einsatz) */
  setModeManually(mode: ScreenMode) {
    this.setManualOverride(mode);
  }
  setManualOverride(mode: ScreenMode) {
    this.manualOverrideSignal.set(mode);
  }
  clearManualOverride() {
    this.manualOverrideSignal.set('none');
  }
}
