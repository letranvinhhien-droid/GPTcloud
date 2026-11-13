/** The same document-store contract as the local Node SQLite implementation. */
export function createDurableStore(storage) {
  const sql = storage.sql;
  sql.exec(
    "CREATE TABLE IF NOT EXISTS documents (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id))",
  );
  return {
    get(kind, id) {
      const [row] = sql
        .exec(
          "SELECT data FROM documents WHERE kind=? AND id=?",
          kind,
          String(id),
        )
        .toArray();
      return row ? JSON.parse(row.data) : null;
    },
    all(kind) {
      return sql
        .exec("SELECT data FROM documents WHERE kind=? ORDER BY rowid", kind)
        .toArray()
        .map((row) => JSON.parse(row.data));
    },
    put(kind, data) {
      sql
        .exec(
          "INSERT INTO documents(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
          kind,
          String(data.id),
          JSON.stringify(data),
        )
        .toArray();
      return data;
    },
    remove(kind, id) {
      sql
        .exec("DELETE FROM documents WHERE kind=? AND id=?", kind, String(id))
        .toArray();
    },
    transaction(fn) {
      return storage.transactionSync(fn);
    },
    close() {},
  };
}
