// JSON Schema the model must return. One shape covers every document type.
// Structured outputs require additionalProperties:false on every object and
// every property listed in `required`; optional values are typed as nullable.

const nullableString = { type: ["string", "null"] } as const;
const nullableNumber = { type: ["number", "null"] } as const;

export const ITEM_KINDS = ["flight", "stay", "transport", "activity", "meal", "note"] as const;
export const DOCUMENT_TYPES = ["flight", "stay", "transport", "activity", "meal", "other"] as const;

export const extractionSchema = {
  type: "object",
  properties: {
    document_type: { type: "string", enum: [...DOCUMENT_TYPES] },
    provider: nullableString,
    booking_reference: nullableString,
    travellers: { type: "array", items: { type: "string" } },
    total_cost: {
      type: "object",
      properties: { amount: nullableNumber, currency: nullableString },
      required: ["amount", "currency"],
      additionalProperties: false,
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...ITEM_KINDS] },
          title: { type: "string" },
          code: nullableString,
          from_name: nullableString,
          from_iata: nullableString,
          to_name: nullableString,
          to_iata: nullableString,
          starts_local: nullableString,
          starts_tz: nullableString,
          ends_local: nullableString,
          ends_tz: nullableString,
          location: nullableString,
          notes: nullableString,
        },
        required: [
          "kind", "title", "code", "from_name", "from_iata", "to_name", "to_iata",
          "starts_local", "starts_tz", "ends_local", "ends_tz", "location", "notes",
        ],
        additionalProperties: false,
      },
    },
    confidence: { type: "number" },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["document_type", "provider", "booking_reference", "travellers", "total_cost", "items", "confidence", "warnings"],
  additionalProperties: false,
} as const;

export type ExtractedItem = {
  kind: (typeof ITEM_KINDS)[number];
  title: string;
  code: string | null;
  from_name: string | null;
  from_iata: string | null;
  to_name: string | null;
  to_iata: string | null;
  starts_local: string | null;
  starts_tz: string | null;
  ends_local: string | null;
  ends_tz: string | null;
  location: string | null;
  notes: string | null;
};

export type Extraction = {
  document_type: (typeof DOCUMENT_TYPES)[number];
  provider: string | null;
  booking_reference: string | null;
  travellers: string[];
  total_cost: { amount: number | null; currency: string | null };
  items: ExtractedItem[];
  confidence: number;
  warnings: string[];
};

export const SYSTEM_PROMPT = `You read travel documents for a family holiday app and turn them into itinerary items.

You will receive one document: a booking confirmation, e-ticket, boarding pass, hotel voucher, tour ticket, transfer booking, restaurant reservation, or a photo or screenshot of one of these.

Return every distinct bookable thing in the document as an item. A return flight is two items. A three-night hotel stay is one "stay" item with starts_local at check-in and ends_local at check-out. A day tour is one "activity". If the document is not a travel booking at all, return no items and explain in warnings.

Times: write starts_local and ends_local as ISO 8601 with the local UTC offset printed or implied by the document (for example 2026-10-12T10:05:00+11:00), and give the IANA time zone of that place in starts_tz / ends_tz (for example Australia/Melbourne, Asia/Makassar). Flights depart in the origin's zone and arrive in the destination's zone. If a date has no time, use 00:00 and say so in notes. If the year is missing, infer it from context and mention that in warnings.

Titles are short and human: "QF43 Melbourne to Denpasar", "Alaya Resort Ubud", "Tegallalang rice terraces tour". Put seat numbers, baggage, pickup instructions and reference numbers in notes.

confidence is your overall confidence from 0 to 1 that the items are correct. Use warnings for anything a traveller should double-check: missing return legs, unclear dates, unreadable sections, multiple bookings in one file.`;
