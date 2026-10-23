import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

interface Entry {
  style: string;
  confidence: number;
}

/** Remembers analysed thumbnails on disk so an interrupted run can resume. */
export class StyleCache {
  private items: Record<string, Entry> = {};
  private readonly tag: string;

  constructor(
    private readonly path: string,
    settings: unknown,
  ) {
    // Results are only reused when the style definitions and model are unchanged.
    this.tag = createHash("sha1").update(JSON.stringify(settings)).digest("hex").slice(0, 10);
    try {
      if (existsSync(path)) {
        const data = JSON.parse(readFileSync(path, "utf8")) as { tag: string; items: Record<string, Entry> };
        if (data.tag === this.tag) this.items = data.items;
      }
    } catch {
      /* unreadable cache: start fresh */
    }
  }

  get(id: string): Entry | undefined {
    return this.items[id];
  }
  set(id: string, entry: Entry) {
    this.items[id] = entry;
  }
  get size() {
    return Object.keys(this.items).length;
  }
  save() {
    try {
      writeFileSync(this.path, JSON.stringify({ tag: this.tag, items: this.items }));
    } catch {
      /* cache is best-effort */
    }
  }
}
