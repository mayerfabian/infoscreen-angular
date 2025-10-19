// Zentrale Typen für LEA / Einsatz-Feed

export interface LeaFunction {
  id: string;
  shortname: string;
  name: string;
}

export interface LeaResponse {
  timestamp: number;
  basicresponse: 'Ja' | 'Nein' | string;
  freetext: string;
}

export interface LeaPerson {
  id: string;
  firstname: string;
  lastname: string;
  qualifications: any[];
  functions: LeaFunction[];
  response: LeaResponse | null;
}

export interface LeaLocation {
  // alles optional, weil die API Felder weglassen/leer lassen kann
  city?: string;
  zipcode?: string;
  street?: string;
  housenumber?: string;
  x?: number;
  y?: number;
  objectname?: string;
  additionalinfo?: string;
}

export interface Einsatz {
  id: string;
  eventtype: string;
  eventtypetext: string;
  additionalinformation?: string;
  alarmtime: number; // Unix ms
  alarmedalarmgroups?: any[];
  alarmedpersons?: LeaPerson[];
  additionaldivisions?: any[];
  location?: LeaLocation;
}

// Optionaler Wrapper, falls dein Endpoint so strukturiert ist
export interface LeaFeed {
  einsaetze?: Einsatz[];
}
