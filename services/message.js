import {
  getFeishuMessages,
  sendFeishuMessage,
  sendFeishuMessageStream,
} from "../api/feishu.js";
import { getGptCompletion, getGptCompletionStream } from "../api/openai.js";

function buildGptPrompt(messages, botSenderID) {
  return messages
    .slice()
    .reverse()
    .map((message) => ({
      role: message.sender_id === botSenderID ? "assistant" : "user",
      content: message.content,
    }));
}

async function handleMessage(env, parsedDecrypted) {
  const chatId = parsedDecrypted.event.message.chat_id;
  const messageId = parsedDecrypted.event.message.message_id;
  const eventId = parsedDecrypted.event.event_id;
  let messageContent = JSON.parse(parsedDecrypted.event.message.content).text;

  const isMentioned = parsedDecrypted.event.message.mentions?.some(
    (mention) => mention.id.union_id === env.BotUnionID
  );
  const isTriggerMessage =
    messageContent.startsWith("yy") || messageContent.startsWith("鸭鸭");

  // Check if it's a direct message or a group message
  const isGroupChat = parsedDecrypted.event.message.chat_type === "group";

  if ((isTriggerMessage || isMentioned) && isGroupChat) {
    // Remove the prefix if it starts with "yy" or "鸭鸭", only if not mentioned
    if (isTriggerMessage && !isMentioned) {
      if (messageContent.startsWith("yy")) {
        messageContent = messageContent.slice(2).trim();
      } else if (messageContent.startsWith("鸭鸭")) {
        messageContent = messageContent.slice(2).trim();
      }
    }

    const messages = await getFeishuMessages(env, messageId);
    const gptPrompt = buildGptPrompt([...messages], env.BotSenderID);

    const chatGptResponseStream = await getGptCompletionStream(env, gptPrompt);
    await sendFeishuMessageStream(
      env,
      chatId,
      "",
      chatGptResponseStream,
      "chat_id",
      messageId
    );
  } else if (!isGroupChat) {
    const messages = await getFeishuMessages(env, messageId);
    const gptPrompt = buildGptPrompt([...messages], env.BotSenderID);

    const chatGptResponseStream = await getGptCompletionStream(env, gptPrompt);
    await sendFeishuMessageStream(
      env,
      chatId,
      "",
      chatGptResponseStream,
      "chat_id",
      messageId
    );
  }
  return new Response("ChatGPT response sent successfully", { status: 200 });
}

export { buildGptPrompt, handleMessage };
