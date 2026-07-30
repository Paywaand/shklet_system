export type Lang = "en" | "ku";

export type Vars = Record<string, string | number>;

export type Entry = string | ((vars: Vars) => string);

export type Dict = { [key: string]: Entry | Dict };
