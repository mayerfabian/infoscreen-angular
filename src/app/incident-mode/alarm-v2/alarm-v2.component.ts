import {
  Component, Input, OnChanges, SimpleChanges, ElementRef, ViewChild,
  AfterViewInit, OnDestroy, NgZone
} from '@angular/core';
import { CommonModule, NgIf, NgFor, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Einsatz } from '../../mode.service';
import { environment } from '../../../environments/environments';
import * as L from 'leaflet';

type SvStatus = 'unknown' | 'checking' | 'ok' | 'none' | 'error';
type RouteStatus = 'idle' | 'loading' | 'ok' | 'fail';

@Component({
  selector: 'app-alarm-v2',
  standalone: true,
  imports: [CommonModule, NgIf, NgFor, DatePipe],
  templateUrl: './alarm-v2.component.html',
  styleUrls: ['./alarm-v2.component.scss']
})
export class AlarmV2Component implements OnChanges, AfterViewInit, OnDestroy {
  @Input() einsatz: Einsatz | null = null;

  @ViewChild('panelBody') panelBodyRef?: ElementRef<HTMLDivElement>;
  private resizeObs?: ResizeObserver;

  // --- Street View (4 Kacheln, Panorama-Bounce) ---
  readonly fov = 90;
  readonly pitch = 0;
  readonly headings = [0, 90, 180, 270];
  readonly STREETVIEW_RADIUS = 50; // 50 m, wie gewünscht
  scrollDurationSec = 50;

  // States
  svStatus: SvStatus = 'unknown';
  lastCheckedKey = '';

  // Leaflet / Route / Geocode
  private readonly FIREHOUSE = { lat: 47.766458576335914, lon: 16.05204256411419 };
  routeStatus: RouteStatus = 'idle';
  private lastRouteKey = '';
  private routeLatLngs: L.LatLngExpression[] = [];
  etaMinutes: number | null = null;
  displayAddress: string | null = null;

  private map?: L.Map;
  private tileLayer?: L.TileLayer;
  private routeLayer?: L.Polyline;
  private startMarker?: L.Marker;
  private endMarker?: L.Marker;
  private mapInited = false;
  private mapTick?: any;

  // Dynamische SV-Kachelgröße (<= 640)
  private svTileW = 320;
  private svTileH = 320;

  // UI
  coordString = '';
  coordError: string | null = null;

  // Cache-Buster
  private bust = 0;

  // --- NEU: Anzeige-Wechsel SV <-> Karte ---
  showStreetView = true;               // start: SV, wenn verfügbar
  private ALT_INTERVAL_MS = 15 * 1000; // 15 Sekunden
  private altTimer?: any;

  constructor(private zone: NgZone, private router: Router) {}

  // ---------------- Lifecycle ----------------
  ngAfterViewInit(): void {
    this.setupResizeObserver();
    setTimeout(() => this.recalcSizes(), 0);

    // Leaflet-Resize-Fix
    this.zone.runOutsideAngular(() => {
      this.mapTick = setInterval(() => this.map?.invalidateSize(), 500);
    });

    // Ohne Key → Leaflet sofort
    if (this.missingKey && !this.missingCoords) {
      this.svStatus = 'error';
      this.ensureLeaflet(true);
      this.updateAlternateTimer();
    }
  }

  ngOnDestroy(): void {
    this.resizeObs?.disconnect();
    if (this.mapTick) clearInterval(this.mapTick);
    if (this.altTimer) clearInterval(this.altTimer);
    this.map?.remove();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('einsatz' in changes) {
      const lat = this.einsatz?.location?.x;
      const lon = this.einsatz?.location?.y;
      this.coordString = (lat != null && lon != null) ? `${lat}, ${lon}` : '';
      this.coordError = null;

      if (!this.missingCoords) this.ensureLeaflet(true);
      this.checkStreetViewAvailability();   // setzt svStatus
      this.fetchRouteAndAddress();          // ETA + Adresse
      this.updateAlternateTimer();          // Timer je nach svStatus steuern
      setTimeout(() => this.recalcSizes(), 0);
    }
  }

  // ---------------- Guards ----------------
  get missingKey(): boolean {
    return !(environment as any)?.GOOGLE_STREETVIEW_KEY;
  }
  get missingCoords(): boolean {
    return !(this.einsatz?.location?.x != null && this.einsatz?.location?.y != null);
  }

