-- A document uploaded to keep for reference (tickets, visas, receipts), not read into the itinerary.
alter type public.document_status add value if not exists 'kept';
