/** The App Router's second handler argument, for calling a route in a test. */
export function routeContext<P extends Record<string, string>>(params: P) {
  return { params: Promise.resolve(params) };
}
