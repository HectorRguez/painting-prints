@inline export function numberAt(base: usize, index: i32): f64 { return load<f64>(base + (<usize>index << 3)); }
