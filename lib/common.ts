import {z} from "zod";
import YAML from "yaml";

export type JsonLiteral = string | number | boolean | null
export type JsonObject = { [key: string]: Json };
export type Json = JsonLiteral | JsonObject | Json[]
export const LiteralSchema: z.ZodType<JsonLiteral> = z.union([z.string(), z.number(), z.boolean(), z.null()])
export const JsonSchema: z.ZodType<Json> = z.lazy(() => z.union([LiteralSchema, JsonObjectSchema, z.array(JsonSchema)]))
export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(JsonSchema)

export const JsonTransformer = z.string().transform((str, ctx) => {
  try {
    return JSON.parse(str) as Json
  } catch (error: unknown) {
    ctx.addIssue({code: 'custom', message: (error as { message?: string }).message})
    return z.NEVER
  }
})

export const YamlTransformer = z.string().transform((str, ctx) => {
  try {
    return YAML.parse(str)
  } catch (error: unknown) {
    ctx.addIssue({code: 'custom', message: (error as { message?: string }).message})
    return z.NEVER
  }
})

/**
 * Returns a promise that resolves after the specified time
 * @param milliseconds
 */
export async function sleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Flatten objects and arrays to all its values including nested objects and arrays
 * @param values - value(s)
 * @returns flattened values
 */
export function getFlatValues(values: unknown): unknown[] {
  if (typeof values !== 'object' || values == null) {
    return [values]
  }

  if (Array.isArray(values)) {
    return values.flatMap(getFlatValues)
  }

  return getFlatValues(Object.values(values))
}
