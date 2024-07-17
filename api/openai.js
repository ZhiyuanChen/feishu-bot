async function getGptCompletion(env, messages) {
  console.log(`Calling OpenAI API with message: ${JSON.stringify(messages)}`);
  const openaiApiResponse = await fetch(env.OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_API_MODEL,
      messages: messages,
    }),
  });

  console.log(`OpenAI API response: ${JSON.stringify(openaiApiResponse)}`);
  if (!openaiApiResponse.ok) {
    throw new Error("Failed to call OpenAI API");
  }

  const openaiResult = await openaiApiResponse.json();
  console.log(`OpenAI result: ${JSON.stringify(openaiResult)}`);
  return openaiResult.choices[0].message.content;
}

async function getGptCompletionStream(env, messages) {
  console.log(`Calling OpenAI API with message: ${JSON.stringify(messages)}`);
  const openaiApiResponse = await fetch(env.OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_API_MODEL,
      messages: messages,
      stream: true,
    }),
  });

  if (!openaiApiResponse.ok) {
    throw new Error("Failed to call OpenAI API");
  }

  return openaiApiResponse.body;
}

export { getGptCompletion, getGptCompletionStream };