  // ---------------- Header-Buttons ----------------
  goTo(view: 'v1'|'v2'): void {
    this.router.navigate([view === 'v1' ? '/alarm' : '/alarm2']);
  }

  // ---------------- Koordinaten speichern ----------------
  saveCoords(raw: string): void {
    this.coordError = null;
    if (!this.applyCoordsFromString(raw)) return;

    this.lastCheckedKey = ''; // SV neu
    this.lastRouteKey   = ''; // Route/Geocode neu
    this.bumpBust();
    this.checkStreetViewAvailability();
    this.fetchRouteAndAddress();
    this.ensureLeaflet(true);
    this.updateAlternateTimer();
    this.recalcSizes();
  }

  private applyCoordsFromString(raw: string): boolean {
    if (!this.einsatz) { this.coordError = 'Kein Einsatz geladen.'; return false; }
    const m = raw.match(/^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/);
    if (!m) { this.coordError = 'Ungültiges Format. Beispiel: 47.7067411321, 15.8170643696'; return false; }
    const lat = parseFloat(m[1]); const lon = parseFloat(m[3]);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      this.coordError = 'Latitude/Longitude außerhalb gültiger Bereiche.'; return false;
    }
    if (!this.einsatz.location) this.einsatz.location = {};
    this.einsatz.location.x = lat; // x = Lat
    this.einsatz.location.y = lon; // y = Lon
    this.coordString = `${lat}, ${lon}`;
    return true;
  }

  // ---------------- Größen & URLs (Street View) ----------------
  private setupResizeObserver(): void {
    const el = this.panelBodyRef?.nativeElement;
    if (!el) return;
    this.resizeObs = new ResizeObserver(() => this.recalcSizes());
    this.resizeObs.observe(el);
  }

  private fitWithin640(w: number, h: number): { w: number; h: number } {
    if (w <= 640 && h <= 640) return { w, h };
    const scale = Math.min(640 / w, 640 / h);
    return { w: Math.max(1, Math.floor(w * scale)), h: Math.max(1, Math.floor(h * scale)) };
  }

  private recalcSizes = (): void => {
    const el = this.panelBodyRef?.nativeElement;
    if (!el) return;
    const cw = Math.max(1, Math.floor(el.clientWidth));
    const ch = Math.max(1, Math.floor(el.clientHeight));
    const tiles = Math.max(1, this.headings.length);
    const targetH = ch;
    const targetW = Math.round(cw / tiles);
    const fitted = this.fitWithin640(targetW, targetH);
    this.svTileW = Math.max(64, fitted.w);
    this.svTileH = Math.max(64, fitted.h);
    this.bumpBust();
  };

  private bumpBust(): void {
    this.bust = Date.now();
  }

  buildSvUrls(): string[] {
    const key = (environment as any)?.GOOGLE_STREETVIEW_KEY || '';
    const lat = this.einsatz?.location?.x;
    const lon = this.einsatz?.location?.y;
    if (!key || lat == null || lon == null) return [];
    const base = 'https://maps.googleapis.com/maps/api/streetview';
    return this.headings.map(heading => {
      const params = new URLSearchParams({
        size: `${this.svTileW}x${this.svTileH}`,
        location: `${lat},${lon}`,
        heading: String(heading),
        pitch: String(this.pitch),
        fov: String(this.fov),
        source: 'outdoor',
        key,
        ts: String(this.bust)
      });
      return `${base}?${params.toString()}`;
    });
  }
  buildSvUrlsLoop(): string[] {
    const u = this.buildSvUrls();
    return u.length ? u.concat(u) : u;
  }

  // ---------------- Street View Verfügbarkeit ----------------
  private async checkStreetViewAvailability(): Promise<void> {
    if (this.missingCoords) { this.svStatus = 'unknown'; return; }
    if (this.missingKey)   { this.svStatus = 'error'; this.updateAlternateTimer(); return; }

    const key = (environment as any)?.GOOGLE_STREETVIEW_KEY || '';
    const lat = this.einsatz!.location!.x!;
    const lon = this.einsatz!.location!.y!;
    const sig = `${key}|${lat},${lon}`;

    if (this.lastCheckedKey === sig && (this.svStatus === 'ok' || this.svStatus === 'none')) {
      // Status schon stabil → sicherstellen, dass Timer korrekt läuft
      this.updateAlternateTimer();
      return;
    }

    this.svStatus = 'checking';
    this.lastCheckedKey = sig;

    try {
      const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${
        encodeURIComponent(`${lat},${lon}`)
      }&source=outdoor&radius=${this.STREETVIEW_RADIUS}&key=${encodeURIComponent(key)}&ts=${this.bust}`;

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(metaUrl, { signal: ctrl.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        this.svStatus = 'error';
      } else {
        const meta = await res.json();
        if (meta?.status === 'OK') this.svStatus = 'ok';
        else if (meta?.status === 'ZERO_RESULTS') this.svStatus = 'none';
        else this.svStatus = 'error';
      }
    } catch {
      this.svStatus = 'error';
    }

    // ⚠️ WICHTIG: Timer erst jetzt (nach finalem Status) setzen/aufräumen
    this.updateAlternateTimer();
    }


  // ---------------- Route + Geocoding ----------------
  private ensureMapsScript(): Promise<void> {
    const key = (environment as any)?.GOOGLE_STREETVIEW_KEY || '';
    if (!key) return Promise.reject(new Error('Missing Google key'));
    const w = (window as any);
    if (w.google?.maps?.DirectionsService && w.google?.maps?.Geocoder) return Promise.resolve();
    if (w.__gmapsLoading) return w.__gmapsLoading as Promise<void>;

    w.__gmapsLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry&ts=${Date.now()}`;
      script.async = true; script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Maps JS API'));
      document.head.appendChild(script);
    });
    return w.__gmapsLoading;
  }

  private async fetchRouteAndAddress(): Promise<void> {
    if (this.missingKey || this.missingCoords) { this.routeStatus = 'fail'; return; }

    const key = (environment as any)?.GOOGLE_STREETVIEW_KEY || '';
    const lat = this.einsatz!.location!.x!;
    const lon = this.einsatz!.location!.y!;
    const sig = `${key}|${lat},${lon}`;

    if (this.lastRouteKey === sig && this.routeStatus === 'ok') return;

    this.routeStatus = 'loading';
    this.etaMinutes = null;

    try {
      await this.ensureMapsScript();
      const g = (window as any).google as any;

      // Directions
      const svc = new g.maps.DirectionsService();
      const origin = new g.maps.LatLng(this.FIREHOUSE.lat, this.FIREHOUSE.lon);
      const destination = new g.maps.LatLng(lat, lon);

      const result: any = await new Promise((resolve, reject) => {
        svc.route(
          { origin, destination, travelMode: g.maps.TravelMode.DRIVING },
          (res: any, status: any) => (status === 'OK' ? resolve(res) : reject(status))
        );
      });

      const path = result?.routes?.[0]?.overview_path;
      const leg = result?.routes?.[0]?.legs?.[0];
      this.routeLatLngs = path?.length ? path.map((p: any) => [p.lat(), p.lng()]) : [];
      this.etaMinutes = leg?.duration?.value != null ? Math.max(1, Math.round(leg.duration.value / 60)) : null;

      // Geocoder (formatierte Adresse)
      const geocoder = new g.maps.Geocoder();
      const geoRes: any = await new Promise((resolve, reject) => {
        geocoder.geocode({ location: { lat, lng: lon } }, (res: any, status: any) =>
          status === 'OK' ? resolve(res) : reject(status)
        );
      });
      this.displayAddress = Array.isArray(geoRes) && geoRes[0]?.formatted_address
        ? geoRes[0].formatted_address
        : null;

      this.routeStatus = 'ok';
      this.lastRouteKey = sig;
      this.ensureLeaflet(true);
    } catch {
      this.routeStatus = 'fail';
      this.ensureLeaflet(true);
    }
  }

  // ---------------- Leaflet (blauer Pfad + Flammen-Icon aus Assets) ----------------
 private ensureLeaflet(refreshTiles = false): void {
  const destLat = this.einsatz?.location?.x ?? null;
  const destLon = this.einsatz?.location?.y ?? null;
  if (destLat == null || destLon == null) return;

  const container = document.getElementById('leafletV2Map') as HTMLElement | null;
  if (!container) return;

  const tileUrl = () => `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png?ts=${this.bust}`;

  // 👉 Pfade zu den SVGs (ggf. anpassen, falls anderer Ort)
  const houseUrl = `assets/ffwh.svg?ts=${this.bust}`;
  const flameUrl = `assets/flame.svg?ts=${this.bust}`;

  // Feuerwehrhaus-Icon
  const houseIcon = L.icon({
    iconUrl: houseUrl,
    iconSize: [45, 45],      // Größe nach Geschmack
    iconAnchor: [23, 18],    // „Fuß“ sitzt am Standort
    tooltipAnchor: [0, -40],
    className: 'ffwh-svg-icon'
  });

  // Einsatz-Flammen-Icon
  const flameIcon = L.icon({
    iconUrl: flameUrl,
    iconSize: [45, 45],
    iconAnchor: [23, 23],
    tooltipAnchor: [0, -44],
    className: 'flame-svg-icon'
  });

  if (!this.mapInited) {
    this.map = L.map(container, { zoomControl: false, attributionControl: true });
    this.tileLayer = L.tileLayer(tileUrl(), {
      maxZoom: 20,
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    // Start (FF-Haus) als Marker mit SVG
    this.startMarker = L.marker([this.FIREHOUSE.lat, this.FIREHOUSE.lon], { icon: houseIcon })
      .addTo(this.map)
      .bindTooltip('Feuerwehrhaus', { direction: 'top' });

    // Ziel (Einsatzort) als Flammen-Icon
    this.endMarker = L.marker([destLat, destLon], { icon: flameIcon })
      .addTo(this.map)
      .bindTooltip('Einsatzort', { direction: 'top' });

    // Route in Blau
    this.routeLayer = L.polyline([], {
      color: '#1e90ff',
      weight: 6,
      opacity: 1.0,
      lineJoin: 'round',
      lineCap: 'round'
    }).addTo(this.map);

    this.mapInited = true;
    setTimeout(() => this.map!.invalidateSize(), 0);
  } else {
    if (refreshTiles && this.tileLayer) this.tileLayer.setUrl(tileUrl());

    // Icons ggf. neu setzen (falls Dateien/Größen geändert wurden)
    if ((this.startMarker as any)?.setIcon) (this.startMarker as L.Marker).setIcon(houseIcon);
    if (this.endMarker) this.endMarker.setIcon(flameIcon);

    // Positionen aktualisieren
    (this.startMarker as L.Marker)?.setLatLng([this.FIREHOUSE.lat, this.FIREHOUSE.lon]);
    this.endMarker?.setLatLng([destLat, destLon]);

    // Route-Stil sicherstellen
    this.routeLayer?.setStyle({ color: '#1e90ff', weight: 6, opacity: 1.0 });
  }

  // Routepunkte setzen (falls vorhanden)
  if (this.routeLayer) this.routeLayer.setLatLngs(this.routeLatLngs);

  // Karte passend zoomen
  const bounds = L.latLngBounds([
    [this.FIREHOUSE.lat, this.FIREHOUSE.lon],
    [destLat, destLon],
    ...(this.routeLatLngs as any)
  ]);
  this.map!.fitBounds(bounds.pad(0.15), { animate: false });
}


  // ---------------- NEU: Alternation Timer ----------------
  private updateAlternateTimer(): void {
    // immer aufräumen
    if (this.altTimer) { clearInterval(this.altTimer); this.altTimer = undefined; }

    // Nur alternieren, wenn Street View verfügbar
    if (!this.missingKey && this.svStatus === 'ok') {
      // Startansicht: Street View
      this.showStreetView = true;

      this.altTimer = setInterval(() => {
        // Falls SV zwischenzeitlich wegfällt → dauerhaft Karte
        if (this.svStatus !== 'ok') {
          this.zone.run(() => { this.showStreetView = false; });
          clearInterval(this.altTimer); this.altTimer = undefined;
          return;
        }

        // Toggle innerhalb der Angular-Zone, damit Template aktualisiert
        this.zone.run(() => {
          this.showStreetView = !this.showStreetView;
          if (!this.showStreetView) {
            // beim Wechsel zur Karte: Map sicher aktualisieren
            this.ensureLeaflet(false);
            setTimeout(() => this.map?.invalidateSize(), 50);
          }
        });
      }, this.ALT_INTERVAL_MS);
    } else {
      // Kein Street View → Karte
      this.showStreetView = false;
    }
  }

}
