import { AESCipher } from "./utils/aesCipher.js";
import {
  handleDocumentCreation,
  handleUrlVerification,
  handleEvent,
} from "./services/event.js";
import { handleMessage } from "./services/message.js";
import { getTenantAccessToken, sendFeishuMessage } from "./api/feishu.js";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return Response.redirect("https://danling.org", 301);
    }

    if (request.method === "POST") {
      const url = new URL(request.url);

      if (url.pathname === "/webhook") {
        return handleWebhookCallback(request, env);
      }

      const { encrypt } = await request.json();
      const encryptKey = env.EncryptKey;
      const cipher = new AESCipher(encryptKey);

      let decrypted;
      try {
        decrypted = await cipher.decrypt(encrypt);
      } catch (error) {
        return new Response("Decryption Failed", { status: 500 });
      }

      let parsedDecrypted;
      try {
        parsedDecrypted = JSON.parse(decrypted);
      } catch (error) {
        return new Response("Invalid Decrypted JSON", { status: 400 });
      }
      console.log(parsedDecrypted);

      if (parsedDecrypted.type === "url_verification") {
        return handleUrlVerification(parsedDecrypted);
      }

      ctx.waitUntil(handleEvent(env, ctx, parsedDecrypted));

      return new Response("Request received successfully", { status: 200 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
};

async function handleWebhookCallback(request, env) {
  const data = await request.json();
  const chatId = data.chat_id;
  const result = data.result;

  const tenantAccessToken = await getTenantAccessToken(
    env.AppID,
    env.AppSecret
  );
  await sendFeishuMessage(env, tenantAccessToken, chatId, result);

  return new Response("Result sent successfully", { status: 200 });
}
