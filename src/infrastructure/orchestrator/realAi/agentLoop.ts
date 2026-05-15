import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { bindOrionTools } from "../llm";
import type { OrionTool } from "../tools";

/**
 * Multi-round tool-calling pre-step. The model is given the bound tools and
 * a conversation; it can call tools (one or more per round) and we feed back
 * `ToolMessage`s with their results, then re-invoke. Loop ends when the model
 * stops requesting tools, or when MAX_ROUNDS is hit.
 *
 * Returns the augmented message list — caller then invokes `withStructuredOutput`
 * over it to produce the final typed response. This separation matters because
 * Gemini's structured-output uses a forced function call, which conflicts with
 * generic tool calling in the same invocation.
 */
export async function runAgentLoop(
  llm: BaseChatModel,
  tools: OrionTool[],
  initialMessages: BaseMessage[],
  maxRounds: number = 4,
  signal?: AbortSignal,
): Promise<BaseMessage[]> {
  if (tools.length === 0) return initialMessages;
  const bound = bindOrionTools(llm, tools);
  const messages: BaseMessage[] = [...initialMessages];

  for (let round = 0; round < maxRounds; round++) {
    const response = await bound.invoke(messages, { signal });
    messages.push(response);
    const toolCalls = (response as { tool_calls?: Array<{ name: string; args: Record<string, unknown>; id?: string }> }).tool_calls;
    if (!toolCalls || toolCalls.length === 0) break;

    for (const call of toolCalls) {
      const match = tools.find((t) => t.name === call.name);
      const callId = call.id ?? `${call.name}-${round}`;
      if (!match) {
        messages.push(
          new ToolMessage({
            tool_call_id: callId,
            content: `ERROR: no tool registered with name '${call.name}'.`,
          }),
        );
        continue;
      }
      try {
        const result = await match.invoke(call.args);
        messages.push(
          new ToolMessage({
            tool_call_id: callId,
            content:
              typeof result === "string" ? result : JSON.stringify(result),
          }),
        );
      } catch (err) {
        messages.push(
          new ToolMessage({
            tool_call_id: callId,
            content: `ERROR invoking ${call.name}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          }),
        );
      }
    }
  }

  return messages;
}
