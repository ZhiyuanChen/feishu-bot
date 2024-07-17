async function getTenantAccessToken(appId, appSecret) {
  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to get tenant_access_token");
  }

  const data = await response.json();
  return data.tenant_access_token;
}

async function sendFeishuMessage(
  env,
  tenantAccessToken,
  receiveId,
  messageContent,
  receiveIdType = "chat_id",
  replyTo = null,
  uuid = ""
) {
  console.log(`Sending message to ${receiveId} with: ${messageContent}`);
  const searchParams = new URLSearchParams({ receive_id_type: receiveIdType });

  const body = {
    receive_id: receiveId,
    msg_type: "text",
    content: JSON.stringify({ text: messageContent }),
  };

  if (uuid) {
    body.uuid = uuid;
  }

  let url = `https://open.feishu.cn/open-apis/im/v1/messages?${searchParams}`;
  if (replyTo) {
    url = `https://open.feishu.cn/open-apis/im/v1/messages/${replyTo}/reply`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tenantAccessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      replyTo
        ? "Failed to reply Feishu message"
        : "Failed to send Feishu message"
    );
  }

  return response.json();
}

async function getFeishuMessage(env, tenantAccessToken, messageId) {
  const response = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantAccessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to get Feishu message content for message ID: ${messageId}`
    );
  }

  const messageData = await response.json();
  return {
    content: JSON.parse(messageData.data.items[0].body.content).text,
    parent_id: messageData.data.items[0].parent_id,
    sender_id: messageData.data.items[0].sender.id,
  };
}

async function getFeishuMessages(
  env,
  tenantAccessToken,
  messageId,
  messages = [],
  callCount = 0
) {
  const MAX_RECURSIVE_CALLS = 10;
  const MAX_MESSAGE_LENGTH = 1000;

  if (callCount >= MAX_RECURSIVE_CALLS) {
    return messages;
  }

  const messageContent = await getFeishuMessage(
    env,
    tenantAccessToken,
    messageId
  );
  messages.push(messageContent);

  if (
    messageContent.parent_id &&
    messageContent.content.length +
      messages.reduce((sum, msg) => sum + msg.content.length, 0) <
      MAX_MESSAGE_LENGTH
  ) {
    return getFeishuMessages(
      env,
      tenantAccessToken,
      messageContent.parent_id,
      messages,
      callCount + 1
    );
  }

  return messages;
}

export {
  getTenantAccessToken,
  sendFeishuMessage,
  getFeishuMessage,
  getFeishuMessages,
};
