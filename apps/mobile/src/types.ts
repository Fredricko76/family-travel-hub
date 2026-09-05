export type TripRole = 'owner' | 'editor' | 'viewer';

export type DocumentStatus =
  | 'uploading'
  | 'queued'
  | 'ready_for_review'
  | 'accepted'
  | 'declined'
  | 'failed';

export type ItemKind = 'flight' | 'stay' | 'transport' | 'activity' | 'meal' | 'note';

export type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  created_by: string;
};

export type ItineraryDay = {
  id: string;
  trip_id: string;
  day_date: string;
  headline: string | null;
};

export type ItineraryItem = {
  id: string;
  trip_id: string;
  day_id: string;
  kind: ItemKind;
  title: string;
  starts_at: string | null;
  starts_tz: string | null;
  ends_at: string | null;
  ends_tz: string | null;
  location: string | null;
  notes: string | null;
  sort_order: number;
  document_id: string | null;
};

export type TripDocument = {
  id: string;
  trip_id: string;
  storage_path: string | null;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
};

// Mirrors supabase/functions/extract-document/schema.ts
export type ExtractedItem = {
  kind: ItemKind;
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
  document_type: 'flight' | 'stay' | 'transport' | 'activity' | 'meal' | 'other';
  provider: string | null;
  booking_reference: string | null;
  travellers: string[];
  total_cost: { amount: number | null; currency: string | null };
  items: ExtractedItem[];
  confidence: number;
  warnings: string[];
};

export type ExtractResponse = {
  extraction_id: string;
  result: Extraction;
};
