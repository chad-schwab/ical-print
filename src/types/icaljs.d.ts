declare module "ical.js" {
  // Minimal declarations used by the project
  export function parse(s: string): any;
  export class Component {
    constructor(jcal: any);
    getAllSubcomponents(name: string): any[];
  }
  export class Event {
    constructor(component: any);
    uid: string;
    summary?: string | null;
    description?: string | null;
    location?: string | null;
    startDate?: { toJSDate(): Date } | null;
    endDate?: { toJSDate(): Date } | null;
  }
}
