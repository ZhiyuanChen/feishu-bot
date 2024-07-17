const STREAMING_STATUS_TEXT = "鸭鸭努力工作中...嘎...嘎...";
const MAX_RECURSIVE_CALLS = 10;
const MAX_MESSAGE_LENGTH = 1000;

let tokenCache = {
  tenant_access_token: null,
  expire: 0,
  timestamp: 0,
};

// Helper function to handle HTTP requests
async function sendFeishuRequest(url, method, token, body = null) {
  try {
    const options = {
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (token) {
      options.headers.Authorization = `Bearer ${token}`;
    }

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(`Failed to ${method} Feishu message: ${errorDetails}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error in sendFeishuRequest: ${error.message}`);
    throw error;
  }
}

// Get Tenant Access Token
async function getTenantAccessToken(env, appId, appSecret) {
  const currentTime = Math.floor(Date.now() / 1000);

  if (tokenCache.tenant_access_token && tokenCache.expire - currentTime > 200) {
    return tokenCache.tenant_access_token;
  }

  const url =
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
  const body = {
    app_id: appId || env.AppID,
    app_secret: appSecret || env.AppSecret,
  };

  const response = await sendFeishuRequest(url, "POST", null, body);
  tokenCache.tenant_access_token = response.tenant_access_token;
  tokenCache.expire = currentTime + response.expire; // Assuming 'expire' field contains the time-to-live in seconds
  tokenCache.timestamp = currentTime;

  return tokenCache.tenant_access_token;
}

// Get Feishu Message
async function getFeishuMessage(env, messageId) {
  const tenantAccessToken = await getTenantAccessToken(env);
  const url = `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`;
  const response = await sendFeishuRequest(url, "GET", tenantAccessToken);

  const messageData = response.data.items[0];
  const contentData = JSON.parse(messageData.body.content);
  let content;

  if (contentData.text) {
    content = contentData.text;
  } else if (contentData.title || contentData.elements) {
    content =
      contentData.title ||
      contentData.elements
        .map((elementArray) =>
          elementArray.map((element) => element.text || "").join("\n")
        )
        .join("\n");
  } else {
    console.error("Unknown message content format:", contentData);
    content = messageData.body.content;
  }

  return {
    content: content,
    parent_id: messageData.parent_id,
    sender_id: messageData.sender.id,
  };
}

// Recursively get Feishu Messages
async function getFeishuMessages(env, messageId, messages = [], callCount = 0) {
  try {
    if (callCount >= MAX_RECURSIVE_CALLS) return messages;

    const messageContent = await getFeishuMessage(env, messageId);
    messages.push(messageContent);

    const totalLength = messages.reduce(
      (sum, msg) => sum + msg.content.length,
      0
    );

    if (messageContent.parent_id && totalLength < MAX_MESSAGE_LENGTH) {
      return await getFeishuMessages(
        env,
        messageContent.parent_id,
        messages,
        callCount + 1
      );
    }

    return messages;
  } catch (error) {
    console.error(
      `Error in getFeishuMessages at callCount ${callCount}: ${error.message}`
    );
    throw error;
  }
}

// Send Feishu Message
async function sendFeishuMessage(
  env,
  receiveId,
  messageContent,
  receiveIdType = "chat_id",
  replyTo = null,
  uuid = ""
) {
  const tenantAccessToken = await getTenantAccessToken(env);
  const searchParams = new URLSearchParams({ receive_id_type: receiveIdType });
  const body = {
    receive_id: receiveId,
    msg_type: "text",
    content: JSON.stringify({ text: messageContent }),
    uuid,
  };

  let url = `https://open.feishu.cn/open-apis/im/v1/messages?${searchParams}`;
  if (replyTo)
    url = `https://open.feishu.cn/open-apis/im/v1/messages/${replyTo}/reply`;

  return await sendFeishuRequest(url, "POST", tenantAccessToken, body);
}

// Construct Message Content
function constructMessageContent(content, isFinal = false) {
  const elements = [{ tag: "div", text: { content: content, tag: "lark_md" } }];

  if (!isFinal) {
    elements.push({
      tag: "div",
      text: {
        content: STREAMING_STATUS_TEXT,
        tag: "plain_text",
        text_size: "notation",
        text_color: "gray",
        text_align: "right",
      },
    });
  }

  return {
    content: JSON.stringify({
      config: { wide_screen_mode: true },
      elements: elements,
    }),
    msg_type: "interactive",
  };
}

// Patch Feishu Message
async function patchFeishuMessage(env, messageId, content, isFinal = false) {
  const tenantAccessToken = await getTenantAccessToken(env);
  const body = constructMessageContent(content, isFinal);
  const url = `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`;

  return await sendFeishuRequest(url, "PATCH", tenantAccessToken, body);
}

// Send Feishu Message Stream
async function sendFeishuMessageStream(
  env,
  receiveId,
  initialContent,
  stream,
  receiveIdType = "chat_id",
  replyTo = null
) {
  const tenantAccessToken = await getTenantAccessToken(env);
  const searchParams = new URLSearchParams({ receive_id_type: receiveIdType });
  const initialBody = constructMessageContent(initialContent);
  let url = `https://open.feishu.cn/open-apis/im/v1/messages?${searchParams}`;
  if (replyTo)
    url = `https://open.feishu.cn/open-apis/im/v1/messages/${replyTo}/reply`;

  const initialResponse = await sendFeishuRequest(
    url,
    "POST",
    tenantAccessToken,
    initialBody
  );
  const messageId = initialResponse.data.message_id;

  const reader = stream.getReader();
  let messageContent = initialContent;
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder("utf-8").decode(value);
      buffer += chunk;
      const lines = buffer.split("\n\n\n");
      buffer = lines.pop(); // Keep the last incomplete chunk in the buffer

      for (let line of lines) {
        if (!line.startsWith("data:")) {
          throw new Error(`Unexpected data format: ${line}`);
        }

        const decoded = line.slice(5).trim();
        if (decoded === "[DONE]") {
          await patchFeishuMessage(env, messageId, messageContent, true);
          return;
        }

        let output;
        try {
          output = JSON.parse(decoded);
        } catch (error) {
          console.error(`Failed to parse JSON: ${decoded}`);
          continue;
        }

        if (output.object === "error") {
          throw new Error(`Logic error: ${output}`);
        }

        messageContent += output.choices[0].delta.content;
        await patchFeishuMessage(env, messageId, messageContent);
      }
    }
  } catch (error) {
    console.error("Error in sendFeishuMessageStream:", error);
  } finally {
    // Ensure STREAMING_STATUS_TEXT is removed regardless of success or failure
    await patchFeishuMessage(env, messageId, messageContent, true);
  }
}

export {
  getTenantAccessToken,
  getFeishuMessage,
  getFeishuMessages,
  sendFeishuMessage,
  sendFeishuMessageStream,
};
