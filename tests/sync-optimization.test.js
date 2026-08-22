"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { FirebaseSyncService } = require("../app/main/sync/firebase-sync-service");

test("Firebase no escribe una instantánea si no hay cambios locales pendientes", async () => {
  let fetchCalls = 0;
  const databaseService = {
    assertReady() {},
    database: {
      prepare(sql) {
        assert.match(sql, /sync_queue/);
        return { get: () => ({ total: 0 }) };
      }
    }
  };
  const service = new FirebaseSyncService({
    databaseService,
    userDataPath: ".",
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("No debería llamar a Firebase");
    },
    config: { apiKey: "test", projectId: "test", collection: "test" }
  });

  const result = await service.pushSnapshot({ deviceId: "device-1" }, "1.1.0");
  assert.equal(result.skipped, true);
  assert.equal(result.pushedRecords, 0);
  assert.equal(fetchCalls, 0);
});
