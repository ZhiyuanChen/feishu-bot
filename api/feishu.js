const STREAMING_STATUS_TEXT = "鸭鸭努力工作中...嘎...嘎...";
const MAX_RECURSIVE_CALLS = 10;
const MAX_MESSAGE_LENGTH = 1000;

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

async function sendFeishuMessageStream(
  env,
  tenantAccessToken,
  receiveId,
  initialContent,
  stream,
  receiveIdType = "chat_id",
  replyTo = null
) {
  console.log(`Sending streaming message to ${receiveId}`);
  const searchParams = new URLSearchParams({ receive_id_type: receiveIdType });

  const initialBody = {
    receive_id: receiveId,
    msg_type: "interactive",
    content: JSON.stringify({
      config: {
        wide_screen_mode: true,
      },
      elements: [
        {
          tag: "div",
          text: {
            content: initialContent,
            tag: "lark_md",
          },
        },
        {
          tag: "div",
          text: {
            content: `${STREAMING_STATUS_TEXT}`,
            tag: "plain_text",
            text_size: "notation",
            text_color: "gray",
            text_align: "right",
          },
        },
      ],
    }),
  };

  let url = `https://open.feishu.cn/open-apis/im/v1/messages?${searchParams}`;
  if (replyTo) {
    url = `https://open.feishu.cn/open-apis/im/v1/messages/${replyTo}/reply`;
  }

  const initialResponse = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tenantAccessToken}`,
    },
    body: JSON.stringify(initialBody),
  });

  if (!initialResponse.ok) {
    throw new Error("Failed to send initial Feishu message for streaming");
  }

  const initialMessageData = await initialResponse.json();
  const messageId = initialMessageData.data.message_id;

  const reader = stream.getReader();
  let messageContent = initialContent;
  let readResult;
  let buffer = "";

  try {
    while (!(readResult = await reader.read()).done) {
      const chunk = new TextDecoder("utf-8").decode(readResult.value);
      buffer += chunk;

      let lines = buffer.split("\n\n\n");
      buffer = lines.pop(); // Keep the last incomplete chunk in the buffer

      for (let line of lines) {
        if (!line.startsWith("data:")) {
          throw new Error(`error message ${line}`);
        }

        let decoded = line.slice(5).trim();
        if (decoded === "[DONE]") {
          console.log("finish!");

          // Final update without STREAMING_STATUS_TEXT
          const finalBody = {
            content: JSON.stringify({
              config: {
                wide_screen_mode: true,
              },
              elements: [
                {
                  tag: "div",
                  text: {
                    content: messageContent,
                    tag: "lark_md",
                  },
                },
              ],
            }),
            msg_type: "interactive",
          };

          const finalResponse = await fetch(
            `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tenantAccessToken}`,
              },
              body: JSON.stringify(finalBody),
            }
          );

          if (!finalResponse.ok) {
            throw new Error(
              "Failed to send final Feishu message for streaming"
            );
          }

          return;
        }

        let output;
        try {
          output = JSON.parse(decoded);
        } catch (error) {
          console.error("Failed to parse JSON:", decoded);
          continue;
        }

        if (output["object"] === "error") {
          throw new Error(`logic error: ${output}`);
        }

        messageContent += output["choices"][0]["delta"]["content"];

        const updateBody = {
          content: JSON.stringify({
            config: {
              wide_screen_mode: true,
            },
            elements: [
              {
                tag: "div",
                text: {
                  content: initialContent,
                  tag: "lark_md",
                },
              },
              {
                tag: "div",
                text: {
                  content: `\n\n${STREAMING_STATUS_TEXT}`,
                  tag: "plain_text",
                  text_size: "notation",
                  text_color: "gray",
                  text_align: "right",
                },
              },
            ],
          }),
          msg_type: "interactive",
        };

        const updateResponse = await fetch(
          `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tenantAccessToken}`,
            },
            body: JSON.stringify(updateBody),
          }
        );

        if (!updateResponse.ok) {
          throw new Error("Failed to update Feishu message for streaming");
        }
      }
    }
  } finally {
    const finalBody = {
      content: JSON.stringify({
        config: {
          wide_screen_mode: true,
        },
        elements: [
          {
            tag: "div",
            text: {
              content: messageContent,
              tag: "lark_md",
            },
          },
        ],
      }),
      msg_type: "interactive",
    };

    const finalResponse = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tenantAccessToken}`,
        },
        body: JSON.stringify(finalBody),
      }
    );

    if (!finalResponse.ok) {
      throw new Error("Failed to send final Feishu message for streaming");
    }
  }
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
  sendFeishuMessageStream,
  getFeishuMessage,
  getFeishuMessages,
};
