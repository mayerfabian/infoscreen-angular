import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy,
  signal, computed, effect, Input,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
  import { HttpClient, HttpClientModule } from '@angular/common/http';

type IsoDatetime = string;

export interface VerfasstVon { standesbuchnummer: number; vorname: string; zuname: string; anzeige_name: string; }
export interface TagebuchEintrag {
  id: number; fzg: string | null; text: string; meldungskategorie: string;
  uhrzeit_de: string; datetime_iso: IsoDatetime; verfasst_von: VerfasstVon;
}
export interface EinsatzGruppe {
  einsatznummer: string; alarmstufe: string; ort: string | null; grund: string;
  einsatzdatum_iso: IsoDatetime; tagebuch: TagebuchEintrag[];
}
export interface EinsatzOffenObject { [einsatznummer: string]: EinsatzGruppe; }
export interface ApiData {
  einsatz_offen: EinsatzOffenObject;
  einsatzhistory: Array<{
    einsatztag: string; einsatzdatum_iso: IsoDatetime;
    einsatzstatus: 'offen'|'beendet'; einsatzalarmstufe: string; einsatzort: string | null; einsatzgrund: string;
  }>;
}
export interface ApiResponse { ok: boolean; meta:{ generated_at: IsoDatetime; version: string; }; data: ApiData; }

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
  private readonly FAST_MS = 10_000;      // 10 s bei offenen Einsätzen
  private readonly SLOW_MS = 10 * 60_000; // 10 min wenn leer

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

  private nextPollHandle: any;

  /** pro Element: { interval, timeout, token } */
  private scrollers = new Map<HTMLElement, { interval?: number; timeout?: number; token: number }>();
  private tokenCounter = 1;

  constructor(private http: HttpClient) { effect(() => void this.errorSig()); }

  ngOnInit(): void { this.fetch(); }
  ngOnDestroy(): void { this.clearNextPoll(); this.stopAllAutoScroll(); }

  trackByEinsatznummer(_i:number, item:EinsatzGruppe){ return item.einsatznummer; }

  /** Einträge: zzImage ausblenden, neueste zuerst */
  entriesForDisplay(e: EinsatzGruppe){
    const arr = e?.tagebuch ?? [];
    return [...arr]
      .filter(en => (en.meldungskategorie || '').toLowerCase() !== 'zzimage')
      .sort((a,b) => new Date(b.datetime_iso||0).getTime() - new Date(a.datetime_iso||0).getTime());
  }

  // --- polling ---
  private currentApiUrl(){ return this.apiUrl?.trim() || this.DEFAULT_API_URL; }
  private clearNextPoll(){ if (this.nextPollHandle) { clearTimeout(this.nextPollHandle); this.nextPollHandle = undefined; } }
  private scheduleNextPoll(){
    this.clearNextPoll();
    const delay = this.offeneEinsaetze().length > 0 ? this.FAST_MS : this.SLOW_MS;
    this.nextPollHandle = setTimeout(() => this.fetch(), delay);
  }
  private fetch(){
    if (this.loadingSig()) return;
    this.loadingSig.set(true);
    this.http.get<ApiResponse>(this.currentApiUrl(), { responseType: 'json' as const })
      .subscribe({
        next: resp => {
          if (!resp || resp.ok !== true || !resp.data) {
            this.errorSig.set('Ungültige API-Antwort.');
            this.payloadSig.set(null);
          } else {
            this.payloadSig.set(resp);
            this.errorSig.set(null);
            // nach Render Auto-Scroll prüfen
            setTimeout(() => this.ensureAutoScroll(), 0);
          }
          this.loadingSig.set(false);
          this.scheduleNextPoll();
        },
        error: err => {
          this.errorSig.set(`Fehler beim Laden: ${err?.message || 'unbekannt'}`);
          this.payloadSig.set(null);
          this.loadingSig.set(false);
          this.clearNextPoll();
          this.nextPollHandle = setTimeout(() => this.fetch(), this.SLOW_MS);
        }
      });
  }

  // --- fades + autoscroll ---
  /** Aktualisiert at-top/at-bottom auf der *Wrapper*-Box (Fades sind dort) */
  private updateFades(listEl: HTMLElement){
    const wrap = listEl.parentElement as HTMLElement | null;
    if (!wrap) return;
    const max = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
    const top = listEl.scrollTop;
    const atTop = top <= 1;
    const atBottom = top >= max - 1;
    wrap.classList.toggle('at-top', atTop);
    wrap.classList.toggle('at-bottom', atBottom);
  }

  /** Stoppt Intervalle *und* Timeouts aller bekannten Scroller */
  private stopAllAutoScroll(){
    for (const [el, h] of this.scrollers.entries()) {
      if (h.interval) clearInterval(h.interval);
      if (h.timeout) clearTimeout(h.timeout);
      this.scrollers.delete(el);
    }
  }

  /** Startet den pendelnden Auto-Scroll auf einem Element und sorgt dafür, dass es niemals doppelt läuft. */
  private startAutoScroll(list: HTMLElement){
    // vorhandene Timer anhalten
    const old = this.scrollers.get(list);
    if (old?.interval) clearInterval(old.interval);
    if (old?.timeout) clearTimeout(old.timeout);

    // eindeutiger Token für diese Session
    const token = ++this.tokenCounter;
    list.dataset['autoscrollId'] = String(token);

    // erstes Fade-Update
    this.updateFades(list);

    // wenn kein Overflow → nichts zu scrollen
    if (list.scrollHeight <= list.clientHeight + 2) {
      this.scrollers.set(list, { token });
      return;
    }

    // sichere Scroll-Einstellungen
    (list.style as any).scrollBehavior = 'auto';

    const stepPx = 1;
    const tickMs = 60;
    const pauseMs = 1200;

    const tick = (dir: 1 | -1) => {
      // Abbruch, wenn zwischenzeitlich ein neuer Token vergeben wurde
      if (list.dataset['autoscrollId'] !== String(token)) return;

      const max = list.scrollHeight - list.clientHeight;
      const next = list.scrollTop + (dir * stepPx);

      if (dir === 1 && next >= max) {
        list.scrollTop = max;
        this.updateFades(list);
        // Pause, danach Richtung wechseln – Timeout tracken & token-check
        const to = window.setTimeout(() => {
          if (list.dataset['autoscrollId'] !== String(token)) return;
          const h = this.scrollers.get(list);
          if (h?.interval) clearInterval(h.interval);
          const interval = window.setInterval(() => tick(-1), tickMs);
          this.scrollers.set(list, { interval, token });
        }, pauseMs);
        this.scrollers.set(list, { timeout: to, token });
        return;
      }

      if (dir === -1 && next <= 0) {
        list.scrollTop = 0;
        this.updateFades(list);
        const to = window.setTimeout(() => {
          if (list.dataset['autoscrollId'] !== String(token)) return;
          const h = this.scrollers.get(list);
          if (h?.interval) clearInterval(h.interval);
          const interval = window.setInterval(() => tick(1), tickMs);
          this.scrollers.set(list, { interval, token });
        }, pauseMs);
        this.scrollers.set(list, { timeout: to, token });
        return;
      }

      list.scrollTop = Math.max(0, Math.min(max, next));
      this.updateFades(list);
    };

    // initial nach unten
    const interval = window.setInterval(() => tick(1), tickMs);
    this.scrollers.set(list, { interval, token });
  }

  /** Sucht alle Listen und startet genau einen Scroller je Liste; alte Timer werden sauber beendet. */
  private ensureAutoScroll(){
    // zuerst alle alten Timer stoppen (auch gegen Re-Render)
    this.stopAllAutoScroll();

    // alle aktuellen Listen aufnehmen
    const lists = Array.from(document.querySelectorAll<HTMLElement>('.restv2-loglist'));
    for (const list of lists) {
      this.startAutoScroll(list);
    }
  }
}
