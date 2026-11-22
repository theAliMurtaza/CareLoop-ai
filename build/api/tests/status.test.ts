import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classify, type Range } from "../src/status.js";
import { seal, unseal } from "../src/crypto.js";
import { verifySignature } from "../src/automation.js";
import { createHmac } from "node:crypto";
const range: Range = {
  id: "range-test",
  test_code: "test",
  label: "Fixture",
  unit: "u",
  low: 10,
  high: 20,
  borderline_low: 9,
  borderline_high: 21,
  critical_low: 5,
  critical_high: 30,
  age_min: 18,
  age_max: 120,
  sex: "any",
  verification: "synthetic_only",
  version: 1,
  source_url: "https://example.test",
  source_label: "Synthetic test",
};
const observation = (value: number) => ({
  testCode: "test",
  value,
  unit: "u",
  evidence: `test ${value} u`,
  confidence: 1,
});
const context = { age: 35, sex: "female", synthetic: true };
describe("deterministic status boundaries", () => {
  for (const [value, status] of [
    [0, "critical"],
    [5, "critical"],
    [5.01, "low"],
    [8.99, "low"],
    [9, "borderline"],
    [9.99, "borderline"],
    [10, "normal"],
    [15, "normal"],
    [20, "normal"],
    [20.01, "borderline"],
    [21, "borderline"],
    [21.01, "high"],
    [29.99, "high"],
    [30, "critical"],
    [100, "critical"],
  ] as const)
    it(`${value} => ${status}`, () =>
      assert.equal(
        classify(observation(value), [range], context).status,
        status,
      ));
  it("never classifies a draft range", () =>
    assert.equal(
      classify(observation(15), [{ ...range, verification: "draft" }], context)
        .status,
      "unclassified",
    ));
  it("does not use synthetic ranges for real patients", () =>
    assert.equal(
      classify(observation(15), [range], { ...context, synthetic: false })
        .status,
      "unclassified",
    ));
  it("requires exact units, context, finite evidence and unambiguous matching", () => {
    for (const o of [
      { ...observation(15), unit: "other" },
      { ...observation(15), confidence: 0.8 },
      { ...observation(15), confidence: Number.NaN },
      { ...observation(15), confidence: 2 },
      { ...observation(15), evidence: "" },
      observation(Number.NaN),
      { ...observation(15), comparator: "<" as const },
    ])
      assert.equal(classify(o, [range], context).status, "unclassified");
    for (const age of [null, 17, 121])
      assert.equal(
        classify(observation(15), [range], { ...context, age }).status,
        "unclassified",
      );
    assert.equal(
      classify(observation(15), [range, range], context).status,
      "unclassified",
    );
  });
  it("fails closed on invalid ranges and sex mismatch", () => {
    assert.equal(
      classify(observation(15), [{ ...range, low: 25 }], context).status,
      "unclassified",
    );
    assert.equal(
      classify(observation(15), [{ ...range, sex: "male" }], context).status,
      "unclassified",
    );
  });
  it("escalates critical and out-of-range results without a model", () => {
    assert.equal(
      classify(observation(30), [range], context).escalation,
      "critical",
    );
    assert.equal(
      classify(observation(25), [range], context).escalation,
      "concerning",
    );
    assert.equal(classify(observation(15), [], context).escalation, "review");
    assert.equal(
      classify(observation(15), [range], context).escalation,
      "none",
    );
  });
  it("preserves normal interval membership over a deterministic sweep", () => {
    for (let i = 0; i < 1000; i++) {
      const value = i / 25;
      assert.equal(
        classify(observation(value), [range], context).status === "normal",
        value >= 10 && value <= 20,
      );
    }
  });
});
describe("encryption and webhook authenticity", () => {
  const key = "a".repeat(64);
  it("uses randomized authenticated encryption bound to record identity", () => {
    const a = seal({ value: 123 }, key, "record:a"),
      b = seal({ value: 123 }, key, "record:a");
    assert.notEqual(a, b);
    assert.deepEqual(unseal(a, key, "record:a"), { value: 123 });
    assert.throws(() => unseal(a, key, "record:b"));
    assert.throws(() => unseal(a.slice(0, -5) + "AAAAA", key, "record:a"));
  });
  it("rejects stale, altered and unsigned webhooks", () => {
    const now = Date.now(),
      timestamp = String(now),
      nonce = "abcdefghijklmnop",
      body = '{"kind":"escalation"}';
    const sig = createHmac("sha256", key)
      .update(`${timestamp}.${nonce}.${body}`)
      .digest("hex");
    assert.ok(verifySignature(key, timestamp, nonce, body, sig, now));
    assert.ok(!verifySignature(key, timestamp, nonce, body + " ", sig, now));
    assert.ok(!verifySignature(key, timestamp, nonce, body, sig, now + 301000));
  });
});
