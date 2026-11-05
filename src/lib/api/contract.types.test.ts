import { expect, it } from "vitest";
import { z } from "zod";

import { api, ApiError, type ApiErrorCode, isApiError } from "./client";
import { defineContract, type Jsonify, schemas, type } from "./contract";
import { q } from "./query";

// `route.ts` loads the database, so its types are used without importing it.
declare const authedRoute: typeof import("./route").authedRoute;

const thingSchemas = {
  params: z.object({ id: z.uuid(), subId: z.string() }),
  query: z.object({ page: q.int().optional() }),
  body: z.object({ name: z.string() }),
};
const postThing = defineContract({
  method: "POST",
  path: "/api/things/[id]/sub/[subId]",
  label: "Post thing",
  schemas: schemas<typeof thingSchemas>(),
  response: type<{ when: Date; count: number }>(),
  errors: { nope: { status: 404, message: "No" } },
});
const listThings = defineContract({
  method: "GET",
  path: "/api/things",
  label: "List things",
  response: type<{ count: number }[]>(),
});
const _missingSub = { params: z.object({ id: z.string() }) };
const _staticParams = { params: z.object({ id: z.string() }) };

// Never called: this function exists for `tsc`. Each `@ts-expect-error` fails
// the typecheck if the line below it stops being a type error.
export async function typeChecks() {
  defineContract({
    method: "GET",
    path: "/api/a/[id]/[subId]",
    label: "x",
    // @ts-expect-error params must cover every path segment
    schemas: schemas<typeof _missingSub>(),
    response: type<{ a: 1 }>(),
  });
  // @ts-expect-error a path with segments needs a params schema
  defineContract({
    method: "GET",
    path: "/api/a/[id]",
    label: "x",
    response: type<{ a: 1 }>(),
  });
  defineContract({
    method: "GET",
    path: "/api/a",
    label: "x",
    // @ts-expect-error a static path cannot have params
    schemas: schemas<typeof _staticParams>(),
    response: type<{ a: 1 }>(),
  });
  // @ts-expect-error a response must be an object or array
  type<string>();

  authedRoute(postThing, thingSchemas, ({ params, query, body, user }) => {
    const subId: string = params.subId;
    const page: number | undefined = query.page;
    const name: string = body.name;
    const userId: string = user.id;
    void [subId, page, name, userId];
    return { when: new Date(), count: 1 };
  });
  authedRoute(postThing, thingSchemas, () => "nope" as const);
  authedRoute(postThing, thingSchemas, async () =>
    Math.random() > 2 ? ("nope" as const) : { when: new Date(), count: 1 },
  );
  // @ts-expect-error the schemas must be the ones the contract names
  authedRoute(postThing, {}, () => ({ when: new Date(), count: 1 }));
  // @ts-expect-error an undeclared error code does not compile
  authedRoute(postThing, thingSchemas, () => "conflict" as const);
  // @ts-expect-error the response must match the contract
  authedRoute(postThing, thingSchemas, () => ({ count: "1" }));

  const thing = await api(postThing, {
    params: { id: "1", subId: "2" },
    body: { name: "n" },
  });
  const when: string = thing.when;
  // @ts-expect-error a Date is a string on the wire
  const notADate: Date = thing.when;
  void [when, notADate];
  // @ts-expect-error input is required when the contract needs it
  await api(postThing);
  // @ts-expect-error body is required
  await api(postThing, { params: { id: "1", subId: "2" } });
  await api(postThing, {
    params: { id: "1", subId: "2" },
    query: { page: 3 },
    body: { name: "n" },
  });
  const things = await api(listThings);
  const count: number = things[0]!.count;
  void count;

  const error: unknown = new ApiError("nope", 404, "No");
  if (isApiError(error, postThing)) {
    const code: ApiErrorCode<typeof postThing> = error.code;
    void code;
    // @ts-expect-error not one of this contract's codes
    void (error.code === "somethingElse");
  }

  const jsonified: Jsonify<{ a: Date[]; b: { c: Date | null } }> = {
    a: ["2026-01-01"],
    b: { c: null },
  };
  void jsonified;
}

it("is checked by tsc", () => {
  expect(typeChecks).toBeTypeOf("function");
});
