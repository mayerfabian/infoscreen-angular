import { Component, OnInit, OnDestroy, Type, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { filter, Subject, takeUntil } from 'rxjs';
import { ModeService, Einsatz } from '../mode.service';

import { AlarmV1Component } from './alarm-v1/alarm-v1.component';
import { AlarmV2Component } from './alarm-v2/alarm-v2.component';

@Component({
  selector: 'app-incident-mode',
  standalone: true,
  imports: [CommonModule, AlarmV1Component, AlarmV2Component],
  templateUrl: './incident-mode.component.html',
  styleUrls: ['./incident-mode.component.scss']
})
export class IncidentModeComponent implements OnInit, OnDestroy {
  activeCmp!: Type<any>;
  outletInputs: Record<string, any> = {};

  /** aktuell angezeigter Einsatz */
  einsatz: Einsatz | null = null;

  /** Live-Uhrzeit für Timer/Elapsed */
  now = new Date();
  private clockHandle: any;

  private destroy$ = new Subject<void>();
  private pollHandle: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    public modeService: ModeService
  ) {}

  ngOnInit(): void {
    // Variante (V1/V2) initial + bei Navigation/Query wechseln
    this.activeCmp = this.resolveVariantFromUrl(this.router.url, this.route);

    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe(() => {
        this.activeCmp = this.resolveVariantFromUrl(this.router.url, this.route);
        this.pushInputs();
      });

    this.route.queryParamMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.activeCmp = this.resolveVariantFromUrl(this.router.url, this.route);
        this.pushInputs();
      });

    // Einsatzdaten: bevorzugt Observable einsatz$, sonst Fallback-Polling
    const asAny = this.modeService as any;
    if (asAny && typeof asAny['einsatz$']?.subscribe === 'function') {
      asAny['einsatz$']
        .pipe(takeUntil(this.destroy$))
        .subscribe((val: Einsatz[] | Einsatz | null | undefined) => {
          this.einsatz = Array.isArray(val) ? (val[0] ?? null) : (val ?? null);
          this.pushInputs();
        });
    } else {
      this.refreshEinsatz(); // initial
      this.pollHandle = setInterval(() => this.refreshEinsatz(), 500);
    }

    // Uhr jede Sekunde aktualisieren (für elapsed)
    this.clockHandle = setInterval(() => {
      this.now = new Date();
      this.cdr.markForCheck();
    }, 1000);

    // erste Inputs setzen
    this.pushInputs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.pollHandle) clearInterval(this.pollHandle);
    if (this.clockHandle) clearInterval(this.clockHandle);
  }

  /** Buttons im Header */
  go(view: 'v1'|'v2'): void {
    this.router.navigate([view === 'v1' ? '/alarm' : '/alarm2']);
  }
  isActive(view: 'v1'|'v2'): boolean {
    const url = (this.router.url || '').toLowerCase();
    if (view === 'v1') return url.includes('/alarm') && !url.includes('/alarm2');
    return url.includes('/alarm2');
  }

  private refreshEinsatz(): void {
    try {
      const list = this.modeService.einsatz?.() ?? [];
      const next = (list && list.length) ? list[0] : null;
      const changed = (this.einsatz?.id !== next?.id) || (!!this.einsatz !== !!next);
      if (changed) {
        this.einsatz = next;
        this.pushInputs();
      }
    } catch {
      /* ignore */
    }
  }

  private pushInputs(): void {
    this.outletInputs = { einsatz: this.einsatz };
    this.cdr.markForCheck();
  }

  private resolveVariantFromUrl(url: string, r: ActivatedRoute): Type<any> {
    const qp = r.snapshot.queryParamMap.get('view');
    if (qp === 'v2') return AlarmV2Component;
    if (qp === 'v1') return AlarmV1Component;
    const lower = (url || '').toLowerCase();
    if (lower.includes('/alarm2')) return AlarmV2Component;
    const dataVariant = (r.snapshot.data?.['variant'] as 'v1' | 'v2' | undefined);
    if (dataVariant === 'v2') return AlarmV2Component;
    return AlarmV1Component;
  }

  /** Vergangene Zeit seit Alarm als HH:mm:ss */
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
