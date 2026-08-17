import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Conta mensagens de clientes (sender_role='user') ainda não lidas pelo admin. */
export function useAdminSupportUnread() {
  const { user } = useAuth();
  const isAdmin = user?.user_metadata?.is_admin === true;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;

    const fetchCount = async () => {
      const { count } = await supabase
        .from("support_messages")
        .select("*", { count: "exact", head: true })
        .eq("sender_role", "user")
        .eq("read_by_admin", false);
      if (active) setUnread(count ?? 0);
    };

    fetchCount();

    const ch = supabase
      .channel("support-admin-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_messages" },
        () => fetchCount()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [isAdmin]);

  return unread;
}
