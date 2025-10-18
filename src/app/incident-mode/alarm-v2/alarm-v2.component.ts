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

  // --- Street View ---
  readonly fov = 90;
  readonly pitch = 0;
  readonly headings = [0, 90, 180, 270];
  readonly STREETVIEW_RADIUS = 50; // m
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

  // Anzeige-Wechsel SV <-> Karte
  showStreetView = false;               // Start: Karte
  private ALT_MAP_MS = 15 * 1000;       // 15 s Karte
  private ALT_SV_MS  = 7 * 1000;        // 7 s StreetView
  private altTimer?: any;

  // Distanz-Schwelle
  private readonly DISTANCE_LIMIT_KM = 2;

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
    if (this.altTimer) clearTimeout(this.altTimer);
    this.map?.remove();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('einsatz' in changes) {
      const lat = this.einsatz?.location?.x;
      const lon = this.einsatz?.location?.y;
      this.coordString = (lat != null && lon != null) ? `${lat}, ${lon}` : '';
      this.coordError = null;

      if (!this.missingCoords) this.ensureLeaflet(true);
      this.checkStreetViewAvailability();   // setzt svStatus und danach Timer
      this.fetchRouteAndAddress();          // ETA + Adresse
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

  // Distanz in km zwischen Feuerwehrhaus und Ziel
  private distanceKm(): number | null {
    const dLat = this.einsatz?.location?.x;
    const dLon = this.einsatz?.location?.y;
    if (dLat == null || dLon == null) return null;

    const R = 6371; // km
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dφ = toRad(dLat - this.FIREHOUSE.lat);
    const dλ = toRad(dLon - this.FIREHOUSE.lon);
    const φ1 = toRad(this.FIREHOUSE.lat);
    const φ2 = toRad(dLat);

    const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /** Formatierte Distanz für die ETA-Blase */
  get distanceDisplay(): string | null {
    const d = this.distanceKm();
    if (d == null) return null;
    if (d < 1) {
      const m = Math.round(d * 1000);
      return `${m} m`;
    }
    const km = Math.round(d);
    return `${km} km`;
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
      // Status stabil → Timer prüfen
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
      this.refitMap(true); // nach Routing ggf. neu einpassen
    } catch {
      this.routeStatus = 'fail';
      this.ensureLeaflet(true);
      this.refitMap(true);
    }
  }

  // ---------------- Sichtbarkeit/Refit-Helper ----------------
  private isMapVisible(): boolean {
    const el = document.getElementById('leafletV2Map') as HTMLElement | null;
    if (!el) return false;
    const box = el.parentElement as HTMLElement | null; // .leaflet-box
    if (!box) return false;
    const cs = getComputedStyle(box);
    return cs.display !== 'none' && cs.opacity !== '0' && el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  private refitMap(force = false): void {
    if (!this.map) return;

    if (!force && !this.isMapVisible()) return;

    this.map.invalidateSize();

    const pts: L.LatLngExpression[] = [];
    pts.push([this.FIREHOUSE.lat, this.FIREHOUSE.lon]);

    const destLat = this.einsatz?.location?.x ?? null;
    const destLon = this.einsatz?.location?.y ?? null;
    if (destLat != null && destLon != null) pts.push([destLat, destLon]);

    if (this.routeLatLngs && this.routeLatLngs.length) {
      pts.push(...this.routeLatLngs);
    }

    if (pts.length >= 2) {
      const b = L.latLngBounds(pts as any);
      // dichteres Padding, danach noch eine Stufe näher (max. 18)
      this.map.fitBounds(b.pad(0.05), { animate: false, maxZoom: 18 });
      const curZ = this.map.getZoom() ?? 0;
      const center = b.getCenter();
      this.map.setView(center, Math.min(18, curZ ), { animate: false });
    } else if (destLat != null && destLon != null) {
      this.map.setView([destLat, destLon], 18, { animate: false });
    }
  }

  // ---------------- Leaflet (blauer Pfad + SVG-Icons) ----------------
  private ensureLeaflet(refreshTiles = false): void {
    const destLat = this.einsatz?.location?.x ?? null;
    const destLon = this.einsatz?.location?.y ?? null;
    if (destLat == null || destLon == null) return;

    const container = document.getElementById('leafletV2Map') as HTMLElement | null;
    if (!container) return;

    const tileUrl = () => `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png?ts=${this.bust}`;

    // SVGs (Pfad ggf. anpassen)
    const houseUrl = `assets/ffwh.svg?ts=${this.bust}`;
    const flameUrl = `assets/flame.svg?ts=${this.bust}`;

    const houseIcon = L.icon({
      iconUrl: houseUrl,
      iconSize: [45, 45],
      iconAnchor: [23, 18],
      tooltipAnchor: [0, -40],
      className: 'ffwh-svg-icon'
    });

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

      this.startMarker = L.marker([this.FIREHOUSE.lat, this.FIREHOUSE.lon], { icon: houseIcon })
        .addTo(this.map)
        .bindTooltip('Feuerwehrhaus', { direction: 'top' });

      this.endMarker = L.marker([destLat, destLon], { icon: flameIcon })
        .addTo(this.map)
        .bindTooltip('Einsatzort', { direction: 'top' });

      this.routeLayer = L.polyline([], {
        color: '#1e90ff',
        weight: 6,
        opacity: 1.0,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(this.map);

      this.mapInited = true;
    } else {
      if (refreshTiles && this.tileLayer) this.tileLayer.setUrl(tileUrl());

      if (this.startMarker) this.startMarker.setIcon(houseIcon).setLatLng([this.FIREHOUSE.lat, this.FIREHOUSE.lon]);
      if (this.endMarker)   this.endMarker.setIcon(flameIcon).setLatLng([destLat, destLon]);

      this.routeLayer?.setStyle({ color: '#1e90ff', weight: 6, opacity: 1.0 });
    }

    // Routepunkte aktualisieren
    if (this.routeLayer) this.routeLayer.setLatLngs(this.routeLatLngs);

    // Refit nur, wenn sichtbar – sonst später beim Umschalten
    this.refitMap(false);
  }

  // ---------------- Alternation Timer (SV <-> Karte) ----------------
  private updateAlternateTimer(): void {
    // Aufräumen
    if (this.altTimer) { clearTimeout(this.altTimer); this.altTimer = undefined; }

    // Distanz-Regel
    const dist = this.distanceKm();
    const tooFar = dist != null && dist > this.DISTANCE_LIMIT_KM;

    // Bedingungen prüfen: SV nur wenn verfügbar und nicht zu weit
    const canAlternate = !this.missingKey && this.svStatus === 'ok' && !tooFar;

    // Startansicht immer Karte
    this.showStreetView = false;
    requestAnimationFrame(() => {
      this.ensureLeaflet(false);
      this.refitMap(true);
    });

    if (!canAlternate) {
      // dauerhaft Karte
      return;
    }

    // Wechsel-Loop mit unterschiedlichen Phasenlängen (15s Map → 7s SV → 15s Map ...)
    const runCycle = () => {
      // Phase 1: MAP sichtbar (bereits aktiv). Nach ALT_MAP_MS → SV
      this.altTimer = setTimeout(() => {
        if (this.svStatus !== 'ok') return; // Sicherheit
        this.zone.run(() => {
          this.showStreetView = true;   // fade-in SV
        });

        // Phase 2: nach ALT_SV_MS → zurück zu MAP
        this.altTimer = setTimeout(() => {
          this.zone.run(() => {
            this.showStreetView = false; // fade zurück zu Map
            requestAnimationFrame(() => {
              this.ensureLeaflet(false);
              requestAnimationFrame(() => this.refitMap(true));
            });
          });
          runCycle();
        }, this.ALT_SV_MS);
      }, this.ALT_MAP_MS);
    };

    runCycle();
  }
}
