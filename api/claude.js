module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Convert Anthropic format → Gemini format
    const systemText = body.system || "";
    const userMessages = body.messages || [];
    const lastMessage = userMessages[userMessages.length - 1];

    // Build Gemini contents
    let contents = [];

    // Handle text or multipart (image) messages
    if (lastMessage && Array.isArray(lastMessage.content)) {
      // Has image
      const parts = lastMessage.content.map(c => {
        if (c.type === "text") return { text: c.text };
        if (c.type === "image") return {
          inlineData: {
            mimeType: c.source.media_type,
            data: c.source.data
          }
        };
        return { text: "" };
      });
      if (systemText) parts.unshift({ text: systemText + "\n\n" });
      contents = [{ role: "user", parts }];
    } else {
      // Plain text
      const text = lastMessage?.content || "";
      contents = [{
        role: "user",
        parts: [{ text: systemText ? systemText + "\n\n" + text : text }]
      }];
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: body.max_tokens || 1500 }
        })
      }
    );

    const geminiData = await geminiRes.json();

    // Convert Gemini response → Anthropic format (so frontend works unchanged)
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return res.status(200).json({
      content: [{ type: "text", text }]
    });

  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: err.message });
  }
};
