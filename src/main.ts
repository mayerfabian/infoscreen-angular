import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withJsonpSupport } from '@angular/common/http';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDeAT from '@angular/common/locales/de-AT';

import { InfoscreenComponent } from './app/infoscreen/infoscreen.component';

registerLocaleData(localeDeAT);

bootstrapApplication(InfoscreenComponent, {
  providers: [
    provideHttpClient(withJsonpSupport()),
    { provide: LOCALE_ID, useValue: 'de-AT' }, // globale Locale
  ],
}).catch(err => console.error(err));