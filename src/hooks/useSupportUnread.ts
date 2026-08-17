import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useSupportUnread() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const fetchCount = async () => {
      const { count } = await supabase
        .from("support_messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("sender_role", "admin")
        .eq("read_by_user", false);
      if (active) setUnread(count ?? 0);
    };

    fetchCount();

    const ch = supabase
      .channel("support-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_messages", filter: `user_id=eq.${user.id}` },
        () => fetchCount()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [user]);

  return unread;
}
