import { getTenantAccessToken, sendFeishuMessage } from "../api/feishu.js";
import { handleMessage } from "./message.js";

async function handleDocumentCreation(env, tenantAccessToken, parsedDecrypted) {
  const chatId = env.ChatID;
  const documentTitle = parsedDecrypted.resource.title;
  const messageContent = `A new document titled "${documentTitle}" has been created.`;

  await sendFeishuMessage(env, tenantAccessToken, chatId, messageContent);
  return new Response("Document creation message sent successfully", {
    status: 200,
  });
}

async function handleUrlVerification(parsedDecrypted) {
  return new Response(
    JSON.stringify({ challenge: parsedDecrypted.challenge }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function handleEvent(env, ctx, parsedDecrypted) {
  let tenantAccessToken;
  try {
    tenantAccessToken = await getTenantAccessToken(env.AppID, env.AppSecret);
  } catch (error) {
    console.error("Failed to get tenant_access_token", error);
    return;
  }

  const { action, event } = parsedDecrypted;

  if (action === "document.create") {
    console.log("Document creation event");
    await handleDocumentCreation(env, tenantAccessToken, parsedDecrypted);
    return;
  }

  if (event && event.message && event.message.message_type === "text") {
    console.log("Chat message event");
    await handleMessage(env, tenantAccessToken, parsedDecrypted);
    return;
  }

  console.log("Not a document creation event");
}

export { handleDocumentCreation, handleUrlVerification, handleEvent };
