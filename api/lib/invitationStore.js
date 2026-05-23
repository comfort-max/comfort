function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    /schema cache|does not exist|relation/i.test(msg)
  );
}

const INVITE_TABLES = ["invitations", "invitation"];

/**
 * Save or refresh a pending invitation row (service role). Throws if insert/update fails.
 */
export async function upsertPendingInvitation(admin, row, { invitationId } = {}) {
  const payload = {
    email: row.email,
    role: row.role,
    status: "pending",
    invited_by: row.invitedBy || "",
    expires_at: row.expiresAt,
    employee_id: row.employeeId ?? null,
    invited_name: row.invitedName ?? null,
  };

  let lastError = null;

  for (const table of INVITE_TABLES) {
    if (invitationId) {
      const { error } = await admin
        .from(table)
        .update({ ...payload, status: "pending" })
        .eq("id", invitationId);
      if (!error) return { table, id: invitationId };
      lastError = error;
      if (!isMissingRelationError(error)) break;
      continue;
    }

    await admin.from(table).delete().eq("email", row.email).eq("status", "pending");

    const { data, error } = await admin.from(table).insert(payload).select("id").single();
    if (!error) return { table, id: data?.id };
    lastError = error;
    if (!isMissingRelationError(error)) break;
  }

  throw new Error(
    lastError?.message ||
      "Could not save invitation record. Run supabase/migrations/20260525120000_fix_invitations_flow.sql in Supabase."
  );
}

/** Keep auth metadata in sync; do not create a profiles row until the user accepts. */
export async function syncInvitedAuthMetadata(admin, userId, { role, fullName, email }) {
  if (!userId) return;
  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      role: role || "user",
      full_name: fullName || "",
      invite_pending: true,
    },
  });
  if (error) {
    console.warn("syncInvitedAuthMetadata:", error.message);
  }
  // Remove premature profile row if another trigger created one.
  await admin.from("profiles").delete().eq("id", userId);
}

/** After an admin assigns a role in User Management, keep auth metadata aligned. */
export async function syncUserAuthRole(admin, userId, { role, fullName }) {
  if (!userId) return;
  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      role: role || "user",
      full_name: fullName || "",
      invite_pending: false,
    },
  });
  if (error) {
    throw new Error(error.message || "Could not sync auth user metadata");
  }
}

/** Remove stale pending invitations so login claim cannot revert the role. */
export async function clearPendingInvitationsForEmail(admin, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return;

  for (const table of INVITE_TABLES) {
    const { error } = await admin.from(table).delete().eq("email", normalized).eq("status", "pending");
    if (error && !isMissingRelationError(error)) {
      console.warn(`clearPendingInvitationsForEmail (${table}):`, error.message);
    }
  }
}

async function findAuthUserByEmail(admin, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;

  let page = 1;
  const perPage = 200;
  while (page <= 25) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message || "Could not list auth users");
    const match = (data?.users || []).find(
      (u) => String(u.email || "").trim().toLowerCase() === normalized
    );
    if (match) return match;
    if (!data?.users?.length || data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function markInvitationAccepted(admin, invitationId, email) {
  const normalized = String(email || "").trim().toLowerCase();
  let lastError = null;

  for (const table of INVITE_TABLES) {
    if (invitationId) {
      const { error } = await admin.from(table).update({ status: "accepted" }).eq("id", invitationId);
      if (!error) return;
      lastError = error;
      if (!isMissingRelationError(error)) break;
      continue;
    }
    if (normalized) {
      const { error } = await admin
        .from(table)
        .update({ status: "accepted" })
        .eq("email", normalized)
        .eq("status", "pending");
      if (!error) return;
      lastError = error;
      if (!isMissingRelationError(error)) break;
    }
  }

  if (lastError && !isMissingRelationError(lastError)) {
    throw new Error(lastError.message || "Could not mark invitation accepted");
  }
}

/**
 * Admin manual approval: create profile, sync auth metadata, mark invitation accepted.
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {{ id?: string, email: string, role?: string, invited_name?: string | null }} invitation
 */
export async function approvePendingInvitation(admin, invitation) {
  const email = String(invitation.email || "").trim().toLowerCase();
  if (!email) throw new Error("Invitation email is required");

  const role = String(invitation.role || "user").trim() || "user";
  const fullName = String(invitation.invited_name || email.split("@")[0] || "").trim() || email.split("@")[0];

  const authUser = await findAuthUserByEmail(admin, email);
  if (!authUser?.id) {
    throw new Error(
      "No login account exists for this email yet. Resend the invitation so Supabase creates the account, then approve again."
    );
  }

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .upsert(
      {
        id: authUser.id,
        email,
        full_name: fullName,
        role,
      },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (profileErr || !profile) {
    throw new Error(profileErr?.message || "Could not create user profile");
  }

  await syncUserAuthRole(admin, authUser.id, { role, fullName });
  await markInvitationAccepted(admin, invitation.id, email);

  return profile;
}
