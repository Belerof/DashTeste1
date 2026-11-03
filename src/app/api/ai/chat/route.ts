import { route } from "@/lib/guard";
import { SUGGESTIONS, aiConfigured, answerQuestion } from "@/lib/ai";
import { audit, db, nextId } from "@/lib/store";
import { z } from "zod";

export const GET = route("ai:view", async ({ user }) => ({
  suggestions: SUGGESTIONS,
  providerConfigured: aiConfigured(),
  history: db().conversations.filter((c) => c.userId === user.id).slice(0, 30),
}));

const body = z.object({ question: z.string().min(2).max(500) });

export const POST = route("ai:create", async ({ user, scope, permissions }, req) => {
  const { question } = body.parse(await req.json());
  // Figures are computed server-side from the caller's authorised data only.
  const answer = await answerQuestion(question, scope, permissions);
  db().conversations.unshift({ id: nextId("ai"), userId: user.id, at: new Date().toISOString(), question, answer: answer.headline, period: answer.period.label });
  audit(user, "ai.query", answer.intent, question.slice(0, 120));
  return { answer, providerConfigured: aiConfigured() };
});
