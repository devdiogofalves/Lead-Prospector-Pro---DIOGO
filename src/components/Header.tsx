import { LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <header className="w-full">
      <div className="px-4 md:px-6 py-3">
        <div className="flex items-center justify-end gap-3">
          {user && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50">
              <UserIcon className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                {user.email}
              </span>
            </div>
          )}
          <Button variant="outline" size="icon" onClick={handleSignOut} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
