import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withJsonpSupport } from '@angular/common/http';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDeAT from '@angular/common/locales/de-AT';
import { routes } from './app/app.routes';
import { InfoscreenComponent } from './app/infoscreen/infoscreen.component';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';

registerLocaleData(localeDeAT);

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withJsonpSupport()),
    { provide: LOCALE_ID, useValue: 'de-AT' }, // globale Locale
  ],
}).catch(err => console.error(err));