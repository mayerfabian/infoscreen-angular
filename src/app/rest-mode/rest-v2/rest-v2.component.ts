import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
  Input,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';

type IsoDatetime = string;

export interface VerfasstVon {
  standesbuchnummer: number;
  vorname: string;
  zuname: string;
  anzeige_name: string;
}
export interface TagebuchEintrag {
  id: number;
  fzg: string | null;
  text: string;
  meldungskategorie: string;
  uhrzeit_de: string;
  datetime_iso: IsoDatetime;
  verfasst_von: VerfasstVon;
}

/** Fahrzeuge laut API */
export interface Fahrzeug {
  einsatznummer: string;
  rufname: string;         // z.B. "Pumpe 1"
  funkrufname: string;     // z.B. "LFA-B"
  status: number;
  besatzung: string | null; // Achtung: string in API
  km: number | null;        // Zahl (kann null sein)
  timestamp_iso: IsoDatetime;
  aus_iso: IsoDatetime | null;
  ein_iso: IsoDatetime | null;
  verantwortlich: VerfasstVon;
}

export interface EinsatzGruppe {
  einsatznummer: string;
  alarmstufe: string;
  ort: string | null;
  grund: string;
  einsatzdatum_iso: IsoDatetime;
  tagebuch: TagebuchEintrag[];
  fahrzeuge?: Fahrzeug[];
}
export interface EinsatzOffenObject {
  [einsatznummer: string]: EinsatzGruppe;
}
export interface ApiData {
  einsatz_offen: EinsatzOffenObject;
  einsatzhistory: Array<{
    einsatztag: string;
    einsatzdatum_iso: IsoDatetime;
    einsatzstatus: 'offen' | 'beendet';
    einsatzalarmstufe: string;
    einsatzort: string | null;
    einsatzgrund: string;
  }>;
}
export interface ApiResponse {
  ok: boolean;
  meta: { generated_at: IsoDatetime; version: string };
  data: ApiData;
}

