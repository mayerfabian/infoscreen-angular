import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, catchError, of } from 'rxjs';

export interface EinsatzAPI {
  m: string; // Meldung/Stichwort
  a: string; // Alarmstufe (B0, T0, ...)
  n: string; // ELKOS-Nummer
  o: string; // Ort
  o2?: string; // Zusatz-Ort
  d: string; // Datum DD.MM.YYYY
  t: string; // Zeit HH:mm:ss
  i: string; // ID/Token
  b: string; // Bezirk als String-Zahl
}
export interface EinsatzKurz {
  id: string;
  stichwort: string;
  alarmstufe?: string;
  nummer: string;           // ELKOS-Nummer
  ort: string;
  ort2?: string;
  ts: number;               // Unix ms
  iso: string;              // ISO-String
}

@Injectable({ providedIn: 'root' })
export class EinsatzService {
  private base = 'https://infoscreen.florian10.info/OWS/wastlMobile/getEinsatzAktiv.ashx';

  constructor(private http: HttpClient) {}

  /**
   * Holt aktive Einsätze eines Bezirks via JSONP.
   * Wichtig: KEIN 'callback=' in der URL mitgeben – http.jsonp() hängt den Callback selbst an.
   */
  getAktiveEinsaetzeBezirk(bezirkId = 'bezirk_15') {
    const url = `${this.base}?id=${encodeURIComponent(bezirkId)}`;
    return this.http.jsonp<{ target: string; Einsatz?: EinsatzAPI[] }>(url, 'callback').pipe(
      map(payload => {
        const liste = payload?.Einsatz ?? [];
        if (!Array.isArray(liste)) return [] as EinsatzKurz[];
        return liste.map(this.mapToKurz);
      }),
      catchError(() => of([] as EinsatzKurz[]))
    );
  }

  private mapToKurz(e: EinsatzAPI): EinsatzKurz {
    const ts = toTimestamp(e.d, e.t); // ms
    return {
      id: e.i || `${e.b}-${e.n || e.m}-${ts}`,
      stichwort: e.m || '',
      alarmstufe: e.a || '',
      nummer: e.n || '',
      ort: e.o || '',
      ort2: e.o2 || '',
      ts,
      iso: new Date(ts).toISOString(),
    };
  }
}

/** DD.MM.YYYY + HH:mm:ss -> Unix ms (lokale Zeit) */
function toTimestamp(d: string, t: string): number {
  // robust gegen fehlende Werte
  const [dd, mm, yyyy] = String(d || '').split('.');
  const [HH = '00', MM = '00', SS = '00'] = String(t || '').split(':');
  const day = parseInt(dd || '1', 10);
  const mon = parseInt(mm || '1', 10) - 1;
  const yr  = parseInt(yyyy || '1970', 10);
  const h   = parseInt(HH, 10);
  const m   = parseInt(MM, 10);
  const s   = parseInt(SS, 10);
  // lokale Zeit (Österreich/Schweiz): ausreichend für Anzeige
  return new Date(yr, mon, day, h, m, s).getTime();
}
