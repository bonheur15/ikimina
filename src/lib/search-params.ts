// Helpers for reading page state from URL search params.
type Params = Record<string, string | string[] | undefined>;

export const param = (params: Params, key: string) => {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : (value ?? "")).trim().slice(0, 100);
};
export const pageParam = (params: Params) =>
  Math.min(Math.max(1, Number.parseInt(param(params, "page"), 10) || 1), 100_000);
export const oneOf = <T extends string>(params: Params, key: string, options: readonly T[], fallback: T) => {
  const value = param(params, key);
  return options.includes(value as T) ? (value as T) : fallback;
};
