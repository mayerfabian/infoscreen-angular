import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { timer, switchMap, catchError, of } from 'rxjs';

/** LEA JSON Typen (vereinfacht an das Beispiel angepasst) */
export interface LeaFunction { id: string; shortname: string; name: string; }
export interface LeaResponse { timestamp: number; basicresponse: 'Ja' | 'Nein' | string; freetext: string; }
export interface LeaPerson {
  id: string;
  firstname: string;
  lastname: string;
  qualifications: any[];
  functions: LeaFunction[];
  response: LeaResponse | null;
}
export interface LeaLocation {
  city: string; zipcode: string; street: string; housenumber?: string;
  x?: number; y?: number; objectname?: string; additionalinfo?: string;
}
export interface Einsatz {
  id: string;
  eventtype: string;
  eventtypetext: string;
  location: LeaLocation;
  additionalinformation?: string;
  alarmtime: number; // Unix ms
  alarmedalarmgroups?: any[];
  alarmedpersons?: LeaPerson[];
  additionaldivisions?: any[];
}

/**
 * ModeService hält:
 * - aktuellen Modus (ruhe|einsatz)
 * - aktuelle Einsätze (LEA-Schema)
 * - Historie (optional)
 *
 * Endpoints bitte anpassen auf eure Backend-URL.
 */
@Injectable({ providedIn: 'root' })
export class ModeService {
  private leaActiveUrl = '/api/lea/active';   // <--- anpassen
  private leaHistoryUrl = '/api/lea/history'; // <--- anpassen

  private modeSignal = signal<'ruhe' | 'einsatz'>('ruhe');
  private einsatzSignal = signal<Einsatz[]>([]);
  private historySignal = signal<Einsatz[]>([]);

  /** API */
  readonly mode = computed(() => this.modeSignal());
  readonly einsatz = computed(() => this.einsatzSignal());
  readonly history = computed(() => this.historySignal());

  constructor(private http: HttpClient) {
    // Aktive Einsätze pollen
    timer(0, 10_000).pipe(
      switchMap(() => this.http.get<Einsatz[]>(this.leaActiveUrl)
        .pipe(catchError(() => of([] as Einsatz[])))
      )
    ).subscribe(list => {
      const safe = Array.isArray(list) ? list : [];
      this.einsatzSignal.set(safe);
      this.modeSignal.set(safe.length > 0 ? 'einsatz' : 'ruhe');
    });

    // Historie optional pollen (seltener)
    timer(0, 60_000).pipe(
      switchMap(() => this.http.get<Einsatz[]>(this.leaHistoryUrl)
        .pipe(catchError(() => of([] as Einsatz[])))
      )
    ).subscribe(list => this.historySignal.set(Array.isArray(list) ? list : []));
  }

  /** Manuelles Umschalten, z.B. für Tests */
  setModeManually(mode: 'ruhe' | 'einsatz') {
    this.modeSignal.set(mode);
  }
}
