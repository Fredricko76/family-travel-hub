// manage-users
// App-admin actions that need the service role: create a user with a
// starting password, change their app role, remove them.
// Body: { action: "create", email, display_name, password, app_role, trips: [{ trip_id, role }] }
//       { action: "set_role", user_id, app_role }
//       { action: "delete", user_id }

import { createClient } from "@supabase/supabase-js";

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

type TripAssignment = { trip_id: string; role: "editor" | "viewer" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Not signed in" }, 401);
  const callerId = userData.user.id;

  const { data: isAdmin } = await userClient.rpc("is_app_admin");
  if (!isAdmin) return json({ error: "Only an app admin can manage users" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  try {
    if (body.action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const displayName = String(body.display_name ?? "").trim();
      const appRole = body.app_role === "admin" ? "admin" : "member";
      const trips = (Array.isArray(body.trips) ? body.trips : []) as TripAssignment[];
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That does not look like an email address.");
      if (password.length < 6) throw new Error("The starting password needs at least 6 characters.");
      if (!displayName) throw new Error("Give the person a name.");

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
      if (createError) throw createError;
      const newId = created.user.id;

      await admin.from("profiles").update({ app_role: appRole, display_name: displayName }).eq("id", newId);
      if (trips.length > 0) {
        const rows = trips.map((t) => ({
          trip_id: t.trip_id,
          user_id: newId,
          role: t.role === "editor" ? "editor" : "viewer",
          is_traveller: true,
        }));
        const { error: memberError } = await admin.from("trip_members").upsert(rows, { onConflict: "trip_id,user_id" });
        if (memberError) throw memberError;
      }
      return json({ user_id: newId });
    }

    if (body.action === "set_role") {
      const userId = String(body.user_id ?? "");
      const appRole = body.app_role === "admin" ? "admin" : "member";
      if (userId === callerId && appRole !== "admin") throw new Error("You cannot remove your own admin access.");
      const { error } = await admin.from("profiles").update({ app_role: appRole }).eq("id", userId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "set_trips") {
      const userId = String(body.user_id ?? "");
      const trips = (Array.isArray(body.trips) ? body.trips : []) as TripAssignment[];
      const { error: clearError } = await admin.from("trip_members").delete().eq("user_id", userId).neq("role", "owner");
      if (clearError) throw clearError;
      if (trips.length > 0) {
        const rows = trips.map((t) => ({ trip_id: t.trip_id, user_id: userId, role: t.role === "editor" ? "editor" : "viewer", is_traveller: true }));
        const { error } = await admin.from("trip_members").upsert(rows, { onConflict: "trip_id,user_id" });
        if (error) throw error;
      }
      return json({ ok: true });
    }

    if (body.action === "reset_password") {
      const userId = String(body.user_id ?? "");
      const password = String(body.password ?? "");
      if (password.length < 6) throw new Error("The new password needs at least 6 characters.");
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "delete") {
      const userId = String(body.user_id ?? "");
      if (userId === callerId) throw new Error("You cannot remove yourself.");
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 400);
  }
});
