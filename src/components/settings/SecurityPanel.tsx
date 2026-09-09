/**
 * Security — Console (UI v2). Password, sign out, account deletion.
 *
 * Handlers are the V1 panel's, unchanged — including the breached-password
 * check and the DELETE-typing confirmation, which stays because deletion is the
 * one irreversible control in the app and the work happens server-side in the
 * delete-account edge function.
 *
 * Two-factor enrolment and the data export are their own Sections between
 * these, each keeping its own state and its own calls.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, Trash2 } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { checkPwnedPassword } from "@/lib/pwned";
import { ExportDataCard } from "./ExportDataCard";
import { SecurityCard } from "./SecurityCard";
import { Button, Field, Input, Section } from "@/ui";

export function SecurityPanel() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || !confirmNewPassword) {
      toast({ title: "Error", description: "Please fill in both fields.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Error", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 10) {
      toast({
        title: "Error",
        description: "Use at least 10 characters with letters and numbers.",
        variant: "destructive",
      });
      return;
    }
    setChangingPassword(true);
    try {
      const pwned = await checkPwnedPassword(newPassword);
      if (pwned.breached) {
        toast({
          title: "Choose a different password",
          description: `This password has appeared in ${pwned.count.toLocaleString()} known data breaches. Please choose a different one.`,
          variant: "destructive",
        });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: "Signed out", description: "You have been signed out." });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE") {
      toast({ title: "Error", description: "Please type DELETE to confirm", variant: "destructive" });
      return;
    }
    setDeletingAccount(true);
    try {
      // The edge function derives the user from the JWT and removes the account
      // plus all of its data server-side; admin methods need the service role
      // key and can never run in the browser.
      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: { confirm: "DELETE" },
      });
      if (error) {
        let message = error.message || "Failed to delete account";
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch {
            // keep the generic message
          }
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);

      await supabase.auth.signOut();
      toast({ title: "Account deleted", description: "Your account has been permanently deleted." });
      navigate("/");
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <>
      <Section title="Password">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="New password" hint="At least 10 characters with letters and numbers.">
            <Input
              type="password"
              value={newPassword}
              minLength={10}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm password">
            <Input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="primary" onClick={handleChangePassword} disabled={changingPassword}>
            {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </Button>
        </div>
      </Section>

      <SecurityCard />
      <ExportDataCard />

      <Section title="Sign out" description="Sign out of your account on this device.">
        <Button onClick={handleSignOut} icon={<LogOut size={15} strokeWidth={1.75} />}>
          Sign out
        </Button>
      </Section>

      <Section
        title="Delete account"
        description="Permanently delete your account and all associated data. This cannot be undone."
      >
        <Button
          variant="destructive"
          onClick={() => setDeleteDialogOpen(true)}
          icon={<Trash2 size={15} strokeWidth={1.75} />}
        >
          Delete account
        </Button>
      </Section>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-eb-red">Delete account</DialogTitle>
            <DialogDescription>
              This will permanently delete your account, all meetings, transcripts and data. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="my-5">
            <Field label="Type DELETE to confirm">
              <Input
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteConfirmation("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deletingAccount || deleteConfirmation !== "DELETE"}
            >
              {deletingAccount && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
