import { NextRequest } from "next/server";
import { handleError, json } from "@/lib/api";
import { addReminder, listReminders } from "@/lib/repo";
import { reminderCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ reminders: await listReminders() });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = reminderCreateSchema.parse(await req.json());
    return json({ reminder: await addReminder(input) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
