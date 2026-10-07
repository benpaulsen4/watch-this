import { describe, expect, it } from "vitest";

import { environValue, listeningInodes } from "./server-guard";

// Two sockets on port 3100 (0x0C1C): one listening (state 0A), one an
// established connection (01); and a listener on another port.
const TCP6 = [
  "  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode",
  "   0: 00000000000000000000000000000000:0C1C 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 424242 1 0000000000000000 100 0 0 10 0",
  "   1: 0000000000000000FFFF00000100007F:0C1C 0000000000000000FFFF00000100007F:D2A4 01 00000000:00000000 00:00000000 00000000  1000        0 515151 1 0000000000000000 20 4 30 10 -1",
  "   2: 00000000000000000000000000000000:1F90 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 616161 1 0000000000000000 100 0 0 10 0",
].join("\n");

describe("listeningInodes", () => {
  it("finds only the listening socket on the port", () => {
    expect(listeningInodes(TCP6, 3100)).toEqual(["424242"]);
    expect(listeningInodes(TCP6, 8080)).toEqual(["616161"]);
  });

  it("finds nothing on a quiet port or in an empty table", () => {
    expect(listeningInodes(TCP6, 3200)).toEqual([]);
    expect(listeningInodes("", 3100)).toEqual([]);
  });
});

describe("environValue", () => {
  const environ = ["PATH=/usr/bin", "DATABASE_URL=postgresql://e2e:e2e@localhost:5433/watchthis_e2e?sslmode=disable", "EMPTY=", ""].join("\0");

  it("reads a variable, keeping any '=' in its value", () => {
    expect(environValue(environ, "DATABASE_URL")).toBe("postgresql://e2e:e2e@localhost:5433/watchthis_e2e?sslmode=disable");
    expect(environValue("A=b=c", "A")).toBe("b=c");
  });

  it("tells an empty value from an unset one", () => {
    expect(environValue(environ, "EMPTY")).toBe("");
    expect(environValue(environ, "DATABASE")).toBeNull();
  });
});
