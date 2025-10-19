import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  Type,
  signal,
  computed,
  Signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Data, ParamMap } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { HeaderControlsComponent } from '../shared/header-controls/header-controls/header-controls.component';
import { RestV1Component } from './rest-v1/rest-v1.component';
import { RestV2Component } from './rest-v2/rest-v2.component';

type Variant = 'v1' | 'v2';

@Component({
  selector: 'app-rest-mode',
  standalone: true,
  imports: [CommonModule, DatePipe, HeaderControlsComponent, RestV1Component, RestV2Component],
  templateUrl: './rest-mode.component.html',
  styleUrl: './rest-mode.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestModeComponent implements OnInit, OnDestroy, OnChanges {
  /** Variante kann vom Parent (Infoscreen) gesetzt werden */
  @Input() variant?: Variant;

  /** Uhrzeit im Header (tickt jede Sekunde) */
  now = signal(new Date());

  /** Cache-Buster NUR für UWZ, rotiert selten (z.B. alle 10 Minuten) */
  private uwzTimestamp = Date.now();

  /** aktive Variante als Signal */
  private variantKey = signal<Variant>('v1');

  /** dynamisch gewählte Komponente aus der Variante abgeleitet */
  activeCmp = computed<Type<any>>(() =>
    this.variantKey() === 'v2' ? RestV2Component : RestV1Component
  );

  // Timer Handles
  private tClock: any;
  private tUwz: any;
  private tReloadIframes: any;

  // Router as Signals (werden im Konstruktor initialisiert!)
  private qpSig!: Signal<ParamMap>;
  private dataSig!: Signal<Data>;

  constructor(private route: ActivatedRoute) {
    // Live-Uhr
    this.tClock = setInterval(() => {
      this.now.set(new Date());
    }, 1000);

    // UWZ-Cachebuster nur alle 10 Minuten
    this.tUwz = setInterval(() => {
      this.uwzTimestamp = Date.now();
    }, 10 * 60 * 1000);

    // Router-Signals NACHDEM 'route' existiert
    this.qpSig = toSignal(this.route.queryParamMap, {
      initialValue: this.route.snapshot.queryParamMap,
    });
    this.dataSig = toSignal(this.route.data, {
      initialValue: this.route.snapshot.data,
    });

    // Initiale Auflösung
    this.resolveVariant();
  }

  ngOnInit() {
    // Sanftes iFrame-Reload selten (alle 10 Minuten) – falls nicht benötigt: auskommentieren
    this.tReloadIframes = setInterval(() => this.reloadIframes(), 10 * 60 * 1000);

    // Reaktiv: durch die Signals löst das Lesen in resolveVariant() CD aus
    this.resolveVariant();
  }

  ngOnChanges(_: SimpleChanges): void {
    // @Input hat höchste Priorität – beim Eintreffen neu auflösen
    this.resolveVariant();
  }

  /** Priorität: Input > ?view > ?rest > data.variant > 'v1' */
  private resolveVariant() {
    // 1) @Input
    if (this.variant === 'v1' || this.variant === 'v2') {
      if (this.variantKey() !== this.variant) this.variantKey.set(this.variant);
      return;
    }

    // 2) QueryParams
    const qpm = this.qpSig?.();
    if (qpm) {
      const view = (qpm.get('view') || '').toLowerCase();
      if (view === 'v1' || view === 'v2') {
        if (this.variantKey() !== (view as Variant)) this.variantKey.set(view as Variant);
        return;
      }
      const rest = (qpm.get('rest') || '').toLowerCase();
      if (rest === 'v1' || rest === 'v2') {
        if (this.variantKey() !== (rest as Variant)) this.variantKey.set(rest as Variant);
        return;
      }
    }

    // 3) Route Data
    const dataVar = (this.dataSig?.()['variant'] as Variant | undefined) ?? undefined;
    if (dataVar === 'v1' || dataVar === 'v2') {
      if (this.variantKey() !== dataVar) this.variantKey.set(dataVar);
      return;
    }

    // 4) Default
    if (this.variantKey() !== 'v1') this.variantKey.set('v1');
  }

  // UWZ-URL mit selten rotierendem Cachebuster
  get uwzUrl(): string {
    return 'https://uwz.at/data/previews/AT_warning_today_all_desktop.png?cache=' + this.uwzTimestamp;
  }

  // sanftes Neuladen aller iFrames (nur falls in Unterkomponenten vorhanden)
  reloadIframes() {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((frame: HTMLIFrameElement) => {
      frame.style.transition = 'opacity 0.5s ease';
      frame.style.opacity = '0.1';
      setTimeout(() => {
        const src = frame.src;
        frame.src = src;
      }, 500);
      setTimeout(() => {
        frame.style.opacity = '1';
      }, 1200);
    });
    console.log('Iframes reloaded with fade effect');
  }

  ngOnDestroy() {
    clearInterval(this.tClock);
    clearInterval(this.tUwz);
    clearInterval(this.tReloadIframes);
  }
}
