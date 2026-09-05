// extract-document
// Called by the app after a file has been uploaded to the `documents` bucket.
// Body: { document_id: string }
// Reads the file, asks Claude for schema-validated itinerary items, stores the
// result in `extractions`, and moves the document to `ready_for_review`.
//
// Secrets required (supabase secrets set ...):
//   ANTHROPIC_API_KEY
// Provided automatically by the platform:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { encodeBase64 } from "@std/encoding/base64";
import { extractionSchema, SYSTEM_PROMPT, type Extraction } from "./schema.ts";

const MODEL = "claude-opus-5";
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Client acting as the caller: every read goes through row-level security.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  // Client for privileged writes (extractions) and file download.
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Not signed in" }, 401);

  let documentId: string | undefined;
  try {
    ({ document_id: documentId } = await req.json());
  } catch {
    return json({ error: "Body must be JSON with document_id" }, 400);
  }
  if (!documentId) return json({ error: "document_id is required" }, 400);

  // RLS guarantees the caller is a member of the document's trip.
  const { data: doc, error: docError } = await userClient
    .from("documents")
    .select("id, trip_id, storage_path, mime_type, original_name, status")
    .eq("id", documentId)
    .single();
  if (docError || !doc) return json({ error: "Document not found or no access" }, 404);
  if (!doc.storage_path) return json({ error: "Document has no file yet" }, 409);

  // Only editors may run extraction (same rule as uploading).
  const { data: canEdit } = await userClient.rpc("can_edit_trip", { p_trip: doc.trip_id });
  if (!canEdit) return json({ error: "Viewers cannot run extraction" }, 403);

  await admin.from("documents").update({ status: "queued", error_message: null }).eq("id", doc.id);

  try {
    const { data: file, error: fileError } = await admin.storage.from("documents").download(doc.storage_path);
    if (fileError || !file) throw new Error(`Could not read file: ${fileError?.message ?? "unknown"}`);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const data = encodeBase64(bytes);
    const mime = (doc.mime_type ?? file.type ?? "application/pdf").toLowerCase();

    let fileBlock: Anthropic.Messages.ContentBlockParam;
    if (mime === "application/pdf") {
      fileBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
    } else if (SUPPORTED_IMAGE_TYPES.has(mime)) {
      fileBlock = {
        type: "image",
        source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data },
      };
    } else {
      throw new Error(`Unsupported file type ${mime}. Upload a PDF, JPEG, PNG or WebP.`);
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    // Structured outputs make the reply match extractionSchema exactly.
    // `fallbacks: "default"` re-runs on another model if a safety classifier
    // declines the request; the SDK types may lag this parameter, hence the cast.
    const params = {
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: extractionSchema },
      },
      messages: [
        {
          role: "user",
          content: [
            fileBlock,
            {
              type: "text",
              text: `Original filename: ${doc.original_name ?? "unknown"}. Extract every booking in this document.`,
            },
          ],
        },
      ],
      // deno-lint-ignore no-explicit-any
    } as any;

    const response = await anthropic.beta.messages.create(params);

    if (response.stop_reason === "refusal") {
      throw new Error("The model declined to read this document.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("The document was too long to extract in one pass.");
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const result = JSON.parse(text) as Extraction;

    // Light sanity checks on top of the schema. Anything odd becomes a warning.
    const warnings = [...result.warnings];
    for (const item of result.items) {
      if (item.starts_local && Number.isNaN(Date.parse(item.starts_local))) {
        warnings.push(`Could not parse start time for "${item.title}": ${item.starts_local}`);
        item.starts_local = null;
      }
      if (item.ends_local && Number.isNaN(Date.parse(item.ends_local))) {
        warnings.push(`Could not parse end time for "${item.title}": ${item.ends_local}`);
        item.ends_local = null;
      }
    }
    if (result.items.length === 0 && warnings.length === 0) {
      warnings.push("No bookings were found in this document.");
    }

    const { data: extraction, error: insertError } = await admin
      .from("extractions")
      .insert({
        document_id: doc.id,
        model: response.model ?? MODEL,
        result,
        warnings,
        input_tokens: response.usage?.input_tokens ?? null,
        output_tokens: response.usage?.output_tokens ?? null,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    await admin.from("documents").update({ status: "ready_for_review" }).eq("id", doc.id);

    return json({ extraction_id: extraction.id, result: { ...result, warnings } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("extract-document failed", { documentId, message });
    await admin.from("documents").update({ status: "failed", error_message: message }).eq("id", doc.id);
    return json({ error: message }, 500);
  }
});
