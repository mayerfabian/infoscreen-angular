import {
  Component,
  OnInit,
  OnDestroy,
  Type,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Input,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { filter, Subject, takeUntil } from 'rxjs';

import { ModeService } from '../mode.service';
import type { Einsatz } from '../models/lea.interfaces';

import { AlarmV1Component } from './alarm-v1/alarm-v1.component';
import { AlarmV2Component } from './alarm-v2/alarm-v2.component';
import { HeaderControlsComponent } from '../shared/header-controls/header-controls/header-controls.component';

type Variant = 'v1' | 'v2';

@Component({
  selector: 'app-incident-mode',
  standalone: true,
  imports: [CommonModule, AlarmV1Component, AlarmV2Component, HeaderControlsComponent],
  templateUrl: './incident-mode.component.html',
  styleUrls: ['./incident-mode.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncidentModeComponent implements OnInit, OnDestroy {
  @Input() variant?: Variant;

  // Kompatibilität (wird durch @switch im Template nicht mehr benötigt, darf bleiben)
  activeCmp!: Type<any>;
  outletInputs: Record<string, any> = {};

  einsatz: Einsatz | null = null;

  now = new Date();
  private clockHandle: any;

  private destroy$ = new Subject<void>();
  private pollHandle: any;

  /** aktive Variante als Signal */
  private variantKey = signal<Variant>('v1');

  /** abgeleitete Komponente (intern) */
  private activeCmpSig = computed<Type<any>>(
    () => (this.variantKey() === 'v2' ? AlarmV2Component : AlarmV1Component)
  );

  /** Debug-Schalter: true wenn ?dev=1 */
  private debug = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    public modeService: ModeService
  ) {
    this.updateDebugFlag();
    this.log('ctor', { url: this.router.url });

    // Reaktiv synchronisieren (entscheidet anhand der aktuellen URL/Query)
    effect(() => {
      const next = this.resolveVariantKey();
      if (this.variantKey() !== next) {
        this.log('effect -> set variantKey', { from: this.variantKey(), to: next });
        this.variantKey.set(next);
      }
      const nextCmp = this.activeCmpSig();
      if (this.activeCmp !== nextCmp) {
        this.log('effect -> switch component', {
          from: this.activeCmp?.name,
          to: nextCmp?.name,
        });
        this.activeCmp = nextCmp;
        this.cdr.markForCheck();
      }
    });
  }

  /** Für Template: aktueller Variant-Key */
  viewVariant(): Variant {
    const v = this.variantKey();
    return v;
  }

  ngOnInit(): void {
    // Navigation beobachten: bei jeder URL-Änderung neu auswerten
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe((e) => {
        this.log('NavigationEnd', { url: this.router.url });
        this.updateDebugFlag();
        this.syncVariantFromRouter(true);
      });

    // QueryParam-Änderungen am Root beobachten (HeaderControls schreibt dort)
    let root = this.route;
    while (root.parent) root = root.parent;
    root.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((qp) => {
      const snapshot = Object.fromEntries(qp.keys.map((k) => [k, qp.get(k)]));
      this.log('root.queryParamMap change', snapshot);
      this.updateDebugFlag();
      this.syncVariantFromRouter(true);
    });

    // Einsatzdaten (unverändert)
    const asAny = this.modeService as any;
    if (asAny && typeof asAny['einsatz$']?.subscribe === 'function') {
      asAny['einsatz$']
        .pipe(takeUntil(this.destroy$))
        .subscribe((val: Einsatz[] | Einsatz | null | undefined) => {
          this.einsatz = Array.isArray(val) ? (val[0] ?? null) : (val ?? null);
          this.log('einsatz$ update', { einsatzId: this.einsatz?.id });
          this.pushInputs();
        });
    } else {
      this.refreshEinsatz();
      this.pollHandle = setInterval(() => this.refreshEinsatz(), 500);
    }

    this.clockHandle = setInterval(() => {
      this.now = new Date();
      this.pushInputs();
    }, 1000);

    // initial
    this.syncVariantFromRouter(true);
    this.pushInputs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.pollHandle) clearInterval(this.pollHandle);
    if (this.clockHandle) clearInterval(this.clockHandle);
    this.log('destroy');
  }

  // Buttons (unverändert)
  go(view: 'v1' | 'v2'): void {
    this.log('go()', { view });
    this.router.navigate([view === 'v1' ? '/alarm' : '/alarm2']);
  }

  isActive(view: 'v1' | 'v2'): boolean {
    const url = (this.router.url || '').toLowerCase();
    if (view === 'v1') return url.includes('/alarm') && !url.includes('/alarm2');
    return url.includes('/alarm2');
  }

  private refreshEinsatz(): void {
    try {
      const list = this.modeService.einsaetze?.() ?? [];
      const next: Einsatz | null = (list && list.length) ? list[0] : null;
      const changed = (this.einsatz?.id !== next?.id) || (!!this.einsatz !== !!next);
      if (changed) {
        this.einsatz = next;
        this.log('refreshEinsatz()', { einsatzId: this.einsatz?.id });
        this.pushInputs();
      }
    } catch {
      /* ignore */
    }
  }

  private pushInputs(): void {
    this.outletInputs = { einsatz: this.einsatz, now: this.now };
    this.cdr.markForCheck();
  }

  /** Normalisiert beliebige Schreibweisen auf 'v1' | 'v2' */
  private normalizeVariant(raw?: string | null): Variant | null {
    const v = (raw || '').trim().toLowerCase();
    if (!v) return null;
    if (v === 'v1' || v === 'a1' || v === '1') return 'v1';
    if (v === 'v2' || v === 'a2' || v === '2') return 'v2';
    if (v.endsWith('1')) return 'v1';
    if (v.endsWith('2')) return 'v2';
    return null;
  }

  /** Liest *direkt* aus der echten URL (inkl. Query) und wendet neue Priorität an */
  private resolveVariantKey(): Variant {
    const full = this.router.url || '';
    const lower = full.toLowerCase();
    const qs = full.includes('?') ? full.substring(full.indexOf('?') + 1) : '';
    const params = new URLSearchParams(qs);

    const snapshot = Object.fromEntries(Array.from(params.entries()));
    this.log('resolveVariantKey() read url', { path: lower.split('?')[0], params: snapshot });

    // ---------- NEUE PRIORITÄT: URL/QUERY VOR @Input ----------
    // 1) ?view
    const byView = this.normalizeVariant(params.get('view')); if (byView) { this.log('resolveVariantKey()', { via: 'view', chosen: byView }); return byView; }
    // 2) ?incident
    const byIncident = this.normalizeVariant(params.get('incident')); if (byIncident) { this.log('resolveVariantKey()', { via: 'incident', chosen: byIncident }); return byIncident; }
    // 3) ?alarm
    const byAlarm = this.normalizeVariant(params.get('alarm')); if (byAlarm) { this.log('resolveVariantKey()', { via: 'alarm', chosen: byAlarm }); return byAlarm; }
    // 4) ?a
    const byA = this.normalizeVariant(params.get('a')); if (byA) { this.log('resolveVariantKey()', { via: 'a', chosen: byA }); return byA; }
    // 5) ?variant
    const byVar = this.normalizeVariant(params.get('variant')); if (byVar) { this.log('resolveVariantKey()', { via: 'variant', chosen: byVar }); return byVar; }

    // 6) Pfad
    if (lower.includes('/alarm2')) {
      this.log('resolveVariantKey()', { via: 'path', chosen: 'v2' });
      return 'v2';
    }

    // 7) @Input  // ← PRIORITY CHANGE (erst jetzt)
    if (this.variant === 'v2') {
      this.log('resolveVariantKey()', { via: '@Input', chosen: 'v2' });
      return 'v2';
    }
    if (this.variant === 'v1') {
      this.log('resolveVariantKey()', { via: '@Input', chosen: 'v1' });
      return 'v1';
    }

    // 8) Default
    this.log('resolveVariantKey()', { via: 'default', chosen: 'v1' });
    return 'v1';
  }

  /** erzwingt sofortiges Rendern (detectChanges) nach URL/Query-Wechsel */
  private syncVariantFromRouter(force = false): void {
    const v = this.resolveVariantKey();
    const oldV = this.variantKey();
    const changed = oldV !== v;
    if (changed) {
      this.log('syncVariantFromRouter(): variantKey change', { from: oldV, to: v });
      this.variantKey.set(v);
    }

    const nextCmp = this.activeCmpSig();
    const oldCmpName = this.activeCmp?.name;
    const cmpChanged = this.activeCmp !== nextCmp;
    if (cmpChanged) {
      this.activeCmp = nextCmp;
      this.log('syncVariantFromRouter(): component switch', { from: oldCmpName, to: nextCmp?.name });
    }

    if (force || changed || cmpChanged) {
      this.log('syncVariantFromRouter(): detectChanges()');
      this.cdr.detectChanges();
    }
  }

  // Debug-Flag aus ?dev=1 lesen
  private updateDebugFlag(): void {
    const full = this.router.url || '';
    const qs = full.includes('?') ? full.substring(full.indexOf('?') + 1) : '';
    const params = new URLSearchParams(qs);
    const devOn = (params.get('dev') || '').toLowerCase() === '1';
    this.debug = devOn;
  }

  // zentrales Logging – nur wenn ?dev=1
  private log(msg: string, obj?: any): void {
    if (!this.debug) return;
    // eslint-disable-next-line no-console
    console.log('[IncidentMode]', msg, obj ?? '');
  }

  // ——— Anzeige-Helfer (unverändert) ———
  elapsed(e: Einsatz | null | undefined): string {
    if (!e?.alarmtime) return '—';
    const ms = Math.max(0, this.now.getTime() - e.alarmtime);
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  meldebild(e?: Einsatz): string {
    if (!e) return 'ALARM';
    const typ = (e.eventtype || '').trim();
    const text = (e.eventtypetext || '').trim();
    return (typ && text) ? `${typ} – ${text}` : (typ || text || 'ALARM');
  }
}
