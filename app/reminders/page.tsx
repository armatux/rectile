import { SectionHeader } from "@/components/hud";
import { RemindersView } from "@/components/reminders/RemindersView";
import { vapidPublicKey } from "@/lib/push";
import { listReminders } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const metadata = { title: "reminders" };

export default async function RemindersPage() {
  const all = await listReminders();
  const open = all.filter((r) => !r.done).length;

  return (
    <div className="flex flex-col gap-5 pt-5">
      <SectionHeader
        label="REMINDERS"
        sub={`OPEN.${String(open).padStart(2, "0")} · DONE.${String(all.length - open).padStart(2, "0")}`}
      />
      <RemindersView
        reminders={all.map((r) => ({
          id: r.id,
          title: r.title,
          notes: r.notes ?? undefined,
          dueAt: r.dueAt?.toISOString(),
          done: r.done,
        }))}
        vapidKey={vapidPublicKey()}
      />
    </div>
  );
}
