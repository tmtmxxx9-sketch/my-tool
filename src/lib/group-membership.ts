import type { SupabaseClient } from "@supabase/supabase-js";
import { BulkInsertError, formatSupabaseError } from "@/lib/client-error";

const DEFAULT_GROUP_SLUG = "couple";

export { formatSupabaseError };

export async function resolveUserGroupId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: membership, error: membershipError } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new BulkInsertError(
      `所属グループの取得に失敗しました: ${formatSupabaseError(membershipError)}`,
      { responseBody: membershipError },
    );
  }

  if (membership?.group_id) {
    return membership.group_id;
  }

  const { data: defaultGroup, error: groupError } = await supabase
    .from("groups")
    .select("id")
    .eq("slug", DEFAULT_GROUP_SLUG)
    .maybeSingle();

  if (groupError || !defaultGroup?.id) {
    throw new BulkInsertError(
      "所属グループが見つかりません。Supabase SQL Editor で schema.sql を実行してください。",
      {
        responseBody: {
          userId,
          details: groupError ? formatSupabaseError(groupError) : undefined,
        },
      },
    );
  }

  const { error: joinError } = await supabase.from("group_members").insert({
    group_id: defaultGroup.id,
    user_id: userId,
    role: "member",
  });

  if (!joinError) {
    return defaultGroup.id;
  }

  const { data: retryMembership, error: retryError } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (retryMembership?.group_id) {
    return retryMembership.group_id;
  }

  throw new BulkInsertError(
    `グループへの参加に失敗しました: ${formatSupabaseError(joinError)}（user_id: ${userId}）`,
    {
      responseBody: {
        userId,
        joinError,
        retryError: retryError ? formatSupabaseError(retryError) : undefined,
      },
    },
  );
}
