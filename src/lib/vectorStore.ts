// src/lib/vectorStore.ts
import fs from "fs";
import path from "path";

export type VectorEntry = {
  id: string;
  embedding: number[]; // floats
  text: string;
  meta?: Record<string, any>;
};

const STORE_PATH = path.join(process.cwd(), "vectors.json");

class VectorStore {
  store: VectorEntry[] = [];

  constructor() {
    this.load();
  }

  add(entries: VectorEntry[]) {
    this.store.push(...entries);
    this.save();
  }

  all() {
    return this.store;
  }

  clear() {
    this.store = [];
    this.save();
  }

  save() {
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.store));
    } catch (e) {
      console.error("VectorStore save error:", e);
    }
  }

  load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, "utf8");
        this.store = JSON.parse(raw);
      } else {
        this.store = [];
      }
    } catch (e) {
      console.error("VectorStore load error:", e);
      this.store = [];
    }
  }
}

export const vectorStore = new VectorStore();
