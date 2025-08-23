import { expect, test } from "bun:test";
import HTTP from "./http";
import Tracker from "./tracker";

test("Can parse metadata over http", async () => {
  const http = new HTTP();
  const trackerInfo = await new Promise((resolve, reject) =>
    http.handle(
      new Tracker(["udp://tracker.leechers-paradise.org:6969"]),
      {info_hash:},
      null,
      (trackerInfo, error) => (error ? reject(error) : resolve(trackerInfo))
    )
  );

  expect(trackerInfo).toMatchObject({});
});
