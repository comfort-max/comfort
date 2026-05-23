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
