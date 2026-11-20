/**
 * npm run smoke:llm — does the gateway enforce response_format json_schema? (ADR 0009 §13)
 *
 * Asks a question whose natural answer looks nothing like the schema, with a schema the model
 * would never follow unprompted. An enforcing gateway returns the schema's shape anyway; one that
 * ignores it returns whatever the model likes. Reads the same LLM_* variables as the app (from
 * .env.local when it exists). Only the server can reach the gateway.
 */
import { AiError, createClient } from "../src/ai/client";
import { readLlmConfig } from "../src/ai/config";

const CODEWORD = "zanzibar-17";
const schema = {
  type: "object",
  properties: { codeword: { type: "string", enum: [CODEWORD] }, petals: { type: "integer", minimum: 40, maximum: 40 } },
  required: ["codeword", "petals"],
  additionalProperties: false,
};

function followsSchema(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return false;
    return "codeword" in value && value.codeword === CODEWORD && "petals" in value && value.petals === 40 && Object.keys(value).length === 2;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  const result = readLlmConfig();
  if (!result.ok) {
    console.error(`Not configured: ${result.problem}.`);
    return 1;
  }
  const client = createClient(result.config);
  console.log(`Gateway ${result.config.baseUrl}, model "${result.config.model}"`);
  try {
    const reply = await client.complete({
      messages: [{ role: "user", content: "In one short JSON object, describe the colour of the sky at noon." }],
      temperature: 0,
      maxTokens: 100,
      responseFormat: { type: "json_schema", json_schema: { name: "smoke", schema, strict: true } },
    });
    console.log(`Reply: ${reply.slice(0, 200)}`);
    if (followsSchema(reply)) {
      console.log("Verdict: json_schema is ENFORCED. Set DEFAULT_RESPONSE_MODE in src/ai/config.ts to json_schema.");
    } else {
      console.log("Verdict: json_schema is NOT enforced. Keep the default response mode json_object.");
    }
    return 0;
  } catch (error) {
    // A gateway that refuses the format outright has answered the question too.
    if (error instanceof AiError && (error.status === 400 || error.status === 422)) {
      console.log(`Verdict: json_schema is NOT supported (the gateway refused it with HTTP ${error.status}). Keep json_object.`);
      return 0;
    }
    console.error(error instanceof AiError ? `Gateway error: ${error.message}` : `Failed: ${String(error)}`);
    return 1;
  }
}

void main().then((code) => {
  process.exitCode = code;
});
