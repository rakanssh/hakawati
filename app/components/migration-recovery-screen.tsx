export type MigrationRecoveryStatus = {
  message: string;
  appDataDir: string;
};

export function MigrationRecoveryScreen({
  status,
}: {
  status: MigrationRecoveryStatus;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-medium text-destructive">
          Database update stopped safely
        </p>
        <h1 className="mt-2 text-2xl font-semibold">
          Your local stories were not changed
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Hakawati could not create or verify the safety backup required before
          updating its local database. Close the app and keep the database,
          migration marker, and migration-backups folder together. Do not delete
          or rename them.
        </p>
        <div className="mt-5 rounded-lg bg-muted p-4 text-sm">
          <p className="font-medium">Recovery details</p>
          <p className="mt-2 break-words font-mono text-xs">{status.message}</p>
          <p className="mt-3 break-all font-mono text-xs">
            {status.appDataDir}
          </p>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Contact{" "}
          <span className="font-medium text-foreground">
            support@hakawati.net
          </span>{" "}
          and include these details. Do not email story text, passwords, access
          tokens, or secret-store contents.
        </p>
      </section>
    </main>
  );
}
