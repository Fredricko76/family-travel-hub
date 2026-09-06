// Sample data for the "look around" preview. Nothing here touches Supabase.
import type { CheckIn, Extraction, ItineraryDay, ItineraryItem, Trip, TripDocument } from './types';

export const demoTrip: Trip = {
  id: 'demo-trip',
  name: 'Bali, October',
  destination: 'Ubud, Bali',
  start_date: '2026-10-12',
  end_date: '2026-10-19',
  created_by: 'demo-user',
};

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const demoDays: ItineraryDay[] = dateRange(demoTrip.start_date, demoTrip.end_date).map((day_date, i) => ({
  id: `demo-day-${i + 1}`,
  trip_id: demoTrip.id,
  day_date,
  headline: null,
}));

const day = (n: number) => demoDays[n - 1].id;
const bali = 'Asia/Makassar';

export const demoItems: ItineraryItem[] = [
  {
    id: 'demo-item-1', trip_id: demoTrip.id, day_id: day(1), kind: 'flight',
    title: 'QF43 Melbourne to Denpasar',
    starts_at: '2026-10-11T23:05:00Z', starts_tz: 'Australia/Melbourne',
    ends_at: '2026-10-12T05:25:00Z', ends_tz: bali,
    location: 'Melbourne Tullamarine, Terminal 1', city: 'Denpasar', notes: 'K7Q2XR · MEL → DPS · Seats 23A-D · 30 kg baggage each',
    sort_order: 0, document_id: 'demo-doc-1',
  },
  {
    id: 'demo-item-2', trip_id: demoTrip.id, day_id: day(1), kind: 'transport',
    title: 'Private transfer to Ubud',
    starts_at: '2026-10-12T06:30:00Z', starts_tz: bali, ends_at: null, ends_tz: null,
    location: 'DPS arrivals hall', city: null, notes: 'Driver holds a sign with the family name',
    sort_order: 1, document_id: null,
  },
  {
    id: 'demo-item-3', trip_id: demoTrip.id, day_id: day(3), kind: 'meal',
    title: 'Breakfast at the villa',
    starts_at: '2026-10-13T23:30:00Z', starts_tz: bali, ends_at: null, ends_tz: null,
    location: null, city: null, notes: null, sort_order: 0, document_id: null,
  },
  {
    id: 'demo-item-4', trip_id: demoTrip.id, day_id: day(3), kind: 'activity',
    title: 'Tegallalang rice terraces',
    starts_at: '2026-10-14T01:00:00Z', starts_tz: bali, ends_at: null, ends_tz: null,
    location: 'Tegallalang', city: null, notes: 'Driver booked · bring sunscreen', sort_order: 1, document_id: null,
  },
  {
    id: 'demo-item-5', trip_id: demoTrip.id, day_id: day(3), kind: 'meal',
    title: 'Lunch, Ubud centre',
    starts_at: '2026-10-14T04:30:00Z', starts_tz: bali, ends_at: null, ends_tz: null,
    location: 'Jalan Raya Ubud', city: null, notes: null, sort_order: 2, document_id: null,
  },
  {
    id: 'demo-item-6', trip_id: demoTrip.id, day_id: day(3), kind: 'activity',
    title: 'Sacred Monkey Forest',
    starts_at: '2026-10-14T07:00:00Z', starts_tz: bali, ends_at: null, ends_tz: null,
    location: 'Ubud', city: null, notes: 'Tickets ref MF-88213', sort_order: 3, document_id: null,
  },
  {
    id: 'demo-item-7', trip_id: demoTrip.id, day_id: day(3), kind: 'meal',
    title: 'Dinner booking for 4',
    starts_at: '2026-10-14T11:00:00Z', starts_tz: bali, ends_at: null, ends_tz: null,
    location: 'Ubud', city: null, notes: 'Confirmation extracted from email PDF', sort_order: 4, document_id: null,
  },
  {
    id: 'demo-item-8', trip_id: demoTrip.id, day_id: day(8), kind: 'flight',
    title: 'QF44 Denpasar to Melbourne',
    starts_at: '2026-10-19T06:35:00Z', starts_tz: bali,
    ends_at: '2026-10-19T13:35:00Z', ends_tz: 'Australia/Melbourne',
    location: 'Denpasar Ngurah Rai', city: null, notes: 'K7Q2XR · DPS → MEL', sort_order: 0, document_id: 'demo-doc-1',
  },
];

export const demoDocuments: TripDocument[] = [
  {
    id: 'demo-doc-1', trip_id: demoTrip.id, storage_path: null, original_name: 'Qantas e-ticket K7Q2XR.pdf',
    mime_type: 'application/pdf', size_bytes: 184_000, status: 'accepted', error_message: null,
    created_at: '2026-09-01T03:12:00Z',
  },
  {
    id: 'demo-doc-2', trip_id: demoTrip.id, storage_path: null, original_name: 'Alaya Resort booking.pdf',
    mime_type: 'application/pdf', size_bytes: 96_000, status: 'ready_for_review', error_message: null,
    created_at: '2026-09-03T09:40:00Z',
  },
];

export const demoCheckIns: CheckIn[] = [
  {
    id: 'demo-check-1', trip_id: demoTrip.id, item_id: 'demo-item-1', user_id: 'demo-user', status: 'done',
    checked_at: '2026-10-11T23:20:00Z', note: null, profiles: { display_name: 'You' },
  },
  {
    id: 'demo-check-2', trip_id: demoTrip.id, item_id: 'demo-item-2', user_id: 'demo-user', status: 'done',
    checked_at: '2026-10-12T06:40:00Z', note: null, profiles: { display_name: 'You' },
  },
];

export const demoExtraction: Extraction = {
  document_type: 'stay',
  provider: 'Alaya Resort Ubud',
  booking_reference: 'ALY-20261012-4471',
  travellers: ['2 adults', '2 children'],
  total_cost: { amount: 1890, currency: 'AUD' },
  items: [
    {
      kind: 'stay', title: 'Alaya Resort Ubud, deluxe family room',
      code: 'ALY-20261012-4471', from_name: null, from_iata: null, to_name: null, to_iata: null,
      starts_local: '2026-10-12T15:00:00+08:00', starts_tz: bali,
      ends_local: '2026-10-19T11:00:00+08:00', ends_tz: bali,
      location: 'Jalan Hanoman, Ubud', city: 'Ubud', notes: 'Check-in from 15:00, check-out by 11:00. Airport transfer included.',
    },
    {
      kind: 'transport', title: 'Resort transfer to airport',
      code: null, from_name: 'Alaya Resort Ubud', from_iata: null, to_name: 'Denpasar Ngurah Rai', to_iata: 'DPS',
      starts_local: '2026-10-19T11:30:00+08:00', starts_tz: bali, ends_local: null, ends_tz: null,
      location: 'Resort lobby', city: null, notes: 'Included in the booking',
    },
  ],
  confidence: 0.91,
  warnings: ['Breakfast inclusion is not stated on the voucher'],
};
