import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function createStore(filename) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS documents (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));",
  );
  const get = db.prepare("SELECT data FROM documents WHERE kind=? AND id=?");
  const all = db.prepare(
    "SELECT data FROM documents WHERE kind=? ORDER BY rowid",
  );
  const put = db.prepare(
    "INSERT INTO documents(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
  );
  const remove = db.prepare("DELETE FROM documents WHERE kind=? AND id=?");
  return {
    get(kind, id) {
      const row = get.get(kind, String(id));
      return row ? JSON.parse(row.data) : null;
    },
    all(kind) {
      return all.all(kind).map((r) => JSON.parse(r.data));
    },
    put(kind, data) {
      put.run(kind, String(data.id), JSON.stringify(data));
      return data;
    },
    remove(kind, id) {
      remove.run(kind, String(id));
    },
    transaction(fn) {
      db.exec("BEGIN");
      try {
        const value = fn();
        db.exec("COMMIT");
        return value;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
}
