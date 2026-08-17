import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConfirmDeleteAllDialogProps {
  trigger: React.ReactNode;
  count: number;
  itemLabel?: string;
  onConfirm: () => void;
}

const KEYWORD = "DELETAR";

export function ConfirmDeleteAllDialog({
  trigger,
  count,
  itemLabel = "leads",
  onConfirm,
}: ConfirmDeleteAllDialogProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const ok = text.trim().toUpperCase() === KEYWORD;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setText("");
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir todos os {itemLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação <strong>não pode ser desfeita</strong>. {count} {itemLabel} serão
            excluídos permanentemente. Todas as exclusões ficam registradas em
            auditoria.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="confirm-delete-input" className="text-sm">
            Digite <span className="font-mono font-bold text-destructive">{KEYWORD}</span> para confirmar:
          </Label>
          <Input
            id="confirm-delete-input"
            autoFocus
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={KEYWORD}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ok}
            onClick={(e) => {
              if (!ok) {
                e.preventDefault();
                return;
              }
              onConfirm();
              setText("");
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            Excluir Todos
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}