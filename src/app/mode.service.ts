import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { timer, switchMap, catchError, of, map } from 'rxjs';

export interface Einsatz {
  id: string;
  eventtype: string;
  eventtypetext: string;
  location: { city: string; street: string };
  alarmtime: number;
}

@Injectable({ providedIn: 'root' })
export class ModeService {
  // ---- Signale ----
  private modeSignal = signal<'ruhe' | 'einsatz'>('ruhe');
  private einsatzSignal = signal<Einsatz[] | null>(null);
  private historySignal = signal<Einsatz[] | null>(null);

  // ---- Öffentliche Getter ----
  readonly mode = computed(() => this.modeSignal());
  readonly einsatz = computed(() => this.einsatzSignal());
  readonly history = computed(() => this.historySignal());

  // ---- API-URLs ----
  private leaUrl = 'https://deine-domain.at/api/lea.php';
  private leaHistoryUrl = 'https://deine-domain.at/api/lea_history.php';

  constructor(private http: HttpClient) {
    // 1️⃣ Haupt-Polling: aktueller Einsatzstatus
    timer(0, 8000)
      .pipe(
        switchMap(() =>
          this.http.get<Einsatz[]>(this.leaUrl).pipe(
            catchError(() => of([])) // Fehler = Ruhe
          )
        )
      )
      .subscribe((data) => {
        if (Array.isArray(data) && data.length > 0) {
          this.modeSignal.set('einsatz');
          this.einsatzSignal.set(data);
        } else {
          this.modeSignal.set('ruhe');
          this.einsatzSignal.set(null);
        }
      });

    // 2️⃣ Nebenläufig: Historie seltener laden (alle 5 Minuten)
    timer(0, 300000)
      .pipe(
        switchMap(() =>
          this.http.get<Einsatz[]>(this.leaHistoryUrl).pipe(
            catchError(() => of([]))
          )
        )
      )
      .subscribe((data) => this.historySignal.set(data));
  }

  // Für Testzwecke manuell umschalten
  setModeManually(mode: 'ruhe' | 'einsatz') {
    this.modeSignal.set(mode);
  }
}
