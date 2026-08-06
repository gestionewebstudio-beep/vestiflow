/** Minimo location incluse nel contratto tenant. */
export const TENANT_LICENSED_LOCATION_MIN = 1;

/** Massimo location incluse nel contratto tenant. */
export const TENANT_LICENSED_LOCATION_MAX = 10;

export const TENANT_LICENSED_LOCATION_OPTIONS = Array.from(
  { length: TENANT_LICENSED_LOCATION_MAX - TENANT_LICENSED_LOCATION_MIN + 1 },
  (_, index) => TENANT_LICENSED_LOCATION_MIN + index,
);
