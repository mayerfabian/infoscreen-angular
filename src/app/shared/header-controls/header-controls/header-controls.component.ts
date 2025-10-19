import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
  OnInit,
  HostBinding,
  Renderer2,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // ⬅️ neu
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter, startWith } from 'rxjs/operators';

type Variant = 'v1' | 'v2';

const POS_KEY = 'devDash_pos_v1'; // sessionStorage key

@Component({
  selector: 'app-header-controls',
  standalone: true,
  imports: [CommonModule, FormsModule], // ⬅️ FormsModule hier einbinden
  templateUrl: './header-controls.component.html',
  styleUrls: ['./header-controls.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderControlsComponent implements OnInit, OnDestroy {
  /** Sichtbarkeit: nur bei ?dev=1 */
  show = false;

  /** Aktive Zustände */
  incidentActive: Variant = 'v1';
  restActive: Variant = 'v1';
  testActive = false;

  /** User-ID aus der URL (bearbeitbar) */
  userValue: string = '';

  /** Overlay-Position (rechts & top in px) – fensterlokal gespeichert */
  pos = { top: 8, right: 8 };

  private sub?: Subscription;
  private dragSubMove?: () => void;
  private dragSubUp?: () => void;
  private dragStart?: { x: number; y: number; top: number; right: number };

  @HostBinding('style.position') hostPos = 'fixed';
  @HostBinding('style.z-index') hostZ = '9999';
  @HostBinding('style.top.px') get hostTop() { return this.pos.top; }
  @HostBinding('style.right.px') get hostRight() { return this.pos.right; }
  @HostBinding('style.pointer-events') hostPe = 'auto';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private r2: Renderer2,
    private el: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    // Pos aus der Session laden (pro Fenster)
    try {
      const raw = sessionStorage.getItem(POS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.top === 'number' && typeof parsed?.right === 'number') {
          this.pos = { top: parsed.top, right: parsed.right };
        }
      }
    } catch {}

    // Router-Änderungen beobachten
    this.sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), startWith(null))
      .subscribe(() => this.updateState());

    // Initial
    this.updateState();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.detachDrag();
  }

  /** Zustand aus URL (Pfad + Query) bestimmen */
  private updateState(): void {
    const url = (this.router.url || '').toLowerCase();
    const root = this.getRoot(this.route);
    const q = root.snapshot.queryParamMap;

    this.show = (q.get('dev') || '').toLowerCase() === '1';

    const test = (q.get('test') || '').toLowerCase();
    this.testActive = !!test && test !== '0';

    const rest = (q.get('rest') || '').toLowerCase();
    this.restActive = rest === 'v2' ? 'v2' : 'v1';

    // user-Param übernehmen (leer → '')
    this.userValue = q.get('user') ?? '';

    if (url.includes('/alarm2')) {
      this.incidentActive = 'v2';
    } else if (url.includes('/alarm')) {
      this.incidentActive = 'v1';
    } else {
      const inc = (q.get('incident') || q.get('view') || '').toLowerCase();
      this.incidentActive = inc === 'v2' ? 'v2' : 'v1';
    }

    this.cdr.markForCheck();
  }

  // --- Actions: nur URL manipulieren ---
  async setIncident(v: Variant) {
    const url = (this.router.url || '').toLowerCase();
    const onFixed = url.includes('/alarm') || url.includes('/alarm2');
    if (onFixed) {
      const target = v === 'v2' ? ['/alarm2'] : ['/alarm'];
      await this.router.navigate(target, {
        queryParams: this.mergeCurrentQuery({ incident: null, view: null }),
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    } else {
      await this.router.navigate([], {
        relativeTo: this.getRoot(this.route),
        queryParams: { incident: v, view: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  async setRest(v: Variant) {
    await this.router.navigate([], {
      relativeTo: this.getRoot(this.route),
      queryParams: { rest: v },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  async toggleTest() {
    const root = this.getRoot(this.route);
    const current = (root.snapshot.queryParamMap.get('test') || '').toLowerCase();
    const next = current && current !== '0' ? null : '1';
    await this.router.navigate([], {
      relativeTo: root,
      queryParams: { test: next },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Enter im User-Feld → ?user=<value> setzen/entfernen */
  async submitUser() {
    const root = this.getRoot(this.route);
    const val = (this.userValue || '').trim();
    await this.router.navigate([], {
      relativeTo: root,
      queryParams: { user: val.length ? val : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // --- Dragging ---
  onDragStart(ev: MouseEvent) {
    if (ev.button !== 0) return; // nur LMB
    ev.preventDefault();
    this.dragStart = {
      x: ev.clientX,
      y: ev.clientY,
      top: this.pos.top,
      right: this.pos.right,
    };
    const move = (e: MouseEvent) => {
      if (!this.dragStart) return;
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.pos = {
        top: Math.max(0, this.dragStart.top + dy),
        right: Math.max(0, this.dragStart.right - dx), // rechtsbündig
      };
      this.cdr.markForCheck();
    };
    const up = () => {
      this.detachDrag();
      this.savePos();
    };
    this.dragSubMove = this.r2.listen('document', 'mousemove', move);
    this.dragSubUp = this.r2.listen('document', 'mouseup', up);
  }

  private detachDrag() {
    this.dragSubMove?.(); this.dragSubMove = undefined;
    this.dragSubUp?.(); this.dragSubUp = undefined;
    this.dragStart = undefined;
  }

  private savePos() {
    try { sessionStorage.setItem(POS_KEY, JSON.stringify(this.pos)); } catch {}
  }

  // Helpers
  private getRoot(r: ActivatedRoute): ActivatedRoute {
    let cur = r;
    while (cur.parent) cur = cur.parent;
    return cur;
  }
  private mergeCurrentQuery(overrides: Record<string, any>): Record<string, any> {
    const q = this.getRoot(this.route).snapshot.queryParamMap;
    const base: Record<string, any> = {};
    q.keys.forEach((k) => (base[k] = q.get(k)));
    return { ...base, ...overrides };
  }
}