@Component({
  selector: 'app-rest-v2',
  standalone: true,
  imports: [CommonModule, HttpClientModule, DatePipe],
  templateUrl: './rest-v2.component.html',
  styleUrls: ['./rest-v2.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestV2Component implements OnInit, OnDestroy {
  @Input() uwzUrl?: string;
  @Input() reloadIframes?: boolean;
  @Input() apiUrl?: string;

  private readonly DEFAULT_API_URL = 'https://info.ff-wuerflach.at/api/einsatz.php';
  private readonly FAST_MS = 10_000; // 10 s bei offenen Einsätzen
  private readonly SLOW_MS = 10 * 60_000; // 10 min wenn leer
  private readonly CAROUSEL_INTERVAL = 20_000; // 20 s

  private loadingSig = signal<boolean>(false);
  private errorSig = signal<string | null>(null);
  private payloadSig = signal<ApiResponse | null>(null);

  readonly loading = computed(() => this.loadingSig());
  readonly error = computed(() => this.errorSig());
  readonly offeneEinsaetze = computed<EinsatzGruppe[]>(() => {
    const data = this.payloadSig()?.data?.einsatz_offen;
    if (!data) return [];
    const list = Object.values(data);
    return list.sort((a, b) => {
      const at = new Date(a.einsatzdatum_iso).getTime();
      const bt = new Date(b.einsatzdatum_iso).getTime();
      if (bt !== at) return bt - at;
      return (b.einsatznummer || '').localeCompare(a.einsatznummer || '');
    });
  });

  /** Seiten für das Carousel: 2 Karten pro Seite */
  readonly pages = computed<EinsatzGruppe[][]>(() => {
    const src = this.offeneEinsaetze();
    const res: EinsatzGruppe[][] = [];
    for (let i = 0; i < src.length; i += 2) {
      res.push(src.slice(i, i + 2));
    }
    return res;
  });

  /** aktueller Carousel-Index */
  readonly pageIndex = signal<number>(0);

  private nextPollHandle: any;
  private carouselHandle: any;

  constructor(private http: HttpClient) {
    // „keep-alive“-Effect
    effect(() => void this.errorSig());

    // Wenn sich die Seitenzahl ändert, Index validieren und Carousel (de)aktivieren
    effect(() => {
      const p = this.pages();
      const len = p.length;
      // Index einfangen
      if (this.pageIndex() >= len && len > 0) {
        this.pageIndex.set(0);
      }
      // Carousel-Start/Stopp-Regel
      if (this.offeneEinsaetze().length > 2 && len > 1) {
        this.startCarousel();
      } else {
        this.stopCarousel();
      }
    });
  }

  ngOnInit(): void {
    this.fetch();
  }

  ngOnDestroy(): void {
    this.clearNextPoll();
    this.stopCarousel();
  }

  trackByEinsatznummer(_i: number, item: EinsatzGruppe) {
    return item.einsatznummer;
  }

  /** Einträge: zzImage ausblenden, neueste zuerst */
  entriesForDisplay(e: EinsatzGruppe) {
    const arr = e?.tagebuch ?? [];
    return [...arr]
      .filter((en) => (en.meldungskategorie || '').toLowerCase() !== 'zzimage')
      .sort(
        (a, b) =>
          new Date(b.datetime_iso || 0).getTime() -
          new Date(a.datetime_iso || 0).getTime()
      );
  }

  // --- Polling ---
  private currentApiUrl() {
    return this.apiUrl?.trim() || this.DEFAULT_API_URL;
  }

  private clearNextPoll() {
    if (this.nextPollHandle) {
      clearTimeout(this.nextPollHandle);
      this.nextPollHandle = undefined;
    }
  }

  private scheduleNextPoll() {
    this.clearNextPoll();
    const delay =
      this.offeneEinsaetze().length > 0 ? this.FAST_MS : this.SLOW_MS;
    this.nextPollHandle = setTimeout(() => this.fetch(), delay);
  }

  private fetch() {
    if (this.loadingSig()) return;

    this.loadingSig.set(true);
    this.http
      .get<ApiResponse>(this.currentApiUrl(), { responseType: 'json' as const })
      .subscribe({
        next: (resp) => {
          if (!resp || resp.ok !== true || !resp.data) {
            this.errorSig.set('Ungültige API-Antwort.');
            this.payloadSig.set(null);
          } else {
            this.payloadSig.set(resp);
            this.errorSig.set(null);
          }
          this.loadingSig.set(false);
          this.scheduleNextPoll();
        },
        error: (err) => {
          this.errorSig.set(
            `Fehler beim Laden: ${err?.message || 'unbekannt'}`
          );
          this.payloadSig.set(null);
          this.loadingSig.set(false);
          this.clearNextPoll();
          this.nextPollHandle = setTimeout(() => this.fetch(), this.SLOW_MS);
        },
      });
  }

  // --- Carousel ---
  private startCarousel() {
    this.stopCarousel();
    this.carouselHandle = setInterval(() => {
      const len = this.pages().length;
      if (len <= 1) return;
      const next = (this.pageIndex() + 1) % len;
      this.pageIndex.set(next);
    }, this.CAROUSEL_INTERVAL);
  }
  private stopCarousel() {
    if (this.carouselHandle) {
      clearInterval(this.carouselHandle);
      this.carouselHandle = undefined;
    }
  }

  /* ===================== Badge-/Kachel-Logik ===================== */

  /** Wert vorhanden? (nicht leer, nicht '0', nicht '-', nicht 0, nicht NaN) */
  private _isPresent(v: any): boolean {
    if (v === null || v === undefined) return false;
    if (typeof v === 'number') return Number.isFinite(v) && v > 0;
    const s = String(v).trim();
    if (!s) return false;
    if (s === '-' || s === '0') return false;
    // "00" etc. -> 0
    const n = Number(s);
    if (!Number.isNaN(n) && n <= 0) return false;
    return true;
  }

  /** km fehlt? */
  private _kmMissing(f: Fahrzeug): boolean {
    return !this._isPresent(f?.km);
  }
  /** Mann/Besatzung fehlt? (API liefert string) */
  private _mannMissing(f: Fahrzeug): boolean {
    return !this._isPresent(f?.besatzung);
  }

  /** True, wenn km und Mann beide gesetzt */
  isCompleteFzg(f: Fahrzeug): boolean {
    return !this._kmMissing(f) && !this._mannMissing(f);
  }

  /** CSS-Klasse der Kachel (knalliges Grün/Rot) */
  tileClassFzg(f: Fahrzeug): string {
    return this.isCompleteFzg(f) ? 'tile-ok' : 'tile-bad';
  }

  /** Anzeige-Helper */
  displayName(f: Fahrzeug): string {
    return f?.funkrufname || f?.rufname || '';
  }
  displayKm(f: Fahrzeug): string {
    return this._isPresent(f?.km) ? String(f.km) : '?';
  }
  displayMann(f: Fahrzeug): string {
    return this._isPresent(f?.besatzung) ? String(f.besatzung) : '?';
  }
  tileTitle(f: Fahrzeug): string {
    return `${this.displayName(f)} • km: ${this.displayKm(f)} • Mann: ${this.displayMann(f)}`;
  }
}
